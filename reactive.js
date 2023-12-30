function Reactive(
  ob,
  options = { prefix: "r-", subscriptionDelay: 0, const: false, related: null }
) {
  const newProxy = new Proxy(
    {
      _rel: options.related,
      _parents: [],
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
        let { prop, path, value, oldValue } = data;
        path = path ? path : [prop];
        const localpath = path;

        const localpathString = localpath.join(".");
        let valueThoughtLocalPath = null;
        let pathValues = [];

        //TEST IF MUTTED
        if (this.target._mutted.has(localpathString)) return;
        //START MUTTED
        this.target._mutted.add(localpathString);

        //TEST SUBS
        if (
          this.target._subscriptions[localpath[0]]?.length ||
          this.target._subscriptions["_all"]?.length
        ) {
          //GET VALUE THOUGT PATH
          valueThoughtLocalPath = this.receiver;

          for (const k of localpath) {
            valueThoughtLocalPath = valueThoughtLocalPath._target.data[k];
            pathValues.push(valueThoughtLocalPath);
          }

          //WIDE SUBSCRIPTION
          for (const sub of [
            ...(this.target._subscriptions[localpath[0]] ?? []),
            ...(this.target._subscriptions["_all"] ?? []),
          ]) {
            if (this.target._subscriptionDelay || sub.subscriptionDelay) {
              if (this.target._delayedPayloads[localpathString]) {
                this.target._delayedPayloads[localpathString].value =
                  data.value;
                this.target._delayedPayloads[localpathString].pathValues =
                  pathValues;
              } else {
                this.target._delayedPayloads[localpathString] = {
                  base: this,
                  prop,
                  path: localpath,
                  value: value,
                  oldValue,
                  pathValues,
                  prefix: this._prefix,
                };
                setTimeout(
                  function () {
                    sub.func({
                      ...this.target._delayedPayloads[localpathString],
                    });
                    delete this.target._delayedPayloads[localpathString];
                  }.bind(this),
                  this.target._subscriptionDelay || sub.subscriptionDelay
                );
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
        this.target._mutted.delete(localpathString);

        //NOTYFY PARENT
        //if (target._parent?.receiver) {
        for (const parent of this.target._parents || []) {
          parent.receiver.triggerSubs.bind({
            target: parent.receiver._target,
            receiver: parent.receiver,
          })({
            prop,
            path: [parent.prop, ...path],
            value: value,
            pathValues,
            oldValue,
          });
        }
      },

      triggerChange: function (prop) {
        if (prop) {
          this.target.triggerSubs.bind(this)({
            prop,
            value: this.target.data[prop],
          });
        } else {
          for (const parent of this.target._parents || []) {
            parent.receiver._target.triggerSubs.bind({
              target: parent.receiver._target,
              receiver: parent.receiver,
            })({
              prop: parent.prop,
              value: this.receiver,
            });
          }
        }
      },
      triggerUpTree: function () {
        if (this.target.data.constructor.name === "Array") {
          for (value of this.target.data) {
            const prop = this.target.data.indexOf(value);
            this.receiver.triggerChange(prop);
            if (this.target.data[prop].isReactive) {
              this.target.data[prop].triggerUpTree();
            }
          }
        }
        if (this.target.data.constructor.name === "Object") {
          for ([prop, value] of Object.entries(this.target.data)) {
            this.receiver.triggerChange(prop);
            if (this.target.data[prop].isReactive) {
              this.target.data[prop].triggerUpTree();
            }
          }
        }
      },
      proxyFunction: function () {
        //EXECUTE FUNCTION
        const ret = this.target.data[this.prop].bind(this.target.data)(
          ...arguments
        );
        //REBUILD RELATIONSHIPS
        this.receiver.rebuildRelationships();
        //POST TRIGGER
        this.target.triggerSubs.bind(this)({
          prop: this.prop,
        });
        return ret;
      },
      orphan: function () {
        if (!this.target._parents.length) return;
        for (const parent of this.target._parents || []) {
          const parentReceiver = parent.receiver;
          const parentTarget = parentReceiver._target;
          const prop = parent.prop;

          if (parentTarget.data.constructor.name === "Array") {
            parentTarget.data.splice(prop, 1);
          } else {
            delete parentReceiver[prop];
          }

          //REBUILD RELATIONSHIPS
          parentReceiver.rebuildRelationships();
        }
        this.target._parents = [];
        return this.receiver;
      },
      rebuildRelationships: function () {
        //Rebuild parent relationship
        for ([key, value] of Object.entries(this.target.data)) {
          if (value?.isReactive) {
            const parentExists = value._target._parents.find((parent) => {
              return parent.receiver === this.receiver;
            });

            if (parentExists) {
              parentExists.prop =
                this.target.data.constructor.name === "Array"
                  ? parseInt(key)
                  : key;
            } else {
              value._target._parents.push({
                prop:
                  this.target.data.constructor.name === "Array"
                    ? parseInt(key)
                    : key,
                receiver: this.receiver,
              });
            }
          }
        }
      },
      mute: function (path) {
        const localpath = path.join(".");
        this.target._mutted.add(localpath);
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
          /*case "_paths":
            const ret = [];
            let rv = receiver;
            while (rv?._parents.length) {
              ret.unshift(rv._parent.prop);
              rv = rv._parent.receiver;
            }
            return ret;*/
          case "_parents":
          case "_prefix":
          case "_proxy":
          case "_const":
          case "_rel":
            return target[prop];
          case "_target":
            return target;
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
            return target.subscribe.bind({ target, receiver });
          case "triggerSubs":
            return target.triggerSubs.bind({ target, receiver });
          case "triggerChange":
            return target.triggerChange.bind({ target, receiver });
          case "triggerUpTree":
            return target.triggerUpTree.bind({ target, receiver });
          case "orphan":
            return target.orphan.bind({ target, receiver });
          case "rebuildRelationships":
            return target.rebuildRelationships.bind({ target, receiver });
          case "mute":
            return target.mute.bind({ target, receiver });
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
          case "_parents":
          case "_prefix":
          case "_proxy":
            target[prop] = value;
            return true;
        }

        //SET REACTIVE PARENTSHIP
        if (value?.isReactive) {
          value._parents.push({ prop: prop, receiver });
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
          target.data?.[prop]?._const &&
          value?.isReactive &&
          target.data[prop].isReactive &&
          target.data[prop]._target.data.constructor.name === "Object" &&
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
        target.triggerSubs.bind({ target, receiver })({
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
          target.triggerSubs.bind({ target: target, receiver: target._proxy })({
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
  newProxy.rebuildRelationships();
  return newProxy;
}

function Reactivate(related, ob, options) {
  related.reactive = Reactive(ob, { ...options, related });
  return related.reactive;
}

if (typeof module !== "undefined") {
  module.exports = {
    Reactive,
    Reactivate,
  };
}
