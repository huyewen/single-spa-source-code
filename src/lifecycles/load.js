import {
  LOAD_ERROR,
  NOT_BOOTSTRAPPED,
  LOADING_SOURCE_CODE,
  SKIP_BECAUSE_BROKEN,
  NOT_LOADED,
  objectType,
  toName,
} from "../applications/app.helpers.js";
import { ensureValidAppTimeouts } from "../applications/timeouts.js";
import {
  handleAppError,
  formatErrorMessage,
} from "../applications/app-errors.js";
import {
  flattenFnArray,
  smellsLikeAPromise,
  validLifecycleFn,
} from "./lifecycle.helpers.js";
import { getProps } from "./prop.helpers.js";
import { assign } from "../utils/assign.js";

// 调用loadApp，传递props，
// 分为三个阶段
// 1.修改状态为：LOADING_SOURCE_CODE
// 2.返回一个promise，待 reroute的Promise.all执行，调用用户传入的loadApp，返回一个promise
// 3.待callAllEventListeners执行完后，更新状态为NOT_BOOTSTRAPPED
export function toLoadPromise(app) {
  return Promise.resolve().then(() => {
    // 避免重复调用
    if (app.loadPromise) {
      return app.loadPromise;
    }
    // 只有 NOT_LOADED 和 LOAD_ERROR 状态的app，允许加载
    if (app.status !== NOT_LOADED && app.status !== LOAD_ERROR) return app;
    // 状态改为正在加载中
    app.status = LOADING_SOURCE_CODE;

    let appOpts, isUserErr; // 标识loadApps 和 用户输入错误

    return (app.loadPromise = Promise.resolve()
      .then(() => {
        // 调用函数，并把props传入，用于给子应用下发
        const loadPromise = app.loadApp(getProps(app));  // Promise { bootstrap: async () => {}, mount: async () => {}, unmount: async () => {} }
        // 用户的配置返回的不是promise，给警告
        if (!smellsLikeAPromise(loadPromise)) {
          isUserErr = true;
          throw Error('loadApps 必须是返回promise的函数');
        }

        return loadPromise.then((val) => { // val => { bootstrap: async () => {}, mount: async () => {}, unmount: async () => {} }
          app.loadErrorTime = null;

          appOpts = val;

          // 错误校验
          let validationErrMessage, validationErrCode; // 错误信息和错误码
          if (typeof appOpts !== "object") {throw Error('appOpts应该是对象');}
          if (!validLifecycleFn(appOpts.bootstrap) || !validLifecycleFn(appOpts.mount) || !validLifecycleFn(appOpts.unmount)) {
            throw Error('bootstrap, mount, unmount 必须是函数')
          }

          const type = objectType(appOpts); // parcel 或 application 这里是 => application

          // overlays合并
          if (appOpts.devtools && appOpts.devtools.overlays) {
            app.devtools.overlays = assign( {}, app.devtools.overlays, appOpts.devtools.overlays );
          }
          // 状态改为待启动
          app.status = NOT_BOOTSTRAPPED;
          // 兼容数组的写法
          app.bootstrap = flattenFnArray(appOpts, "bootstrap");
          app.mount = flattenFnArray(appOpts, "mount");
          app.unmount = flattenFnArray(appOpts, "unmount");
          app.unload = flattenFnArray(appOpts, "unload");
          app.timeouts = ensureValidAppTimeouts(appOpts.timeouts);

          delete app.loadPromise; // 删除

          return app;
        });
      })
      .catch((err) => {
        delete app.loadPromise; // 删掉

        let newStatus;
        // 出错了，改成出错的状态，记录错误时间并上报
        if (isUserErr) {
          newStatus = SKIP_BECAUSE_BROKEN;
        } else {
          newStatus = LOAD_ERROR;
          app.loadErrorTime = new Date().getTime();
        }
        handleAppError(err, app, newStatus);

        return app; // 返回的还是之前的app
      }));
  });
}
