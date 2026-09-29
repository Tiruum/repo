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

  return { LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs, spawnChance, rarityOdds, levelOdds, atLeast, forecast };
})();
if (typeof module === "object") module.exports = RULES;
