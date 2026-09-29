const test = require("node:test");
const assert = require("node:assert/strict");
const RUN = require("../run.js");

const close = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const MIN = 60000, T0 = 1_000_000;
const levelWith = (number, setupId) => {
  const run = RUN.newRun(T0);
  RUN.startLevel(run, number, T0);
  if (setupId) RUN.addPick(run, setupId);
  return run;
};

test("new run starts in the shop; start level switches mode", () => {
  const run = RUN.newRun(T0);
  assert.equal(run.mode, "shop");
  RUN.startLevel(run, 4, T0 + 5000);
  assert.equal(run.mode, "level");
  assert.equal(run.level.number, 4);
  assert.equal(RUN.levelSec(run, T0 + 65000), 60);
});

test("picks respect tier slots and expand packs", () => {
  const run = levelWith(1);
  assert.equal(RUN.addPick(run, "rugrat"), null);          // level 1 has no 2★ slot
  assert.ok(RUN.addPick(run, "gnome"));
  assert.equal(run.level.enemies.length, 4);
  assert.equal(RUN.addPick(run, "tick"), null);            // the only 1★ slot is taken
  assert.equal(RUN.addPick(run, "nope"), null);
});

test("removing the last member frees the slot", () => {
  const run = levelWith(1, "robe");
  RUN.removeEnemy(run, run.level.enemies[0].uid);
  assert.equal(run.level.picks.length, 0);
  assert.ok(RUN.addPick(run, "huntsman"));
});

test("kill at level start: 240-300 s window, orb +1", () => {
  const run = levelWith(3, "robe"), e = run.level.enemies[0];
  assert.ok(RUN.kill(run, e.uid, T0 + 10000));
  assert.equal(e.start, T0 + 10000 + 240000);
  assert.equal(e.end, T0 + 10000 + 300000);
  assert.equal(e.orbs, 1);
  assert.equal(RUN.status(e, T0 + 20000), "cooldown");
  assert.equal(RUN.kill(run, e.uid, T0 + 20000), false);   // cannot kill while away
  assert.equal(RUN.status(e, e.start + 1), "window");
  assert.equal(RUN.status(e, e.end), "back");
});

test("kill at 25 min uses coefficient 0.6; orbs cap at 3", () => {
  const run = levelWith(3, "robe"), e = run.level.enemies[0];
  const t = T0 + 25 * MIN;
  RUN.kill(run, e.uid, t);
  assert.equal(e.coef, 0.6);
  assert.equal(e.start, t + 144000);
  assert.equal(e.end, t + 180000);
  for (let i = 0; i < 4; i++) RUN.kill(run, e.uid, e.end + i * MIN * 10);
  assert.equal(e.orbs, 3);
  assert.equal(e.kills, 5);
});

test("extractions done: long cooldowns end now, later kills take 1 s", () => {
  const run = levelWith(3, "robe");
  RUN.addPick(run, "gnome");
  const [robe, g1, g2] = run.level.enemies;
  RUN.kill(run, robe.uid, T0);                                // window 240-300 s
  RUN.kill(run, g1.uid, T0);
  const x = T0 + 280000;                                      // g1/robe now 0-20 s left: unchanged
  RUN.kill(run, g2.uid, T0 + 100000);                         // 340-400 s → surely >30 s left
  RUN.extractionsDone(run, x);
  assert.equal(robe.end, T0 + 300000);
  assert.equal(g2.start, x); assert.equal(g2.end, x);
  assert.equal(RUN.status(g2, x), "back");
  const g3 = run.level.enemies[3];
  RUN.kill(run, g3.uid, x + 1000);
  assert.equal(g3.coef, 0);
  assert.equal(g3.end - g3.start, 0);
  assert.equal(g3.start, x + 2000);
});

test("end level records a summary and returns to the shop", () => {
  const run = levelWith(2, "robe");
  RUN.kill(run, run.level.enemies[0].uid, T0 + MIN);
  RUN.endLevel(run, [1], T0 + 9 * MIN);
  assert.equal(run.mode, "shop");
  assert.equal(run.level, null);
  assert.deepEqual(run.levels[0], { number: 2, startedAt: T0, endedAt: T0 + 9 * MIN, boxes: [1], enemies: ["robe"], picks: ["robe"], kills: 1 });
});

test("run ended mid-level keeps that level as failed", () => {
  const run = levelWith(1, "robe");
  RUN.endLevel(run, [], T0 + MIN);
  RUN.startLevel(run, 2, T0 + 2 * MIN);
  RUN.addPick(run, "gnome");
  RUN.kill(run, run.level.enemies[0].uid, T0 + 3 * MIN);
  RUN.endRun(run, T0 + 4 * MIN);
  const s = RUN.summary(run, T0 + 4 * MIN);
  assert.equal(s.levels, 1);
  assert.equal(s.lastLevel, 2);
  assert.equal(s.failed, true);
  assert.equal(s.kills, 1);
  assert.deepEqual(s.met.sort(), ["gnome", "robe"]);
  assert.deepEqual(s.boxes, []);
});

test("coefficient uses level time, not run time", () => {
  const run = RUN.newRun(T0);
  RUN.startLevel(run, 3, T0 + 30 * MIN);
  RUN.addPick(run, "robe");
  const e = run.level.enemies[0], t = T0 + 31 * MIN;
  RUN.kill(run, e.uid, t);
  assert.equal(e.coef, 1);
  assert.equal(e.start, t + 240000);
  assert.equal(e.end, t + 300000);
});

test("extractions done clamps a window that has >30 s left on its end; second call is a no-op", () => {
  const run = levelWith(3, "robe"), e = run.level.enemies[0];
  RUN.kill(run, e.uid, T0);
  const x = T0 + 220000;
  RUN.extractionsDone(run, x);
  assert.equal(e.start, x);
  assert.equal(e.end, x + 30000);
  RUN.extractionsDone(run, x + 5000);
  assert.equal(e.start, x);
  assert.equal(e.end, x + 30000);
  assert.equal(run.level.extractionsAt, x);
});

test("cancel kill restores the enemy exactly as before the kill", () => {
  const run = levelWith(3, "robe"), e = run.level.enemies[0];
  RUN.kill(run, e.uid, T0 + MIN);
  RUN.kill(run, e.uid, e.end);                              // second kill: kills 2, orbs 2
  const before = { killedAt: e.killedAt, start: e.start, end: e.end, coef: e.coef };
  RUN.kill(run, e.uid, e.end + MIN);                        // misclick
  assert.ok(RUN.cancelKill(run, e.uid));
  assert.deepEqual({ killedAt: e.killedAt, start: e.start, end: e.end, coef: e.coef }, before);
  assert.equal(e.kills, 2);
  assert.equal(e.orbs, 2);
  assert.equal(RUN.cancelKill(run, e.uid), false);          // only the last kill can be cancelled
});

test("cancelling the first kill makes the enemy alive again", () => {
  const run = levelWith(3, "robe"), e = run.level.enemies[0];
  RUN.kill(run, e.uid, T0 + MIN);
  assert.ok(RUN.cancelKill(run, e.uid));
  assert.equal(RUN.status(e, T0 + MIN), "alive");
  assert.equal(e.kills, 0);
  assert.equal(e.orbs, 0);
});

test("respawned early ends the cooldown now and keeps the kill", () => {
  const run = levelWith(3, "robe"), e = run.level.enemies[0];
  RUN.kill(run, e.uid, T0 + MIN);
  const t = T0 + 2 * MIN;
  assert.ok(RUN.respawned(run, e.uid, t));
  assert.equal(RUN.status(e, t), "back");
  assert.equal(e.seen, true);                                // UI: no "respawning" beep for this one
  assert.equal(e.kills, 1);
  assert.equal(e.orbs, 1);
  assert.equal(RUN.respawned(run, e.uid, t), false);        // already back
  assert.ok(RUN.kill(run, e.uid, t + 1000));                // can be killed again at once
});

const playLevel = (run, number, setups) => {
  RUN.startLevel(run, number, T0);
  for (const id of setups) RUN.addPick(run, id);
  RUN.endLevel(run, [], T0);
};

test("spawn history: +2 per spawn (max 4), −1 per level for setups present at its start", () => {
  const run = RUN.newRun(T0);
  playLevel(run, 1, ["gnome", "robe"]);
  assert.deepEqual(RUN.spawnHistory(run), { gnome: 2, robe: 2 });
  playLevel(run, 2, ["gnome"]);                      // gnome 2 → 4 (cap) → 3; robe 2 → 1
  assert.deepEqual(RUN.spawnHistory(run), { gnome: 3, robe: 1 });
  playLevel(run, 3, []);
  playLevel(run, 4, []);
  playLevel(run, 5, []);
  assert.deepEqual(RUN.spawnHistory(run), { gnome: 0, robe: 0 });
});

test("pick odds: an enemy from the last level almost never comes back", () => {
  const run = RUN.newRun(T0);
  playLevel(run, 1, ["gnome", "robe"]);
  const odds = RUN.pickOdds(run, 1, 2, false);           // 9 tier-1 setups, gnome weight 100 − 60 = 40
  assert.equal(odds.length, 9);
  const g = odds.find(o => o.setup.id === "gnome");
  close(g.p, 0.4 ** 8 / 9, 1e-12);
  assert.equal(g.recent, true);
  assert.equal(odds[odds.length - 1].setup.id, "gnome");     // sorted, most likely first
  close(odds.reduce((a, o) => a + o.p, 0), 1, 1e-9);
  for (const o of odds.slice(0, 8)) close(o.p, (1 - g.p) / 8, 1e-9);
});

test("pick odds inside a level count this level's picks (−10 each)", () => {
  const run = RUN.newRun(T0);
  RUN.startLevel(run, 20, T0);                         // 4 tier-3 slots
  RUN.addPick(run, "robe");
  const r = RUN.pickOdds(run, 3, 20, false).find(o => o.setup.id === "robe");
  close(r.p, 0.9 ** 7 / 8, 1e-12);                     // 8 setups, robe weight 90
});
