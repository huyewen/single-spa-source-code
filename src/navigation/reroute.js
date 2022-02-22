import CustomEvent from "custom-event";
import { isStarted } from "../start.js";
import { toLoadPromise } from "../lifecycles/load.js";
import { toBootstrapPromise } from "../lifecycles/bootstrap.js";
import { toMountPromise } from "../lifecycles/mount.js";
import { toUnmountPromise } from "../lifecycles/unmount.js";
import {
  getAppStatus,
  getAppChanges,
  getMountedApps,
} from "../applications/apps.js";
import {
  callCapturedEventListeners,
  navigateToUrl,
} from "./navigation-events.js";
import { toUnloadPromise } from "../lifecycles/unload.js";
import {
  toName,
  shouldBeActive,
  NOT_MOUNTED,
  MOUNTED,
  NOT_LOADED,
  SKIP_BECAUSE_BROKEN,
} from "../applications/app.helpers.js";
import { assign } from "../utils/assign.js";
import { isInBrowser } from "../utils/runtime-environment.js";

let appChangeUnderway = false, // app切换完成（旧app卸载完成，新app挂载完成）
  peopleWaitingOnAppChange = [],
  currentUrl = isInBrowser && window.location.href;

// 不带任何参数，进行重新路由
export function triggerAppChange () {
  return reroute();
}
// 主函数-核心
export function reroute (pendingPromises = [], eventArguments) {
  // 1. start方法调用过了，app切换完成，则直接返回
  if (appChangeUnderway) {
    return new Promise((resolve, reject) => {
      peopleWaitingOnAppChange.push({
        resolve,
        reject,
        eventArguments,
      });
    });
  }

  const { appsToUnload, appsToUnmount, appsToLoad, appsToMount } = getAppChanges();
  let appsThatChanged,
    navigationIsCanceled = false, // 是否取消导航
    oldUrl = currentUrl,
    newUrl = (currentUrl = window.location.href);
  // 已经调用了start方法
  if (isStarted()) {
    appChangeUnderway = true;
    appsThatChanged = appsToUnload.concat(appsToLoad, appsToUnmount, appsToMount);
    return performAppChanges();
  } else {
    // 第一次，走这里-加载
    appsThatChanged = appsToLoad;
    return loadApps();
  }

  // 设置取消导航
  function cancelNavigation () {
    navigationIsCanceled = true;
  }
  /**
   * 做一下笔记， 当registerAPP后，会预先加载APP，并且修改状态为SOURCE_CODE_LOADING，然后保存加载子应用的promise实例到app.loadPromise中，当调用
   * start时，在执行performAppChanges，卸载旧应用挂载激活的子应用时，会再次的调用toLoadPromise，在toLoadPromise会做一次判断，当app.loadPromise
   * 存在会直接返回，表示app正在加载或者加载完了，可以执行启动和挂载。
   */

  // 加载应用
  function loadApps () {
    return Promise.resolve().then(() => {
      const loadPromises = appsToLoad.map(toLoadPromise); // 1. Promise => Promise.resolve().then()  promise还没有执行
      return (
        Promise.all(loadPromises) // 并发调用返回的 Promise.resolve().then(), 调用loadApp, 返回 Promise.then(val) val => { bootstrap: async () => {}, mount: async () => {}, ... } 
          .then(callAllEventListeners) // 调用函数
          .then(() => []) // 在调用start()之前，没有mounted 应用，因此我们始终返回[]
          .catch((err) => {
            callAllEventListeners();
            throw err;
          })
      );
    });
  }
  // 执行app切换，挂载
  function performAppChanges () {
    return Promise.resolve().then(() => {
      // dispatch自定义事件，在应用状态改变前，用户可以做一些事情。
      window.dispatchEvent(new CustomEvent(
        appsThatChanged.length === 0 ? "single-spa:before-no-app-change" : "single-spa:before-app-change",
        getCustomEventDetail(true))
      );
      window.dispatchEvent(new CustomEvent(
        "single-spa:before-routing-event",
        getCustomEventDetail(true, { cancelNavigation })) // 取消导航函数合并到属性上
      );

      // 导航取消，触发自定义事件，恢复之前的状态，跳转到oldUrl
      if (navigationIsCanceled) {
        window.dispatchEvent(new CustomEvent("single-spa:before-mount-routing-event", getCustomEventDetail(true)));
        finishUpAndReturn();
        navigateToUrl(oldUrl);
        return;
      }
      // 先卸载
      const unloadPromises = appsToUnload.map(toUnloadPromise); // promise，调用执行销毁函数
      // unMount后，再unLoad一下
      const unmountUnloadPromises = appsToUnmount.map(toUnmountPromise).map((unmountPromise) => unmountPromise.then(toUnloadPromise)); // promise，调用执行销毁函数
      // 所有需要卸载的应用
      const allUnmountPromises = unmountUnloadPromises.concat(unloadPromises);
      // 并发卸载
      const unmountAllPromise = Promise.all(allUnmountPromises);
      // 卸载完成后，触发自定义事件，用户想在mounted前干点啥，可以干
      unmountAllPromise.then(() => {
        window.dispatchEvent(new CustomEvent("single-spa:before-mount-routing-event", getCustomEventDetail(true)));
      });

      // 在卸载完成后，加载和启动 appsToLoad 中的应用
      const loadThenMountPromises = appsToLoad.map((app) => {
        return toLoadPromise(app).then((app) =>
          tryToBootstrapAndMount(app, unmountAllPromise)
        );
      });

      // 从appsToMount中过滤出appsToLoad中不包含的应用，启动并挂载它们
      const mountPromises = appsToMount
        .filter((appToMount) => appsToLoad.indexOf(appToMount) < 0)
        .map((appToMount) => {
          return tryToBootstrapAndMount(appToMount, unmountAllPromise);
        });

      // 捕获卸载应用过程出错
      return unmountAllPromise
        .catch((err) => {
          callAllEventListeners();
          throw err;
        })
        .then(() => {
          // 现在已经卸载了需要卸载的应用程序以及它们的导航事件（如hashchange、popstate)应该已经清除了。因此让其余捕获的时间监听器处理有关DOM事件是安全的。
          callAllEventListeners();

          return Promise.all(loadThenMountPromises.concat(mountPromises))
            .catch((err) => {
              pendingPromises.forEach((promise) => promise.reject(err));
              throw err;
            })
            .then(finishUpAndReturn);
        });
    });
  }
  // 完成了卸载和挂载
  function finishUpAndReturn () {
    const returnValue = getMountedApps(); // 获取状态为 MOUNTED 的app
    pendingPromises.forEach((promise) => promise.resolve(returnValue));

    try {
      const appChangeEventName = appsThatChanged.length === 0 ? "single-spa:no-app-change" : "single-spa:app-change";
      window.dispatchEvent(new CustomEvent(appChangeEventName, getCustomEventDetail()));
      window.dispatchEvent(new CustomEvent("single-spa:routing-event", getCustomEventDetail()));
    } catch (err) {
      // 为啥要用setTimeout呢？因为如果其他人的事件处理抛出错误，则single-spa需要处理。单如果是时间监听器抛出的错误，是他们自己的错，single-spa不需要处理。
      setTimeout(() => { throw err; });
    }

    // 设置该项，允许后续调用 reroute 进行重新路由，而不是再路由调用后排队。
    // 我们希望在加载mounting、卸载unmounting后，但是在resolve reroute 这个promise函数之前执行这个操作
    appChangeUnderway = false;

    if (peopleWaitingOnAppChange.length > 0) {
      // 当我们 reroute 时，其他人触发了另一个排队的 reroute，因此我们需要再次 reroute.
      const nextPendingPromises = peopleWaitingOnAppChange;
      peopleWaitingOnAppChange = [];
      reroute(nextPendingPromises);
    }

    return returnValue;
  }

  // 调用所有事件监听方法，这些方法因为等待single-spa，被延迟调用。
  // 这些监听方法，包括hashchange，popstate事件，当前运行的performAppChanges()，还有排队的事件监听器。
  // 我们会依次按照顺序去调用，先排队，先调用。
  function callAllEventListeners () {
    pendingPromises.forEach((pendingPromise) => {
      callCapturedEventListeners(pendingPromise.eventArguments);
    });

    callCapturedEventListeners(eventArguments);
  }

  // 获取自定义事件的detail
  function getCustomEventDetail (isBeforeChanges = false, extraProperties) {
    const newAppStatuses = {}; // 各个app的新状态 { 'app1': MOUNTED, ... }
    const appsByNewStatus = {
      [MOUNTED]: [], // mounted的app列表
      [NOT_MOUNTED]: [],
      [NOT_LOADED]: [],
      [SKIP_BECAUSE_BROKEN]: [], // 尝试执行某些操作，但是已经损坏的应用程序
    };

    if (isBeforeChanges) {
      appsToLoad.concat(appsToMount).forEach((app, index) => { // 待加载、待挂载 => 挂载完成 
        addApp(app, MOUNTED);
      });
      appsToUnload.forEach((app) => { // 待销毁 =>待加载
        addApp(app, NOT_LOADED);
      });
      appsToUnmount.forEach((app) => { // 待卸载 => 待挂载
        addApp(app, NOT_MOUNTED);
      });
    } else {
      appsThatChanged.forEach((app) => {
        addApp(app);
      });
    }

    const result = {
      detail: {
        newAppStatuses,
        appsByNewStatus,
        totalAppChanges: appsThatChanged.length,
        originalEvent: eventArguments?.[0],
        oldUrl,
        newUrl,
        navigationIsCanceled,
      },
    };

    // 对象合并
    if (extraProperties) {
      assign(result.detail, extraProperties);
    }

    return result;

    // 给app赋值当前状态
    function addApp (app, status) {
      const appName = toName(app);
      status = status || getAppStatus(appName);
      newAppStatuses[appName] = status;
      const statusArr = (appsByNewStatus[status] = appsByNewStatus[status] || []);
      statusArr.push(appName);
    }
  }
}

// 假设在应用程序加载期间发生了某种类型的延迟，用户无需等待应用加载完成，就直接切换到另一条线路。
// 这意味着我们不应该启动并挂载该应用程序。
// 因此，我们进行第二次检查，看看该应用是否在启动和挂载之前是被加载了的。
function tryToBootstrapAndMount (app, unmountAllPromise) {
  if (shouldBeActive(app)) {
    return toBootstrapPromise(app).then((app) =>
      unmountAllPromise.then(() =>
        shouldBeActive(app) ? toMountPromise(app) : app
      )
    );
  } else {
    return unmountAllPromise.then(() => app);
  }
}
