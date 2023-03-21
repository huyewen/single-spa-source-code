(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define(["exports"], factory);
  } else if (typeof exports !== "undefined") {
    factory(exports);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod.exports);
    global.singleSpaVue = mod.exports;
  }
})(this, function (_exports) {
  "use strict";

  Object.defineProperty(_exports, "__esModule", {
    value: true
  });
  _exports["default"] = singleSpaVue;

  function ownKeys (object, enumerableOnly) {
    var keys = Object.keys(object); // keys返回的是可枚举的属性键值数组
    if (Object.getOwnPropertySymbols) {
      var symbols = Object.getOwnPropertySymbols(object); // getOwnPropertySymbols返回一个对象的symbol键值数组
      if (enumerableOnly) symbols = symbols.filter(function (sym) { //  返回可枚举的symbol属性
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
      keys.push.apply(keys, symbols);
    }
    return keys; // 可枚举的一般属性和可枚举的symbol属性
  }

  function _objectSpread (target) { // 刚来的时候target是个{}对象
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] != null ? arguments[i] : {};
      if (i % 2) { // i 为奇数
        ownKeys(source, true).forEach(function (key) {
          _defineProperty(target, key, source[key]);
        });
      } else if (Object.getOwnPropertyDescriptors) { // i 为偶数并且getOwnPropertyDescriptors存在(getOwnPropertyDescriptors获取对象所有自身属性的描述符)
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); // 通过描述符的形式一次定义多个属性
      } else {
        ownKeys(source).forEach(function (key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
    }
    return target;
  }

  function _defineProperty (obj, key, value) {
    if (key in obj) { // 可枚举
      Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true });
    } else {
      obj[key] = value;
    }
    return obj;
  }

  function _typeof (obj) {
    if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
      _typeof = function _typeof (obj) {
        return typeof obj;
      };
    } else {
      _typeof = function _typeof (obj) {
        return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
      };
    }
    return _typeof(obj);
  }

  var defaultOpts = {
    // required opts
    Vue: null,
    appOptions: null,
    template: null
  };

  function singleSpaVue (userOpts) {
    if (_typeof(userOpts) !== 'object') {
      throw new Error("single-spa-vue requires a configuration object");
    }
    // 合并选项
    var opts = _objectSpread({}, defaultOpts, {}, userOpts);

    if (!opts.Vue) {
      throw new Error('single-spa-vuejs must be passed opts.Vue');
    }

    if (!opts.appOptions) {
      throw new Error('single-spa-vuejs must be passed opts.appOptions');
    } // Just a shared object to store the mounted object state


    var mountedInstances = {};
    return {
      bootstrap: bootstrap.bind(null, opts, mountedInstances),
      mount: mount.bind(null, opts, mountedInstances),
      unmount: unmount.bind(null, opts, mountedInstances),
      update: update.bind(null, opts, mountedInstances)
    };
  }

  function bootstrap (opts) {
    if (opts.loadRootComponent) {
      return opts.loadRootComponent().then(function (root) {
        return opts.rootComponent = root;
      });
    } else {
      return Promise.resolve();
    }
  }
  /**
   * props为mount在挂载时被调用时传入的参数，其中有以下值
   * {
   *    name,        // 注册到 single-spa 的应用名称
   *    singleSpa,   // singleSpa实例
   *    mountParcel, // 手动挂载的函数
   *    customProps  // 注册应用时传入自定义属性
   * }
   */
  /**
   * 判断是否已指定应用的dom容器元素，没有则创建并添加到body中，然后判断是否存在渲染函数，没有则使用默认
   */
  function mount (opts, mountedInstances, props) {
    return Promise.resolve().then(function () {
      // 合并选项
      var appOptions = _objectSpread({}, opts.appOptions); // 创建Vue实例的options选项
      // 假如props中有domElement属性，而appOptions中没有el属性
      if (props.domElement && !appOptions.el) { // domElement为元素对像
        appOptions.el = props.domElement;
      }

      if (!appOptions.el) { // appOptions中没有el属性
        var htmlId = "single-spa-application:".concat(props.name); // 新元素ID
        /**
         * document.querySelector方法规定当选择器中存在冒号:或者空格时，需要使用反斜杠将这些字符进行转义
         * 这是因为Vue在判断不存在template时，会去查找是否存在el，并且若el为字符串时，会使用querySelector获取该
         * 选择器字符串对应的DOM元素
         */
        // 最后找到的是single-spa-container对应的元素，也就是single-spa-application:app元素下的single-spa-container元素
        appOptions.el = "#".concat(htmlId.replace(':', '\\:'), " .single-spa-container");

        var domEl = document.getElementById(htmlId); // 获取ID对于的元素对象

        if (!domEl) { // 当元素对象不存在，创建对于ID的新元素并添加到body中
          domEl = document.createElement('div');
          domEl.id = htmlId;
          document.body.appendChild(domEl);
        }

        // 当ID对应元素中不存在container元素时，创建container元素并添加到domEl中
        if (!domEl.querySelector('.single-spa-container')) {
          var singleSpaContainer = document.createElement('div');
          singleSpaContainer.className = 'single-spa-container';
          domEl.appendChild(singleSpaContainer);
        }

        mountedInstances.domEl = domEl;
      }
      // appOptions中不存在render函数，或者不存在template模板，但是存在根组件（也就是入口文件APP组件），则使用根组件生成一个render函数并赋值给appOptions.render
      if (!appOptions.render && !appOptions.template && opts.rootComponent) {
        appOptions.render = function (h) { // 根据根组件APP新建一个render函数
          return h(opts.rootComponent);
        };
      }

      if (!appOptions.data) {
        appOptions.data = {};
      }
      // 合并appOptions.data和调用mount函数传入的props对象，并赋给appOptions.data，上面看到props中有以下属性
      /**
       * name,        // 注册到 single-spa 的应用名称
       * singleSpa,   // singleSpa实例
       * mountParcel, // 手动挂载的函数
       * customProps  // 注册应用时传入自定义属性
       */
      // 所以在合并后在Vue应用中可以通过this.singleSpa微前端实例以及其它几个属性
      appOptions.data = _objectSpread({}, appOptions.data, {}, props);
      mountedInstances.instance = new opts.Vue(appOptions); // 创建Vue实例

      if (mountedInstances.instance.bind) { // 绑定vue实例的调用
        mountedInstances.instance = mountedInstances.instance.bind(mountedInstances.instance);
      }
    });
  }
  // 基座应用通过update生命周期函数可以更新子应用的属性
  function update (opts, mountedInstances, props) {
    return Promise.resolve().then(function () {
      var data = _objectSpread({}, opts.appOptions.data || {}, {}, props);

      for (var prop in data) {
        mountedInstances.instance[prop] = data[prop];
      }
    });
  }
  // 调用VUE实例的$destroy钩子函数，销毁子应用
  function unmount (opts, mountedInstances) {
    return Promise.resolve().then(function () {
      mountedInstances.instance.$destroy(); // 销毁Vue实例
      mountedInstances.instance.$el.innerHTML = ''; // 清空挂载元素的内容
      delete mountedInstances.instance; // 删除Vue实例

      if (mountedInstances.domEl) {
        mountedInstances.domEl.innerHTML = '';
        delete mountedInstances.domEl;
      }
    });
  }
});
