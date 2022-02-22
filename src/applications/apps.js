// single-spa API

import { ensureJQuerySupport } from "../jquery-support.js";
import {
  isActive,
  toName,
  NOT_LOADED,
  NOT_BOOTSTRAPPED,
  NOT_MOUNTED,
  MOUNTED,
  LOAD_ERROR,
  SKIP_BECAUSE_BROKEN,
  LOADING_SOURCE_CODE,
  shouldBeActive,
} from "./app.helpers.js";
import { reroute } from "../navigation/reroute.js";
import { find } from "../utils/find.js";
import { toUnmountPromise } from "../lifecycles/unmount.js";
import {
  toUnloadPromise,
  getAppUnloadInfo,
  addAppToUnload,
} from "../lifecycles/unload.js";
import { formatErrorMessage } from "./app-errors.js";
import { isInBrowser } from "../utils/runtime-environment.js";
import { assign } from "../utils/assign";

// 已经挂载的应用列表
const apps = [];

// 获取不同状态下的应用集合
export function getAppChanges () {
  const appsToUnload = [], // 带完全卸载应用
    appsToUnmount = [], // 待卸载应用
    appsToLoad = [], // 待加载应用
    appsToMount = []; // 待挂载应用

  // 超时200ms后，会再次尝试在 LOAD_ERROR 中下载应用程序
  const currentTime = new Date().getTime();

  apps.forEach((app) => {
    // 获取激活应用的前缀
    /**
     * shouldBeActive()返回该应用是否处于激活状态的Boolean值
     */
    const appShouldBeActive =
      app.status !== SKIP_BECAUSE_BROKEN && shouldBeActive(app);

    // 只关心以下状态，其他状态被忽略
    switch (app.status) {
      // 加载错误，200ms后再尝试加载应用
      case LOAD_ERROR:
        if (appShouldBeActive && currentTime - app.loadErrorTime >= 200) {
          appsToLoad.push(app);
        }
        break;
      // 正在加载
      case NOT_LOADED: // 未加载
      case LOADING_SOURCE_CODE: // 正在加载中
        if (appShouldBeActive) {
          appsToLoad.push(app);
        }
        break;
      // 加载完成，待挂载
      case NOT_BOOTSTRAPPED: // 未激活启动
      case NOT_MOUNTED: // 未挂载
        if (!appShouldBeActive && getAppUnloadInfo(toName(app))) { // 有未完全卸载的
          appsToUnload.push(app); // 待卸载
        } else if (appShouldBeActive) {
          appsToMount.push(app); // 待挂载
        }
        break;
      // 挂载完成，可以卸载
      case MOUNTED:
        if (!appShouldBeActive) {
          appsToUnmount.push(app);
        }
        break;
    }
  });

  return { appsToUnload, appsToUnmount, appsToLoad, appsToMount };
}
// 获取已经挂载的应用，即状态为 MOUNTED 的应用
export function getMountedApps () {
  return apps.filter(isActive).map(toName);
}
// 获取app名称集合
export function getAppNames () {
  return apps.map(toName);
}

// 原有应用配置数据 devtools中使用
export function getRawAppData () {
  return [...apps];
}
// 获取应用状态，指：NOT_LOADED, NOT_MOUNTED, MOUNTED, ...
export function getAppStatus (appName) {
  const app = find(apps, (app) => toName(app) === appName);
  return app ? app.status : null;
}

// 注册应用
export function registerApplication (
  appNameOrConfig, // 应用的名字
  appOrLoadApp, // promise函数，也可以是一个被解析过的应用
  activeWhen, // 应用标识 激活标识
  customProps // 自定义属性，用于传递给子应用
) {
  const registration = sanitizeArguments(
    appNameOrConfig,
    appOrLoadApp,
    activeWhen,
    customProps
  );
  // 应用名称相同，表示应用以及注册过了
  if (getAppNames().indexOf(registration.name) !== -1) throw Error("应用已经注册过了！");
  // 注册应用，放到apps中
  apps.push(
    assign(
      {
        loadErrorTime: null, // 加载错误时间
        status: NOT_LOADED, // 默认状态，未加载
        parcels: {}, // ? 包裹？
        devtools: {
          overlays: {
            options: {},
            selectors: [],
          },
        },
      },
      registration
    )
  );

  if (isInBrowser) { // 在浏览器环境跑（window不为undefined）
    ensureJQuerySupport();
    reroute();
  }
}
// 获取当前激活函数：遍历所有应用，通过匹配应用标识符，得到应用的name
export function checkActivityFunctions (location = window.location) {
  return apps.filter((app) => app.activeWhen(location)).map(toName);
}
// 取消注册应用
export function unregisterApplication (appName) {
  // 应用本来就没有被注册过，无法取消注册
  if (apps.filter((app) => toName(app) === appName).length === 0) {
    throw Error("此应该本来就未被注册过，因此无法取消注册");
  }
  // 取消注册应用，卸载完成后，从应用列表中移除
  return unloadApplication(appName).then(() => {
    const appIndex = apps.map(toName).indexOf(appName);
    apps.splice(appIndex, 1);
  });
}
// 卸载应用
export function unloadApplication (appName, opts = { waitForUnmount: false }) {
  // app名称必须为字符串
  if (typeof appName !== "string") {
    throw Error("应用名称必须为字符串！");
  }
  // 待卸载app没有注册，所以不用卸载
  const app = find(apps, (App) => toName(App) === appName);
  if (!app) {
    throw Error("app没注册，无需卸载");
  }

  const appUnloadInfo = getAppUnloadInfo(toName(app));
  if (opts && opts.waitForUnmount) {
    // 在unloading前，需要等待unmount完app
    if (appUnloadInfo) {
      // 别人也在等待
      return appUnloadInfo.promise;
    } else {
      // 没有人在等，直接卸载
      const promise = new Promise((resolve, reject) => {
        addAppToUnload(app, () => promise, resolve, reject);
      });
      return promise;
    }
  } else {
    // 我们应该卸载应用程序，卸载完成后，立即重装它
    let resultPromise;

    if (appUnloadInfo) {
      // 别人也在等待
      resultPromise = appUnloadInfo.promise;
      immediatelyUnloadApp(app, appUnloadInfo.resolve, appUnloadInfo.reject);
    } else {
      // 没有人在等，直接卸载
      resultPromise = new Promise((resolve, reject) => {
        addAppToUnload(app, () => resultPromise, resolve, reject);
        immediatelyUnloadApp(app, resolve, reject);
      });
    }

    return resultPromise;
  }
}
// 立即卸载应用程序
function immediatelyUnloadApp (app, resolve, reject) {
  toUnmountPromise(app) // 先unmount
    .then(toUnloadPromise) // 再unload
    .then(() => {
      resolve();
      setTimeout(() => {
        // 卸载应用已经完成，然后 reroute
        reroute();
      });
    })
    .catch(reject);
}

// 校验应用配置，必填校验
function validateRegisterWithArguments (
  name,
  appOrLoadApp,
  activeWhen,
  customProps
) {
  // 应用名称校验
  if (typeof name !== "string" || name.length === 0)
    throw Error("应用名称必须是字符串");
  // 装载函数校验
  if (!appOrLoadApp)
    throw Error("异步函数，bootstrap, mount, unmount 必须要有");
  // activeWhen
  if (typeof activeWhen !== "function")
    throw Error(
      "必须是函数， 如：location => location.has.startsWith('#/app')"
    );
  if (!validCustomProps(customProps)) throw Error("customProps必须是对象");
}

// 校验应用配置，用户传入配置的合法性
export function validateRegisterWithConfig (config) {
  // 1. 应用配置不能是数组或者null
  if (Array.isArray(config) || config === null)
    throw Error("应用名称不能是数组或者null");
  // 2. 应用配置必须是指定的几个关键字
  const validKeys = ["name", "app", "activeWhen", "customProps"];
  // 过滤函数，将不是 validKeys 中的key，过滤出来。
  const invalidKeys = Object.keys(config).reduce(
    (invalidKeys, prop) =>
      validKeys.indexOf(prop) >= 0 ? invalidKeys : invalidKeys.concat(prop),
    []
  );
  // 如果过滤出来其他的属性，表示书写不合法
  if (invalidKeys.length !== 0)
    throw Error("配置对象只接受 validKeys 中的属性，其他的无效");
  // 3. 应用名称存在校验
  if (typeof config.name !== "string" || config.name.length === 0)
    throw Error("应用名称必须存在，且不能是空字符串");
  // 3，应用校验，必须是一个可以返回promise的app，或者一个promise加载函数
  if (typeof config.app !== "object" && typeof config.app !== "function")
    throw Error("必须是一个可以返回promise的app，或者一个promise加载函数");
  // 4. 应用跳转路径，必须是字符串或者参数为location的函数
  const allowsStringAndFunction = (activeWhen) =>
    typeof activeWhen === "string" || typeof activeWhen === "function";
  if (
    !allowsStringAndFunction(config.activeWhen) &&
    !(
      Array.isArray(config.activeWhen) &&
      config.activeWhen.every(allowsStringAndFunction)
    )
  ) {
    throw Error("activeWhen 必须是字符串，或者函数或者数组");
  }
  // 5. 自定义属性校验， 必须是一个对象
  if (!validCustomProps(config.customProps))
    throw Error("customProps 必须是对象，不能是函数或者数组，也不能为空");
}
function validCustomProps (customProps) {
  return (
    !customProps ||
    typeof customProps === "function" ||
    (typeof customProps === "object" &&
      customProps !== null &&
      !Array.isArray(customProps))
  );
}

// 消毒，配置校验，合法后生成目标配置对象
// 配置校验分为：整个配置的合法性校验和非空校验
// 合法配置
function sanitizeArguments (
  appNameOrConfig,
  appOrLoadApp,
  activeWhen,
  customProps
) {
  // app名称传入的是一个对象
  const usingObjectAPI = typeof appNameOrConfig === "object";

  const registration = {
    name: null, // 应用名称
    loadApp: null, // promise函数加载app的函数
    activeWhen: null, // 当前激活的标识
    customProps: null, // 自定义属性，用于向子应用传递
  };

  // 校验合法后，进行赋值
  if (usingObjectAPI) { // 如果appNameOrConfig是一个对象，则从对象中拿出对应的属性放置到registration中
    validateRegisterWithConfig(appNameOrConfig);
    registration.name = appNameOrConfig.name;
    registration.loadApp = appNameOrConfig.app;
    registration.activeWhen = appNameOrConfig.activeWhen;
    registration.customProps = appNameOrConfig.customProps;
  } else {
    validateRegisterWithArguments(
      appNameOrConfig,
      appOrLoadApp,
      activeWhen,
      customProps
    );
    registration.name = appNameOrConfig;
    registration.loadApp = appOrLoadApp;
    registration.activeWhen = activeWhen;
    registration.customProps = customProps;
  }

  registration.loadApp = sanitizeLoadApp(registration.loadApp);
  registration.customProps = sanitizeCustomProps(registration.customProps);
  registration.activeWhen = sanitizeActiveWhen(registration.activeWhen); // 转换唯一个函数，入参是location，只有传入

  return registration;
}
// loadApp 包装成promise （如果是函数，则必须提供返回promise的函数）
function sanitizeLoadApp (loadApp) {
  if (typeof loadApp !== "function") {
    return () => Promise.resolve(loadApp);
  }

  return loadApp;
}
// cusromProps 如果是空，则给个空对象
function sanitizeCustomProps (customProps) {
  return customProps ? customProps : {};
}
// activeWhen 返回一个函数，将location传入 (location) => location.hash.startsWith('#/app1'); 调用后返回一个字符串
function sanitizeActiveWhen (activeWhen) {
  let activeWhenArray = Array.isArray(activeWhen) ? activeWhen : [activeWhen]; // 
  activeWhenArray = activeWhenArray.map((activeWhenOrPath) =>
    typeof activeWhenOrPath === "function"
      ? activeWhenOrPath // 是函数则返回
      : pathToActiveWhen(activeWhenOrPath) // 路径字符串
  );

  return (location) => // 只要其中返回一个true，则表示激活
    activeWhenArray.some((activeWhen) => activeWhen(location)); // 调用用户配置的函数，传入location
}

// activeWhen传入的不是函数，而是字符串或者数组，则特殊处理
// '/app1', '/users/:userId/profile', '/pathname/#/hash' ['/pathname/#/hash', '/app1']
// 具体见官方文档api，有详细说明：https://zh-hans.single-spa.js.org/docs/api
export function pathToActiveWhen (path, exactMatch) {
  const regex = toDynamicPathValidatorRegex(path, exactMatch); // 返回符合激活条件的正则

  return (location) => {
    const route = location.href
      .replace(location.origin, "")
      .replace(location.search, "")
      .split("?")[0];
    return regex.test(route); // 当符合正则匹配模式，则标识
  };
}

function toDynamicPathValidatorRegex (path, exactMatch) { // '/myApp'
  let lastIndex = 0,
    inDynamic = false,
    regexStr = "^";
  // 添加 / 前缀
  if (path[0] !== "/") { // 如果路径不是/开头，则加上/
    path = "/" + path;
  }
  // /app1
  for (let charIndex = 0; charIndex < path.length; charIndex++) {
    const char = path[charIndex];
    const startOfDynamic = !inDynamic && char === ":"; // 当前字符是：,标识动态字符串
    const endOfDynamic = inDynamic && char === "/"; // 当前字符是 /
    if (startOfDynamic || endOfDynamic) {
      appendToRegex(charIndex);
    }
  }

  appendToRegex(path.length);
  return new RegExp(regexStr, "i");

  function appendToRegex (index) {
    const anyCharMaybeTrailingSlashRegex = "[^/]+/?";
    const commonStringSubPath = escapeStrRegex(path.slice(lastIndex, index));

    regexStr += inDynamic
      ? anyCharMaybeTrailingSlashRegex
      : commonStringSubPath;

    if (index === path.length) {
      if (inDynamic) {
        if (exactMatch) {
          // Ensure exact match paths that end in a dynamic portion don't match
          // urls with characters after a slash after the dynamic portion.
          regexStr += "$";
        }
      } else {
        // For exact matches, expect no more characters. Otherwise, allow
        // any characters.
        const suffix = exactMatch ? "" : ".*";

        regexStr =
          // use charAt instead as we could not use es6 method endsWith
          regexStr.charAt(regexStr.length - 1) === "/"
            ? `${regexStr}${suffix}$`
            : `${regexStr}(/${suffix})?(#.*)?$`;
      }
    }

    inDynamic = !inDynamic;
    lastIndex = index;
  }

  function escapeStrRegex (str) {
    // borrowed from https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
    return str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
  }
}
