# REPO Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the cosmetic box tracker (https://tiruum.github.io/repo/) into a run helper: level/run timers, enemies on the level with kill → respawn timers driven by the game's respawn coefficient, shop forecast, run summary — while keeping the box tracker as the between-runs view.

**Architecture:** Static page, classic `<script>` files sharing one global scope, no build. Pure logic (`rules.js`, `enemies.js`, `run.js`) has no DOM and is tested with `node --test`. UI is split into the existing box tracker (`app.js`, moved out of `index.html`) and the new run UI (`helper.js`), connected by a few hook variables declared in `app.js`. State: box tracker keeps `localStorage["repoBoxTracker.v1"]`; helper uses `localStorage["repoHelper.v1"]`; timers are `Date.now()` stamps.

**Tech Stack:** HTML/CSS, vanilla JS (ES2020), Node 24 built-in test runner (`node --test`), Python `http.server` + Chrome DevTools MCP for browser checks.

**Spec:** `docs/superpowers/specs/2026-09-29-repo-helper-design.md`

## Global Constraints

- Game version text stays "R.E.P.O. v0.4.4.3 (Steam build 23363152)".
- No external requests of any kind (runs as a Discord Activity): no CDN, no remote images, fonts stay in `fonts/`.
- No build step, no npm dependencies; tests use only `node:test` and `node:assert`.
- `localStorage` access always wrapped in `try/catch`.
- Box tracker key `repoBoxTracker.v1` format unchanged; helper key `repoHelper.v1`.
- Design system unchanged: graphite palette, Unbounded (`--display`) + Golos Text (`--body`), light/dark/system theme via `data-theme`; every new colour defined in all three theme blocks.
- UI copy in Russian; enemy names in English as in the game.
- Layout target: wide second monitor (1920 px), must stay usable at 1100 px and not break at 980 px or below.
- No pause feature (the game does not pause).
- Rules (from spec): coefficient 1.0 −0.2 per 10 min of **level** time, floor 0; respawn window = [240, 300] s × coefficient, min 1 s; extractions done → coefficient 0 and cooldowns > 30 s reset to 0; max 3 orbs per enemy per level.
- Work on branch `repo-helper`. Never push to `main` without the user's explicit OK (push publishes the public site).

## Review Focus

1. **Page reloaded mid-level** — clocks and respawn timers continue from stored timestamps; no burst of beeps on load (lastTick starts at load time). Pinned by the browser check in Task 7.
2. **Keys while the picker dialog is open / Russian keyboard layout** — Enter inside the dialog must not record a level; S/E/M must work on the RU layout (use `e.code`). Pinned in Task 6 (app.js dialog guard) and Task 7 (helper keydown uses `e.code`) plus the browser check in Task 7.
3. **Existing users' box history** — opening the new page with only `repoBoxTracker.v1` present shows the same history/stats and idle mode. Pinned by the browser check in Task 1 and Task 8.
4. **Run ends by team death mid-level** — the unfinished level goes into the summary as failed, its kills count, no box level is recorded. Pinned by the `endRun` test in Task 4.
5. **Extractions done, then kills** — cooldowns > 30 s become "back now", mixed windows clamp to [now, now+30 s], new kills get a 1 s window. Pinned by `afterExtractions` tests (Task 2) and `extractionsDone` tests (Task 4).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `rules.js` | create | Pure game rules: box odds (moved), enemy counts, first spawn, respawn coefficient/window, extractions rule |
| `enemies.js` | create | `ENEMY_DATA`: enemies (name, tier, HP, damage, description, icon), spawn setups, pools |
| `run.js` | create | `RUN`: pure run-state transitions over plain objects |
| `app.js` | create (moved from `index.html` inline script) | Box tracker UI; shared undo stack; hook variables |
| `helper.js` | create | Run UI: modes, shop/level/summary panels, cards, picker, ticking, sound, hotkeys |
| `index.html` | modify | Markup for new panels, CSS, script tags |
| `tests/rules.test.js`, `tests/enemies.test.js`, `tests/run.test.js` | create | Node tests |
| `README.md` | modify | Describe helper |

Browser check recipe used by several tasks (call it **BROWSER CHECK**):

1. Start a server in the repo root (background): `python -m http.server 8777 --bind 127.0.0.1`
2. Chrome DevTools MCP: `new_page` → `http://127.0.0.1:8777/`.
3. To seed state: `evaluate_script` with `() => { localStorage.setItem(KEY, JSON.stringify(VALUE)); location.reload(); }`.
4. `list_console_messages` must show no errors. `take_screenshot` at 1920×1080 and 1100×900 (`resize_page`), light and dark (click `#theme`).
5. Stop the server when done.

---

### Task 1: Move rules to `rules.js`, script to `app.js`, add Node tests

Pure refactor: page must behave exactly as before.

**Files:**
- Create: `rules.js`, `app.js`, `tests/rules.test.js`
- Modify: `index.html:309-628` (inline `<script>` replaced by script tags)

**Interfaces:**
- Produces: global `RULES` (browser) / `module.exports` (Node) with `LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs(level), spawnChance(t, bad), rarityOdds(t) → number[4], levelOdds(level, bad) → {slots, any, expected}, atLeast(o, rarities[]) → number, forecast(level, bad, h=5) → {exp, rare, ultra}`.

- [ ] **Step 1: Write the failing test** — `tests/rules.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL with `Cannot find module '../rules.js'`

- [ ] **Step 3: Create `rules.js`**

Copy `index.html` lines 311, 314-361 (constants `LEVEL_LOOP…BAD_LUCK_BONUS`, `WEIGHTS`, `slotTs`, `spawnChance`, `rarityCache`, `rarityOdds`, `levelOdds`, `atLeast`, `forecast`) verbatim into this wrapper:

```js
/* R.E.P.O. game rules, v0.4.4.3 (Assembly-CSharp.dll + level0/resources assets).
   Pure functions, no DOM. Loaded by index.html and by the Node tests. */
const RULES = (() => {
  /* ----- cosmetic boxes: ValuableDirector.SetupHost, RunManager.ChangeLevel ----- */
  const LEVEL_LOOP = 5, LOOPS_MAX = 2, BAD_LUCK_BONUS = 25;
  const WEIGHTS = [t => 0.50 - 0.20 * t, t => 0.30, t => 0.10 + 0.15 * t, t => 0.19 * t];
  // ... slotTs, spawnChance, rarityCache, rarityOdds, levelOdds, atLeast, forecast — verbatim ...

  return { LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs, spawnChance, rarityOdds, levelOdds, atLeast, forecast };
})();
if (typeof module === "object") module.exports = RULES;
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/`
Expected: 4 tests PASS.

- [ ] **Step 5: Create `app.js` from the inline script**

Move `index.html` lines 310-627 (everything inside `<script>…</script>`) into `app.js`, then replace the rules block (lines 310-361 of the old file, i.e. from the `/* ===== Game rules` comment through the end of `forecast`) with:

```js
/* ===== Box tracker UI. Game rules live in rules.js ===== */
const { LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs, levelOdds, atLeast, forecast } = RULES;
const RAR = ["Обычная", "Необычная", "Редкая", "Ультра"];
const ITEM = ["Network Adapter", "32PB RAM Cluster", "Neural Logic Core", "12x Quantum Drive Stack"];
```

In `index.html` replace the whole `<script>…</script>` block (old lines 309-628) with:

```html
<script src="rules.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 6: BROWSER CHECK**

Seed `repoBoxTracker.v1` with `{"level":4,"bad":2,"pending":[],"history":[{"level":1,"boxes":[],"badBefore":0,"expected":0.25,"run":"new"},{"level":2,"boxes":[],"badBefore":1,"expected":0.58},{"level":3,"boxes":[1],"badBefore":2,"expected":0.91}]}`.
Expected: no console errors; level 4, bad luck 2 (+50%), table shows the three levels, stats "Уровней 3 · Коробок 1"; keys `2` then `Enter` record level 4 with an uncommon box; `Ctrl+Z` undoes it.

- [ ] **Step 7: Commit**

```bash
git add rules.js app.js index.html tests/rules.test.js
git commit -m "Move box rules to rules.js and page script to app.js"
```

---

### Task 2: Enemy rules in `rules.js`

**Files:**
- Modify: `rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces (added to `RULES`): `enemyCounts(level) → [n1, n2, n3]`, `firstSpawn(level) → {min, max, earlyMin, earlyMax, earlyChance}` (seconds), `respawnCoef(levelSec) → number`, `nextCoefDrop(levelSec) → seconds | null`, `respawnWindow(coef) → {min, max}` (seconds), `afterExtractions(start, end, x) → {start, end}` (seconds, absolute), `ORBS_MAX = 3`, `COEF_PERIOD = 600`.

- [ ] **Step 1: Write the failing tests** — append to `tests/rules.test.js`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL with `R.enemyCounts is not a function`.

- [ ] **Step 3: Implement** — insert before the `return` in `rules.js`, and extend the `return`:

```js
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
    { t: 0, v: 1, s: 0.0008574398816563189 },
    { t: 0.5, v: 0.20000000298023224, s: 0.00043129612458869815 },
    { t: 1, v: 0, s: -1.491617202758789 },
  ];
  function hermite(keys, t) {                    // Unity AnimationCurve with in = out tangents
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t > b.t) continue;
      const dt = b.t - a.t, s = (t - a.t) / dt, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a.v + (s3 - 2 * s2 + s) * a.s * dt + (-2 * s3 + 3 * s2) * b.v + (s3 - s2) * b.s * dt;
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
```

```js
  return { LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs, spawnChance, rarityOdds, levelOdds, atLeast, forecast,
    enemyCounts, firstSpawn, respawnCoef, nextCoefDrop, respawnWindow, afterExtractions, ORBS_MAX, COEF_PERIOD };
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add rules.js tests/rules.test.js
git commit -m "Add enemy count, first spawn and respawn rules"
```

---

### Task 3: Enemy data `enemies.js`

**Files:**
- Create: `enemies.js`, `tests/enemies.test.js`

**Interfaces:**
- Produces: global `ENEMY_DATA` = `{ ENEMIES, SETUPS, enemyPool(tier, level, groupsAllowed) → setup[], oneShot(enemy) → bool, setupLabel(setup) → string }`.
  - `ENEMIES[id] = { name, tier, hp, dmg: number[], desc: string, icon: string }` — `icon` is inner SVG markup for `viewBox="0 0 24 24"`, stroke-based.
  - `setup = { id, tier, members: [[enemyId, count]], group?: true, minLevel?: number }`.

- [ ] **Step 1: Write the failing test** — `tests/enemies.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { ENEMIES, SETUPS, enemyPool, oneShot, setupLabel } = require("../enemies.js");

test("every enemy is complete", () => {
  assert.equal(Object.keys(ENEMIES).length, 29);
  for (const [id, e] of Object.entries(ENEMIES)) {
    assert.ok(e.name && [1, 2, 3].includes(e.tier) && e.hp > 0, id);
    assert.ok(Array.isArray(e.dmg) && typeof e.desc === "string", id);
    assert.ok(e.icon.includes("<"), id);
  }
});

test("setups reference known enemies with the right tier", () => {
  const ids = new Set();
  for (const s of SETUPS) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`); ids.add(s.id);
    for (const [id, n] of s.members) { assert.ok(ENEMIES[id], `${s.id}: ${id}`); assert.ok(n >= 1); }
    if (!s.group) assert.equal(ENEMIES[s.members[0][0]].tier, s.tier, s.id);
  }
});

test("pools per tier and level", () => {
  assert.equal(enemyPool(1, 1, false).length, 9);
  assert.equal(enemyPool(2, 1, false).length, 12);
  assert.equal(enemyPool(3, 1, false).length, 7);       // no Loom before level 3
  assert.equal(enemyPool(3, 3, false).length, 8);
  assert.equal(enemyPool(3, 3, true).length, 29);       // + 21 groups on levels 1-3
  assert.equal(enemyPool(3, 4, true).length, 8);
  assert.equal(enemyPool(1, 1, true).length, 9);
});

test("gnomes and bangers come in packs", () => {
  assert.deepEqual(SETUPS.find(s => s.id === "gnome").members, [["gnome", 4]]);
  assert.deepEqual(SETUPS.find(s => s.id === "banger").members, [["banger", 3]]);
  assert.equal(setupLabel(SETUPS.find(s => s.id === "gnome")), "Gnome ×4");
  assert.equal(setupLabel(SETUPS.find(s => s.id === "g-gnome")), "Группа: 10 × Gnome");
  assert.equal(setupLabel(SETUPS.find(s => s.id === "robe")), "Robe");
});

test("one-shot enemies", () => {
  const ones = Object.entries(ENEMIES).filter(([, e]) => oneShot(e)).map(([id]) => id).sort();
  assert.deepEqual(ones, ["huntsman", "loom", "robe", "trudge"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/`
Expected: FAIL with `Cannot find module '../enemies.js'`.

- [ ] **Step 3: Create `enemies.js`**

Descriptions are short Russian notes. Where the behaviour is not known for sure the description is an empty string (the card hides the line); the user fills those in later.

```js
/* R.E.P.O. enemies, v0.4.4.3. HP = EnemyHealth.health, damage = HurtCollider.playerDamage in the enemy
   prefab (empty when damage comes from code: explosions, throws, beams). Pools = EnemyDirector
   .enemiesDifficulty1..3 → EnemySetup. Icons are our own 24×24 stroke drawings. */
const ENEMY_DATA = (() => {
  const ENEMIES = {
    // ----- 1★ -----
    gnome: { name: "Gnome", tier: 1, hp: 20, dmg: [10],
      desc: "Ходят пачкой по 4 и долбят ценности. Хлипкие: хватит удара или броска.",
      icon: '<path d="M12 3 7 14h10z"/><circle cx="12" cy="17.5" r="3.5"/>' },
    tick: { name: "Tick", tier: 1, hp: 10, dmg: [], desc: "",
      icon: '<ellipse cx="12" cy="13" rx="5" ry="6"/><path d="M7 10 3 7M17 10l4-3M7 15l-4 2M17 15l4 2"/>' },
    peeper: { name: "Peeper", tier: 1, hp: 30, dmg: [],
      desc: "Глаз на потолке. Не смотри на него: взгляд притягивает и ранит.",
      icon: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
    spewer: { name: "Spewer", tier: 1, hp: 65, dmg: [10],
      desc: "Цепляется к лицу и блюёт. Сорви и ударь.",
      icon: '<circle cx="12" cy="10" r="7"/><path d="M8 11q4 4 8 0M10 17v4M14 17v3"/>' },
    apex: { name: "Apex Predator", tier: 1, hp: 150, dmg: [10],
      desc: "Утка ходит следом. Не трогай: после удара становится хищником.",
      icon: '<circle cx="9" cy="8" r="4"/><path d="M13 8h5l-3 2M5 12c0 5 4 8 9 8s6-3 6-6H9"/>' },
    birthday: { name: "Birthday Boy", tier: 1, hp: 150, dmg: [10], desc: "",
      icon: '<ellipse cx="12" cy="9" rx="5" ry="6"/><path d="M12 15l-1 2h2l-1-2v6"/>' },
    shadowchild: { name: "Shadow Child", tier: 1, hp: 150, dmg: [], desc: "",
      icon: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v13M12 11l-4 5M12 11l4 5"/>' },
    bella: { name: "Bella", tier: 1, hp: 200, dmg: [5], desc: "",
      icon: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l5-8h4l3 8M11 9V5h3"/>' },
    elsa: { name: "Elsa", tier: 1, hp: 600, dmg: [5], desc: "",
      icon: '<path d="M12 2v20M3 7l18 10M21 7 3 17"/>' },
    // ----- 2★ -----
    banger: { name: "Banger", tier: 2, hp: 50, dmg: [],
      desc: "Тройка бомбочек: подкатываются и взрываются. Отбегай.",
      icon: '<circle cx="11" cy="14" r="6"/><path d="M15 9l3-3M18 3v2M21 6h-2"/>' },
    upscream: { name: "Upscream", tier: 2, hp: 50, dmg: [2],
      desc: "Прыгает к лицу и кричит, оглушает.",
      icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="14.5" rx="3" ry="4"/><path d="M8 8h1M15 8h1"/>' },
    hidden: { name: "Hidden", tier: 2, hp: 100, dmg: [],
      desc: "Невидимка, выдаёт себя дыханием. Хватает и утаскивает игрока.",
      icon: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M9 12h.01M15 12h.01"/>' },
    animal: { name: "Animal", tier: 2, hp: 150, dmg: [2],
      desc: "Носится как бешеный и таранит. Урон слабый.",
      icon: '<circle cx="12" cy="15" r="4"/><circle cx="6" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="18" cy="9" r="2"/>' },
    chef: { name: "Chef", tier: 2, hp: 150, dmg: [10],
      desc: "Прыгает на игрока и бьёт ножом.",
      icon: '<path d="M7 13a4 4 0 1 1 2-7 4 4 0 0 1 6 0 4 4 0 1 1 2 7v6H7z"/><path d="M7 16h10"/>' },
    headgrab: { name: "Headgrab", tier: 2, hp: 150, dmg: [5], desc: "",
      icon: '<path d="M7 21v-8M7 13V6a1.5 1.5 0 0 1 3 0v5M10 11V4a1.5 1.5 0 0 1 3 0v7M13 11V5a1.5 1.5 0 0 1 3 0v8c0 5-3 8-6 8H9"/>' },
    gambit: { name: "Gambit", tier: 2, hp: 150, dmg: [], desc: "",
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>' },
    mentalist: { name: "Mentalist", tier: 2, hp: 150, dmg: [],
      desc: "Поднимает игроков и предметы в воздух и роняет.",
      icon: '<circle cx="12" cy="9" r="6"/><path d="M8 20h8M6 17h12"/>' },
    rugrat: { name: "Rugrat", tier: 2, hp: 150, dmg: [],
      desc: "Швыряет в игроков ценности.",
      icon: '<rect x="8" y="8" width="8" height="13" rx="2"/><path d="M10 8V5h4v3M11 3h2"/>' },
    bowtie: { name: "Bowtie", tier: 2, hp: 200, dmg: [],
      desc: "Кричит, и волна отбрасывает игроков. Прячься за стеной.",
      icon: '<path d="M3 7v10l9-5zM21 7v10l-9-5z"/>' },
    oogly: { name: "Oogly", tier: 2, hp: 200, dmg: [4], desc: "",
      icon: '<path d="M4 18c0-8 3-13 8-13s8 5 8 13z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><circle cx="12" cy="15" r="1.5"/>' },
    hearthugger: { name: "Heart Hugger", tier: 2, hp: 300, dmg: [30], desc: "",
      icon: '<path d="M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z"/>' },
    // ----- 3★ -----
    headman: { name: "Headman", tier: 3, hp: 250, dmg: [10],
      desc: "Летающая голова: гонится и кусает.",
      icon: '<circle cx="12" cy="11" r="7"/><path d="M9 10h.01M15 10h.01M9 15h6M12 18v3"/>' },
    reaper: { name: "Reaper", tier: 3, hp: 250, dmg: [10],
      desc: "Быстро бегает и рубит серией ударов.",
      icon: '<path d="M6 21 17 4M17 4c-5 0-9 2-11 6 4-2 8-2 11-2"/>' },
    clown: { name: "Clown", tier: 3, hp: 250, dmg: [10, 30],
      desc: "Стреляет лучом и бьёт ногой.",
      icon: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="13" r="2"/><path d="M9 9h.01M15 9h.01M2 9h3M19 9h3"/>' },
    huntsman: { name: "Huntsman", tier: 3, hp: 250, dmg: [100],
      desc: "Слепой, стреляет на звук и убивает с выстрела. Замри и не шуми.",
      icon: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>' },
    robe: { name: "Robe", tier: 3, hp: 250, dmg: [100],
      desc: "Преследует и убивает с удара. Держи дистанцию.",
      icon: '<path d="M12 3c-5 0-7 5-7 9v9h14v-9c0-4-2-9-7-9z"/><path d="M10 11h.01M14 11h.01"/>' },
    cleanup: { name: "Cleanup Crew", tier: 3, hp: 350, dmg: [20], desc: "",
      icon: '<path d="M14 3 8 15M5 15h8l-2 6H3z"/>' },
    loom: { name: "Loom", tier: 3, hp: 500, dmg: [100], desc: "",
      icon: '<path d="M4 21c0-9 3-17 8-17s8 8 8 17M8 21c0-6 2-10 4-10s4 4 4 10"/>' },
    trudge: { name: "Trudge", tier: 3, hp: 500, dmg: [20, 35, 100],
      desc: "Медленный, притягивает к себе. Удар булавой убивает.",
      icon: '<path d="M4 20 13 11"/><circle cx="16" cy="8" r="4"/><path d="M16 2v2M22 8h-2M20.2 3.8l-1.4 1.4"/>' },
  };

  const one = (id, tier, n = 1, extra = {}) => ({ id, tier, members: [[id, n]], ...extra });
  const group = (id, n) => ({ id: "g-" + id, tier: 3, members: [[id, n]], group: true });
  const SETUPS = [
    ...["tick", "peeper", "spewer", "apex", "birthday", "shadowchild", "bella", "elsa"].map(id => one(id, 1)),
    one("gnome", 1, 4),
    ...["rugrat", "animal", "upscream", "hidden", "chef", "bowtie", "mentalist", "gambit", "hearthugger", "headgrab", "oogly"].map(id => one(id, 2)),
    one("banger", 2, 3),
    ...["headman", "robe", "huntsman", "reaper", "clown", "trudge", "cleanup"].map(id => one(id, 3)),
    one("loom", 3, 1, { minLevel: 3 }),                     // EnemySetup: levelsCompleted ≥ 2
    group("animal", 3), group("bowtie", 3), group("mentalist", 3), group("hidden", 2), group("chef", 3),
    group("upscream", 3), group("rugrat", 3), group("peeper", 4), group("apex", 4), group("spewer", 4),
    group("shadowchild", 4), group("banger", 6), group("gnome", 10), group("gambit", 2), group("hearthugger", 2),
    group("tick", 5), group("birthday", 3), group("elsa", 3), group("headgrab", 3), group("oogly", 3), group("bella", 3),
  ];
  const GROUP_MAX_LEVEL = 3;   // EnemySetup levelsCompletedMax = 2; also needs 5+ runs played

  function enemyPool(tier, level, groupsAllowed) {
    return SETUPS.filter(s => s.tier === tier
      && (!s.minLevel || level >= s.minLevel)
      && (!s.group || (groupsAllowed && level <= GROUP_MAX_LEVEL)));
  }
  const oneShot = e => e.dmg.some(d => d >= 100);
  function setupLabel(s) {
    const [[id, n]] = s.members, name = ENEMIES[id].name;
    return s.group ? `Группа: ${n} × ${name}` : n > 1 ? `${name} ×${n}` : name;
  }
  return { ENEMIES, SETUPS, enemyPool, oneShot, setupLabel };
})();
if (typeof module === "object") module.exports = ENEMY_DATA;
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/`
Expected: all tests PASS (Tier-3 base = 7 + Loom; 21 groups).

- [ ] **Step 5: Commit**

```bash
git add enemies.js tests/enemies.test.js
git commit -m "Add enemy data, spawn setups and pools"
```

---

### Task 4: Run state `run.js`

**Files:**
- Create: `run.js`, `tests/run.test.js`

**Interfaces:**
- Consumes: `RULES.enemyCounts, respawnCoef, respawnWindow, afterExtractions, ORBS_MAX`; `ENEMY_DATA.SETUPS`.
- Produces: global `RUN` with (all times ms, mutate `run` in place):
  - `newRun(now) → run` (`{ startedAt, mode: "shop", level: null, levels: [], seq: 0 }`)
  - `startLevel(run, number, now)`
  - `levelSec(run, now) → seconds`
  - `addPick(run, setupId) → pick number | null` (null when tier is full or setup unknown)
  - `removeEnemy(run, uid)`
  - `kill(run, uid, now) → bool` (false when unknown or still in cooldown)
  - `extractionsDone(run, now)`
  - `status(enemy, now) → "alive" | "cooldown" | "window" | "back"`
  - `endLevel(run, boxes, now)`, `endRun(run, now)`
  - `seenCounts(run) → { enemyId: levelsSeen }`
  - `summary(run, now) → { startedAt, endedAt, levels, lastLevel, failed, kills, met: [id], boxes: [rarity] }`

- [ ] **Step 1: Write the failing test** — `tests/run.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const RUN = require("../run.js");

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
  assert.deepEqual(run.levels[0], { number: 2, startedAt: T0, endedAt: T0 + 9 * MIN, boxes: [1], enemies: ["robe"], kills: 1 });
  assert.deepEqual(RUN.seenCounts(run), { robe: 1 });
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/`
Expected: FAIL with `Cannot find module '../run.js'`.

- [ ] **Step 3: Create `run.js`**

```js
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
    Object.assign(e, { killedAt: now, coef, start: now + Math.round(w.min * 1000), end: now + Math.round(w.max * 1000),
      kills: e.kills + 1, orbs: Math.min(R.ORBS_MAX, e.orbs + 1) });
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
      enemies: lv.enemies.map(e => e.id), kills: lv.enemies.reduce((a, e) => a + e.kills, 0) };
    if (failed) entry.failed = true;
    run.levels.push(entry);
    run.level = null;
    run.mode = "shop";
  }
  const endLevel = (run, boxes, now) => closeLevel(run, boxes, now, false);
  const endRun = (run, now) => closeLevel(run, [], now, true);

  function seenCounts(run) {
    const c = {};
    for (const l of run.levels) for (const id of new Set(l.enemies)) c[id] = (c[id] || 0) + 1;
    return c;
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

  return { newRun, startLevel, levelSec, addPick, removeEnemy, kill, extractionsDone, status, endLevel, endRun, seenCounts, summary };
})();
if (typeof module === "object") module.exports = RUN;
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/`
Expected: all tests PASS. If `extractions done` fails on `g3.start`: `kill` at `x+1000` gets `respawnWindow(0) = {1,1}` → start = x+2000; check `extractionsAt` is set before the kill.

- [ ] **Step 5: Commit**

```bash
git add run.js tests/run.test.js
git commit -m "Add run state: levels, picks, kills, extractions, summary"
```

---

### Task 5: Shared undo stack and hooks in `app.js`

Makes the box tracker ready for the helper without changing what the user sees.

**Files:**
- Modify: `app.js` (state/undo block, `recordLevel`, `undoLevel`, `editHistory`, `render`, events)
- Modify: `index.html` (menu text)

**Interfaces:**
- Produces (global, reassignable by `helper.js`):
  - `let onRecorded = boxes => {}` — called inside `recordLevel` before save/render.
  - `let inLevel = () => false` — true while a helper level runs (Enter then records even with no boxes).
  - `let afterRender = () => {}` — called at the end of `render()`.
  - `let extra = { get: () => null, set: v => {} }` — extra state saved in undo snapshots.
  - `remember()` — push an undo snapshot; `undo() → bool`; `undoStack` (array); `toast(text, undoable)`.

- [ ] **Step 1: Replace the undo/toast block**

In `app.js` replace from `let lastUndo = null;` … through the end of `function toast(…) {…}` (the lines with `lastUndo`, `snapshot`, `restore`, `toast`) with:

```js
/* ===== Undo and hooks shared with helper.js ===== */
let onRecorded = boxes => {};          // helper: finish the running level
let inLevel = () => false;             // helper: a level is running
let afterRender = () => {};            // helper: render its panels
let extra = { get: () => null, set: v => {} };   // helper state inside undo snapshots

const UNDO_MAX = 20, undoStack = [];
const snapshot = () => JSON.stringify({ S, nextMark, x: extra.get() });
function remember() { undoStack.push(snapshot()); if (undoStack.length > UNDO_MAX) undoStack.shift(); }
function undo() {
  const snap = undoStack.pop();
  if (!snap) return false;
  const o = JSON.parse(snap);
  S = o.S; nextMark = o.nextMark; extra.set(o.x);
  save(); render();
  return true;
}

function toast(text, undoable) {
  $("toastText").textContent = text;
  $("toastUndo").hidden = !undoable;
  $("toast").hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $("toast").hidden = true; }, 5000);
}
```

- [ ] **Step 2: Update actions**

`recordLevel` becomes:

```js
function recordLevel(boxes) {
  remember();
  const o = levelOdds(S.level, S.bad);
  S.history.push({ level: S.level, boxes: boxes.slice(), badBefore: S.bad, expected: o.expected, run: nextMark || undefined });
  nextMark = null;
  // RunManager.ChangeLevel: +1 if no box spawned; SpawnCosmeticWorldObject: reset to 0
  S.bad = boxes.length ? 0 : S.bad + 1;
  S.level += 1;
  S.pending = [];
  onRecorded(boxes);
  save(); render();
  toast(`Уровень ${S.level - 1} записан: ${describe(boxes)}`, true);
}
```

Delete `function undoLevel() {…}`. In `editHistory` replace `const snap = snapshot();` with `remember();` and the final `toast(…, snap)` with `toast(…, true)`. In the `restart` and `wipe` handlers replace `const snap = snapshot();` with `remember();` and `toast(…, snap)` with `toast(…, true)`. The `newRun` handler stays for now (Task 6 moves it).

Add as the last line of `render()`:

```js
  afterRender();
```

- [ ] **Step 3: Update events**

```js
$("next").addEventListener("click", () => { if (S.pending.length || inLevel()) recordLevel(S.pending); });
$("undo").addEventListener("click", () => { $("menu").open = false; if (undo()) toast("Действие отменено", undoStack.length > 0); });
$("toastUndo").addEventListener("click", () => { undo(); $("toast").hidden = true; });
```

In the keydown handler: first line becomes `if (e.target.closest("input, textarea, summary, dialog")) return;`; the Ctrl+Z line becomes
`if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (undo()) toast("Действие отменено", undoStack.length > 0); return; }`;
the Enter branch ends with `e.preventDefault(); if (S.pending.length || inLevel()) recordLevel(S.pending);`.

In `index.html` change the menu button text to `Отменить последнее действие <kbd>Ctrl Z</kbd>`.

- [ ] **Step 4: Verify**

Run: `node --test tests/` → PASS (no logic touched).
BROWSER CHECK with the Task 1 seed: record a level (`2`, `Enter`), press `Ctrl+Z` → level returns with the box pending; add a box in the table (`+`), toast "Отменить" restores it; "Новый забег" still works; no console errors. `grep -n "lastUndo\|undoLevel\|restore(" app.js` → no matches.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "Generalise undo and add hooks for the run helper"
```

---

### Task 6: Modes, shop, level panel and run flow (`helper.js` part 1)

**Files:**
- Create: `helper.js`
- Modify: `index.html` (header, panel ids, new panels, CSS, script tags), `app.js` (remove `newRun` handler)

**Interfaces:**
- Consumes: `RULES`, `ENEMY_DATA`, `RUN`; from `app.js`: `S`, `nextMark`, `save`, `render`, `remember`, `undoStack`, `toast`, `$`, `RAR`, hooks.
- Produces (used by Task 7): `H` (helper state), `saveH()`, `now()`, `clock(sec)`, `range(a, b)`, `renderHelper()`, `tick()`, `lastTick`, `renderLevel()` (stub filled in Task 7), `beep(freq, dur, n)`.

- [ ] **Step 1: Markup** — in `index.html`:

Title/brand: `<title>R.E.P.O. — помощник забега и трекер коробок</title>` (also `og:title`), brand becomes
`<div class="brand"><b>R.E.P.O.</b><span>помощник забега</span><span class="pill" id="modePill" hidden></span></div>`.

Actions: after `#newRun` add `<button class="btn" id="endRun" hidden title="Команда погибла или вышли в меню">Забег окончен</button>`; before `#theme` add `<button class="btn icon-btn" id="sound" aria-label="Звук"></button>`.

Add ids to existing sections: `<section class="panel log" id="logP" …>`, `<aside class="panel odds" id="oddsP" …>`, `<section class="panel levels" id="levelsP" …>`, `<aside class="panel stats" id="statsP" …>`.

Insert at the start of `<main class="grid">`:

```html
    <section class="panel shop" id="shop" aria-label="Магазин" hidden>
      <h2 id="shopTitle">Следующий уровень</h2>
      <div class="shop-row">
        <button class="primary big" id="startLevel">Начать уровень <kbd>S</kbd></button>
        <div class="clock-sm"><span>забег</span><b class="num" id="runClockShop">0:00</b></div>
      </div>
      <div id="shopForecast"></div>
      <label class="check"><input type="checkbox" id="groups"> Сыграно 5+ забегов: на уровнях 1–3 в слот 3★ может выпасть группа</label>
    </section>

    <section class="panel lvlp" id="lvlp" aria-label="Уровень" hidden>
      <h2 id="lvlTitle">Уровень</h2>
      <div class="clock"><b class="num" id="lvlClock">0:00</b><span>на уровне · забег <b class="num" id="runClock">0:00</b></span></div>
      <div class="coef">
        <div class="coef-head"><span>Коэффициент возрождения</span><b class="num" id="coef">1.0</b></div>
        <div class="coef-bar" id="coefBar"></div>
        <span class="muted" id="coefNext"></span>
      </div>
      <p class="first" id="firstSpawn"></p>
      <button class="alarm" id="extract">Все выгрузки сданы <kbd>E</kbd></button>
      <p class="banner" id="extractBanner" hidden>Выгрузки сданы: мобы идут в комнаты игроков, возрождение почти мгновенное.</p>
    </section>

    <section class="panel mobs" id="mobs" aria-label="Мобы" hidden>
      <h2>Мобы <span id="mobsHint"></span></h2>
      <div id="tiers"></div>
    </section>

    <section class="panel summary" id="summary" aria-label="Итог забега" hidden>
      <h2>Итог забега</h2>
      <div id="summaryBody"></div>
    </section>
```

After the toast `div` (before scripts) add:

```html
<dialog class="picker" id="picker" aria-labelledby="pickerTitle">
  <h2 id="pickerTitle">Кто появился?</h2>
  <div class="pgrid" id="pickerGrid"></div>
  <button class="btn" id="pickerClose">Закрыть <kbd>Esc</kbd></button>
</dialog>
```

Scripts become:

```html
<script src="rules.js"></script>
<script src="enemies.js"></script>
<script src="run.js"></script>
<script src="app.js"></script>
<script src="helper.js"></script>
```

- [ ] **Step 2: CSS** — add tier colours to the three theme blocks:

Dark `:root`: `--t1: #7fd08a; --t2: #f0a93b; --t3: #ff6b6b; --alarm: #ff5c5c;`
Both light blocks: `--t1: #1f9a4a; --t2: #b86e00; --t3: #d23434; --alarm: #c62828;`

Append before the `/* phone overrides */` comment:

```css
/* ===== run helper ===== */
.t1 { --tc: var(--t1); } .t2 { --tc: var(--t2); } .t3 { --tc: var(--t3); }
.pill { font-size: 12.5px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--text); }
body[data-mode="level"] .pill { border-color: var(--good); color: var(--good); }
.shop { grid-area: shop; } .lvlp { grid-area: lvlp; } .mobs { grid-area: mobs; } .summary { grid-area: summary; }
body[data-mode="level"] .wrap { max-width: 1760px; }
body[data-mode="level"] .grid { grid-template-columns: minmax(0, 4fr) minmax(0, 9fr) minmax(0, 5fr); grid-template-areas: "lvlp mobs log"; }
body[data-mode="level"] .carts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
body[data-mode="level"] .chance output { font-size: 40px; }
body[data-mode="shop"] .grid { grid-template-areas: "shop odds" "levels stats"; }
body.has-summary[data-mode="idle"] .grid { grid-template-areas: "summary summary" "log odds" "levels stats"; }
@media (max-width: 1180px) {
  body[data-mode="level"] .grid { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); grid-template-areas: "lvlp mobs" "log mobs"; }
}
@media (max-width: 980px) {
  body[data-mode] .grid { grid-template-columns: minmax(0, 1fr); }
  body[data-mode="level"] .grid { grid-template-areas: "lvlp" "mobs" "log"; }
  body[data-mode="shop"] .grid { grid-template-areas: "shop" "odds" "levels" "stats"; }
  body.has-summary[data-mode="idle"] .grid { grid-template-areas: "summary" "log" "odds" "levels" "stats"; }
}
.big { padding: 16px 24px; font-size: 17px; }
.shop-row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
.clock-sm span { display: block; font-size: 12.5px; color: var(--muted); }
.clock-sm b { font-size: 22px; }
.tsum { display: flex; gap: 18px; flex-wrap: wrap; align-items: baseline; margin-bottom: 10px; }
.tsum span { display: inline-flex; align-items: center; gap: 7px; }
.tsum i { width: 9px; height: 9px; border-radius: 50%; background: var(--tc); }
.tsum b { font-size: 22px; }
#shopForecast p { margin: 6px 0; font-size: 14px; }
.warn { color: var(--t2); }
.check { display: flex; gap: 8px; align-items: center; margin-top: 14px; font-size: 13.5px; color: var(--muted); cursor: pointer; }
.clock b { display: block; font-size: 64px; font-weight: 700; line-height: 1; letter-spacing: -.02em; }
.clock span { font-size: 13px; color: var(--muted); }
.coef { margin: 22px 0 14px; }
.coef-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.5px; }
.coef-head b { font-size: 28px; }
.coef-bar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; margin: 8px 0 6px; }
.coef-bar i { font-style: normal; text-align: center; font-size: 11px; padding: 4px 0; border-radius: 5px; background: var(--panel-2); color: var(--faint); }
.coef-bar i.past { opacity: .45; }
.coef-bar i.on { background: var(--primary); color: var(--primary-ink); font-weight: 600; }
.first { font-size: 14px; margin: 0 0 16px; }
.alarm { width: 100%; border: 1px solid color-mix(in srgb, var(--alarm) 55%, transparent); background: color-mix(in srgb, var(--alarm) 12%, transparent); color: var(--text); border-radius: 12px; padding: 12px 16px; cursor: pointer; font-weight: 600; display: flex; justify-content: center; gap: 10px; align-items: center; }
.alarm:hover { background: color-mix(in srgb, var(--alarm) 20%, transparent); }
.alarm:disabled { opacity: .4; cursor: default; }
.banner { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--alarm); color: #fff; font-weight: 600; font-size: 14px; }
```

- [ ] **Step 3: Remove the old `newRun` handler from `app.js`** (the `$("newRun").addEventListener("click", …)` block) — `helper.js` owns it now.

- [ ] **Step 4: Create `helper.js`**

```js
/* ===== REPO helper: run mode UI. Needs rules.js, enemies.js, run.js, app.js (loaded before). ===== */
const { ENEMIES, enemyPool, oneShot, setupLabel } = ENEMY_DATA;
const HKEY = "repoHelper.v1";
const BASE_TITLE = document.title;
const freshH = () => ({ settings: { sound: true, groups: false }, run: null, runs: [] });
let H = loadH();
let lastTick = Date.now();
let numbered = [];                      // uid per on-screen number 1..9 (Shift+N = killed)

function loadH() {
  try { const h = JSON.parse(localStorage.getItem(HKEY)); if (h && h.settings) return { ...freshH(), ...h }; } catch (e) {}
  return freshH();
}
function saveH() { try { localStorage.setItem(HKEY, JSON.stringify(H)); } catch (e) {} }

const now = () => Date.now();
const mode = () => H.run ? H.run.mode : "idle";
function clock(sec) {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
const range = (a, b) => { const x = clock(Math.ceil(a)), y = clock(Math.ceil(b)); return x === y ? x : `${x}–${y}`; };
const iconSvg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d.icon}</svg>`;

/* ----- hooks into app.js ----- */
extra = { get: () => H, set: h => { if (h) { H = h; saveH(); } } };
inLevel = () => mode() === "level";
onRecorded = boxes => { if (inLevel()) { RUN.endLevel(H.run, boxes, now()); saveH(); } };
afterRender = () => renderHelper();

/* ----- sound: Web Audio beeps, no files ----- */
let actx = null;
document.addEventListener("pointerdown", () => { try { actx = actx || new AudioContext(); actx.resume(); } catch (e) {} }, { once: true });
function beep(freq = 880, dur = 0.12, n = 1) {
  if (!H.settings.sound) return;
  try {
    actx = actx || new AudioContext();
    for (let i = 0; i < n; i++) {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * (dur + 0.08);
      o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    }
  } catch (e) {}
}
const SOUND_ICON = {
  on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
};

/* ----- actions ----- */
function finishRun() {
  RUN.endRun(H.run, now());
  H.runs.push(RUN.summary(H.run, now()));
  H.runs = H.runs.slice(-20);
  H.run = null;
}
function newRunH() {
  remember();
  if (H.run) finishRun();
  S.level = 1; S.pending = []; nextMark = "new"; save();
  H.run = RUN.newRun(now()); saveH();
  render();
  toast("Новый забег: уровень 1, невезение сохранено", true);
}
function endRunH() {
  if (!H.run) return;
  remember();
  finishRun(); saveH(); render();
  toast("Забег окончен", true);
}
function startLevel() {
  if (mode() !== "shop") return;
  remember();
  RUN.startLevel(H.run, S.level, now()); saveH();
  lastTick = now();
  render();
}
function extractionsDone() {
  if (!inLevel() || H.run.level.extractionsAt !== null) return;
  remember();
  RUN.extractionsDone(H.run, now()); saveH(); render();
  beep(440, 0.25, 2);
  toast("Выгрузки сданы: мобы возвращаются", true);
}
function toggleSound() { H.settings.sound = !H.settings.sound; saveH(); renderHelper(); }

/* ----- render ----- */
function renderHelper() {
  const m = mode(), last = H.runs[H.runs.length - 1];
  document.body.dataset.mode = m;
  document.body.classList.toggle("has-summary", m === "idle" && !!last);
  $("shop").hidden = m !== "shop";
  $("lvlp").hidden = $("mobs").hidden = m !== "level";
  $("summary").hidden = !(m === "idle" && last);
  $("logP").hidden = m === "shop";
  $("oddsP").hidden = $("levelsP").hidden = $("statsP").hidden = m === "level";
  $("newRun").hidden = m !== "idle";
  $("endRun").hidden = m === "idle";
  $("modePill").hidden = m === "idle";
  $("modePill").textContent = m === "level" ? `идёт уровень ${H.run.level.number}` : m === "shop" ? `магазин → уровень ${S.level}` : "";
  $("sound").innerHTML = SOUND_ICON[H.settings.sound ? "on" : "off"];
  $("sound").title = `Звук: ${H.settings.sound ? "вкл" : "выкл"} (M)`;
  $("sound").setAttribute("aria-label", $("sound").title);
  $("next").innerHTML = m === "level" ? "Уровень пройден <kbd>Enter</kbd>" : "Записать уровень <kbd>Enter</kbd>";
  if (m === "level") $("next").disabled = false;
  $("nothing").hidden = m === "level";
  if (m === "shop") renderShop();
  if (m === "level") renderLevel();
  if (m === "idle" && last) renderSummary(last);
  tick();
}

function renderShop() {
  const L = S.level, c = RULES.enemyCounts(L), f = RULES.firstSpawn(L);
  $("shopTitle").textContent = `Дальше уровень ${L}`;
  $("startLevel").innerHTML = `Начать уровень ${L} <kbd>S</kbd>`;
  $("groups").checked = H.settings.groups;
  $("shopForecast").innerHTML = `
    <div class="tsum">${c.map((n, i) => `<span class="t${i + 1}"><i></i>${"★".repeat(i + 1)} <b class="num">${n}</b></span>`).join("")}
      <span class="muted">всего <b class="num">${c[0] + c[1] + c[2]}</b> слотов</span></div>
    <p>Первые мобы через ${range(f.min, f.max)}${f.max > 5 ? `, в 20% случаев раньше: ${range(f.earlyMin, f.earlyMax)}` : ""}.</p>
    <p class="muted">Gnome приходят пачкой по 4, Banger по 3. ${L < 3 ? "Loom появляется с 3-го уровня." : ""}</p>
    ${L <= 3 && H.settings.groups ? `<p class="warn">Слот 3★ может оказаться группой: до 10 мобов сразу.</p>` : ""}`;
}

function renderLevel() {
  const lv = H.run.level;
  $("lvlTitle").textContent = `Уровень ${lv.number}`;
  $("extract").disabled = lv.extractionsAt !== null;
  $("extractBanner").hidden = lv.extractionsAt === null;
}

function renderSummary(r) {
  const byR = [0, 0, 0, 0]; r.boxes.forEach(b => byR[b]++);
  $("summaryBody").innerHTML = `
    <div class="totals">
      <div><span>Время</span><b class="num">${clock((r.endedAt - r.startedAt) / 1000)}</b></div>
      <div><span>Уровней пройдено</span><b class="num">${r.levels}</b></div>
      <div><span>Убийств</span><b class="num">${r.kills}</b></div>
    </div>
    ${r.failed ? `<p class="muted">Забег закончился на уровне ${r.lastLevel}.</p>` : ""}
    <div class="byr">${RAR.map((n, i) => `<span class="r${i}"><i></i>${n} ${byR[i]}</span>`).join("")}</div>
    <div class="met">${r.met.map(id => `<span class="metc t${ENEMIES[id].tier}">${iconSvg(ENEMIES[id])}${ENEMIES[id].name}</span>`).join("") || '<span class="muted">мобов не отмечал</span>'}</div>`;
}

/* ----- ticking clocks (every 250 ms) ----- */
function put(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; }
function tick() {
  const t = now();
  if (!H.run) { document.title = BASE_TITLE; lastTick = t; return; }
  const runText = clock((t - H.run.startedAt) / 1000);
  put("runClock", runText); put("runClockShop", runText);
  if (!inLevel()) { document.title = `Магазин · ${BASE_TITLE}`; lastTick = t; return; }
  const lv = H.run.level, sec = (t - lv.startedAt) / 1000, done = lv.extractionsAt !== null;
  put("lvlClock", clock(sec));
  const coef = done ? 0 : RULES.respawnCoef(sec), nd = done ? null : RULES.nextCoefDrop(sec);
  put("coef", coef.toFixed(1));
  put("coefNext", done ? "выгрузки сданы: возрождение 1 с" : nd === null ? "минимум: возрождение 1 с" : `→ ${(coef - 0.2).toFixed(1)} через ${clock(Math.ceil(nd))}`);
  put("coefBar", [1, 0.8, 0.6, 0.4, 0.2, 0].map(v => `<i class="${Math.abs(v - coef) < 1e-9 ? "on" : v > coef ? "past" : ""}">${v.toFixed(1)}</i>`).join(""));
  const f = RULES.firstSpawn(lv.number);
  put("firstSpawn", sec < f.min ? `Первые мобы через ${range(f.min - sec, f.max - sec)} (в 20% случаев раньше)`
    : sec < f.max ? `Первые мобы появляются: ещё до ${clock(Math.ceil(f.max - sec))}` : "Мобы уже на карте");
  for (let k = 1; k <= 5 && !done; k++) {
    const at = lv.startedAt + k * RULES.COEF_PERIOD * 1000;
    if (lastTick < at && at <= t) beep(660, 0.15, 3);
  }
  document.title = `Ур. ${lv.number} · ${clock(sec)}`;
  tickEnemies(t);
  lastTick = t;
}
function tickEnemies(t) {}              // filled in Task 7

/* ----- events ----- */
$("newRun").addEventListener("click", newRunH);
$("endRun").addEventListener("click", endRunH);
$("startLevel").addEventListener("click", startLevel);
$("extract").addEventListener("click", extractionsDone);
$("sound").addEventListener("click", toggleSound);
$("groups").addEventListener("change", e => { H.settings.groups = e.target.checked; saveH(); render(); });
// After a mouse click, drop focus from the button so Enter means "level done" again, not "press this button".
document.addEventListener("click", e => {
  const a = document.activeElement;
  if (a && a !== document.body && a.matches("button") && !a.closest("dialog, .menu")) a.blur();
});
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, summary, dialog") || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (e.code === "KeyS") startLevel();
  else if (e.code === "KeyE") extractionsDone();
  else if (e.code === "KeyM") toggleSound();
});

render();
setInterval(tick, 250);
```

- [ ] **Step 5: BROWSER CHECK**

1. Fresh storage (`localStorage.clear()`): idle mode, looks like before plus sound button; no console errors.
2. Click "Новый забег" → shop: "Дальше уровень 1", forecast `★1 · ★★0 · ★★★1`, "Первые мобы через 2:00–3:00, в 20% случаев раньше: 0:12–0:45"; run clock ticks.
3. Press `S` (also try with RU layout: `ы` key, `e.code` is still `KeyS`) → level mode, three columns at 1920; level clock counts; coefficient 1.0, "→ 0.8 через 10:00" (then 9:59…).
4. Seed level started 25 minutes ago: `evaluate_script` → `() => { const h = JSON.parse(localStorage.getItem("repoHelper.v1")); h.run.level.startedAt -= 25*60000; localStorage.setItem("repoHelper.v1", JSON.stringify(h)); location.reload(); }` → coefficient 0.6, "→ 0.4 через 4:59", bar shows 0.6 on; no beeps on load.
5. `E` → banner, button disabled, coefficient 0.0. `Enter` (no boxes) → back to shop "уровень 2", table has level 1 "нет".
6. "Забег окончен" → idle with summary panel on top (1 level, 0 kills). `Ctrl+Z` → back in shop.
7. Screenshots 1920/1100, light/dark for shop and level.

- [ ] **Step 6: Commit**

```bash
git add helper.js index.html app.js
git commit -m "Add run modes: shop, level timers, respawn coefficient, run summary"
```

---

### Task 7: Enemy slots, picker, cards, kill timers, hotkeys (`helper.js` part 2)

**Files:**
- Modify: `helper.js` (`renderLevel`, `tickEnemies`, new functions, events)
- Modify: `index.html` (CSS)

**Interfaces:**
- Consumes: Task 6 functions; `RUN.addPick/removeEnemy/kill/status/seenCounts`, `ENEMY_DATA.enemyPool/setupLabel/oneShot`.

- [ ] **Step 1: CSS** — append after the Task 6 helper CSS:

```css
.mobs h2 span { font: 13px var(--body); color: var(--muted); margin-left: 8px; }
.tier { padding: 12px 0; border-top: 1px solid var(--line); }
.tier:first-child { border-top: 0; padding-top: 0; }
.th { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.th b { color: var(--tc); letter-spacing: .08em; }
.th span { font-size: 13px; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.mob { border-radius: 14px; padding: 12px; background: var(--panel-2); border: 1px solid color-mix(in srgb, var(--tc) 35%, transparent); display: flex; flex-direction: column; gap: 6px; }
.mob[data-st="cooldown"] { opacity: .72; border-style: dashed; }
.mob[data-st="window"] { border-color: var(--t2); box-shadow: 0 0 0 1px var(--t2); }
.mob[data-st="back"] { border-color: var(--tc); }
.mh { display: flex; align-items: center; gap: 8px; }
.mh .ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--tc); background: color-mix(in srgb, var(--tc) 14%, transparent); flex: none; }
.mh .ic svg { width: 20px; height: 20px; }
.mh b { font-weight: 600; flex: 1; }
.ms { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.ms b { color: var(--text); font-size: 14px; }
.one { color: var(--alarm); font-weight: 600; }
.md { margin: 0; font-size: 13px; color: var(--muted); }
.mt { font-size: 13.5px; min-height: 0; }
.mt:empty { display: none; }
.mt .cd b, .mt .win b { font-size: 15px; }
.mt .win { color: var(--t2); }
.mt .back { color: var(--tc); font-weight: 600; }
.mt .bar { display: block; height: 5px; border-radius: 3px; background: var(--line); margin-top: 5px; overflow: hidden; }
.mt .bar i { display: block; height: 100%; background: var(--t2); }
.ma { display: flex; align-items: center; gap: 8px; margin-top: auto; }
.kill { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--primary); color: var(--primary-ink); font-weight: 600; cursor: pointer; }
.kill:disabled { opacity: .35; cursor: default; }
.orbs { font-size: 12.5px; color: var(--muted); flex: 1; }
.rm { border: 0; background: none; color: var(--faint); cursor: pointer; font-size: 12.5px; padding: 4px; }
.rm:hover { color: var(--bad); }
.slot-add { border: 1px dashed color-mix(in srgb, var(--tc) 55%, transparent); background: transparent; color: var(--tc); border-radius: 14px; min-height: 96px; cursor: pointer; font-weight: 500; }
.slot-add:hover { background: color-mix(in srgb, var(--tc) 10%, transparent); }
.picker { border: 1px solid var(--line); border-radius: 18px; background: var(--panel); color: var(--text); padding: 20px; width: min(760px, calc(100vw - 32px)); }
.picker::backdrop { background: rgb(0 0 0 / .5); }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-bottom: 14px; max-height: 60vh; overflow-y: auto; }
.pgrid button { display: flex; align-items: center; gap: 8px; text-align: left; border: 1px solid var(--line); background: var(--panel-2); border-radius: 12px; padding: 8px 10px; cursor: pointer; }
.pgrid button:hover { border-color: var(--tc); }
.pgrid .ic { width: 26px; height: 26px; color: var(--tc); flex: none; }
.pgrid small { display: block; font-size: 11.5px; color: var(--muted); }
.met { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.metc { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; border-radius: 999px; font-size: 13px; background: color-mix(in srgb, var(--tc) 12%, transparent); }
.metc svg { width: 16px; height: 16px; color: var(--tc); }
```

- [ ] **Step 2: Replace `renderLevel` and `tickEnemies` in `helper.js`, add picker and actions**

```js
function renderLevel() {
  const lv = H.run.level, counts = RULES.enemyCounts(lv.number);
  $("lvlTitle").textContent = `Уровень ${lv.number}`;
  $("extract").disabled = lv.extractionsAt !== null;
  $("extractBanner").hidden = lv.extractionsAt === null;
  const tierOf = e => lv.picks.find(p => p.pick === e.pick).tier;
  numbered = [];
  $("tiers").innerHTML = [1, 2, 3].map(t => {
    const used = lv.picks.filter(p => p.tier === t).length, free = Math.max(0, counts[t - 1] - used);
    const cards = lv.enemies.filter(e => tierOf(e) === t).map(e => { numbered.push(e.uid); return card(e, numbered.length); }).join("");
    const adds = Array.from({ length: free }, () => `<button class="slot-add t${t}" data-open="${t}">+ кто появился?</button>`).join("");
    return `<div class="tier t${t}"><div class="th"><b>${"★".repeat(t)}</b><span>${counts[t - 1] ? `${used} из ${counts[t - 1]}` : "на этом уровне нет"}</span></div>
      ${cards || adds ? `<div class="cards">${cards}${adds}</div>` : ""}</div>`;
  }).join("");
  $("mobsHint").textContent = numbered.length ? "Shift+номер — убит" : "";
}

function card(e, n) {
  const d = ENEMIES[e.id];
  return `<article class="mob t${d.tier}" data-uid="${e.uid}" data-st="alive">
    <div class="mh"><span class="ic">${iconSvg(d)}</span><b>${d.name}</b>${n <= 9 ? `<kbd title="Shift+${n}: убит">⇧${n}</kbd>` : ""}</div>
    <div class="ms"><span>HP <b class="num">${d.hp}</b></span>
      <span title="${d.dmg.length ? "урон по игроку за удар" : "урон зависит от атаки"}">урон <b class="num">${d.dmg.length ? d.dmg.join(" / ") : "—"}</b></span>
      ${oneShot(d) ? `<span class="one">убивает с удара</span>` : ""}</div>
    ${d.desc ? `<p class="md">${d.desc}</p>` : ""}
    <div class="mt" data-timer="${e.uid}"></div>
    <div class="ma"><button class="kill" data-kill="${e.uid}">Убит</button>
      <span class="orbs" title="Орбов выпало с этого моба, максимум 3 за уровень">орбы ${e.orbs}/3</span>
      <button class="rm" data-rm="${e.uid}" aria-label="Убрать ${d.name}">Убрать</button></div>
  </article>`;
}

function timerText(e, st, t) {
  if (st === "alive") return "";
  if (st === "cooldown") return `<span class="cd">вернётся через <b class="num">${range((e.start - t) / 1000, (e.end - t) / 1000)}</b></span>`;
  if (st === "window") {
    const p = (t - e.start) / Math.max(1, e.end - e.start);
    return `<span class="win">может вернуться · окно до <b class="num">${clock(Math.ceil((e.end - t) / 1000))}</b></span><span class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></span>`;
  }
  return `<span class="back">может быть на карте</span>`;
}

function tickEnemies(t) {
  let nearest = null;
  for (const e of H.run.level.enemies) {
    const st = RUN.status(e, t);
    const box = document.querySelector(`.mob[data-uid="${e.uid}"]`);
    if (box) {
      box.dataset.st = st;
      const tm = box.querySelector(".mt"), html = timerText(e, st, t);
      if (tm.innerHTML !== html) tm.innerHTML = html;
      box.querySelector(".kill").disabled = st === "cooldown";
    }
    if (e.start !== null) {
      if (lastTick < e.start - 10000 && e.start - 10000 <= t && e.start - e.killedAt > 10000) beep(880, 0.12, 1);
      if (lastTick < e.start && e.start <= t) beep(1175, 0.18, 2);
    }
    if (st === "cooldown" && (!nearest || e.start < nearest.start)) nearest = e;
  }
  if (nearest) document.title = `⏱ ${ENEMIES[nearest.id].name} ${clock(Math.ceil((nearest.start - t) / 1000))}`;
}

function openPicker(tier) {
  if (!inLevel()) return;
  const lv = H.run.level, seen = RUN.seenCounts(H.run);
  $("pickerTitle").textContent = `${"★".repeat(tier)}: кто появился на уровне ${lv.number}?`;
  $("pickerGrid").innerHTML = enemyPool(tier, lv.number, H.settings.groups).map(s => {
    const d = ENEMIES[s.members[0][0]], was = seen[s.members[0][0]];
    return `<button class="t${tier}" data-pick="${s.id}"><span class="ic">${iconSvg(d)}</span>
      <span>${setupLabel(s)}${was ? `<small>уже был в забеге: реже выпадает</small>` : ""}</span></button>`;
  }).join("");
  $("picker").showModal();
}
function pickSetup(id) {
  remember();
  if (RUN.addPick(H.run, id) === null) { undoStack.pop(); return; }
  saveH(); $("picker").close(); render();
}
function killEnemy(uid) {
  remember();
  if (!RUN.kill(H.run, uid, now())) { undoStack.pop(); return; }
  saveH(); render();
}
function removeEnemyH(uid) { remember(); RUN.removeEnemy(H.run, uid); saveH(); render(); }
```

Delete the placeholder line `function tickEnemies(t) {}              // filled in Task 7`.

- [ ] **Step 3: Events** — add to the events block of `helper.js`:

```js
document.addEventListener("click", e => {
  const t = e.target.closest("[data-open],[data-pick],[data-kill],[data-rm]");
  if (!t) return;
  if (t.dataset.open) openPicker(+t.dataset.open);
  else if (t.dataset.pick) pickSetup(t.dataset.pick);
  else if (t.dataset.kill) killEnemy(+t.dataset.kill);
  else if (t.dataset.rm) removeEnemyH(+t.dataset.rm);
});
$("pickerClose").addEventListener("click", () => $("picker").close());
```

Replace the helper keydown listener with (Shift+digit uses `e.code`, so it works on any layout and never collides with box keys `1`–`4`):

```js
document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, summary, dialog") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.shiftKey) {
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && inLevel() && numbered[+m[1] - 1]) { e.preventDefault(); killEnemy(numbered[+m[1] - 1]); }
    return;
  }
  if (e.code === "KeyS") startLevel();
  else if (e.code === "KeyE") extractionsDone();
  else if (e.code === "KeyM") toggleSound();
});
```

- [ ] **Step 4: BROWSER CHECK**

1. New run → `S` on level 1. 1★ row "0 из 1" + "+ кто появился?", 2★ "на этом уровне нет", 3★ "0 из 1".
2. Click 1★ slot → dialog with 9 entries incl. "Gnome ×4"; pick it → 4 Gnome cards numbered ⇧1–⇧4, slot gone. Press `Enter` while the dialog is open (before picking) → nothing is recorded (dialog guard).
3. Pick Robe in 3★ → card shows "HP 250 · урон 100 · убивает с удара".
4. `Shift+1` → Gnome #1: dashed card, "вернётся через 4:00–5:00", kill button disabled, orbs 1/3, tab title "⏱ Gnome 3:59".
5. Seed kill time into the past: `evaluate_script` → `() => { const h = JSON.parse(localStorage.getItem("repoHelper.v1")); const e = h.run.level.enemies[0]; e.start -= 235000; e.end -= 235000; e.killedAt -= 235000; localStorage.setItem("repoHelper.v1", JSON.stringify(h)); location.reload(); }` → no beep on load, card counts "0:05–1:05"; after ~5 s card switches to "может вернуться" with a progress bar (beep if sound on — check `list_console_messages` shows no AudioContext errors).
6. `E` → Gnome #1 window clamps (≤ 30 s left); a fresh kill after that shows "вернётся через 0:01" then "может быть на карте".
7. "Убрать" on all four gnomes → 1★ slot free again. `Ctrl+Z` restores the last one.
8. Reload mid-level → everything identical, timers continue.
9. Screenshots 1920 and 1100, light and dark, with 4+ cards incl. cooldown/window states.

- [ ] **Step 5: Commit**

```bash
git add helper.js index.html
git commit -m "Add enemy slots, picker, cards and respawn timers"
```

---

### Task 8: README, final checks

**Files:**
- Modify: `README.md`, `index.html` (meta description), `docs/superpowers/specs/2026-09-29-repo-helper-design.md` only if behaviour diverged

- [ ] **Step 1: README** — replace the first lines and "Как пользоваться" with:

```markdown
# R.E.P.O. — помощник забега и трекер коробок

**Открыть:** https://tiruum.github.io/repo/

Помощник на второй монитор: таймеры уровня и забега, мобы на уровне с таймерами возрождения
по коэффициенту из кода игры, прогноз на следующий уровень. Между забегами — трекер
косметических коробок: шансы, счётчик невезения, статистика.

## Как пользоваться

- «Новый забег» → магазин. «Начать уровень» (`S`), когда уровень загрузился.
- Увидел моба — нажми «+ кто появился?» в его ряду (1★/2★/3★) и выбери его.
- Убил — «Убит» или `Shift+номер`: карточка покажет, когда он может вернуться.
- Сдал все выгрузки — «Все выгрузки сданы» (`E`): мобы с долгим кулдауном возвращаются сразу.
- Нашёл коробку — `1`–`4`. Уровень пройден — `Enter`. `Ctrl+Z` отменяет любое действие, `M` — звук.
- «Забег окончен» — итог забега и снова полный трекер коробок.

## Мобы (из кода игры)

- Мобов по тирам: ур. 1–2: 1/0/1, 3–5: 1/1/1, 6–8: 2/2/2, 9: 2/3/2, 10–19: 2/3/3, 20+: 3/4/4.
- Возрождение: 240–300 с × коэффициент. Коэффициент 1.0 в начале уровня и −0.2 каждые 10 минут
  на уровне, до 0 (тогда 1 с). После сдачи всех выгрузок коэффициент 0, кулдауны больше 30 с обнуляются.
- С убитого моба выпадает орб, максимум 3 с одного моба за уровень.
```

Keep the existing "Правила спавна" section (boxes) below and add `EnemyDirector`, `EnemyParent.Despawn` to the source line. Update the `<meta name="description">` / `og:description` to "Помощник забега R.E.P.O.: таймеры, мобы и их возрождение, шансы косметических коробок. Правила из кода игры, v0.4.4.3."

- [ ] **Step 2: Full verification**

Run: `node --test tests/` → all PASS (paste the summary line).
BROWSER CHECK, existing-user path: `localStorage.clear()`, seed only `repoBoxTracker.v1` (Task 1 seed) → idle, same history and stats, no summary panel, no console errors. Then one full run: new run → level 1 with a gnome pack and a kill → `Enter` with a rare box → level 2 → "Забег окончен" → summary shows 1 level, 1 kill, Редкая 1, Gnome + met enemies, failed on level 2.
`grep -rn "http" rules.js enemies.js run.js app.js helper.js` → no URLs (no external requests).

- [ ] **Step 3: Commit**

```bash
git add README.md index.html
git commit -m "Describe the run helper in README and meta"
```

- [ ] **Step 4: Hand-off** — tell the user the branch is ready, show screenshots, and ask before `git merge` into `main` + push (push publishes the public site). Push command when approved:
`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`
