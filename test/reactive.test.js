const { Reactive } = require("../reactive.js");
const chai = require("chai");
const assert = require("assert");

it("Reactive Basic", function () {
  const games = Reactive();
  //SUBSCRIBE to test property changes
  games.subscribe("test", (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop, "test");
    assert.equal(path.length, 1);
    assert.equal(pathValues[0], 1);
    assert.equal(value, 1);
    assert.equal(oldValue, undefined);
  });
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
    },
    { triggerChange: true }
  );

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
});

it("Reactive Chain", function () {
  const games = Reactive(
    {
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
});

it("Delayed trigger", async function () {
  const games = Reactive(null, {
    prefix: "subcriptionDelayed",
    subscriptionDelay: 10,
  });
  games.subscribe("test", (data) => {
    const { base, prop, path, pathValues, value, oldValue } = data;
    assert.equal(prop, "test");
    assert.equal(path.length, 1);
    assert.equal(pathValues[0], 2);
    assert.equal(value, 2);
    assert.equal(oldValue, undefined);
  });
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
