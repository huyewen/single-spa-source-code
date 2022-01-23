import { getRawAppData, unregisterApplication } from "../applications/apps";
import { reroute } from "../navigation/reroute";
import { NOT_LOADED } from "../applications/app.helpers";
import { toLoadPromise } from "../lifecycles/load";
import { toBootstrapPromise } from "../lifecycles/bootstrap";

export default {
  getRawAppData, // 注册的app列表
  reroute,
  NOT_LOADED,
  toLoadPromise, // 加载
  toBootstrapPromise, // 启动
  unregisterApplication, // 取消注册
};
