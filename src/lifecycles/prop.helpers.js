import * as singleSpa from "../single-spa.js";
import { mountParcel } from "../parcels/mount-parcel.js";
import { assign } from "../utils/assign.js";
import { isParcel, toName } from "../applications/app.helpers.js";
import { formatErrorMessage } from "../applications/app-errors.js";

// 获取完整属性
export function getProps(appOrParcel) {
  const name = toName(appOrParcel);
  // 获取自定义属性
  let customProps = typeof appOrParcel.customProps === "function" ? appOrParcel.customProps(name, window.location) : appOrParcel.customProps;
  // 书写方式校验
  if ( typeof customProps !== "object" || customProps === null || Array.isArray(customProps) ) {
    customProps = {};
    console.warn('customProps 必须返回一个对象');
  }
  // 将自定义属性和singleSpa进行合并
  const result = assign({}, customProps, {
    name,
    mountParcel: mountParcel.bind(appOrParcel),
    singleSpa,
  });

  if (isParcel(appOrParcel)) {
    result.unmountSelf = appOrParcel.unmountThisParcel;
  }

  return result;
}
