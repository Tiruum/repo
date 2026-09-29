const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../rules.js");

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("box slots open on levels 6 and 11", () => {
  assert.equal(R.slotTs(1).length, 1);
  assert.equal(R.slotTs(6).length, 2);
  assert.equal(R.slotTs(11).length, 3);
  assert.deepEqual(R.slotTs(16), [1, 1, 1]);
});

test("box chance: 25% on level 1, bad luck +25% each", () => {
  close(R.levelOdds(1, 0).any, 0.25);
  close(R.levelOdds(1, 2).any, 0.75);
  close(R.levelOdds(16, 0).any, 1 - 0.35 ** 3);
});

test("rarity odds sum to 1 and ultra is ~0 at t=0", () => {
  for (const t of [0, 0.4, 1]) close(R.rarityOdds(t).reduce((a, b) => a + b, 0), 1);
  assert.ok(R.rarityOdds(0)[3] < 0.001);
});

test("5-level forecast from level 1 expects 2.05 boxes", () => {
  close(R.forecast(1, 0).exp, 0.25 + 0.33 + 0.41 + 0.49 + 0.57, 1e-6);
});
