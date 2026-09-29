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
keysBlocked = () => mode() === "shop";
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
// After a mouse click (not keyboard activation), drop focus from the button so Enter means "level done" again, not "press this button".
document.addEventListener("click", e => {
  if (e.detail === 0) return;
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
