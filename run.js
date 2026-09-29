/* Run state for the helper: pure functions over plain objects, times in ms (Date.now()).
   Loaded by index.html (after rules.js and enemies.js) and by the Node tests. */
const RUN = (() => {
  const R = typeof RULES !== "undefined" ? RULES : require("./rules.js");
  const E = typeof ENEMY_DATA !== "undefined" ? ENEMY_DATA : require("./enemies.js");

  const newRun = now => ({ startedAt: now, mode: "shop", level: null, levels: [], seq: 0 });

  function startLevel(run, number, now) {
    run.mode = "level";
    run.level = { number, startedAt: now, extractionsAt: null, picks: [], enemies: [] };
  }

  const levelSec = (run, now) => (now - run.level.startedAt) / 1000;
  const find = (run, uid) => run.level && run.level.enemies.find(e => e.uid === uid);

  function addPick(run, setupId) {
    const lv = run.level, setup = E.SETUPS.find(s => s.id === setupId);
    if (!lv || !setup) return null;
    const used = lv.picks.filter(p => p.tier === setup.tier).length;
    if (used >= R.enemyCounts(lv.number)[setup.tier - 1]) return null;
    const pick = ++run.seq;
    lv.picks.push({ pick, tier: setup.tier, setupId });
    for (const [id, n] of setup.members) for (let i = 0; i < n; i++)
      lv.enemies.push({ uid: ++run.seq, pick, id, killedAt: null, start: null, end: null, coef: null, kills: 0, orbs: 0 });
    return pick;
  }

  function removeEnemy(run, uid) {
    const lv = run.level, e = find(run, uid);
    if (!e) return;
    lv.enemies = lv.enemies.filter(x => x !== e);
    if (!lv.enemies.some(x => x.pick === e.pick)) lv.picks = lv.picks.filter(p => p.pick !== e.pick);
  }

  function status(e, now) {
    if (e.killedAt === null) return "alive";
    if (now < e.start) return "cooldown";
    if (now < e.end) return "window";
    return "back";
  }

  function kill(run, uid, now) {
    const e = find(run, uid);
    if (!e || status(e, now) === "cooldown") return false;
    const lv = run.level;
    const coef = lv.extractionsAt !== null ? 0 : R.respawnCoef(levelSec(run, now));
    const w = R.respawnWindow(coef);
    const prev = { killedAt: e.killedAt, start: e.start, end: e.end, coef: e.coef, kills: e.kills, orbs: e.orbs };
    Object.assign(e, { killedAt: now, coef, start: now + Math.round(w.min * 1000), end: now + Math.round(w.max * 1000),
      kills: e.kills + 1, orbs: Math.min(R.ORBS_MAX, e.orbs + 1), seen: false, prev });
    return true;
  }

  // Misclick: put the enemy back exactly as it was before its last kill.
  function cancelKill(run, uid) {
    const e = find(run, uid);
    if (!e || !e.prev) return false;
    Object.assign(e, e.prev, { prev: null });
    return true;
  }

  // Seen on the map before its window ended: the cooldown is over now; the kill and its orb stay.
  function respawned(run, uid, now) {
    const e = find(run, uid);
    const st = e && status(e, now);
    if (st !== "cooldown" && st !== "window") return false;
    Object.assign(e, { start: now, end: now, seen: true, prev: null });
    return true;
  }

  function extractionsDone(run, now) {
    const lv = run.level;
    if (!lv || lv.extractionsAt !== null) return;
    lv.extractionsAt = now;
    for (const e of lv.enemies) {
      if (e.end === null || e.end <= now) continue;
      const w = R.afterExtractions(e.start / 1000, e.end / 1000, now / 1000);
      e.start = Math.round(w.start * 1000); e.end = Math.round(w.end * 1000);
    }
  }

  function closeLevel(run, boxes, now, failed) {
    const lv = run.level;
    if (!lv) return;
    const entry = { number: lv.number, startedAt: lv.startedAt, endedAt: now, boxes: boxes.slice(),
      enemies: lv.enemies.map(e => e.id), picks: lv.picks.map(p => p.setupId), kills: lv.enemies.reduce((a, e) => a + e.kills, 0) };
    if (failed) entry.failed = true;
    run.levels.push(entry);
    run.level = null;
    run.mode = "shop";
  }
  const endLevel = (run, boxes, now) => closeLevel(run, boxes, now, false);
  const endRun = (run, now) => closeLevel(run, [], now, true);

  // RunManager.enemiesSpawned: each spawned setup is added twice (max 4 copies); after every level one copy of
  // each setup that was there when the level started is removed (EnemiesSpawnedRemoveStart/End).
  const levelPicks = l => l.picks || [...new Set(l.enemies)];      // records from before picks were stored
  function spawnHistory(run) {
    const h = {};
    for (const l of run.levels) {
      const before = Object.keys(h).filter(id => h[id] > 0);
      for (const id of levelPicks(l)) h[id] = Math.min(4, (h[id] || 0) + 2);
      for (const id of before) h[id] -= 1;
    }
    return h;
  }

  // Odds that one pick for this tier is each setup (EnemyDirector.PickEnemies): weight = chance (100, groups 60)
  // − 30 per copy in the run history − 10 per same setup already picked on this level, at least 1.
  const PICK_CHANCE = 100, GROUP_CHANCE = 60;
  function pickOdds(run, tier, level, groupsAllowed) {
    const hist = spawnHistory(run), here = {};
    if (run.level) for (const p of run.level.picks) here[p.setupId] = (here[p.setupId] || 0) + 1;
    const pool = E.enemyPool(tier, level, groupsAllowed);
    const w = pool.map(s => Math.max(1, (s.group ? GROUP_CHANCE : PICK_CHANCE) - 30 * (hist[s.id] || 0) - 10 * (here[s.id] || 0)));
    const p = R.raceOdds(w);
    return pool.map((setup, i) => ({ setup, p: p[i], recent: (hist[setup.id] || 0) > 0 })).sort((a, b) => b.p - a.p);
  }

  function summary(run, now) {
    const done = run.levels.filter(l => !l.failed), last = run.levels[run.levels.length - 1];
    return {
      startedAt: run.startedAt, endedAt: now,
      levels: done.length, lastLevel: last ? last.number : null, failed: !!(last && last.failed),
      kills: run.levels.reduce((a, l) => a + l.kills, 0),
      met: [...new Set(run.levels.flatMap(l => l.enemies))],
      boxes: run.levels.flatMap(l => l.boxes),
    };
  }

  return { newRun, startLevel, levelSec, addPick, removeEnemy, kill, cancelKill, respawned, extractionsDone, status, endLevel, endRun, spawnHistory, pickOdds, summary };
})();
if (typeof module === "object") module.exports = RUN;
