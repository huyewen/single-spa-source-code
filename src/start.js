import { reroute } from "./navigation/reroute.js";
import { formatErrorMessage } from "./applications/app-errors.js";
import { setUrlRerouteOnly } from "./navigation/navigation-events.js";
import { isInBrowser } from "./utils/runtime-environment.js";

// 是否调用了start()函数
let started = false;

// 在调用start之前，应用被加载了，但是不会初始化，不会挂载或者卸载。
// 调用这个函数，就意味着要开始挂载，就会开始激活应用里的代码
export function start (opts) {
  started = true;
  // 是否不希望浏览器路由变化后，single-spa重新路由
  if (opts && opts.urlRerouteOnly) {
    setUrlRerouteOnly(opts.urlRerouteOnly);
  }
  // 仅支持在浏览器环境跑（window不为undefined）
  if (isInBrowser) {
    reroute();
  }
}
// 是否已经启动
export function isStarted () {
  return started;
}

// 浏览器环境下，5s没有调用start()则报错
if (isInBrowser) {
  setTimeout(() => {
    if (!started) {
      console.warn('single-spa加载完成5s后，singleSpa.start()没有被调用。在调用start()函数前，可以声明和加载应用，但是不能bootstrap和mount');
    }
  }, 5000);
}
