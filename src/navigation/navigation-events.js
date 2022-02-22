// 导航事件
import { reroute } from "./reroute.js";
import { find } from "../utils/find.js";
import { formatErrorMessage } from "../applications/app-errors.js";
import { isInBrowser } from "../utils/runtime-environment.js";
import { isStarted } from "../start.js";

// 捕获事件监听器，但是现在不会去调用，只是收集。直到single-spa已经将该卸载的应用卸载并该挂载的应用成功挂载完成后，再在代码里调用
const capturedEventListeners = {
  hashchange: [],
  popstate: [],
};

export const routingEventsListeningTo = ["hashchange", "popstate"];

// 导航到某个url
export function navigateToUrl (obj) {
  let url;
  if (typeof obj === "string") {
    url = obj;
  } else if (this && this.href) {
    url = this.href;
  } else if (
    obj &&
    obj.currentTarget &&
    obj.currentTarget.href &&
    obj.preventDefault
  ) {
    url = obj.currentTarget.href;
    obj.preventDefault();
  } else {
    throw Error('navigateToUrl最好是要给字符串');
  }

  const current = parseUri(window.location.href); // a标签，有href地址为location.href
  const destination = parseUri(url); // a标签，有href地址为用户输入的地址

  // 1.hash路由
  if (url.indexOf("#") === 0) {
    window.location.hash = destination.hash;
    // 2.域名不一致，以用户输入地址为准
  } else if (current.host !== destination.host && destination.host) {
    window.location.href = url;
    // 3.域名一致，并且pathname和search一致
  } else if (destination.pathname === current.pathname && destination.search === current.search) {
    window.location.hash = destination.hash;
    // 4.不同的域名、pathname、参数
  } else {
    window.history.pushState(null, null, url);
  }
}

// 依次调用保存好的事件函数
export function callCapturedEventListeners (eventArguments) {
  if (eventArguments) {
    const eventType = eventArguments[0].type;
    // 仅针对 popstate，hashchange事件类型
    if (routingEventsListeningTo.indexOf(eventType) >= 0) {
      // 调用之前保存好的事件函数，依次执行
      capturedEventListeners[eventType].forEach((listener) => {
        try {
          listener.apply(this, eventArguments);
        } catch (e) { // 应用程序事件函数执行引发的错误，不应该破坏单个spa
          setTimeout(() => {
            throw e;
          });
        }
      });
    }
  }
}

// 是否在客户端更改路由后触发single-spa重新路由。默认为false，设置为true时不会重新路由
let urlRerouteOnly;
export function setUrlRerouteOnly (val) {
  urlRerouteOnly = val;
}

// url路由变化，触发single-spa重新路由
function urlReroute () {
  reroute([], arguments);
}

function patchedUpdateState (updateState, methodName) {
  return function () {
    const urlBefore = window.location.href;
    const result = updateState.apply(this, arguments); // 调用原方法 history.pushState, history.replaceState
    const urlAfter = window.location.href;
    // 切换浏览器地址要single-spa重新路由，并且切的不是同一个浏览器地址时
    if (!urlRerouteOnly || urlBefore !== urlAfter) {
      // 1. single-spa启动，人工触发popstate事件。目的是为了让single-spa知道不同应用间的路由信息
      if (isStarted()) {
        window.dispatchEvent(createPopStateEvent(window.history.state, methodName));
        // 2. 在single-spa启动前，不要触发popstate事件。因为各自应用只关心自己的路由，没必要了解其他应用的路由
      } else {
        reroute([]);
      }
    }

    return result;
  };
}

// 创建popstate自定义事件
// 当调用pushState，replaceState时，浏览器没有做任何操作，但是我们需要一个popstate事件，以便所有的应用都可以reroute。
function createPopStateEvent (state, originalMethodName) {
  let evt;
  try {
    evt = new PopStateEvent("popstate", { state });
  } catch (err) {
    evt = document.createEvent("PopStateEvent");
    evt.initPopStateEvent("popstate", false, false, state);
  }
  evt.singleSpa = true;
  evt.singleSpaTrigger = originalMethodName;
  return evt;
}

if (isInBrowser) {
  // 浏览器路由变化，触发single-spa重新路由，挂载最新匹配到的应用
  window.addEventListener("hashchange", urlReroute);
  window.addEventListener("popstate", urlReroute);

  // 保存事件监听函数
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  window.addEventListener = function (eventName, fn) {
    // 只保存hashchange和popstate的路由切换函数，并且进行去重
    if (routingEventsListeningTo.indexOf(eventName) >= 0 && !find(capturedEventListeners[eventName], (listener) => listener === fn)) {
      capturedEventListeners[eventName].push(fn);

      return;
    }

    return originalAddEventListener.apply(this, arguments);
  };
  // 移除事件监听函数
  window.removeEventListener = function (eventName, listenerFn) {
    if (routingEventsListeningTo.indexOf(eventName) >= 0) {
      capturedEventListeners[eventName] = capturedEventListeners[eventName].filter((fn) => fn !== listenerFn);
      return;
    }

    return originalRemoveEventListener.apply(this, arguments);
  };

  // 浏览器api进行处理
  window.history.pushState = patchedUpdateState(
    window.history.pushState,
    "pushState"
  );
  window.history.replaceState = patchedUpdateState(
    window.history.replaceState,
    "replaceState"
  );

  // 导航函数，挂在到全局
  if (window.singleSpaNavigate) {
    console.warn('single-spa被加载了两次');
  } else {
    window.singleSpaNavigate = navigateToUrl;
  }
}

// 创建a标签，并赋值href
function parseUri (str) {
  const anchor = document.createElement("a");
  anchor.href = str;
  return anchor;
}
