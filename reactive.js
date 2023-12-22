function Reactive(
  ob,
  options = { prefix: "r-", subscriptionDelay: 0, const: false }
) {
  const newProxy = new Proxy(
    {
      _const: options.const,
      _prefix: options.prefix,
      _subscriptionDelay: options.subscriptionDelay,
      _mutted: new Set(),
      _delayedPayloads: {},
      _proxy: null,
      _subscriptions: {},
      _ignoredFunctions: ["valueOf", "toString", "join", "keys"],
      data: ob ?? {},

      subscribe: function (
        propInput,
        func,
        options = { triggerChange: false, subscriptionDelay: 0 }
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
          if (this.target._subscriptions[prop]) {
            this.target._subscriptions[prop].push({
              func,
              subscriptionDelay: options.subscriptionDelay,
            });
          } else {
            this.target._subscriptions[prop] = [
              { func, subscriptionDelay: options.subscriptionDelay },
            ];
          }
          if (options.triggerChange) {
            this.receiver.triggerChange(prop);
          }
        }
      },
      triggerSubs: function (data) {
        const { prop, path, value, oldValue } = data;
        const localpath = [...path.slice(this._path.length, path.length), prop];
        const localpathString = localpath.join(".");
        let valueThoughtLocalPath = null;
        let pathValues = [];
        const target = this._target;

        //TEST IF MUTTED
        if (target._mutted.has(localpathString)) return;
        //START MUTTED
        target._mutted.add(localpathString);

        //TEST SUBS
        if (
          target._subscriptions[localpath[0]]?.length ||
          target._subscriptions["_all"]?.length
        ) {
          //GET VALUE THOUGT PATH
          valueThoughtLocalPath = this;

          for (const k of localpath) {
            valueThoughtLocalPath = valueThoughtLocalPath._target.data[k];
            pathValues.push(valueThoughtLocalPath);
          }

          //WIDE SUBSCRIPTION
          for (const sub of [
            ...(target._subscriptions[localpath[0]] ?? []),
            ...(target._subscriptions["_all"] ?? []),
          ]) {
            if (target._subscriptionDelay || sub.subscriptionDelay) {
              if (target._delayedPayloads[localpathString]) {
                target._delayedPayloads[localpathString].value = data.value;
                target._delayedPayloads[localpathString].pathValues =
                  pathValues;
              } else {
                target._delayedPayloads[localpathString] = {
                  base: this,
                  prop,
                  path: localpath,
                  value: value ?? valueThoughtLocalPath,
                  oldValue,
                  pathValues,
                  prefix: this._prefix,
                };
                setTimeout(function () {
                  sub.func({ ...target._delayedPayloads[localpathString] });
                  delete target._delayedPayloads[localpathString];
                }, target._subscriptionDelay || sub.subscriptionDelay);
              }
            } else {
              sub.func({
                base: this,
                prop,
                path: localpath,
                value: value ?? valueThoughtLocalPath,
                oldValue,
                pathValues,
                prefix: this._prefix,
              });
            }
          }
        }
        //END MUTTED
        target._mutted.delete(localpathString);

        //NOTYFY PARENT
        if (target._parent?.receiver) {
          target._parent.receiver.triggerSubs.bind(target._parent?.receiver)({
            prop,
            path,
            value: value,
            pathValues,
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

      proxyFunction: function () {
        //EXECUTE FUNCTION
        const ret = this.target.data[this.prop].bind(this.target.data)(
          ...arguments
        );
        //REBUILD RELATIONSHIPS
        this.target.rebuildRelationships.bind(this)();
        //POST TRIGGER
        this.target.triggerSubs.bind(this.receiver)({
          prop: this.prop,
          path: this.receiver._path,
        });
        return ret;
      },
      orphan: function () {
        if (!this.target._parent) return;
        const parentReceiver = this.target._parent.receiver;
        const parentTarget = parentReceiver._target;
        const prop = this.target._parent.prop;
        delete this.target._parent;

        if (parentTarget.data.constructor.name === "Array") {
          parentTarget.data.splice(prop, 1);
        } else {
          delete parentReceiver[prop];
        }

        //REBUILD RELATIONSHIPS
        parentReceiver.rebuildRelationships();

        return this.receiver;
      },
      rebuildRelationships: function () {
        //Rebuild parent relationship
        for ([key, value] of Object.entries(this.target.data)) {
          if (value?.isReactive) {
            value._target._parent = {
              prop:
                this.target.data.constructor.name === "Array"
                  ? parseInt(key)
                  : key,
              receiver: newProxy,
            };
          }
        }
      },
    },
    {
      get: (target, prop, receiver) => {
        if (prop === Symbol.iterator) {
          if (target.data.constructor.name === "Array") {
            return target.data[Symbol.iterator].bind(target.data);
          } else {
            const dataArr = Object.entries(target.data);
            return dataArr[Symbol.iterator].bind(dataArr);
          }
        }
        switch (prop) {
          case "_path":
            const ret = [];
            let rv = receiver;
            while (rv?._parent) {
              ret.unshift(rv._parent.prop);
              rv = rv._parent.receiver;
            }
            return ret;
          case "_parent":
          case "_prefix":
          case "_proxy":
            return target[prop];
          case "_target":
            return target;
          case "_data":
          case "_":
            if (target.data.constructor.name === "Object") {
              const ret = Object.fromEntries(
                Object.entries(target.data).map(([key, val]) => {
                  if (val?.isReactive) {
                    return [key, val._];
                  } else {
                    return [key, val];
                  }
                })
              );
              return ret;
            }
            if (target.data.constructor.name === "Array") {
              const ret = target.data.map((val) => {
                if (val?.isReactive) {
                  return val._;
                } else {
                  return val;
                }
              });
              return ret;
            }
            return target.data;
          case "isReactive":
            return true;
          case "subscribe":
            return target.subscribe.bind({ receiver, target });
          case "triggerSubs":
            return target.triggerSubs.bind(receiver);
          case "triggerChange":
            return target.triggerChange.bind(receiver);
          case "triggerUpTree":
            return target.triggerUpTree.bind(receiver);
          case "orphan":
            return target.orphan.bind({ receiver, target });
          case "rebuildRelationships":
            return target.rebuildRelationships.bind({ receiver, target });
        }
        if (
          typeof target.data[prop] === "function" &&
          !target._ignoredFunctions.includes(prop)
        ) {
          return target.proxyFunction.bind({ target, prop, receiver });
        }
        return target.data[prop];
      },
      set: (target, prop, value, receiver) => {
        switch (prop) {
          case "_parent":
          case "_prefix":
          case "_proxy":
            target[prop] = value;
            return true;
        }

        //SET REACTIVE PARENTSHIP
        if (value?.isReactive) {
          value._parent = { prop: prop, receiver };
        }
        //BLOCK SAME VALUE

        if (target.data[prop] === value) {
          return true;
        }

        //RUN PARENT SUBSCRIPTIONS
        let oldData = receiver._;
        let oldValue = target.data[prop];

        //OBJECTS CAN BE CONST
        if (
          this._const &&
          target.data[prop] &&
          target.data[prop].isReactive &&
          value.isReactive &&
          target.data[prop].constructor.name === "Object" &&
          value?._target?.data.constructor.name === "Object"
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
          value: value?.isReactive ? value._ : value,
          oldValue: oldValue?.isReactive ? oldValue._ : oldValue,
        });

        return true;
      },
      deleteProperty(target, prop) {
        if (prop in target.data) {
          delete target.data[prop];
          //POST TRIGGER
          target.triggerSubs.bind(target._proxy)({
            prop: prop,
            path: target._proxy._path,
          });
        }
        return true;
      },
    }
  );
  //GIVE ACCESS TO PROXY FROM TARGET
  const newProxyTarget = newProxy._target;
  newProxyTarget._proxy = newProxy;
  //CHAIN REACTIVES
  for ([key, value] of Object.entries(newProxyTarget.data)) {
    if (value?.isReactive) {
      value._target._parent = {
        prop:
          newProxyTarget.data.constructor.name === "Array"
            ? parseInt(key)
            : key,
        receiver: newProxy,
      };
    }
  }
  return newProxy;
}

if (typeof module !== "undefined") {
  module.exports = {
    Reactive,
  };
}
