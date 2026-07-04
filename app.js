/* ============================================================
   ЖАРАВА · логика (vanilla JS, без външни библиотеки)
   Данни: localStorage (мигновено, работи офлайн).
   Резервно копие: Прогрес → Експорт / Импорт.
   ============================================================ */
(function () {
"use strict";

/* ---------- константи и помощни ---------- */
const START = new Date(2026, 6, 1);          // 1 юли 2026
const END   = new Date(2026, 11, 31);        // 31 дек 2026
const LS_KEY = "zharava-state-v1";
const { MEALS, MEAL_TYPES, EX, PROGRAM, CONTENT,
        DEFAULT_HABITS_GOOD, DEFAULT_HABITS_BAD, DOW, MON } = DATA;

const dk = (n) => `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
const addDays = (n, s) => { const l = new Date(n); l.setDate(l.getDate() + s); return l; };
const clampDate = (n) => (n < START ? new Date(START) : n > END ? new Date(END) : n);
const challengeDay = (n) => Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - START) / 864e5) + 1;
const isWorkday = (n) => n.getDay() >= 2 && n.getDay() <= 6;   // вт–сб
const mealIdx = (n) => (n.getDay() + 6) % 7;
const progIdx = (day) => ((day - 1) % 30 + 30) % 30;

/* ---------- състояние ---------- */
let state = loadState();
let cur = clampDate(new Date());   // избрана дата
let tab = "today";
let openMeal = null, openEx = null;
let addingTask = false, editHabits = false;
let saveTimer = null, syncLbl = "локално";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        checks: s.checks || {}, refl: s.refl || {}, tasks: s.tasks || {},
        habitsGood: s.habitsGood || DEFAULT_HABITS_GOOD.slice(),
        habitsBad: s.habitsBad || DEFAULT_HABITS_BAD.slice(),
      };
    }
  } catch (e) { /* повредени данни → чисто начало */ }
  return { checks: {}, refl: {}, tasks: {},
           habitsGood: DEFAULT_HABITS_GOOD.slice(),
           habitsBad: DEFAULT_HABITS_BAD.slice() };
}

function save() {
  clearTimeout(saveTimer);
  setSync("запис…");
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); setSync("запазено"); }
    catch (e) { setSync("грешка при запис"); }
  }, 250);
}
function setSync(t) {
  syncLbl = t;
  const el = document.querySelector(".sync");
  if (el) { el.textContent = t; el.classList.toggle("err", t.indexOf("грешка") === 0); }
}

/* ---------- DOM помощник ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(kid));
  }
  return el;
}
const svgNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS(svgNS, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  kids.flat(Infinity).forEach((k) => k && el.appendChild(k));
  return el;
}

/* ---------- икони ---------- */
const ICON_PATHS = {
  flame: [["path", { d: "M12 2c1 4-3 5.5-3 9a3 3 0 006 0c0-1.5-.8-2.5-.8-2.5S17 10 17 13.5A5 5 0 017 13.5C7 8 12 6.5 12 2z" }]],
  bowl: [["path", { d: "M4 12h16a8 8 0 01-16 0z" }],
         ["path", { d: "M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4", "stroke-linecap": "round", fill: "none" }]],
  train: [["path", { d: "M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12", "stroke-linecap": "round", fill: "none", "stroke-width": "2.2" }]],
  habit: [["circle", { cx: 12, cy: 12, r: 9, fill: "none", "stroke-width": "2" }],
          ["path", { d: "M8 12.5l2.6 2.6L16 9.5", fill: "none", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  cam: [["rect", { x: 3, y: 7, width: 13, height: 11, rx: 2.5, fill: "none", "stroke-width": "2" }],
        ["path", { d: "M16 11l5-2.5v8L16 14", fill: "none", "stroke-width": "2", "stroke-linejoin": "round" }]],
  chev: [["path", { d: "M9 6l6 6-6 6", fill: "none", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  plus: [["path", { d: "M12 5v14M5 12h14", fill: "none", "stroke-width": "2.4", "stroke-linecap": "round" }]],
  x: [["path", { d: "M6 6l12 12M18 6L6 18", fill: "none", "stroke-width": "2.2", "stroke-linecap": "round" }]],
  chart: [["path", { d: "M4 20V10M10 20V4M16 20v-8M21 20H3", fill: "none", "stroke-width": "2.2", "stroke-linecap": "round" }]],
};
function icon(name, size = 20) {
  const s = svgEl("svg", { width: size, height: size, viewBox: "0 0 24 24",
    fill: "currentColor", stroke: "currentColor",
    "stroke-width": name === "flame" ? 0 : 1.6, "aria-hidden": "true" });
  ICON_PATHS[name].forEach(([t, a]) => s.appendChild(svgEl(t, a)));
  return s;
}
function checkBtn(on, onTap, small) {
  const b = h("button", { class: `chk ${on ? "on" : ""} ${small ? "sm" : ""}`,
    "aria-pressed": on, "aria-label": on ? "Отметнато" : "Отметни", onclick: onTap });
  const sv = svgEl("svg", { viewBox: "0 0 24 24", width: small ? 14 : 17, height: small ? 14 : 17 });
  sv.appendChild(svgEl("path", { d: "M5 12.5l4.2 4.2L19 7", fill: "none", stroke: "currentColor",
    "stroke-width": "3", "stroke-linecap": "round", "stroke-linejoin": "round" }));
  b.appendChild(sv);
  return b;
}

/* ---------- изчисления ---------- */
const dayChecks = (key) => state.checks[key] || {};

function dayScore(dateObj) {
  // дял изпълнени елементи за деня (както % в хедъра)
  const key = dk(dateObj);
  const o = dayChecks(key);
  const r = PROGRAM[progIdx(challengeDay(dateObj))];
  const parts = [];
  parts.push(!!o.wake);
  if (!r.rest) parts.push(r.ex.every((_, i) => o[`ex${i}`]));
  for (let i = 0; i < 4; i++) parts.push(!!o[`meal${i}`]);
  parts.push(!!o.content, !!o.evening);
  (state.tasks[key] || []).forEach((t) => parts.push(!!t.done));
  return parts.filter(Boolean).length / parts.length;
}

function totals() {
  let workouts = 0, meals = 0;
  for (const key of Object.keys(state.checks)) {
    const u = state.checks[key];
    const b = new Date(key + "T00:00:00");
    const R = PROGRAM[progIdx(challengeDay(b))];
    if (!R.rest && R.ex.every((_, i) => u[`ex${i}`])) workouts++;
    for (let i = 0; i < 4; i++) if (u[`meal${i}`]) meals++;
  }
  const refls = Object.values(state.refl).filter((i) => i.rate || i.plus || i.minus || i.note).length;
  return { workouts, meals, refls };
}

function habitStreak(id, from) {
  let a = 0, t = new Date(from);
  while (challengeDay(t) >= 1 && dayChecks(dk(t))[id]) { a++; t = addDays(t, -1); }
  return a;
}

function toggleCheck(id) {
  const key = dk(cur);
  const t = { ...dayChecks(key) };
  if (t[id]) delete t[id]; else t[id] = true;
  state.checks = { ...state.checks, [key]: t };
  save(); render();
}
function setRefl(patch) {
  const key = dk(cur);
  state.refl = { ...state.refl, [key]: { ...(state.refl[key] || {}), ...patch } };
  save();
}

/* ---------- изгледи ---------- */
function viewToday() {
  const key = dk(cur), o = dayChecks(key), k = state.refl[key] || {};
  const day = challengeDay(cur), workday = isWorkday(cur), f = mealIdx(cur);
  const T = progIdx(day), r = PROGRAM[T], cont = CONTENT[T];
  const tasks = state.tasks[key] || [];
  const P = r.rest ? 0 : r.ex.filter((_, i) => o[`ex${i}`]).length;
  const N = r.rest ? 0 : r.ex.length;
  const workoutDone = !r.rest && P === N && N > 0;
  const tot = totals();

  const items = [];
  items.push({ id: "wake", time: "05:30", t: "Ставане + вода", s: "Телефонът остава далеч първите 30 мин", k: "habit" });
  if (!r.rest) items.push({ id: "__workout", time: "06:15", t: `Тренировка · ${r.t}`, s: `${r.dur} мин · ${P}/${N} упражнения`, k: "train", nav: "train", done: workoutDone });
  items.push({ id: "meal0", time: "07:30", t: `Закуска · ${MEALS[f][0].n}`, s: MEALS[f][0].dev.join(" · "), k: "food", nav: "food" });
  if (workday) items.push({ id: "__leave", time: "09:10", t: "Тръгване за работа", k: "info" });
  items.push({ id: "meal1", time: "13:00", t: `Обяд · ${MEALS[f][1].n}`, s: MEALS[f][1].dev.join(" · "), k: "food", nav: "food" });
  items.push({ id: "meal2", time: "16:30", t: `Следобед · ${MEALS[f][2].n}`, s: MEALS[f][2].dev.join(" · "), k: "food", nav: "food" });
  if (workday) items.push({ id: "__home", time: "19:30", t: "Прибиране", k: "info" });
  items.push({ id: "meal3", time: workday ? "20:00" : "19:30", t: `Вечеря · ${MEALS[f][3].n}`, s: MEALS[f][3].dev.join(" · "), k: "food", nav: "food" });
  items.push({ id: "content", time: "21:00", t: `Контент · ${cont.f}`, s: cont.h, k: "cam", nav: "content" });
  items.push({ id: "evening", time: "22:00", t: "Вечерна рутина", s: "Телефон извън спалнята · 20 страници четене", k: "habit" });
  const icoMap = { habit: "habit", food: "bowl", train: "train", cam: "cam", info: "chev" };

  const sec = h("section", null,
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("b", null, String(tot.workouts)), h("span", null, "тренировки")),
      h("div", { class: "stat" }, h("b", null, String(tot.meals)), h("span", null, "хранения")),
      h("div", { class: "stat" }, h("b", null, String(tot.refls)), h("span", null, "рефлексии"))),
    h("h2", { class: "secT" }, "Планът за деня"),
    h("div", { class: "tl" },
      items.map((e) => e.k === "info"
        ? h("div", { class: "tlInfo" }, h("span", { class: "tlTime" }, e.time), h("span", null, e.t))
        : h("div", { class: `tlItem ${(e.id === "__workout" ? e.done : o[e.id]) ? "done" : ""}` },
            h("span", { class: "tlTime" }, e.time),
            h("div", { class: "tlIco" }, icon(icoMap[e.k], 17)),
            h("button", { class: "tlBody", onclick: () => { if (e.nav) { tab = e.nav; render(); } } },
              h("span", { class: "tlT" }, e.t),
              e.s ? h("span", { class: "tlS" }, e.s) : null),
            e.id === "__workout"
              ? checkBtn(e.done, () => { tab = "train"; render(); })
              : checkBtn(!!o[e.id], () => toggleCheck(e.id)))),
      tasks.map((e) =>
        h("div", { class: `tlItem custom ${e.done ? "done" : ""}` },
          h("span", { class: "tlTime" }, e.time || "—"),
          h("div", { class: "tlIco" }, icon("plus", 15)),
          h("div", { class: "tlBody" }, h("span", { class: "tlT" }, e.t), h("span", { class: "tlS" }, "твоя задача")),
          checkBtn(e.done, () => {
            state.tasks[key] = tasks.map((t) => t.id === e.id ? { ...t, done: !t.done } : t);
            save(); render();
          }),
          h("button", { class: "del", "aria-label": "Изтрий", onclick: () => {
            state.tasks[key] = tasks.filter((t) => t.id !== e.id);
            save(); render();
          } }, icon("x", 13))))),
    addingTask ? taskForm(key) :
      h("button", { class: "addBtn", onclick: () => { addingTask = true; render(); } },
        icon("plus", 15), ` Добави задача за ${cur.getDate()} ${MON[cur.getMonth()]}`),
    h("h2", { class: "secT" }, "Вечерна рефлексия"),
    h("div", { class: "card refl" },
      h("span", { class: "lbl" }, "Как беше денят?"),
      h("div", { class: "flames" },
        [1, 2, 3, 4, 5].map((e) => h("button", {
          class: `flame ${(k.rate || 0) >= e ? "lit" : ""}`, "aria-label": `Оценка ${e}`,
          onclick: () => { setRefl({ rate: k.rate === e ? 0 : e }); render(); },
        }, icon("flame", 24)))),
      reflArea("Какво проработи", k.plus, "Едно нещо, което свърши работа днес…", (v) => setRefl({ plus: v })),
      reflArea("Какво не проработи", k.minus, "Без извинения — какво се разпадна…", (v) => setRefl({ minus: v })),
      reflArea("Бележка към бъдещия ти", k.note, "Мисъл, идея за контент, каквото и да е…", (v) => setRefl({ note: v }))));
  return sec;
}
function reflArea(label, val, ph, onInput) {
  return [h("span", { class: "lbl" }, label),
    h("textarea", { class: "ta", rows: 2, placeholder: ph,
      oninput: (e) => onInput(e.target.value) }, val || "")];
}
function taskForm(key) {
  const inp = h("input", { class: "inp", placeholder: "Задача (напр. подстрижка)" });
  const time = h("input", { class: "inp time", placeholder: "час" });
  const add = () => {
    const t = inp.value.trim();
    if (!t) return;
    state.tasks[key] = [...(state.tasks[key] || []), { id: Date.now(), t, time: time.value, done: false }];
    addingTask = false; save(); render();
  };
  inp.addEventListener("keydown", (e) => e.key === "Enter" && add());
  return h("div", { class: "addForm" }, inp, time,
    h("button", { class: "btn", onclick: add }, "Добави"),
    h("button", { class: "btnGhost", onclick: () => { addingTask = false; render(); } }, "Откажи"));
}

function viewFood() {
  const key = dk(cur), o = dayChecks(key), f = mealIdx(cur);
  return h("section", null,
    h("h2", { class: "secT" }, `Меню · ${DOW[cur.getDay()].toLowerCase()}`),
    h("p", { class: "secS" }, "~2250 ккал · 190 г протеин · 70 г мазнини · 215 г въглехидрати"),
    MEALS[f].map((e, a) =>
      h("div", { class: `card meal ${o[`meal${a}`] ? "done" : ""}` },
        h("button", { class: "mealHead", onclick: () => { openMeal = openMeal === a ? null : a; render(); } },
          h("div", { class: "mealHeadL" },
            h("span", { class: "eyebrow" }, MEAL_TYPES[a]),
            h("span", { class: "mealN" }, e.n),
            h("div", { class: "chips" }, e.dev.map((t) => h("span", { class: "chip" }, t)))),
          h("span", { class: `car ${openMeal === a ? "up" : ""}` }, icon("chev", 16))),
        openMeal === a ? h("div", { class: "mealBody" },
          h("span", { class: "lbl" }, "Продукти"),
          h("p", { class: "ing" }, e.ing),
          h("span", { class: "lbl" }, "Приготвяне"),
          h("ol", { class: "steps" }, e.steps.map((t) => h("li", null, t)))) : null,
        h("div", { class: "mealFoot" },
          h("span", null, o[`meal${a}`] ? "Изядено ✓" : "Отметни, когато е изядено"),
          checkBtn(!!o[`meal${a}`], () => toggleCheck(`meal${a}`))))));
}

function viewTrain() {
  const key = dk(cur), o = dayChecks(key);
  const day = challengeDay(cur), T = progIdx(day), r = PROGRAM[T];
  const cycle = Math.floor((day - 1) / 30) + 1;
  const P = r.rest ? 0 : r.ex.filter((_, i) => o[`ex${i}`]).length;
  const N = r.rest ? 0 : r.ex.length;
  const done = !r.rest && P === N && N > 0;
  return h("section", null,
    h("h2", { class: "secT" }, `Тренировка · Ден ${T + 1} от 30 `,
      cycle > 1 ? h("span", { class: "cyc" }, `цикъл ${cycle}`) : null),
    r.rest
      ? h("div", { class: "card restCard" }, icon("flame", 26),
          h("strong", null, "Почивен ден"), h("p", null, r.note),
          h("p", { class: "secS" }, "Дисциплината включва и почивка. Жаравата тлее — не гасне."))
      : [h("p", { class: "secS" }, `${r.t} · ~${r.dur} мин ${r.note ? "· " + r.note : ""}`),
         h("div", { class: "exProg" }, h("div", { class: "exProgBar", style: `width:${N ? P / N * 100 : 0}%` })),
         r.ex.map(([name, reps], t) =>
           h("div", { class: `card ex ${o[`ex${t}`] ? "done" : ""}` },
             h("div", { class: "exRow" },
               h("button", { class: "exHead", onclick: () => { openEx = openEx === t ? null : t; render(); } },
                 h("span", { class: "exN" }, name), h("span", { class: "exR" }, reps)),
               checkBtn(!!o[`ex${t}`], () => toggleCheck(`ex${t}`))),
             openEx === t ? h("p", { class: "exDesc" }, EX[name] || "") : null)),
         done ? h("div", { class: "doneBanner" }, "Тренировката е завършена. Жаравата гори. 🔥") : null],
    h("div", { class: "card hint" },
      h("strong", null, "Внимавай за:"),
      h("p", null, "Остра/режеща болка в кръста (не мускулна умора) — спри упражнението веднага и мини на по-лека вариация. Постоянна умора или лош сън — намали интензивността 2–3 дни.")));
}

function viewHabits() {
  const key = dk(cur), o = dayChecks(key);
  const rows = (list, kind, streakSuffix) => list.map((e) =>
    h("div", { class: `card habitRow ${kind === "bad" ? "bad" : ""} ${o[e.id] ? "done" : ""}` },
      h("div", { class: "habL" },
        h("span", { class: "habN" }, e.name),
        h("span", { class: "habS" }, `${habitStreak(e.id, cur)} ${streakSuffix}`)),
      editHabits
        ? h("button", { class: "del", "aria-label": "Изтрий навик", onclick: () => {
            const f = kind === "good" ? "habitsGood" : "habitsBad";
            state[f] = state[f].filter((x) => x.id !== e.id); save(); render();
          } }, icon("x", 15))
        : checkBtn(!!o[e.id], () => toggleCheck(e.id))));
  const addRow = (kind, ph) => {
    const inp = h("input", { class: "inp", placeholder: ph });
    const add = () => {
      const t = inp.value.trim(); if (!t) return;
      const f = kind === "good" ? "habitsGood" : "habitsBad";
      state[f] = [...state[f], { id: (kind === "good" ? "hgX" : "hbX") + Date.now(), name: t }];
      save(); render();
    };
    inp.addEventListener("keydown", (e) => e.key === "Enter" && add());
    return h("div", { class: "addForm" }, inp, h("button", { class: "btn", onclick: add }, "Добави"));
  };
  return h("section", null,
    h("div", { class: "secTRow" },
      h("h2", { class: "secT" }, "Изграждам"),
      h("button", { class: "editToggle", onclick: () => { editHabits = !editHabits; render(); } },
        editHabits ? "Готово" : "Редактирай")),
    rows(state.habitsGood, "good", "дни поред"),
    editHabits ? addRow("good", "Нов навик за изграждане") : null,
    h("div", { class: "secTRow" },
      h("h2", { class: "secT" }, "Премахвам ", h("span", { class: "secHint" }, "отметни = избегнато днес"))),
    rows(state.habitsBad, "bad", "дни чисто"),
    editHabits ? addRow("bad", "Нов навик за премахване") : null);
}

function viewContent() {
  const key = dk(cur), o = dayChecks(key);
  const day = challengeDay(cur), T = progIdx(day), cont = CONTENT[T];
  const cycle = Math.floor((day - 1) / 30) + 1;
  const next = addDays(cur, 1);
  const nextOk = next <= END;
  const nc = nextOk ? CONTENT[progIdx(challengeDay(next))] : null;
  return h("section", null,
    h("h2", { class: "secT" }, `Контент · Ден ${T + 1} `,
      cycle > 1 ? h("span", { class: "cyc" }, `цикъл ${cycle} — преизползвай формата с нов материал`) : null),
    h("div", { class: `card contCard ${o.content ? "done" : ""}` },
      h("div", { class: "chips" }, h("span", { class: "chip hot" }, cont.f), h("span", { class: "chip" }, cont.p)),
      h("span", { class: "lbl" }, "Hook"), h("p", { class: "hook" }, `„${cont.h}“`),
      h("span", { class: "lbl" }, "Концепция"), h("p", { class: "contD" }, cont.d),
      h("span", { class: "lbl" }, "CTA"), h("p", { class: "contD" }, cont.c),
      h("div", { class: "mealFoot" },
        h("span", null, o.content ? "Публикувано ✓" : "Отметни при публикуване"),
        checkBtn(!!o.content, () => toggleCheck("content")))),
    h("div", { class: "card hint" },
      h("strong", null, `Утре (${nc ? nc.f : "—"}):`),
      h("p", null, nc ? nc.h : "Край на календара.")));
}

/* ---------- ПРОГРЕС (нов таб) ---------- */
function viewProgress() {
  const today = clampDate(new Date());
  const tot = totals();
  const totalDays = challengeDay(today);

  // текуща серия "успешни дни" (>= 60% изпълнение)
  let streak = 0, t = new Date(today);
  while (challengeDay(t) >= 1 && dayScore(t) >= 0.6) { streak++; t = addDays(t, -1); }

  // най-дълга серия
  let best = 0, run = 0;
  for (let dd = new Date(START); dd <= today; dd = addDays(dd, 1)) {
    run = dayScore(dd) >= 0.6 ? run + 1 : 0;
    if (run > best) best = run;
  }

  // средно изпълнение
  let sum = 0;
  for (let dd = new Date(START); dd <= today; dd = addDays(dd, 1)) sum += dayScore(dd);
  const avg = totalDays ? Math.round((sum / totalDays) * 100) : 0;

  // месечни топлинни карти (юли–дек)
  const months = [];
  for (let m = 6; m <= 11; m++) {
    const first = new Date(2026, m, 1);
    if (first > END) break;
    const daysInMonth = new Date(2026, m + 1, 0).getDate();
    const cells = [];
    const lead = (first.getDay() + 6) % 7; // понеделник = 0
    for (let i = 0; i < lead; i++) cells.push(h("div", { class: "heatCell empty" }));
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const dt = new Date(2026, m, dnum);
      const future = dt > today;
      const sc = future ? 0 : dayScore(dt);
      const lvl = future ? 0 : sc >= 0.999 ? 4 : sc >= 0.7 ? 3 : sc >= 0.4 ? 2 : sc > 0 ? 1 : 0;
      cells.push(h("div", {
        class: `heatCell ${lvl ? "l" + lvl : ""} ${future ? "future" : ""} ${dk(dt) === dk(today) ? "today" : ""}`,
        title: `${dnum} ${MON[m]} · ${Math.round(sc * 100)}%`,
        onclick: future ? null : () => { cur = dt; tab = "today"; render(); window.scrollTo(0, 0); },
      }, String(dnum)));
    }
    months.push(h("div", { class: "heatMonth" },
      h("div", { class: "heatMonthLbl" }, ["","","","","","","юли","август","септември","октомври","ноември","декември"][m]),
      h("div", { class: "heatRow" }, cells)));
  }

  // седмични барове — последните 8 седмици
  const bars = [];
  const curMonday = addDays(today, -((today.getDay() + 6) % 7));
  for (let wk = 7; wk >= 0; wk--) {
    const mon = addDays(curMonday, -7 * wk);
    let s = 0, n = 0;
    for (let i = 0; i < 7; i++) {
      const dd = addDays(mon, i);
      if (dd < START || dd > today) continue;
      s += dayScore(dd); n++;
    }
    const pct = n ? Math.round((s / n) * 100) : 0;
    bars.push(h("div", { class: "barCol" },
      h("span", { class: "barVal" }, n ? pct + "%" : "–"),
      h("div", { class: "barFill", style: `height:${Math.max(pct, 2)}%` }),
      h("span", { class: "barLbl" }, `${mon.getDate()} ${MON[mon.getMonth()]}`)));
  }

  // серии по навици
  const streakRows = state.habitsGood.map((e) =>
    h("div", { class: "card streakRow" },
      h("span", { class: "habN" }, e.name),
      h("span", { class: "streakVal" }, icon("flame", 14), `${habitStreak(e.id, today)} дни`)));

  return h("section", null,
    h("h2", { class: "secT" }, "Прогрес · 180 дни"),
    h("div", { class: "progGrid" },
      h("div", { class: "stat" }, h("b", null, `${streak}`), h("span", null, "текуща серия (дни)")),
      h("div", { class: "stat" }, h("b", null, `${best}`), h("span", null, "най-дълга серия")),
      h("div", { class: "stat" }, h("b", null, `${avg}%`), h("span", null, "средно изпълнение")),
      h("div", { class: "stat" }, h("b", null, `${tot.workouts}`), h("span", null, "завършени тренировки"))),
    h("h2", { class: "secT" }, "Карта на дните"),
    h("p", { class: "secS" }, "Тъмно → светло: 0% → 100% изпълнен ден. Докосни ден, за да го отвориш."),
    h("div", { class: "heatWrap" }, months),
    h("div", { class: "heatLegend" }, "по-малко ",
      h("i", null), h("i", { style: "background:rgba(255,77,20,.18)" }),
      h("i", { style: "background:rgba(255,77,20,.38)" }),
      h("i", { style: "background:rgba(255,77,20,.62)" }),
      h("i", { style: "background:linear-gradient(135deg,#FF4D14,#ff7a2e);border:none" }), " повече"),
    h("h2", { class: "secT" }, "Седмици"),
    h("div", { class: "card" }, h("div", { class: "barChart" }, bars)),
    h("h2", { class: "secT" }, "Серии по навици"),
    streakRows,
    h("h2", { class: "secT" }, "Данни"),
    h("p", { class: "secS" }, "Всичко се пази локално в това устройство/браузър. Свали резервно копие или прехвърли на друго устройство."),
    h("div", { class: "dataBtns" },
      h("button", { class: "btn", onclick: exportData }, "Експорт (JSON)"),
      h("button", { class: "btnOut", onclick: importData }, "Импорт")));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `zharava-backup-${dk(new Date())}.json` });
  document.body.appendChild(a); a.click(); a.remove();
}
function importData() {
  const inp = h("input", { type: "file", accept: "application/json", style: "display:none" });
  inp.addEventListener("change", () => {
    const f = inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result);
        if (!s.checks && !s.refl && !s.tasks) throw 0;
        state = { checks: s.checks || {}, refl: s.refl || {}, tasks: s.tasks || {},
                  habitsGood: s.habitsGood || DEFAULT_HABITS_GOOD.slice(),
                  habitsBad: s.habitsBad || DEFAULT_HABITS_BAD.slice() };
        save(); render();
      } catch (e) { alert("Файлът не е валидно резервно копие на Жарава."); }
    };
    rd.readAsText(f);
  });
  document.body.appendChild(inp); inp.click(); inp.remove();
}

/* ---------- рамка (хедър + навигация) ---------- */
function ring(pct, day) {
  const C = 2 * Math.PI * 26;
  const wrap = h("div", { class: "ring" });
  const sv = svgEl("svg", { width: 72, height: 72, viewBox: "0 0 72 72" });
  sv.appendChild(svgEl("circle", { cx: 36, cy: 36, r: 26, fill: "none", stroke: "var(--line)", "stroke-width": 5 }));
  const arc = svgEl("circle", { cx: 36, cy: 36, r: 26, fill: "none", stroke: "url(#emberGrad)",
    "stroke-width": 5, "stroke-linecap": "round", "stroke-dasharray": C,
    "stroke-dashoffset": C * (1 - pct), transform: "rotate(-90 36 36)" });
  arc.style.transition = "stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)";
  if (pct > 0) arc.style.filter = "drop-shadow(0 0 5px rgba(255,77,20,.55))";
  sv.appendChild(arc);
  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id: "emberGrad", x1: 0, y1: 0, x2: 1, y2: 1 });
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#FF4D14" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#FFB86B" }));
  defs.appendChild(grad); sv.appendChild(defs);
  wrap.appendChild(sv);
  wrap.appendChild(h("div", { class: "ringLbl" },
    h("span", { class: "ringDay" }, String(day)), h("span", { class: "ringOf" }, "/180")));
  return wrap;
}

function navDay(delta) {
  const a = addDays(cur, delta);
  if (a >= START && a <= END) { cur = a; openMeal = null; openEx = null; render(); }
}

function render() {
  const root = document.getElementById("root");
  const key = dk(cur), day = challengeDay(cur), workday = isWorkday(cur);
  const pct = dayScore(cur);
  const isToday = key === dk(clampDate(new Date()));

  const chevLeft = h("span", { style: "transform:rotate(180deg);display:inline-flex" }, icon("chev", 16));

  const header = h("header", { class: "hdr" },
    h("div", { class: "hdrTop" },
      h("div", { class: "brand" }, icon("flame", 16), h("span", null, "ЖАРАВА")),
      h("div", { class: "hdrTopR" },
        h("span", { class: `sync ${syncLbl.indexOf("грешка") === 0 ? "err" : ""}` }, syncLbl))),
    h("div", { class: "hdrMain" },
      ring(Math.max(pct, 0.02), day),
      h("div", { class: "hdrInfo" },
        h("div", { class: "dateNav" },
          h("button", { class: "navBtn", "aria-label": "Предишен ден", disabled: day <= 1, onclick: () => navDay(-1) }, chevLeft),
          h("div", { class: "dateLbl dateLblWrap" },
            h("input", { type: "date", class: "dateInputOverlay", min: dk(START), max: dk(END), value: key,
              "aria-label": "Избери дата от календара",
              onchange: (e) => {
                if (!e.target.value) return;
                cur = clampDate(new Date(e.target.value + "T00:00:00"));
                openMeal = null; openEx = null; render();
              } }),
            h("strong", null, DOW[cur.getDay()]),
            h("span", null, `${cur.getDate()} ${MON[cur.getMonth()]} · ${workday ? "работен ден" : "почивен ден"}`)),
          h("button", { class: "navBtn", "aria-label": "Следващ ден", disabled: key === dk(END), onclick: () => navDay(1) }, icon("chev", 16))),
        h("div", { class: "hdrMeta" },
          h("span", { class: "pct" }, `${Math.round(pct * 100)}% от деня`),
          !isToday ? h("button", { class: "todayBtn", onclick: () => { cur = clampDate(new Date()); render(); } }, "към днес") : null))));

  const views = { today: viewToday, food: viewFood, train: viewTrain, habits: viewHabits, content: viewContent, progress: viewProgress };
  const main = h("main", { class: "main" }, views[tab]());

  const nav = h("nav", { class: "nav" },
    [["today", "flame", "Днес"], ["food", "bowl", "Хранене"], ["train", "train", "Спорт"],
     ["habits", "habit", "Навици"], ["content", "cam", "Контент"], ["progress", "chart", "Прогрес"]]
      .map(([id, ic, lbl]) => h("button", {
        class: `navTab ${tab === id ? "act" : ""}`,
        onclick: () => { tab = id; render(); window.scrollTo(0, 0); },
      }, icon(ic, 20), h("span", null, lbl))));

  root.replaceChildren(header, main, nav);
}

setSync("запазено");
render();
})();

