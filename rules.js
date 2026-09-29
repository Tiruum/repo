/* R.E.P.O. game rules, v0.4.4.3 (Assembly-CSharp.dll + level0/resources assets).
   Pure functions, no DOM. Loaded by index.html and by the Node tests. */
const RULES = (() => {
  /* ----- cosmetic boxes: ValuableDirector.SetupHost, RunManager.ChangeLevel ----- */
const LEVEL_LOOP = 5, LOOPS_MAX = 2, BAD_LUCK_BONUS = 25;
const WEIGHTS = [t => 0.50 - 0.20 * t, t => 0.30, t => 0.10 + 0.15 * t, t => 0.19 * t];

function slotTs(level) {                       // t of every box slot on a 1-based level
  const lc = level - 1, loops = Math.floor(lc / LEVEL_LOOP);
  const clamped = Math.max(0, Math.min(loops, LOOPS_MAX));
  const partial = (lc % LEVEL_LOOP) / LEVEL_LOOP;
  return Array.from({ length: clamped + 1 }, (_, i) => i < loops ? 1 : partial);
}
const spawnChance = (t, bad) => Math.min(100, Math.round((0.25 + 0.40 * t) * 100) + (bad > 0 ? bad * BAD_LUCK_BONUS : 0)) / 100;

const rarityCache = new Map();
function rarityOdds(t) {                       // each rarity rolls Random(0, weight); highest wins, ties -> earlier
  const key = t.toFixed(3);
  if (rarityCache.has(key)) return rarityCache.get(key);
  const n = WEIGHTS.map(w => Math.max(1, Math.round(w(t) * 100 + 1e-9)));
  const wins = [0, 0, 0, 0];
  for (let a = 0; a < n[0]; a++) for (let b = 0; b < n[1]; b++) for (let c = 0; c < n[2]; c++) for (let d = 0; d < n[3]; d++) {
    let best = a, bi = 0;
    if (b > best) { best = b; bi = 1; }
    if (c > best) { best = c; bi = 2; }
    if (d > best) { bi = 3; }
    wins[bi]++;
  }
  const total = n[0] * n[1] * n[2] * n[3];
  const r = wins.map(w => w / total);
  rarityCache.set(key, r);
  return r;
}

function levelOdds(level, bad) {               // bonus applies only until the first box spawns
  let none = 1;
  const slots = slotTs(level).map((t, i) => {
    const cb = spawnChance(t, bad), c0 = spawnChance(t, 0);
    const p = none * cb + (1 - none) * c0;
    none *= 1 - cb;
    return { slot: i + 1, t, chance: p, base: c0, rarity: rarityOdds(t) };
  });
  return { slots, any: 1 - none, expected: slots.reduce((a, s) => a + s.chance, 0) };
}
const atLeast = (o, pick) => { let none = 1; for (const s of o.slots) none *= 1 - s.chance * pick.reduce((a, r) => a + s.rarity[r], 0); return 1 - none; };

function forecast(level, bad, h = 5) {
  let exp = 0, noRare = 1, noUltra = 1;
  for (let i = 0; i < h; i++) for (const s of levelOdds(level + i, i ? 0 : bad).slots) {
    exp += s.chance; noRare *= 1 - s.chance * (s.rarity[2] + s.rarity[3]); noUltra *= 1 - s.chance * s.rarity[3];
  }
  return { exp, rare: 1 - noRare, ultra: 1 - noUltra };
}

  /* ----- enemies: EnemyDirector (AmountSetup, Start, Update), EnemyParent.Despawn ----- */
  const clamp01 = x => Math.min(1, Math.max(0, x));

  // [1★, 2★, 3★] per level. AmountSetup evaluates step curves at lc = level - 1
  // (lc/9 for lc < 10, (lc-9)/10 after) and truncates to int.
  const COUNT_STEPS = [[1, [1, 0, 1]], [3, [1, 1, 1]], [6, [2, 2, 2]], [9, [2, 3, 2]], [10, [2, 3, 3]], [20, [3, 4, 4]]];
  function enemyCounts(level) {
    let c = COUNT_STEPS[0][1];
    for (const [from, v] of COUNT_STEPS) if (level >= from) c = v;
    return c.slice();
  }

  // First spawn pause: 60 × U(2,3) × spawnIdlePauseCurve(lc/9); 20%: × U(0.1, 0.25); min 5 s.
  const IDLE_KEYS = [
    { t: 0, v: 1, in: 0.0008574398816563189, out: 0.0008574398816563189 },
    { t: 0.5, v: 0.20000000298023224, in: 0.00043129612458869815, out: 0.00043129612458869815 },
    { t: 1, v: 0, in: -1.491617202758789, out: -1.491617202758789 },
  ];
  function hermite(keys, t) {                    // Unity AnimationCurve (non-weighted tangents)
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t > b.t) continue;
      const dt = b.t - a.t, s = (t - a.t) / dt, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a.v + (s3 - 2 * s2 + s) * a.out * dt + (-2 * s3 + 3 * s2) * b.v + (s3 - s2) * b.in * dt;
    }
    return last.v;
  }
  function firstSpawn(level) {
    const k = hermite(IDLE_KEYS, clamp01((level - 1) / 9));
    const min = Math.max(5, 120 * k), max = Math.max(5, 180 * k);
    return { min, max, earlyMin: Math.max(5, 120 * k * 0.1), earlyMax: Math.max(5, 180 * k * 0.25), earlyChance: 0.2 };
  }

  // Respawn: U(240,300) × despawnedDecreaseMultiplier, min 1 s. The multiplier starts at 1 when the
  // level loads and loses 0.2 every 10 minutes (EnemyDirector.Update), floor 0.
  const RESPAWN_MIN = 240, RESPAWN_MAX = 300, COEF_STEP = 0.2, COEF_PERIOD = 600, EXTRACT_CAP = 30, ORBS_MAX = 3;
  const respawnCoef = levelSec => Math.max(0, Math.round((1 - COEF_STEP * Math.floor(levelSec / COEF_PERIOD)) * 10) / 10);
  const nextCoefDrop = levelSec => respawnCoef(levelSec) > 0 ? COEF_PERIOD - (levelSec % COEF_PERIOD) : null;
  const respawnWindow = coef => ({ min: Math.max(1, RESPAWN_MIN * coef), max: Math.max(1, RESPAWN_MAX * coef) });
  // All extractions done at x: every DespawnedTimer > 30 s is set to 0. Window [start, end] is what we
  // know about the hidden timer; returns the new window (all values absolute seconds).
  function afterExtractions(start, end, x) {
    if (end - x <= EXTRACT_CAP) return { start, end };
    if (start - x > EXTRACT_CAP) return { start: x, end: x };
    return { start: x, end: Math.min(end, x + EXTRACT_CAP) };
  }

  /* ----- loot: RoundDirector.StartRound, ExtractionPoint.StateActive, LevelGenerator.TileGeneration ----- */
  // Run quota = int(sum of valuables at spawn × 0.7 × haulCurve); each extraction's goal = quota / count.
  const HAUL_1 = [
    { t: 0, v: 0.4000000059604645, in: 0.0006335551152005792, out: 0.0006335551152005792 },
    { t: 0.10000000149011612, v: 0.6000000238418579, in: 0.012308282777667046, out: 0.012308282777667046 },
    { t: 1.00152587890625, v: 0.6994247436523438, in: 0, out: 0 },
  ];
  const HAUL_2 = [
    { t: 0, v: 0.699999988079071, in: 0.0006335551152005792, out: 0.30000001192092896 },
    { t: 1, v: 1, in: 0.30000001192092896, out: 0 },
  ];
  const HAUL_SHARE = 0.7;
  function haulCurve(level) {
    const lc = level - 1, m2 = clamp01((lc - 9) / 10);
    return m2 > 0 ? hermite(HAUL_2, m2) : hermite(HAUL_1, clamp01(lc / 9));
  }
  // LevelGenerator: modules = min(5 + lc, 10) (+ up to 5 more after level 10); ExtractionAmount by modules, +1 point.
  function extractionCount(level) {
    const lc = level - 1, modules = Math.min(5 + lc, 10) + (lc >= 10 ? Math.min(lc - 9, 5) : 0);
    return 1 + (modules >= 15 ? 4 : modules >= 10 ? 3 : modules >= 8 ? 2 : modules >= 6 ? 1 : 0);
  }
  function lootEstimate(level, pointGoal) {
    const count = extractionCount(level), quota = pointGoal * count;
    return { total: quota / (HAUL_SHARE * haulCurve(level)), quota, count };
  }
  // ValuableDirector.totalMaxValue (spawn budget, thousands): 30 → 180 over levels 1-10, 180 → 250 over 11-20.
  // Spawning stops once the running total exceeds it, so the real total is usually a bit above (live: cap 30K, loot 31.3K).
  function totalValueCap(level) {
    const lc = level - 1, m2 = clamp01((lc - 9) / 10);
    return 1000 * (m2 > 0 ? Math.round(180 + 70 * m2) : Math.round(30 + 150 * clamp01(lc / 9)));
  }

  return { LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs, spawnChance, rarityOdds, levelOdds, atLeast, forecast,
    enemyCounts, firstSpawn, respawnCoef, nextCoefDrop, respawnWindow, afterExtractions, ORBS_MAX, COEF_PERIOD,
    haulCurve, extractionCount, lootEstimate, totalValueCap };
})();
if (typeof module === "object") module.exports = RULES;
