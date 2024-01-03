const { reactiveObjects, Reactive, Reactivate } = require("../reactive.js");
const chai = require("chai");
const assert = require("assert");

it("Reactive Basic", function () {
  const games = Reactive(null, { ignoreSameValue: true });
  //SUBSCRIBE to test property changes
  games.subscribe(
    "test",
    (data) => {
      const { base, prop, path, pathValues, value, oldValue } = data;
      assert.equal(prop, "test");
      assert.equal(path.length, 1);
      assert.equal(pathValues[0], 1);
      assert.equal(value, 1);
      assert.equal(oldValue, undefined);
    },
    { pathValues: true }
  );
  games.test = 1;

  //Multiple property subcription
  games.subscribe(["test2", "test3"], (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop.includes("test"), true);
    assert.equal(path.length, 1);
    assert.equal(value, "OK");
    assert.equal(oldValue, undefined);
  });
  games.test2 = "OK";
  games.test3 = "OK";

  games.test4 = "OK";
  games.test4 = "OK";
});

it("Reactive Multiple properties one subscription", function () {
  const games = Reactive();
  //Multiple property subcription
  games.subscribe(["test2", "test3"], (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop.includes("test"), true);
    assert.equal(path.length, 1);
  });
  games.test2 = "OK";
  games.test3 = "OK";
  games.subscribe(["test2", "test3"], (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop.includes("test"), true);
    assert.equal(path.length, 1);
    assert.equal(value, "KO");
    assert.equal(oldValue, "OK");
  });
  games.test2 = "KO";
  games.test3 = "KO";
});

it("Trigger change when subscribe", function () {
  const games = Reactive({ test: 1 });
  //SUBSCRIBE to test property changes
  games.subscribe(
    "test",
    (data) => {
      const { base, prop, path, pathValues, value, oldValue } = data;
      assert.equal(prop, "test");
      assert.equal(path.length, 1);
      assert.equal(pathValues[0], 1);
      assert.equal(value, 1);
      assert.equal(oldValue, undefined);
      games.ok = "OK";
    },
    { triggerChange: true, pathValues: true }
  );
  assert.equal(games.ok, "OK");
  //Multiple property subcription
  games.subscribe(["test2", "test3"], (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop.includes("test"), true);
    assert.equal(path.length, 1);
    assert.equal(value, "OK");
    assert.equal(oldValue, undefined);
    games.ok = "OK2";
  });
  games.test2 = "OK";
  games.test3 = "OK";
  assert.equal(games.ok, "OK2");
});

it("Reactive Chain", function () {
  const games = Reactive(
    {
      number: 1,
      level1: Reactive([Reactive({ level3: "OK" }, { prefix: "level2" })], {
        prefix: "level1",
      }),
    },
    { prefix: "base" }
  );
  //SUBSCRIBE to every change in Reactive chain
  games.subscribe(null, (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop, "level3");
    assert.equal(JSON.stringify(path), JSON.stringify(["level1", 0, "level3"]));
    assert.equal(value, "KO");
    assert.equal(oldValue, "OK");
  });
  assert.equal(games.level1[0].level3, "OK");
  games.level1[0].level3 = "KO";
  assert.equal(
    JSON.stringify(games._),
    JSON.stringify({ number: 1, level1: [{ level3: "KO" }] })
  );
});

it("Delayed trigger", async function () {
  const games = Reactive(null, {
    prefix: "subcriptionDelayed",
    subscriptionDelay: 10,
  });
  games.subscribe(
    "test",
    (data) => {
      const { base, prop, path, pathValues, value, oldValue } = data;
      assert.equal(prop, "test");
      assert.equal(path.length, 1);
      assert.equal(pathValues[0], 2);
      assert.equal(value, 2);
      assert.equal(oldValue, undefined);
      games.ok = "OK";
    },
    { pathValues: true }
  );
  games.test = 1; //<--- this value ignored because of subscriptionDelay
  games.test = 2;
  assert.equal(games.ok, undefined);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(games.ok, "OK");
});

it("Delayed trigger on subscription", async function () {
  const games = Reactive(null, {
    prefix: "subcriptionDelayed",
  });
  games.subscribe(
    "test",
    (data) => {
      const { base, prop, path, pathValues, value, oldValue } = data;
      assert.equal(prop, "test");
      assert.equal(path.length, 1);
      assert.equal(pathValues[0], 2);
      assert.equal(value, 2);
      assert.equal(oldValue, undefined);
    },
    { subscriptionDelay: 10, pathValues: true }
  );
  games.test = 1; //<--- this value ignored because of subscriptionDelay
  games.test = 2;
  await new Promise((resolve) => setTimeout(resolve, 20));
});

it("Delayed trigger on tree", async function () {
  const games = Reactive(
    {
      level1: Reactive([Reactive({ level3: "OK" }, { prefix: "level2" })], {
        prefix: "level1",
      }),
    },
    { prefix: "base", subscriptionDelay: 10 } //<--- delay 10ms
  );
  //SUBSCRIBE to every change in Reactive chain
  games.subscribe(null, (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop, "level3");
    assert.equal(JSON.stringify(path), JSON.stringify(["level1", 0, "level3"]));
    assert.equal(value, "KO1");
    assert.equal(oldValue, "OK");
  });
  assert.equal(games.level1[0].level3, "OK");
  games.level1[0].level3 = "KO"; //<--- this value ignored because of subscriptionDelay
  games.level1[0].level3 = "KO1";
  await new Promise((resolve) => setTimeout(resolve, 20)); //<--- wait delay triggered
});

it("Avoid loop", function () {
  const games = Reactive(null);
  games.subscribe(
    "test",
    (data) => {
      const { base, prop, path, pathValues, value, oldValue } = data;
      assert.equal(prop, "test");
      assert.equal(path.length, 1);
      assert.equal(pathValues[0], 1);
      assert.equal(value, 1);
      assert.equal(oldValue, undefined);
      games.test = 2; //<-- Change same prop inside subscription ignored for trigger
    },
    { pathValues: true }
  );
  games.test = 1; //<--- this value ignored because of subscriptionDelay
});

it("Manual trigger loop on tree", function () {
  const targetReactive = Reactive({ msg: "HERE AM I" });
  const games = Reactive(
    {
      level1: Reactive(
        [
          1,
          Reactive({ level3: "OK", targetReactive }, { prefix: "level2" }),
          1,
          3,
          5,
        ],
        {
          prefix: "level1",
        }
      ),
    },
    { prefix: "base" }
  );
  //SUBSCRIBE to every change in Reactive chain
  games.subscribe(null, (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop, "targetReactive");
    assert.equal(
      JSON.stringify(path),
      JSON.stringify(["level1", 1, "targetReactive"])
    );
    assert.equal(value.msg, "HERE AM I");
    assert.equal(oldValue, undefined);
  });

  targetReactive.triggerChange();
});

it("Reactive Array", function () {
  const games = Reactive(
    [
      Reactive([1, 2, 3, 5]),
      Reactive([1, 2, 3, 5]),
      Reactive([1, 2, 3, 5]),
      Reactive([1, 2, 3, 5]),
    ],
    { prefix: "base" }
  );
  //SUBSCRIBE to every change in Reactive chain
  games.subscribe(null, (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
  });

  games[0].push(Reactive({ test: "IM HERE" }));
  games[1].shift();
  games[2].pop();
  games[3].unshift(Reactive([7, 7, 7]));

  assert.equal(
    JSON.stringify(games._),
    JSON.stringify([
      [1, 2, 3, 5, { test: "IM HERE" }],
      [2, 3, 5],
      [1, 2, 3],
      [[7, 7, 7], 1, 2, 3, 5],
    ])
  );
});

it("Remove reactive from parent as itself, orphan function", function () {
  const target1 = Reactive(["IM 1"]);
  const target2 = Reactive(["IM 2"]);
  const item3 = Reactive(["IM 3"]);
  const target3 = Reactive({ item3, item4: Reactive() });
  const games = Reactive([target1, target2], { prefix: "base" });
  //SUBSCRIBE to every change in Reactive chain

  assert.equal(target1._target._parents[0].prop, 0);
  assert.equal(target2._target._parents[0].prop, 1);
  assert.equal(item3._target._parents[0].prop, "item3");
  target1.orphan();
  assert.equal(target1._target._parents.length, 0);
  assert.equal(target2._target._parents[0].prop, 0);
  item3.orphan();
  assert.equal(item3._target._parents.length, 0);
  item3.orphan();
});

it("Iterators", function () {
  const games = Reactive([1, 2, 3, 4, 5, 6, 7, 8]);
  const games2 = Reactive({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8 });
  let counter = 0;
  for (const game of games) {
    counter++;
    assert.equal(game, counter);
  }
  counter = 0;
  for (const [key, value] of games2) {
    counter++;
    assert.equal(value, counter);
  }
});

it("Reactive of non object", function () {
  const games = Reactive(1);
  assert.equal(games._, 1);
});

it("Set inner properties", function () {
  const child = Reactive();
  const games = Reactive({ child });
  assert.equal(child._parents[0].receiver, games);
  games._prefix = "test";
  child._parent = null;
  assert.equal(games._prefix, "test");
  assert.equal(games._target._prefix, "test");
  assert.equal(child._parent, null);
  assert.equal(games._target._parent, null);
});

it("Const reactive feature", function () {
  const target1 = Reactive({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }, { const: true });
  const target2 = Reactive({ 6: 6 });
  const target3 = Reactive({ 2: 2, 4: 4, 6: 6, 8: 8 });
  const games = Reactive({ target1, target2, target3 });
  games.target1 = target2;
  games.target3 = target2;
  assert.equal(games.target1, target1);
  assert.equal(
    JSON.stringify(target1._),
    JSON.stringify({
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
    })
  );
  assert.equal(games.target3, target2);
});

it("Uptree trigger", function () {
  const games = Reactive(
    {
      number: 1,
      level1: Reactive(
        [
          Reactive(
            { level3: Reactive({ ok: "OK" }, { prefix: "okTarget" }) },
            { prefix: "level2" }
          ),
        ],
        {
          prefix: "level1",
        }
      ),
    },
    { prefix: "base" }
  );
  //SUBSCRIBE to every change in Reactive chain
  games.level1[0].level3.subscribe("ok", (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(JSON.stringify(data.path), JSON.stringify(["ok"]));
    games.tree = "OK";
  });

  games.triggerUpTree();
  assert.equal(games.tree, "OK");
});

it("Reactivate test", function () {
  const myObj = { 2: 2 };
  const games = Reactivate(myObj, { 1: 1 }, { prefix: "base" });
  assert.equal(games._rel, myObj);
});

it("Multiparent reactive feature", function () {
  const target1 = Reactive(
    { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
    { prefix: "target1" }
  );
  const parent1 = Reactive({ 6: 6, target1 }, { prefix: "parent1" });
  const parent2 = Reactive({ 2: 2, 4: 4, 6: 6, 8: 8 }, { prefix: "parent2" });
  parent2.target1 = target1;

  parent1.subscribe(null, (data) => {
    assert.equal(data.base._prefix, parent1._prefix);
  });
  parent2.subscribe(null, (data) => {
    assert.equal(data.base._prefix, parent2._prefix);
  });

  target1.test = "OK";

  assert.equal(target1._parents.length, 2);
  delete parent1.target1;
  assert.equal(target1._parents.length, 1);
});

it("External mute feature", function () {
  const target1 = Reactive({ ok: "ok" }, { prefix: "target1" });
  target1.subscribe(null, (data) => {
    target1.ok = "ko";
  });
  target1.mute(["trigger"]);
  target1.trigger = "KO";
  assert.equal(target1.ok, "ok");
  target1.unmute(["trigger"]);
  target1.trigger = "OK";
  assert.equal(target1.ok, "ko");
});

it("Delete Reactive", function () {
  const targetN = Reactive({ ok: "ok" }, { prefix: "target1" });
  const targetM = Reactive({ ok: "ok" }, { prefix: "target1" });
  targetN.targetM = targetM;
  assert.equal(reactiveObjects.get(targetN._obId) != null, true);
  assert.equal(reactiveObjects.get(targetM._obId) != null, true);
  targetN.delete();
  delete targetN.targetM;
  assert.equal(reactiveObjects.get(targetN._obId) == null, true);
  assert.equal(reactiveObjects.get(targetM._obId) == null, true);
});
