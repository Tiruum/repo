/* ===== Box tracker UI. Game rules live in rules.js ===== */
const { LEVEL_LOOP, LOOPS_MAX, BAD_LUCK_BONUS, slotTs, levelOdds, atLeast, forecast } = RULES;
const RAR = ["Обычная", "Необычная", "Редкая", "Ультра"];
const ITEM = ["Network Adapter", "32PB RAM Cluster", "Neural Logic Core", "12x Quantum Drive Stack"];

/* ===== State ===== */
const KEY = "repoBoxTracker.v1";
const fresh = () => ({ level: 1, bad: 0, pending: [], history: [] });
// history entry: { level, boxes: [rarity...], badBefore, expected, run: 'new'|'restart'|undefined }
let S = load();
let nextMark = null;           // 'new' | 'restart' marker for the next recorded level

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.history) return { ...fresh(), ...s }; } catch (e) {}
  return fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...S, nextMark })); } catch (e) {} }
try { nextMark = JSON.parse(localStorage.getItem(KEY) || "{}").nextMark || null; } catch (e) {}

/* ===== Undo and hooks shared with helper.js ===== */
let onRecorded = boxes => {};          // helper: finish the running level
let inLevel = () => false;             // helper: a level is running
let afterRender = () => {};            // helper: render its panels
let keysBlocked = () => false;   // helper: box keys off while the box panel is hidden
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

/* ===== Actions ===== */
const maxBoxes = () => slotTs(S.level).length;
const describe = boxes => boxes.length ? boxes.map(r => RAR[r].toLowerCase()).join(", ") : "коробок не было";

function addBox(r) {
  if (S.pending.length >= maxBoxes()) return;
  S.pending.push(r); save(); render();
  const el = document.querySelector(`.cart[data-add="${r}"]`);
  if (el) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
}
function removeBox(i = S.pending.length - 1) { if (i < 0) return; S.pending.splice(i, 1); save(); render(); }

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

function replayFrom(i) {
  // recompute bad luck before each level from entry i onward (RunManager.ChangeLevel rules)
  let bad = S.history[i].badBefore;
  for (let j = i; j < S.history.length; j++) {
    const h = S.history[j];
    if (h.run === "restart" && j > i) bad = 0;
    h.badBefore = bad;
    h.expected = levelOdds(h.level, bad).expected;
    bad = h.boxes.length ? 0 : bad + 1;
  }
  S.bad = bad;
}

function editHistory(i, change) {
  remember();
  const h = S.history[i];
  change(h);
  replayFrom(i);
  save(); render();
  toast(`Уровень ${h.level} исправлен: ${describe(h.boxes)}`, true);
}

/* ===== Render ===== */
const $ = id => document.getElementById(id);
const pct = (x, d = 1) => (x * 100).toFixed(d).replace(/\.0+$/, "") + "%";
const pctSmall = (x, d = 1) => pct(x, d).replace("%", "<small>%</small>");

function currentRun() {
  // entries since the last "new run" marker; latest entry wins if a level was replayed
  let start = 0;
  S.history.forEach((h, i) => { if (h.run === "new") start = i; });
  const byLevel = new Map();
  for (let i = start; i < S.history.length; i++) byLevel.set(S.history[i].level, i);
  return byLevel;
}

function levelsTable() {
  const run = currentRun();
  const maxLevel = Math.max(16, S.level, ...run.keys());
  const rows = [];
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const idx = run.get(lvl);
    const h = idx === undefined ? null : S.history[idx];
    const isCur = lvl === S.level;
    const bad = isCur ? S.bad : h ? h.badBefore : 0;
    const o = levelOdds(lvl, bad);
    const cells = [0, 1, 2].map(i => o.slots[i] ? `<td>${pct(o.slots[i].chance, 0)}</td>` : `<td class="dim">–</td>`).join("");
    let found = "";
    if (isCur) found = `<span class="now">${S.pending.length ? describe(S.pending) : "сейчас"}</span>`;
    else if (h) {
      const full = h.boxes.length >= o.slots.length;
      found = `<span class="found">${h.boxes.length
          ? h.boxes.map((r, j) => `<button class="hchip r${r}" data-hdel="${idx}:${j}" aria-label="Убрать: ${RAR[r]}"><i></i>${RAR[r]}</button>`).join("")
          : `<span class="hnone">нет</span>`}
        <span class="adds">${RAR.map((n, r) => `<button class="add r${r}" data-hadd="${idx}:${r}" aria-label="Добавить: ${n}" title="Добавить: ${n}" ${full ? "disabled" : ""}>+</button>`).join("")}</span></span>`;
    }
    const cls = [isCur ? "cur" : "", !isCur && !h ? "future" : ""].join(" ");
    const tags = (bad ? `<span class="bl" title="Бонус невезения">+${bad * BAD_LUCK_BONUS}%</span>` : "")
               + (lvl === 6 || lvl === 11 ? `<span class="slot-new" title="Открывается новый слот">+слот</span>` : "");
    rows.push(`<tr class="${cls}"><td><span class="lvl">${lvl}${tags}</span></td>${cells}
      <td>${o.expected.toFixed(2)}</td><td>${pct(o.any)}</td><td>${pct(atLeast(o, [2, 3]))}</td><td>${pct(atLeast(o, [3]), 2)}</td><td>${found}</td></tr>`);
  }
  return `<table><thead><tr><th>Уровень</th><th>Слот 1</th><th>Слот 2</th><th>Слот 3</th><th>Коробок</th><th>Хоть одна</th><th>Редкая+</th><th>Ультра</th><th>Нашёл</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function render() {
  const o = levelOdds(S.level, S.bad);
  const mb = maxBoxes();
  $("level").textContent = S.level;
  $("bad").innerHTML = S.bad + (S.bad ? `<small>+${S.bad * BAD_LUCK_BONUS}%</small>` : "");
  $("any").innerHTML = pctSmall(o.any);

  const r1 = o.slots[0].rarity;
  $("carts").innerHTML = RAR.map((name, i) => `
    <button class="cart r${i}" data-add="${i}" ${S.pending.length >= mb ? "disabled" : ""} aria-label="${name}: ${ITEM[i]}">
      <kbd>${i + 1}</kbd><span class="rn">${name}</span><span class="item">${ITEM[i]}</span><span class="pc">${pct(r1[i], r1[i] < 0.01 ? 2 : 1)}</span>
    </button>`).join("");
  $("pending").innerHTML = S.pending.map((r, i) =>
    `<button class="chip r${r}" data-del="${i}" aria-label="Убрать: ${RAR[r]}"><i></i>${RAR[r]}<span class="x">✕</span></button>`).join("")
    + (mb > 1 && S.pending.length < mb ? `<span class="muted" style="font-size:13px">${S.pending.length ? "можно ещё " + (mb - S.pending.length) : "до " + mb + " коробок на уровне"}</span>` : "");
  $("nothing").disabled = S.pending.length > 0;
  $("next").disabled = S.pending.length === 0;

  $("oddsTitle").textContent = `Шансы на уровне ${S.level}`;
  $("slots").innerHTML = o.slots.map(s => `
    <div class="slot">
      <span class="n">Слот ${s.slot}</span>
      <div class="stack" title="Редкость коробки в этом слоте">${s.rarity.map((p, i) => `<i class="r${i}" style="flex-grow:${p}" title="${RAR[i]}: ${pct(p, 2)}"></i>`).join("")}</div>
      <span class="p">${pct(s.chance)}${Math.abs(s.chance - s.base) > 1e-9 ? `<small>без невезения ${pct(s.base)}</small>` : ""}</span>
    </div>`).join("");
  $("rlist").innerHTML = RAR.map((name, i) =>
    `<li class="r${i}"><span class="l"><i></i>${name}</span><b>${pct(atLeast(o, [i]), 2)}</b></li>`).join("");
  const f = forecast(S.level, S.bad);
  $("fcExp").textContent = f.exp.toFixed(1);
  $("fcRare").textContent = pct(f.rare, 0);
  $("fcUltra").textContent = pct(f.ultra, 0);

  const loops = Math.floor((S.level - 1) / LEVEL_LOOP);
  const maxAt = LEVEL_LOOP * (LOOPS_MAX + 1) + 1;
  $("slotHint").textContent = loops < LOOPS_MAX ? `следующий слот на ${LEVEL_LOOP * (loops + 1) + 1}-м`
    : S.level < maxAt ? `максимум шансов с ${maxAt}-го` : "все слоты на максимуме";
  $("levels").innerHTML = levelsTable();

  const found = S.history.reduce((a, h) => a + h.boxes.length, 0);
  const exp = S.history.reduce((a, h) => a + (h.expected || 0), 0);
  $("sLevels").textContent = S.history.length;
  $("sFound").textContent = found;
  $("sExp").textContent = exp.toFixed(1);
  const byR = [0, 0, 0, 0]; S.history.forEach(h => h.boxes.forEach(r => byR[r]++));
  $("byr").innerHTML = RAR.map((n, i) => `<span class="r${i}"><i></i>${n} ${byR[i]}</span>`).join("");
  // luck: found vs expected on a log scale, x0.25 .. x4, middle = as expected
  const ratio = exp > 0 ? found / exp : 1;
  const pos = exp > 0 ? Math.min(1, Math.max(0, 0.5 + Math.log2(Math.max(ratio, 0.25)) / 4)) : 0.5;
  $("luckMark").style.left = (pos * 100) + "%";
  $("luckText").textContent = exp > 0.5
    ? `Нашёл ${found} при ожидаемых ${exp.toFixed(1)}: ${ratio >= 1.15 ? "везёт" : ratio <= 0.85 ? "не везёт" : "в пределах нормы"} (×${ratio.toFixed(2)}).`
    : "Отметь несколько уровней — здесь появится, насколько тебе везёт.";
  afterRender();
}

const THEME_ICON = {
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
const THEME_NAME = { system: "как в системе", light: "светлая", dark: "тёмная" };
let theme = store0("repoTheme") || "system";
function store0(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function applyTheme() {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const btn = $("theme");
  btn.innerHTML = THEME_ICON[theme];
  btn.title = `Тема: ${THEME_NAME[theme]}`; btn.setAttribute("aria-label", btn.title);
  const dark = theme === "dark" || (theme === "system" && !matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#1a1e26" : "#eceef3";
}

/* ===== Events ===== */
document.addEventListener("click", e => {
  const menu = $("menu");
  if (menu.open && !e.target.closest("#menu")) menu.open = false;
  const t = e.target.closest("[data-add],[data-del],[data-step],[data-hadd],[data-hdel]");
  if (!t) return;
  if (t.dataset.add) addBox(+t.dataset.add);
  else if (t.dataset.del) removeBox(+t.dataset.del);
  else if (t.dataset.hadd) {
    const [i, r] = t.dataset.hadd.split(":").map(Number);
    if (S.history[i].boxes.length < slotTs(S.history[i].level).length) editHistory(i, h => h.boxes.push(r));
  }
  else if (t.dataset.hdel) {
    const [i, j] = t.dataset.hdel.split(":").map(Number);
    editHistory(i, h => h.boxes.splice(j, 1));
  }
  else if (t.dataset.step) {
    const [k, d] = t.dataset.step.split(":");
    if (k === "level") { S.level = Math.max(1, S.level + +d); S.pending = S.pending.slice(0, maxBoxes()); }
    else S.bad = Math.max(0, S.bad + +d);
    save(); render();
  }
});
$("nothing").addEventListener("click", () => recordLevel([]));
$("next").addEventListener("click", () => { if (S.pending.length || inLevel()) recordLevel(S.pending); });
$("undo").addEventListener("click", () => { $("menu").open = false; if (undo()) toast("Действие отменено", undoStack.length > 0); });
$("restart").addEventListener("click", () => {
  remember();
  S.bad = 0; nextMark = "restart"; save(); render();
  toast("Невезение обнулено", true);
});
$("wipe").addEventListener("click", () => {
  $("menu").open = false;
  remember();
  S = fresh(); nextMark = null; save(); render();
  toast("История стёрта", true);
});
$("theme").addEventListener("click", () => {
  theme = { system: "light", light: "dark", dark: "system" }[theme];
  try { if (theme === "system") localStorage.removeItem("repoTheme"); else localStorage.setItem("repoTheme", theme); } catch (e) {}
  applyTheme();
  toast(`Тема: ${THEME_NAME[theme]}`, null);
});
matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (theme === "system") applyTheme(); });
$("toastUndo").addEventListener("click", () => { undo(); $("toast").hidden = true; });

document.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, summary, dialog")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (undo()) toast("Действие отменено", undoStack.length > 0); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") { $("menu").open = false; $("toast").hidden = true; return; }
  if (keysBlocked()) return;
  if (["1", "2", "3", "4"].includes(e.key)) addBox(+e.key - 1);
  else if (e.key === "0") { if (!S.pending.length) recordLevel([]); }
  else if (e.key === "Enter") {
    // keep Enter for keyboard-focused controls other than the rarity buttons
    if (e.target.closest(".menu, .btn, .stepper, .levels, .chip, .ghost, #toast")) return;
    e.preventDefault(); if (S.pending.length || inLevel()) recordLevel(S.pending);
  }
  else if (e.key === "Backspace") { e.preventDefault(); removeBox(); }
});

applyTheme();
render();
