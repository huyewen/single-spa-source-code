export { start } from "./start.js";
export { ensureJQuerySupport } from "./jquery-support.js";
export {
  setBootstrapMaxTime,
  setMountMaxTime,
  setUnmountMaxTime,
  setUnloadMaxTime,
} from "./applications/timeouts.js";
export {
  registerApplication, // 注册应用
  unregisterApplication, // 取消注册
  getMountedApps, // 获取已经挂载的应用
  getAppStatus, // 获取各个状态下的应用集合
  unloadApplication, // 卸载应用
  checkActivityFunctions, // 获取当前激活函数：遍历所有应用，通过匹配应用标识符，得到应用的name
  getAppNames, // 获取应用名称集合
  pathToActiveWhen, // 处理非函数形式的 activeWhen
} from "./applications/apps.js";
export { navigateToUrl } from "./navigation/navigation-events.js";
export { triggerAppChange } from "./navigation/reroute.js";
export {
  addErrorHandler,
  removeErrorHandler,
} from "./applications/app-errors.js";
export { mountRootParcel } from "./parcels/mount-parcel.js";

export {
  NOT_LOADED,
  LOADING_SOURCE_CODE,
  NOT_BOOTSTRAPPED,
  BOOTSTRAPPING,
  NOT_MOUNTED,
  MOUNTING,
  UPDATING,
  LOAD_ERROR,
  MOUNTED,
  UNMOUNTING,
  SKIP_BECAUSE_BROKEN,
} from "./applications/app.helpers.js";

import devtools from "./devtools/devtools";
import { isInBrowser } from "./utils/runtime-environment.js";

if (isInBrowser && window.__SINGLE_SPA_DEVTOOLS__) {
  window.__SINGLE_SPA_DEVTOOLS__.exposedMethods = devtools;
}
