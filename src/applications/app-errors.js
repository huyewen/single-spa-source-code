import { objectType, toName } from "./app.helpers";

// 错误队列
let errorHandlers = [];

// 处理app错误
export function handleAppError(err, app, newStatus) {
  const transformedErr = transformErr(err, app, newStatus);
  // 如果错误队列中有值，则遍历调用，并传入transformedErr
  if (errorHandlers.length) {
    errorHandlers.forEach((handler) => handler(transformedErr));
  // 否则则直接调用transformedErr
  } else {
    setTimeout(() => {
      throw transformedErr;
    });
  }
}

export function addErrorHandler(handler) {
  if (typeof handler !== "function") {
    throw Error('handler 必须是一个函数');
  }

  errorHandlers.push(handler);
}

export function removeErrorHandler(handler) {
  if (typeof handler !== "function") {
    throw Error('handler 必须是一个函数');
  }

  let removedSomething = false;
  errorHandlers = errorHandlers.filter((h) => {
    const isHandler = h === handler;
    removedSomething = removedSomething || isHandler;
    return !isHandler;
  });

  return removedSomething;
}

// 报告错误信息
export function formatErrorMessage(code, msg, ...args) {
  return `single-spa minified message #${code}: ${
    msg ? msg + " " : ""
  }See https://single-spa.js.org/error/?code=${code}${
    args.length ? `&arg=${args.join("&arg=")}` : ""
  }`;
}

export function transformErr(ogErr, appOrParcel, newStatus) {
  const errPrefix = `${objectType(appOrParcel)} '${toName(
    appOrParcel
  )}' died in status ${appOrParcel.status}: `;

  let result;

  if (ogErr instanceof Error) {
    try {
      ogErr.message = errPrefix + ogErr.message;
    } catch (err) {
      /* Some errors have read-only message properties, in which case there is nothing
       * that we can do.
       */
    }
    result = ogErr;
  } else {
    console.warn(
      formatErrorMessage(
        30,
        __DEV__ &&
          `While ${appOrParcel.status}, '${toName(
            appOrParcel
          )}' rejected its lifecycle function promise with a non-Error. This will cause stack traces to not be accurate.`,
        appOrParcel.status,
        toName(appOrParcel)
      )
    );
    try {
      result = Error(errPrefix + JSON.stringify(ogErr));
    } catch (err) {
      // If it's not an Error and you can't stringify it, then what else can you even do to it?
      result = ogErr;
    }
  }

  result.appOrParcelName = toName(appOrParcel);

  // We set the status after transforming the error so that the error message
  // references the state the application was in before the status change.
  appOrParcel.status = newStatus;

  return result;
}
