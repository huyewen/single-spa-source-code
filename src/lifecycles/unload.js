import {
  NOT_MOUNTED,
  UNLOADING,
  NOT_LOADED,
  SKIP_BECAUSE_BROKEN,
  toName,
} from "../applications/app.helpers.js";
import { handleAppError } from "../applications/app-errors.js";
import { reasonableTime } from "../applications/timeouts.js";
import { LOAD_ERROR } from "single-spa";

const appsToUnload = {};

export function toUnloadPromise(app) {
  console.log(999, app);
  return Promise.resolve().then(() => {
    // 在销毁映射表中没找到应用名字，说明没有要销毁的
    const unloadInfo = appsToUnload[toName(app)];
    if (!unloadInfo) return app;

    // 没有加载的应用，无需销毁
    if (app.status === NOT_LOADED) {
      finishUnloadingApp(app, unloadInfo);
      return app;
    }
    // 正在销毁中的，无需往下执行销毁
    if (app.status === UNLOADING) {
      return unloadInfo.promise.then(() => app);
    }
    // 没有挂载或者加载错误的，直接返回
    if (app.status !== NOT_MOUNTED && app.status !== LOAD_ERROR) {
      return app;
    }

    const unloadPromise = app.status === LOAD_ERROR ? Promise.resolve() : reasonableTime(app, "unload");
    // 更新状态
    app.status = UNLOADING;

    return unloadPromise
      .then(() => {
        finishUnloadingApp(app, unloadInfo);
        return app;
      })
      .catch((err) => {
        errorUnloadingApp(app, unloadInfo, err);
        return app;
      });
  });
}

// 销毁应用
function finishUnloadingApp(app, unloadInfo) {
  delete appsToUnload[toName(app)];

  // 销毁生命周期
  delete app.bootstrap;
  delete app.mount;
  delete app.unmount;
  delete app.unload;
  // 更新状态
  app.status = NOT_LOADED;

  // 销毁完了，让程序继续往下执行
  unloadInfo.resolve();
}
// 销毁应用出错
function errorUnloadingApp(app, unloadInfo, err) {
  delete appsToUnload[toName(app)];
  // 销毁生命周期
  delete app.bootstrap;
  delete app.mount;
  delete app.unmount;
  delete app.unload;
  // 更新状态
  handleAppError(err, app, SKIP_BECAUSE_BROKEN);

  // 销毁出错，让程序继续往下走
  unloadInfo.reject(err);
}
// 把待销毁app保存到 appsToUnload 映射表中
export function addAppToUnload(app, promiseGetter, resolve, reject) {
  appsToUnload[toName(app)] = { app, resolve, reject };
  // 调用 app1.promise => promiseGetter
  Object.defineProperty(appsToUnload[toName(app)], "promise", {
    get: promiseGetter,
  });
}

// 待销毁app的销毁信息
export function getAppUnloadInfo(appName) {
  return appsToUnload[appName];
}
