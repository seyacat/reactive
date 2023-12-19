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
    console.log("DATA", { data });
    assert.equal(prop, "level3");
    assert.equal(JSON.stringify(path), JSON.stringify(["level1", 0, "level3"]));
    assert.equal(value, "KO");
    assert.equal(oldValue, "OK");
  });
  assert.equal(games.level1[0].level3, "OK");
  games.level1[0].level3 = "KO";
});
