import { handleAppError } from "./app-errors.js";

// App 状态 === single-spa的所有状态都在这里
export const NOT_LOADED = "NOT_LOADED"; // 未加载
export const LOADING_SOURCE_CODE = "LOADING_SOURCE_CODE"; // 加载中
export const NOT_BOOTSTRAPPED = "NOT_BOOTSTRAPPED"; // 未激活启动
export const BOOTSTRAPPING = "BOOTSTRAPPING"; // 激活启动中
export const NOT_MOUNTED = "NOT_MOUNTED"; // 未挂载
export const MOUNTING = "MOUNTING"; // 挂载中
export const MOUNTED = "MOUNTED"; // 已挂载
export const UPDATING = "UPDATING"; // 更新中
export const UNMOUNTING = "UNMOUNTING"; // 卸载中
export const UNLOADING = "UNLOADING"; // 完全卸载
export const LOAD_ERROR = "LOAD_ERROR"; // 加载错误
export const SKIP_BECAUSE_BROKEN = "SKIP_BECAUSE_BROKEN"; // 跳过，因为挂了，用于报错时的状态

// 当前应用处于激活状态
export function isActive(app) {
  return app.status === MOUNTED;
}
// 当前应用是否应该被激活
export function shouldBeActive(app) {
  try {
    return app.activeWhen(window.location); // 执行函数，得到一个字符串，用来标识应用前缀
  } catch (err) {
    handleAppError(err, app, SKIP_BECAUSE_BROKEN);
    return false;
  }
}

export function toName(app) {
  return app.name;
}

export function isParcel(appOrParcel) {
  return Boolean(appOrParcel.unmountThisParcel);
}

export function objectType(appOrParcel) {
  return isParcel(appOrParcel) ? "parcel" : "application";
}
