import { assign } from "../utils/assign";
import { getProps } from "../lifecycles/prop.helpers";
import { objectType, toName } from "./app.helpers";
import { formatErrorMessage } from "./app-errors";

const defaultWarningMillis = 1000;

const globalTimeoutConfig = {
  bootstrap: {
    millis: 4000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  mount: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  unmount: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  unload: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  update: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
};
// 设置启动时间配置
export function setBootstrapMaxTime (time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        16,
        __DEV__ &&
        `bootstrap max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.bootstrap = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function setMountMaxTime (time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        17,
        __DEV__ &&
        `mount max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.mount = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function setUnmountMaxTime (time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        18,
        __DEV__ &&
        `unmount max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.unmount = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function setUnloadMaxTime (time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        19,
        __DEV__ &&
        `unload max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.unload = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function reasonableTime (appOrParcel, lifecycle) { // app, 'unload'
  const timeoutConfig = appOrParcel.timeouts[lifecycle];
  const warningPeriod = timeoutConfig.warningMillis;
  const type = objectType(appOrParcel); // parcel、 application

  return new Promise((resolve, reject) => {
    let finished = false;
    let errored = false;
    if (lifecycle === 'unload') {
      console.log(appOrParcel[lifecycle], appOrParcel, lifecycle);
    }
    appOrParcel[lifecycle](getProps(appOrParcel))
      .then((val) => {
        finished = true;
        resolve(val);
      })
      .catch((val) => {
        finished = true;
        reject(val);
      });

    // 超时检测
    setTimeout(() => maybeTimingOut(1), warningPeriod);
    setTimeout(() => maybeTimingOut(true), timeoutConfig.millis);

    const errMsg = formatErrorMessage(
      31,
      __DEV__ &&
      `Lifecycle function ${lifecycle} for ${type} ${toName(
        appOrParcel
      )} lifecycle did not resolve or reject for ${timeoutConfig.millis} ms.`,
      lifecycle,
      type,
      toName(appOrParcel),
      timeoutConfig.millis
    );

    function maybeTimingOut (shouldError) {
      if (!finished) { // 卸载操作还没结束，可能成功可能失败，在这里表示超时了
        if (shouldError === true) { // 规定超时时间还没搞定，真的有问题了
          errored = true;
          if (timeoutConfig.dieOnTimeout) {
            reject(Error(errMsg));
          } else {
            console.error(errMsg);
            //don't resolve or reject, we're waiting this one out
          }
        } else if (!errored) { // 还有救，再等等
          const numWarnings = shouldError; // 1
          const numMillis = numWarnings * warningPeriod; // 1000
          console.warn(errMsg);
          // 只要还小于超时时间
          if (numMillis + warningPeriod < timeoutConfig.millis) {
            setTimeout(() => maybeTimingOut(numWarnings + 1), warningPeriod);
          }
        }
      }
    }
  });
}

export function ensureValidAppTimeouts (timeouts) {
  const result = {};

  for (let key in globalTimeoutConfig) {
    result[key] = assign(
      {},
      globalTimeoutConfig[key],
      (timeouts && timeouts[key]) || {}
    );
  }

  return result;
}
