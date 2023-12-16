module.exports = function Reactive(ob) {
  const newProxy = new Proxy(
    {
      _prefix: "-r",
      _mutted: new Set(),
      data: ob ?? {},
      subscriptions: {},

      subscribe: function (
        propInput,
        func,
        options = { triggerChange: false }
      ) {
        let propArr;
        if (!propInput) {
          propArr = ["_all"];
        } else if (typeof propInput === "string") {
          propArr = [propInput];
        } else {
          propArr = Array.from(new Set(propInput));
        }
        for (const prop of propArr) {
          if (this._target.subscriptions[prop]) {
            this._target.subscriptions[prop].push(func);
          } else {
            this._target.subscriptions[prop] = [func];
          }
          if (options.triggerChange) {
            this.triggerChange(prop);
          }
        }
      },
      triggerSubs: function (data) {
        const { prop, path, value, oldValue } = data;
        const localpath = [...path.slice(this._path.length, path.length), prop];
        const localpathString = localpath.join(".");
        if (this._target._mutted.has(localpathString)) return;
        this._target._mutted.add(localpathString);

        //WIDE SUBSCRIPTION

        for (const sub of [
          ...(this._target.subscriptions[localpath[0]] ?? []),
          ...(this._target.subscriptions["_all"] ?? []),
        ]) {
          sub({
            base: this,
            prop,
            path: localpath,
            value,
            oldValue,
            prefix: this._prefix,
          });
        }

        this._target._mutted.delete(localpathString);

        if (this._target._parent?.receiver) {
          this._target._parent.receiver.triggerSubs({
            prop,
            path,
            value,
            oldValue,
          });
        }
      },
      triggerChange: function (prop) {
        if (prop) {
          this._target.triggerSubs.bind(this)({
            prop,
            path: this._path,
            value: this._target.data[prop],
          });
        } else {
          if (this._parent) {
            this._parent.receiver._target.triggerSubs.bind(
              this._parent.receiver
            )({
              prop: this._parent.prop,
              path: this._parent.receiver._path,
              value: this,
            });
          }
        }
      },
      triggerUpTree: function () {
        for (prop of this.keys()) {
          this.triggerChange(prop);
          if (this._target.data[prop].isReactive) {
            this._target.data[prop].triggerUpTree();
          }
        }
      },
      keys: function () {
        return Object.keys(this._data);
      },
    },
    {
      get: (target, prop, receiver) => {
        if (prop === Symbol.iterator) {
          const dataArr = Object.entries(target.data);
          return dataArr[Symbol.iterator].bind(dataArr);
        }
        let currentTarget = target;
        if (target.isReactive) {
          currentTarget = target._data;
        }
        if (prop === "_path") {
          const ret = [];
          let rv = receiver;
          while (rv?._parent) {
            ret.unshift(rv._parent.prop);
            rv = rv._parent.receiver;
          }
          return ret;
        }
        if (prop === "_parent" || prop === "_prefix") {
          return target[prop];
        }
        if (prop === "_target") {
          return target;
        }
        if (prop === "_data") {
          const ret = Object.fromEntries(
            Object.entries(currentTarget.data).map(([key, val]) => {
              if (val?.isReactive) {
                return [key, val._data];
              } else {
                return [key, val];
              }
            })
          );
          return ret;
        }
        if (prop == "isReactive") {
          return true;
        }

        if (prop == "subscribe") {
          return target.subscribe.bind(receiver);
        }
        if (prop == "triggerSubs") {
          return target.triggerSubs.bind(receiver);
        }
        if (prop == "triggerChange") {
          return target.triggerChange.bind(receiver);
        }
        if (prop == "triggerUpTree") {
          return target.triggerUpTree.bind(receiver);
        }
        if (prop == "keys") {
          return target.keys.bind(receiver);
        }

        return target.data[prop];
      },
      set: (target, prop, value, receiver) => {
        if (prop === "_parent" || prop === "_prefix") {
          target[prop] = value;
          return true;
        }

        if (value?.isReactive) {
          value._parent = { prop: prop, receiver };
        }
        //BLOCK SAME VALUE

        if (target.data[prop] === value) {
          return true;
        }

        //RUN PARENT SUBSCRIPTIONS
        let oldData = receiver._data;
        let oldValue = target.data[prop];

        if (
          target.data[prop] &&
          target.data[prop].isReactive &&
          value.isReactive
        ) {
          //ON THIS CASE NO SELF CHANGE
          for ([k, v] of value) {
            target.data[prop][k] = v;
          }
          return true;
        } else {
          target.data[prop] = value;
        }
        //RUN SUBSCRIPTIONS

        target.triggerSubs.bind(receiver)({
          prop,
          path: receiver._path,
          value: value?.isReactive ? value._data : value,
          oldValue: oldValue?.isReactive ? oldValue._data : oldValue,
        });

        return true;
      },
    }
  );
  //CHAIN REACTIVES
  for ([key, value] of Object.entries(newProxy._target.data)) {
    if (value?.isReactive) {
      value._target._parent = { prop: key, receiver: newProxy };
    }
  }
  return newProxy;
};
