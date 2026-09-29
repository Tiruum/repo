/* ===== REPO helper: run mode UI. Needs rules.js, enemies.js, run.js, app.js (loaded before). ===== */
const { ENEMIES, setupLabel } = ENEMY_DATA;
const HKEY = "repoHelper.v1";
const BASE_TITLE = document.title;
const freshH = () => ({ settings: { sound: true, groups: false }, run: null, runs: [] });
let H = loadH();
let lastTick = Date.now();
let numbered = [];                      // uid per on-screen number 1..9 (Shift+N = killed / back)

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
extra = { get: () => H, set: h => { if (h) { H = { ...h, settings: H.settings }; saveH(); } } };
onWipe = () => { H = freshH(); saveH(); };
inLevel = () => mode() === "level";
keysBlocked = () => mode() === "shop" || !!document.querySelector("dialog[open]");
onRecorded = boxes => { if (inLevel()) { RUN.endLevel(H.run, boxes, now()); saveH(); } };
afterRender = () => renderHelper();

/* ----- sound: Web Audio beeps, no files ----- */
let actx = null;
const unlockAudio = () => { try { actx = actx || new AudioContext(); actx.resume(); } catch (e) {} };
document.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("keydown", unlockAudio, { once: true });
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
  finishRun(); S.pending = []; save(); saveH(); render();
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
  document.querySelectorAll('#logP [data-step^="level"]').forEach(b => { b.disabled = m === "level"; });
  if (m === "shop") renderShop();
  if (m === "level") renderLevel();
  if (m === "idle" && last) renderSummary(last);
  tick();
}

const money = n => "$" + Math.round(n).toLocaleString("ru-RU");
function renderLoot() {
  const lv = H.run.level, L = lv.number, g = lv.pointGoal;
  const input = $("pointGoal");
  if (document.activeElement !== input) input.value = g ? String(g) : "";
  if (g) {
    const e = RULES.lootEstimate(L, g);
    $("lootOut").innerHTML = `На карте ≈ <b>${money(e.total)}</b><br><span class="muted">сдать всего ${money(e.quota)} (${e.count} × ${money(g)})</span>`;
  } else {
    $("lootOut").innerHTML = `<span class="muted">Выгрузок: ${RULES.extractionCount(L)} · лута ≈ ${money(RULES.totalValueCap(L))}+</span>`;
  }
}
$("pointGoal").addEventListener("input", e => {
  if (!inLevel()) return;
  const v = Math.max(0, Math.floor(+e.target.value || 0));
  H.run.level.pointGoal = v || null;
  saveH(); renderLoot();
});

const oddsText = p => p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
// Most likely enemies per tier for the next level; chance to see each at least once in the tier's slots.
function likelyEnemies(L, counts) {
  return [1, 2, 3].filter(t => counts[t - 1]).map(t => {
    const n = counts[t - 1], odds = RUN.pickOdds(H.run, t, L, H.settings.groups);
    const top = odds.slice(0, 4).map(o => `<span>${setupLabel(o.setup)} <b class="num">${oddsText(1 - (1 - o.p) ** n)}</b></span>`).join("");
    const rare = odds.filter(o => o.recent).map(o => setupLabel(o.setup));
    return `<div class="lk t${t}"><i>${"★".repeat(t)}</i>${top}${rare.length ? `<small>реже: ${rare.join(", ")}</small>` : ""}</div>`;
  }).join("");
}

function renderShop() {
  const L = S.level, c = RULES.enemyCounts(L), f = RULES.firstSpawn(L);
  $("shopTitle").innerHTML = `Дальше уровень <span class="stepper"><button data-step="level:-1" aria-label="Уровень меньше">−</button><output class="num">${L}</output><button data-step="level:1" aria-label="Уровень больше">+</button></span>`;
  $("startLevel").innerHTML = `Начать уровень ${L} <kbd>S</kbd>`;
  $("groups").checked = H.settings.groups;
  $("shopForecast").innerHTML = `
    <div class="tsum">${c.map((n, i) => `<span class="t${i + 1}"><i></i>${"★".repeat(i + 1)} <b class="num">${n}</b></span>`).join("")}
      <span class="muted">всего <b class="num">${c[0] + c[1] + c[2]}</b> слотов</span></div>
    <div class="likely">${likelyEnemies(L, c)}</div>
    <p class="muted">Шансы по правилам игры: мобы с прошлых уровней выпадают реже. Точнее всего, если отмечаешь всех мобов.</p>
    <p>Первые мобы через ${range(f.min, f.max)}${f.max > 5 ? `, в 20% случаев раньше: ${range(f.earlyMin, f.earlyMax)}` : ""}.</p>
    <p>Выгрузок: ${RULES.extractionCount(L)} · лута на карте ≈ ${money(RULES.totalValueCap(L))}+ (игра докладывает ценности, пока сумма не превысит эту планку).</p>
    <p class="muted">Gnome приходят пачкой по 4, Banger по 3. ${L < 3 ? "Loom появляется с 3-го уровня." : ""}</p>
    ${L <= 3 && H.settings.groups ? `<p class="warn">Слот 3★ может оказаться группой: до 10 мобов сразу.</p>` : ""}`;
}

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
  $("mobsHint").textContent = numbered.length ? "Shift+номер — убит / появился" : "";
  renderLoot();
}

function card(e, n) {
  const d = ENEMIES[e.id];
  return `<article class="mob t${d.tier}" data-uid="${e.uid}" data-st="alive">
    <div class="mh"><span class="ic">${iconSvg(d)}</span><b>${d.name}</b>${n <= 9 ? `<kbd title="Shift+${n}: убит / появился">⇧${n}</kbd>` : ""}</div>
    <div class="ms"><span>HP <b class="num">${d.hp}</b></span>
      <span title="${d.dmg.length ? "урон по игроку за удар" : "урон зависит от атаки"}">урон <b class="num">${d.dmg.length ? d.dmg.join(" / ") : "—"}</b></span></div>
    ${d.desc ? `<p class="md">${d.desc}</p>` : ""}
    <div class="mt" data-timer="${e.uid}"></div>
    <div class="ma"><button class="kill" data-kill="${e.uid}">Убит</button>
      <button class="kill" data-back="${e.uid}" title="Уже на карте, раньше окна">Появился</button>
      <button class="undo-kill" data-cancel="${e.uid}" title="Отметил убийство по ошибке">Отмена</button>
      <span class="orbs" title="Орбов выпало с этого моба, максимум ${RULES.ORBS_MAX} за уровень">${e.orbs >= RULES.ORBS_MAX ? `орбы ${RULES.ORBS_MAX}/${RULES.ORBS_MAX} · всё` : `орбы ${e.orbs}/${RULES.ORBS_MAX}`}</span>
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
    }
    if (e.start !== null) {
      if (lastTick < e.start - 10000 && e.start - 10000 <= t && e.start - e.killedAt > 10000) beep(880, 0.12, 1);
      if (lastTick < e.start && e.start <= t && !e.seen) beep(1175, 0.18, 2);
    }
    if (st === "cooldown" && (!nearest || e.start < nearest.start)) nearest = e;
  }
  if (nearest) document.title = `⏱ ${ENEMIES[nearest.id].name} ${clock(Math.ceil((nearest.start - t) / 1000))}`;
}

function openPicker(tier) {
  if (!inLevel()) return;
  const lv = H.run.level;
  $("pickerTitle").textContent = `${"★".repeat(tier)}: кто появился на уровне ${lv.number}?`;
  // most likely first, so the usual answer sits in the first row
  $("pickerGrid").innerHTML = RUN.pickOdds(H.run, tier, lv.number, H.settings.groups).map(({ setup: s, p, recent }) => {
    const d = ENEMIES[s.members[0][0]];
    return `<button class="t${tier}" data-pick="${s.id}"><span class="ic">${iconSvg(d)}</span>
      <span>${setupLabel(s)}<small>${oddsText(p)}${recent ? " · был недавно" : ""}</small></span></button>`;
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
function respawnEnemy(uid) {
  remember();
  if (!RUN.respawned(H.run, uid, now())) { undoStack.pop(); return; }
  saveH(); render();
}
function cancelKillH(uid) {
  remember();
  if (!RUN.cancelKill(H.run, uid)) { undoStack.pop(); return; }
  saveH(); render();
}
// Shift+N: the card's main button — "Убит" while it may be on the map, "Появился" while it is away.
function mobAction(uid) {
  const e = H.run.level.enemies.find(x => x.uid === uid), st = e && RUN.status(e, now());
  if (st === "cooldown" || st === "window") respawnEnemy(uid); else killEnemy(uid);
}
function removeEnemyH(uid) { remember(); RUN.removeEnemy(H.run, uid); saveH(); render(); }

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

/* ----- events ----- */
$("newRun").addEventListener("click", newRunH);
$("endRun").addEventListener("click", endRunH);
$("startLevel").addEventListener("click", startLevel);
$("extract").addEventListener("click", extractionsDone);
$("sound").addEventListener("click", toggleSound);
$("groups").addEventListener("change", e => { H.settings.groups = e.target.checked; saveH(); render(); });
// After a mouse click (not keyboard activation), drop focus from the button so Enter means "level done" again, not "press this button".
document.addEventListener("click", e => {
  if (e.detail === 0) return;
  const a = document.activeElement;
  if (a && a !== document.body && a.matches("button") && !a.closest("dialog, .menu")) a.blur();
});
document.addEventListener("click", e => {
  const t = e.target.closest("[data-open],[data-pick],[data-kill],[data-back],[data-cancel],[data-rm]");
  if (!t) return;
  if (t.dataset.open) openPicker(+t.dataset.open);
  else if (t.dataset.pick) pickSetup(t.dataset.pick);
  else if (t.dataset.kill) killEnemy(+t.dataset.kill);
  else if (t.dataset.back) respawnEnemy(+t.dataset.back);
  else if (t.dataset.cancel) cancelKillH(+t.dataset.cancel);
  else if (t.dataset.rm) removeEnemyH(+t.dataset.rm);
});
$("pickerClose").addEventListener("click", () => $("picker").close());
document.addEventListener("keydown", e => {
  if (e.target.closest("input:not([type=checkbox]), textarea, summary, dialog") || document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.shiftKey) {
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && inLevel() && numbered[+m[1] - 1]) { e.preventDefault(); mobAction(numbered[+m[1] - 1]); }
    return;
  }
  if (e.code === "KeyS") startLevel();
  else if (e.code === "KeyE") extractionsDone();
  else if (e.code === "KeyM") toggleSound();
});

try { render(); } catch (err) { H = freshH(); saveH(); render(); }
setInterval(tick, 250);
