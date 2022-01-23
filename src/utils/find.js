// npm和lodash的find包都比较大，所以作者自己写了一个

// 遍历数组，将数组中每一项作为参数，调用func执行。如果func执行后返回true，则返回当前数组的值，否则依次执行。
export function find(arr, func) {
  for (let i = 0; i < arr.length; i++) {
    if (func(arr[i])) {
      return arr[i];
    }
  }

  return null;
}
