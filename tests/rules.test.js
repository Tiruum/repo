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

test("enemy counts per tier follow EnemyDirector.AmountSetup", () => {
  const want = { 1: [1, 0, 1], 2: [1, 0, 1], 3: [1, 1, 1], 5: [1, 1, 1], 6: [2, 2, 2], 8: [2, 2, 2],
    9: [2, 3, 2], 10: [2, 3, 3], 19: [2, 3, 3], 20: [3, 4, 4], 30: [3, 4, 4] };
  for (const [lvl, c] of Object.entries(want)) assert.deepEqual(R.enemyCounts(+lvl), c, `level ${lvl}`);
});

test("first spawn pause: 2-3 min on level 1, 5 s from level 10", () => {
  const f1 = R.firstSpawn(1);
  close(f1.min, 120, 1e-6); close(f1.max, 180, 1e-6);
  close(f1.earlyMin, 12, 1e-6); close(f1.earlyMax, 45, 1e-6);
  const f5 = R.firstSpawn(5);
  close(f5.min, 27.3, 0.1); close(f5.max, 40.9, 0.1);
  const f10 = R.firstSpawn(10);
  assert.equal(f10.min, 5); assert.equal(f10.max, 5); assert.equal(f10.earlyMin, 5);
});

test("respawn coefficient drops 0.2 every 10 minutes of the level", () => {
  assert.equal(R.respawnCoef(0), 1);
  assert.equal(R.respawnCoef(599.9), 1);
  assert.equal(R.respawnCoef(600), 0.8);
  assert.equal(R.respawnCoef(1500), 0.6);
  assert.equal(R.respawnCoef(2999), 0.2);
  assert.equal(R.respawnCoef(3000), 0);
  assert.equal(R.respawnCoef(9999), 0);
  assert.equal(R.nextCoefDrop(0), 600);
  assert.equal(R.nextCoefDrop(1500), 300);
  assert.equal(R.nextCoefDrop(3000), null);
});

test("respawn window is 240-300 s times coefficient, at least 1 s", () => {
  assert.deepEqual(R.respawnWindow(1), { min: 240, max: 300 });
  const w = R.respawnWindow(0.6);
  close(w.min, 144, 1e-9); close(w.max, 180, 1e-9);
  assert.deepEqual(R.respawnWindow(0), { min: 1, max: 1 });
});

test("all extractions done resets cooldowns longer than 30 s", () => {
  assert.deepEqual(R.afterExtractions(100, 120, 95), { start: 100, end: 120 });   // ≤30 s left: unchanged
  assert.deepEqual(R.afterExtractions(200, 260, 100), { start: 100, end: 100 });  // surely >30 s: back now
  assert.deepEqual(R.afterExtractions(110, 170, 100), { start: 100, end: 130 });  // maybe: within 30 s
});

test("extraction points per level", () => {
  const want = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 10: 4, 14: 4, 15: 5, 30: 5 };
  for (const [lvl, n] of Object.entries(want)) assert.equal(R.extractionCount(+lvl), n, `level ${lvl}`);
});

test("haul goal curve: 0.4 on level 1, 0.7 → 1.0 over levels 11-20", () => {
  close(R.haulCurve(1), 0.4, 1e-6);
  close(R.haulCurve(10), 0.6994, 1e-3);
  close(R.haulCurve(11), 0.73, 1e-3);
  close(R.haulCurve(20), 1, 1e-6);
  close(R.haulCurve(40), 1, 1e-6);
});

test("loot on the map from one extraction's goal", () => {
  const mult = { 1: 3.571, 2: 4.760, 6: 8.766, 10: 8.170, 11: 7.828, 15: 8.403, 20: 7.143 };
  for (const [lvl, m] of Object.entries(mult)) close(R.lootEstimate(+lvl, 1000).total / 1000, m, 0.01);
  const e = R.lootEstimate(6, 5000);
  assert.equal(e.count, 4);
  assert.equal(e.quota, 20000);
  close(e.total, 43830, 20);
  close(R.lootEstimate(1, 8764).total, 31300, 1);
});

test("valuable spawn budget cap", () => {
  assert.equal(R.totalValueCap(1), 30000);
  assert.equal(R.totalValueCap(10), 180000);
  assert.equal(R.totalValueCap(11), 187000);
  assert.equal(R.totalValueCap(20), 250000);
});

test("race odds: each rolls Random(0, w), highest wins", () => {
  for (const p of R.raceOdds([100, 100, 100, 100])) close(p, 0.25, 1e-12);
  const [a, b] = R.raceOdds([100, 40]);
  close(a, 1 - 40 / 200, 1e-12);
  close(b, 40 / 200, 1e-12);
  const p = R.raceOdds([100, 70, 40, 1, 100]);
  close(p.reduce((x, y) => x + y, 0), 1, 1e-12);
  close(p[0], p[4], 1e-12);
});
