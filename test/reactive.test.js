const { Reactive } = require("../reactive.js");
const chai = require("chai");
const assert = require("assert");

it("Reactive Basic", function () {
  const games = Reactive();
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
