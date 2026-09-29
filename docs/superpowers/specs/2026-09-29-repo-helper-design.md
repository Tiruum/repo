# REPO helper — design

Date: 2026-09-29. Game: R.E.P.O. v0.4.4.3 (Steam build 23363152).

## Goal

Turn the cosmetic box tracker at https://tiruum.github.io/repo/ into a run helper used on a
second monitor while playing. During a level the page shows what matters right now (level and
run timers, enemies on the level, respawn timers, respawn coefficient). Between runs it shows
the existing box tracker (all levels, all-time stats, luck).

The page cannot see the game. The player marks events by hand (level start, enemy seen, enemy
killed, all extractions done, boxes found); the page runs every timer and forecast from the
game's own rules.

## Constraints

- Static site on GitHub Pages, no build step, vanilla JS.
- Also runs as a Discord Activity: no external requests (fonts, images, scripts all same origin).
- State in `localStorage` only. Timers are stored as timestamps so a reload loses nothing.
- Existing box tracker data (`repoBoxTracker.v1`) must keep working unchanged.
- Existing design system: graphite palette, Unbounded + Golos Text, light/dark toggle.
- Layout targets a wide second monitor; still usable down to ~1000px, no need for phone layout.
- The game does not pause (Esc menu keeps running), so there is no pause feature.

## File layout

| File | Role |
|---|---|
| `index.html` | markup skeleton + CSS |
| `rules.js` | pure game rules: box odds (moved from index.html), enemy counts, first spawn, respawn math |
| `enemies.js` | enemy data: name, tier, HP, damage, description, SVG icon; spawn setups and pools |
| `run.js` | pure run state: start level, picks, kills, extractions, statuses, run summary |
| `app.js` | existing box tracker UI (moved from index.html), shared undo stack and hooks |
| `helper.js` | run UI: modes, level/shop/summary panels, enemy cards, ticking timers, sound, hotkeys |

Plain classic `<script>` tags sharing one global scope, no modules, no build.
`rules.js`, `enemies.js`, `run.js` have no DOM access and are tested in Node (`node --test`).

## Modes

The mode follows run state; a header switch shows it.

1. **Level** (level running). Three columns:
   - Left, level panel: level number, big level timer, run timer, respawn coefficient with
     "next drop in m:ss", first-spawn countdown, "All extractions done" button.
   - Centre, enemies: three tier rows (1★/2★/3★) with slots ("2 of 3 seen"), enemy cards.
   - Right, boxes: existing rarity buttons + this level's odds, compact.
   - Bottom: "Level done" (Enter) records boxes (existing logic), stops the level timer, goes to Shop.
2. **Shop** (between levels): run timer keeps running (game time keeps going in the shop too),
   "Start level N" button, forecast for the next level (enemy counts per tier, group chance, box odds).
3. **Idle** (no run / run over): the current tracker (levels table, all-time stats, luck) plus a
   run summary (time, levels, enemies met, kills, boxes).

"New run" starts at Shop for level 1. "Run over" goes to Idle and saves the summary.

## Game rules (from Assembly-CSharp.dll + assets)

`lc` = levels completed = level − 1.

**Enemy count per tier** (`EnemyDirector.AmountSetup`, step curves, int truncation):

| Level | 1★ | 2★ | 3★ | total |
|---|---|---|---|---|
| 1–2 | 1 | 0 | 1 | 2 |
| 3–5 | 1 | 1 | 1 | 3 |
| 6–8 | 2 | 2 | 2 | 6 |
| 9 | 2 | 3 | 2 | 7 |
| 10–19 | 2 | 3 | 3 | 8 |
| 20+ | 3 | 4 | 4 | 11 |

**Pools** (`EnemyDirector.enemiesDifficulty1/2/3`, `EnemySetup`):
- 1★: Peeper, Shadow Child, Gnome, Apex Predator, Spewer, Tick, Birthday Boy, Elsa, Bella.
- 2★: Rugrat, Animal, Upscream, Hidden, Chef, Bowtie, Mentalist, Banger, Gambit, Heart Hugger, Headgrab, Oogly.
- 3★: Headman, Robe, Huntsman, Reaper, Clown, Trudge, Cleanup Crew; Loom only from level 3 (lc ≥ 2).
- 3★ groups, only levels 1–3 and only with ≥ 5 runs played (setting in the page, default off):
  3 Animals, 3 Bowties, 3 Mentalists, 2 Hidden, 3 Chefs, 3 Upscreams, 3 Rugrats, 4 Peepers,
  4 Apex Predators, 4 Spewers, 4 Shadow Children, 6 Bangers, 10 Gnomes, 2 Gambits,
  2 Heart Huggers, 5 Ticks, 3 Birthday Boys, 3 Elsas, 3 Headgrabs, 3 Ooglies, 3 Bellas.
  A group fills one 3★ slot and adds one card per member.
- Pick weight = max(1, chance − 30 × times spawned this run − 10 × already in this level's list);
  chance 100, groups 60. Shown only as a hint ("seen this run → less likely"), not as exact odds.

**First spawn**: pause = 60 × U(2,3) × idleCurve(clamp01(lc/9)), idleCurve keys (0,1) (0.5,0.2) (1,0)
(Hermite, evaluate with the asset's tangents); 20% chance × U(0.1,0.25); minimum 5 s.
Shown as a range, e.g. level 1: 2:00–3:00 (or early).

**Respawn**:
- Kill and normal leave are the same `EnemyParent.Despawn`:
  cooldown = U(240,300) × despawnedDecreaseMultiplier × despawnedTimeMultiplier (always 1), min 1 s.
- despawnedDecreaseMultiplier (the respawn coefficient) starts at 1.0 on level load and drops by 0.2
  every 10 min of level time, floor 0: 0–10 min 1.0, 10–20 0.8, 20–30 0.6, 30–40 0.4, 40–50 0.2, 50+ 0.
- The coefficient is taken at kill time; the card shows the window [240k, 300k].
- All extractions done: coefficient becomes 0, every cooldown > 30 s is set to 0 (enemy back now),
  enemies go to player rooms.
- On the map an enemy stays 20–40 s of "no player close" time, then leaves (not tracked, info only).
- A killed enemy drops an orb (small/medium/big by tier), at most 3 per enemy per level.

## Enemy data (`enemies.js`)

Per enemy: id, English name, tier, HP, player damage values, one-shot flag (damage ≥ 100),
`scriptDamage` flag where damage comes from code (explosions, throws, beams) and the number is
filled by hand or shown as "—", 1–2 line Russian description (threat + how to deal with it),
inline SVG icon (own drawing, silhouette/symbol, tinted by tier colour, works in both themes).

| Tier | Enemy | HP | Damage |
|---|---|---|---|
| 1 | Gnome | 20 | 10 |
| 1 | Tick | 10 | — |
| 1 | Peeper | 30 | — |
| 1 | Spewer | 65 | 10 |
| 1 | Apex Predator | 150 | 10 |
| 1 | Birthday Boy | 150 | 10 |
| 1 | Shadow Child | 150 | — |
| 1 | Bella | 200 | 5 |
| 1 | Elsa | 600 | 5 |
| 2 | Banger | 50 | — (explosion) |
| 2 | Upscream | 50 | 2 |
| 2 | Hidden | 100 | — |
| 2 | Animal | 150 | 2 |
| 2 | Chef | 150 | 10 |
| 2 | Headgrab | 150 | 5 |
| 2 | Gambit | 150 | — |
| 2 | Mentalist | 150 | — |
| 2 | Rugrat | 150 | — (throws) |
| 2 | Bowtie | 200 | — |
| 2 | Oogly | 200 | 4 |
| 2 | Heart Hugger | 300 | 30 |
| 3 | Headman | 250 | 10 |
| 3 | Reaper | 250 | 10 |
| 3 | Clown | 250 | 10 / 30 |
| 3 | Huntsman | 250 | 100 |
| 3 | Robe | 250 | 100 |
| 3 | Cleanup Crew | 350 | 20 |
| 3 | Loom | 500 | 100 |
| 3 | Trudge | 500 | 20 / 35 / 100 |

Player HP is 100 without upgrades. Source dump: `repo-cosmetics/enemystats.json`.

## Enemy cards and interaction

- Click an empty tier slot → picker grid (icon + name) with the pool valid for this level.
  Duplicates allowed. Group entries appear only when allowed.
- Card: icon, name, ★, number 1–9 (hotkey), HP, damage, "one hit" badge, description,
  orbs 0/3, "Killed" button, "Remove" (misclick).
- States: **alive** → Killed → **cooldown** ("back in m:ss", counts to window start) →
  **window** (progress bar to window end) → **maybe on map** (alive again, can be killed again).
- "All extractions done": red banner, cooldowns > 30 s jump to "back now", later kills get 1 s.
- Orbs: +1 per kill up to 3, then "no more orbs".

## Sound and title

- Web Audio beeps, no audio files: 10 s before a respawn window, at window start, at coefficient drop.
- Mute toggle (M), remembered.
- Document title shows the nearest timer, e.g. `⏱ Huntsman 0:42`.

## Hotkeys

| Key | Action |
|---|---|
| S | start level (Shop mode) |
| Enter | level done (records boxes) |
| Shift+1…9 | enemy #N killed |
| E | all extractions done |
| M | sound on/off |
| 1–4 / 0 | boxes (existing) |
| Backspace | remove last marked box (existing) |
| Ctrl+Z | undo last action of any kind |

Hotkeys are ignored while a text field or the picker has focus; Esc closes the picker.

## State

Box tracker state stays in its existing key `repoBoxTracker.v1` (no migration, old data keeps working).
Helper state lives in a new key `repoHelper.v1`:

```
{
  settings: { sound, groups },
  run: null | {
    startedAt, mode: 'shop' | 'level', seq,
    level: null | { number, startedAt, extractionsAt | null,
                    picks: [{ pick, tier, setupId }],
                    enemies: [{ uid, pick, id, killedAt, start, end, coef, kills, orbs }] },
    levels: [{ number, startedAt, endedAt, boxes, enemies: [id], kills, failed? }]
  },
  runs: [ summary... ]                            // finished runs
}
```

Times are `Date.now()` stamps; all displayed values are derived each tick (250 ms interval).
Undo keeps a small stack of snapshots (last 20 actions).

## Out of scope

- Reading game memory (that is the local dashboard in `repo-cosmetics`).
- Multiplayer sync between players.
- Tracking enemy leave/return (variant 3), pause.
- Exact enemy pick odds per species.

## Testing

- `rules.js` checked in Node: counts table for levels 1–30, pools per level, first-spawn range,
  coefficient steps, respawn windows, extraction-done rule; box odds unchanged vs current page.
- Browser check in headless Edge screenshots (light/dark, 1920 and 1100 widths) for each mode.
- Existing data: page opened with an existing `repoBoxTracker.v1` keeps history and stats.
- Run ended while a level is running (team died): that level is kept in the summary as failed, its kills count, no box level is recorded.
