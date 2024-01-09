const reactiveObjects = new Map();
function Reactive(
  ob,
  options = {
    obId: null,
    prefix: "r-",
    subscriptionDelay: 0,
    const: false,
    related: null,
    ignoreSameValue: false,
  }
) {
  const newProxy = new Proxy(
    {
      _obId:
        options.obId ??
        new Date().getTime().toString(36) +
          "-" +
          (performance.now() * 1000).toString(36).replace(".", "-"),
      _options: options,
      _rel: options.related,
      _parents: [],
      _prefix: options.prefix,
      _mutted: new Set(),
      _delayedPayloads: {},
      _subscriptions: {},
      _ignoredFunctions: ["valueOf", "toString", "join", "keys"],
      data: ob ?? {},

      subscribe: function (
        propInput,
        func,
        options = {
          triggerChange: false,
          subscriptionDelay: 0,
          pathValues: false,
          detailed: false,
        }
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
              options,
            });
          } else {
            this.target._subscriptions[prop] = [
              {
                func,
                options,
              },
            ];
          }
          if (options.triggerChange) {
            this.receiver.triggerChange(prop);
          }
        }
      },
      triggerSubs: function (data) {
        let { prop, path, pathIds, value, oldValue } = data;

        if (!path) {
          path = [prop];
          pathIds = [value?._obId];
        }

        const pathString = path.join(".");
        const localpath = path;

        let valueThoughtLocalPath = null;
        let pathValues = [];

        //TEST IF MUTTED
        if (this.target._mutted.has(pathString)) return;
        //START MUTTED
        this.target._mutted.add(pathString);

        //TEST SUBS
        if (
          this.target._subscriptions[localpath[0]]?.length ||
          this.target._subscriptions["_all"]?.length
        ) {
          //WIDE SUBSCRIPTION
          for (const sub of [
            ...(this.target._subscriptions[localpath[0]] ?? []),
            ...(this.target._subscriptions["_all"] ?? []),
          ]) {
            if (sub.options.pathValues) {
              valueThoughtLocalPath = this.receiver;

              for (const k of localpath) {
                valueThoughtLocalPath = valueThoughtLocalPath._target.data[k];
                pathValues.push(valueThoughtLocalPath);
              }
            }

            if (
              this.target._options.subscriptionDelay ||
              sub.options.subscriptionDelay
            ) {
              if (this.target._delayedPayloads[pathString]) {
                this.target._delayedPayloads[pathString].value = data.value;
                this.target._delayedPayloads[pathString].pathValues =
                  pathValues;
              } else {
                this.target._delayedPayloads[pathString] = {
                  base: this.receiver,
                  prop,
                  path,
                  pathIds,
                  pathString,
                  value: value?._isReactive
                    ? sub.options.detailed
                      ? value.__
                      : value._
                    : value,
                  rawValue: value,
                  oldValue,
                  pathValues,
                  prefix: this._prefix,
                };
                setTimeout(
                  function () {
                    sub.func({
                      ...this.target._delayedPayloads[pathString],
                    });
                    delete this.target._delayedPayloads[pathString];
                  }.bind(this),
                  this.target._options.subscriptionDelay ||
                    sub.options.subscriptionDelay
                );
              }
            } else {
              sub.func({
                base: this.receiver,
                prop,
                path,
                pathIds,
                pathString,
                value: value?._isReactive
                  ? sub.options.detailed
                    ? value.__
                    : value._
                  : value,
                rawValue: value,
                oldValue,
                pathValues,
                prefix: this._prefix,
              });
            }
          }
        }
        //END MUTTED
        this.target._mutted.delete(pathString);

        //NOTYFY PARENT
        //if (target._parent?.receiver) {
        for (const parent of this.target._parents || []) {
          parent.receiver.triggerSubs.bind({
            target: parent.receiver._target,
            receiver: parent.receiver,
          })({
            prop,
            path: [parent.prop, ...path],
            pathIds: [parent.receiver._obId, ...pathIds],
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
            if (this.target.data[prop]._isReactive) {
              this.target.data[prop].triggerUpTree();
            }
          }
        }
        if (this.target.data.constructor.name === "Object") {
          for ([prop, value] of Object.entries(this.target.data)) {
            this.receiver.triggerChange(prop);
            if (this.target.data[prop]._isReactive) {
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
          if (value?._isReactive) {
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
      unmute: function (path) {
        const localpath = path.join(".");
        this.target._mutted.delete(localpath);
      },
      delete: function () {
        this.receiver.orphan();
        reactiveObjects.delete(this.target._obId);
        delete this.receiver;
        return true;
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
          case "_obId":
          case "_parents":
          case "_prefix":
          case "_options":
          case "_rel":
            return target[prop];
          case "_target":
            return target;
          case "_":
            if (target.data.constructor.name === "Object") {
              const ret = Object.fromEntries(
                Object.entries(target.data).map(([key, val]) => {
                  if (val?._isReactive) {
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
                if (val?._isReactive) {
                  return val._;
                } else {
                  return val;
                }
              });
              return ret;
            }
            return target.data;
          case "__":
            if (target.data.constructor.name === "Object") {
              const ret = {
                _obId: target._obId,
                _parents: target._parents.map((p) => p.receiver._obId),
                _prefix: target._prefix,
                value: Object.fromEntries(
                  Object.entries(target.data).map(([key, val]) => {
                    if (val?._isReactive) {
                      return [key, val.__];
                    } else {
                      return [key, val];
                    }
                  })
                ),
              };
              return ret;
            }
            if (target.data.constructor.name === "Array") {
              const ret = target.data.map((val) => {
                if (val?._isReactive) {
                  return val.__;
                } else {
                  return val;
                }
              });
              return ret;
            }
            return target.data;
          case "_isReactive":
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
          case "unmute":
            return target.unmute.bind({ target, receiver });
          case "delete":
            return target.delete.bind({ target, receiver });
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
          case "_rel":
            target[prop] = value;
            return true;
        }

        //BLOCK SAME VALUE
        if (target._options?.ignoreSameValue && target.data[prop] === value) {
          return true;
        }

        //RUN PARENT SUBSCRIPTIONS
        let oldData = receiver._;
        let oldValue = target.data[prop];

        //OBJECTS CAN BE CONST

        if (
          target.data?.[prop]?._options?.const &&
          //value?._isReactive &&
          target.data[prop]._isReactive &&
          target.data[prop]._target.data.constructor.name === "Object" &&
          (value?._target?.data.constructor.name === "Object" ||
            value?.constructor.name === "Object")
        ) {
          //ON THIS CASE NO SELF CHANGE
          if (value?._isReactive) {
            for ([k, v] of value) {
              target.data[prop][k] = v;
            }
          } else {
            for ([k, v] of Object.entries(value)) {
              target.data[prop][k] = v;
            }
          }
          return true;
        } else {
          target.data[prop] = value;
        }

        //SET REACTIVE PARENTSHIP
        if (value?._isReactive) {
          receiver.rebuildRelationships.bind({ target, receiver })();
        }

        //RUN SUBSCRIPTIONS
        target.triggerSubs.bind({ target, receiver })({
          prop,
          path: receiver._path,
          value: value,
          oldValue: oldValue,
        });

        return true;
      },
      deleteProperty(target, prop) {
        const receiver = reactiveObjects.get(target._obId);
        if (prop in target.data) {
          if (target.data[prop]._isReactive) {
            const delIndex = target.data[prop]._parents.findIndex(
              (childParent) => {
                return (
                  childParent.receiver === receiver && childParent.prop === prop
                );
              }
            );
            if (delIndex != null) {
              target.data[prop]._parents.splice(delIndex, 1);
              if (target.data[prop]._parents.length === 0) {
                target.data[prop].delete();
              }
            }
          }
          delete target.data[prop];
          //POST TRIGGER
          target.triggerSubs.bind({ target: target, receiver: receiver })({
            prop: prop,
          });
        }
        return true;
      },
    }
  );
  //GIVE ACCESS TO PROXY FROM TARGET
  const newProxyTarget = newProxy._target;

  //CHAIN REACTIVES
  newProxy.rebuildRelationships();

  reactiveObjects.set(newProxy._obId, newProxy);

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
    reactiveObjects,
  };
}
