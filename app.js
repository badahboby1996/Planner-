/* ============================================================
   ЖАРАВА v2 · логика (vanilla JS, без библиотеки)
   - Месечни модули: window.ZHARAVA_MONTHS["YYYY-MM"] (data-*.js)
   - Данни на потребителя: localStorage + Експорт/Импорт
   - Редакция от приложението: тренировка/меню/контент override
     се пазят в state.edits и стоят "върху" месечния файл
   ============================================================ */
(function () {
"use strict";

/* ---------- константи ---------- */
const START = new Date(2026, 6, 1);
const END   = new Date(2026, 11, 31);
const LS_KEY = "zharava-state-v2";
const LS_KEY_V1 = "zharava-state-v1";
const MONTHS = window.ZHARAVA_MONTHS || {};
const DOW = ["Неделя","Понеделник","Вторник","Сряда","Четвъртък","Петък","Събота"];
const DOW_S = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
const MON = ["яну","фев","мар","апр","май","юни","юли","авг","сеп","окт","ное","дек"];
const MON_F = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
const READING_ID = "hg2"; // навикът за четене се брои по страници, не по дни
const DEFAULT_HABITS_GOOD = [
  { id: "hg0", name: "Ставане 05:30–06:00" }, { id: "hg1", name: "Развиване на умение" },
  { id: READING_ID, name: "Четене на книга" }, { id: "hg3", name: "Спорт / движение" },
  { id: "hg4", name: "Здравословно готвене" }];
const DEFAULT_HABITS_BAD = [
  { id: "hb0", name: "Безцелно скролване" }, { id: "hb1", name: "Телефон в спалнята" },
  { id: "hb2", name: "Късно ядене" }, { id: "hb3", name: "Нездравословна храна" },
  { id: "hb4", name: "Късно лягане" }, { id: "hb5", name: "Мързел / отлагане" }];


/* ---------- икони за ръчни задачи (авто-разпознаване по ключови думи) ---------- */
const TASK_ICONS = [
  { e:"✂️", kw:["подстри","фризьор","бръснар","коса","брада"] },
  { e:"🛒", kw:["пазар","магазин","купи","покупк","лидл","кауфланд","билла"] },
  { e:"💼", kw:["работа","среща","офис","смяна","интервю","колег"] },
  { e:"📞", kw:["обад","звън","разговор","call","телефон"] },
  { e:"🚗", kw:["кола","сервиз","гума","бензин","паркинг","винетка","шофьор"] },
  { e:"🏥", kw:["лекар","зъбол","доктор","преглед","болниц","кръв","изследван"] },
  { e:"💊", kw:["лекарств","хапче","витамин","аптека","рецепта"] },
  { e:"🏋️", kw:["фитнес","трениров","зала","кардио","бягане","плуване"] },
  { e:"🎬", kw:["видео","снима","монтаж","клип","контент","reel","тикток","инста"] },
  { e:"📄", kw:["документ","банка","плащане","сметка","данъц","нап","фактура","наем"] },
  { e:"🎂", kw:["рожден","парти","празник","подарък","имен ден"] },
  { e:"🧹", kw:["чистене","пране","гладене","почист","подред"] },
  { e:"📚", kw:["чете","книга","уча","курс","урок","изпит"] },
  { e:"✈️", kw:["полет","пътуване","билет","хотел","резервац","екскурзия"] },
  { e:"📌", kw:[] },
];
const detectTaskIcon = (txt) => {
  const t = (txt || "").toLowerCase();
  for (const it of TASK_ICONS) for (const k of it.kw) if (k && t.includes(k)) return it.e;
  return "📌";
};
const parseTimeMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec((t || "").trim());
  return m ? (+m[1]) * 60 + (+m[2]) : 24 * 60 + 1; // без час -> в края на деня
};

const dk = (n) => `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
const mk = (n) => `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;
const addDays = (n, s) => { const l = new Date(n); l.setDate(l.getDate()+s); return l; };
const clampDate = (n) => (n < START ? new Date(START) : n > END ? new Date(END) : n);
const challengeDay = (n) => Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - START) / 864e5) + 1;
const isWorkday = (n) => n.getDay() >= 2 && n.getDay() <= 6;
const mealIdx = (n) => (n.getDay() + 6) % 7;

/* ---------- състояние ---------- */
let state = loadState();
let cur = clampDate(new Date());
let tab = "today";
let planSub = "food";            // под-таб на План: food | train | content
let calMonth = mk(cur);          // показван месец в календара
let openMeal = null, openEx = null, addingTask = false, editHabits = false, editPlan = false;
let editingTask = null;         // id на ръчна задача в режим редакция
let scrollToNow = true;         // еднократен автоскрол до текущия час в "Днес"
let pendingScroll = null;       // id (data-scroll) към който да се скролне след следващия render()
let lastTab = "today";          // за плавния преход между табове
let toastTimer = null;
let saveTimer = null, syncLbl = "локално";
let prevPct = 0;

// изчиства старото фиксирано „20 страници“ име, за да стане навикът брояч на страници
function migrateReading(st) {
  const rh = (st.habitsGood || []).find((x) => x.id === READING_ID);
  if (rh && /страниц/i.test(rh.name)) rh.name = "Четене на книга";
  return st;
}
function emptyState() {
  return { checks:{}, refl:{}, tasks:{}, weights:{}, shopping:{}, shopExtra:{}, edits:{}, reading:{},
    habitsGood: DEFAULT_HABITS_GOOD.slice(), habitsBad: DEFAULT_HABITS_BAD.slice() };
}
function normalizeState(s) {
  const empty = emptyState();
  return migrateReading({ ...empty, ...s, reading: s.reading || {},
    habitsGood: s.habitsGood || empty.habitsGood, habitsBad: s.habitsBad || empty.habitsBad });
}
function loadState() {
  const empty = emptyState();
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) { // миграция от v1
      const old = localStorage.getItem(LS_KEY_V1);
      if (old) { const s = JSON.parse(old); return migrateReading({ ...empty, checks:s.checks||{}, refl:s.refl||{}, tasks:s.tasks||{}, habitsGood:s.habitsGood||empty.habitsGood, habitsBad:s.habitsBad||empty.habitsBad }); }
      return empty;
    }
    return normalizeState(JSON.parse(raw));
  } catch (e) { return empty; }
}
function save() {
  clearTimeout(saveTimer); setSync("запис…");
  saveTimer = setTimeout(() => {
    state.updatedAt = Date.now(); // за облачния merge: по-новото устройство печели
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { setSync("грешка при запис"); return; }
    const cloud = window.ZHARAVA_CLOUD;
    if (cloud && cloud.enabled && cloud.active()) cloud.push(state);
    else setSync("запазено");
  }, 250);
}
function setSync(t) { syncLbl = t; const el = document.querySelector(".sync");
  if (el) { el.textContent = t; el.classList.toggle("err", t.indexOf("грешка")===0); } }

/* ---------- месечен модул + edits ---------- */
function monthData(dateObj) { return MONTHS[mk(dateObj)] || null; }
function dayEdits(key) { return state.edits[key] || {}; }

// Тренировка за конкретна дата (edits > месечен файл > null)
function workoutFor(dateObj) {
  const key = dk(dateObj), ed = dayEdits(key);
  if (ed.workout === "rest") return null;
  if (ed.workout) return ed.workout;
  const m = monthData(dateObj);
  if (!m) return null;
  return m.workouts[dateObj.getDate()] || null;
}
// Меню за конкретна дата
function mealsFor(dateObj) {
  const key = dk(dateObj), ed = dayEdits(key);
  const m = monthData(dateObj);
  const base = m ? m.meals[mealIdx(dateObj)] : null;
  if (!base) return null;
  if (!ed.meals) return base;
  return base.map((meal, i) => ed.meals[i] ? { ...meal, ...ed.meals[i] } : meal);
}
/* ---------- "Гориво": каква полза носи ястието (разчита продуктите) ---------- */
const FUEL_RULES = [
  ["пилешк","чист протеин за възстановяване на мускулите"],
  ["телешк","протеин + желязо и креатин за сила"],
  ["кюфте","протеин + желязо и креатин за сила"],
  ["тон","протеин + омега-3 срещу възпаления"],
  ["туна","протеин + омега-3 срещу възпаления"],
  ["сьомга","протеин + омега-3 срещу възпаления"],
  ["скумрия","протеин + омега-3 срещу възпаления"],
  ["риба","протеин + омега-3 срещу възпаления"],
  ["яйц","пълен протеин + холин за фокус"],
  ["кисело мляко","казеин + пробиотици за храносмилането"],
  ["извара","бавен казеинов протеин — сит с часове"],
  ["овес","бавни въглехидрати — енергия с часове"],
  ["киноа","пълноценен растителен протеин + магнезий"],
  ["булгур","бавни въглехидрати + фибри"],
  ["ориз","чисти въглехидрати — зареждат гликогена"],
  ["картоф","въглехидрати + калий за мускулите"],
  ["боб","фибри + растителен протеин за ситост"],
  ["леща","фибри + растителен протеин за ситост"],
  ["нахут","фибри + растителен протеин за ситост"],
  ["авокадо","здравословни мазнини за хормоните"],
  ["орех","омега-3 за мозъка"],
  ["бадем","витамин Е + магнезий"],
  ["фъстъч","здравословни мазнини + дълга ситост"],
  ["банан","бърза енергия + калий против крампи"],
  ["мед","бърза естествена енергия"],
  ["канела","изглажда кръвната захар"],
  ["гъби","витамин D + селен"],
  ["домат","ликопен + витамин C"],
  ["лимон","витамин C за имунитета"],
  ["хляб","фибри + стабилна енергия"],
  ["зехтин","мононенаситени мазнини за сърцето"],
  ["маслин","мононенаситени мазнини за сърцето"],
  ["праскова","витамини + антиоксиданти"],
  ["кайси","витамини + антиоксиданти"],
  ["ябълк","витамини + антиоксиданти"],
  ["спанак","фибри и микроелементи"],["брокол","фибри и микроелементи"],
  ["тиквичк","фибри и микроелементи"],["чушк","фибри и микроелементи"],
  ["краставиц","фибри и микроелементи"],["салата","фибри и микроелементи"],
  ["зеленчуц","фибри и микроелементи"],["зелен боб","фибри и микроелементи"],
];
function mealBenefit(meal) {
  const txt = ((meal.n||"") + " " + (meal.ing||"")).toLowerCase();
  const out = [];
  for (const [kw, phrase] of FUEL_RULES) {
    if (txt.includes(kw) && !out.includes(phrase)) out.push(phrase);
    if (out.length >= 3) break;
  }
  return out.length ? out.join(" · ") : "балансирано гориво по плана — яж без колебание";
}

// Контент за конкретна дата
function contentFor(dateObj) {
  const key = dk(dateObj), ed = dayEdits(key);
  if (ed.content) return ed.content;
  const m = monthData(dateObj);
  if (!m) return null;
  return m.content[dateObj.getDate()] || null;
}
/* ---------- Цитат на седмицата (мотивация от велики личности) ---------- */
const QUOTES = [
  ["Не е нужно да си велик, за да започнеш, но трябва да започнеш, за да станеш велик.", "Зиг Зиглар"],
  ["Дисциплината е мостът между целите и постиженията.", "Джим Рон"],
  ["Всеки удар, който не улучва целта, ме приближава до нея.", "Мохамед Али"],
  ["Не броим дните, правим дните да се броят.", "Мохамед Али"],
  ["Тялото постига това, което умът вярва.", "Наполеон Хил"],
  ["Не се страхувай от съвършенството — никога няма да го постигнеш.", "Салвадор Дали"],
  ["Ако можеш да го сънуваш, можеш да го направиш.", "Уолт Дисни"],
  ["Успехът е сборът от малки усилия, повтаряни ден след ден.", "Робърт Колиър"],
  ["Не изчаквай подходящия момент. Вземи момента и го направи подходящ.", "Наполеон Хил"],
  ["Който има защо да живее, може да понесе почти всяко как.", "Фридрих Ницше"],
  ["Пречката по пътя е пътят.", "Марк Аврелий"],
  ["Ти имаш власт над ума си, не над външните събития. Осъзнай това и ще намериш сила.", "Марк Аврелий"],
  ["Не е достатъчно да знаеш, трябва и да прилагаш. Не е достатъчно да искаш, трябва и да действаш.", "Йохан Волфганг фон Гьоте"],
  ["Ние ставаме това, което правим отново и отново. Съвършенството не е акт, а навик.", "Аристотел"],
  ["Който е победил себе си, е по-велик от този, който е превзел хиляда крепости.", "Буда"],
  ["Пътят от хиляда мили започва с една стъпка.", "Лао Дзъ"],
  ["Не е важно колко пъти падаш, а колко пъти се изправяш.", "Винс Ломбарди"],
  ["Победителите не правят различни неща, те правят нещата по различен начин.", "Шайкер Чоудри"],
  ["Болката е временна. Отказването е завинаги.", "Ланс Армстронг"],
  ["Не спирай, когато си уморен. Спри, когато си готов.", "Дейвид Гогинс"],
  ["Никой не идва да те спаси. Спасяваш се сам, всеки ден, с малки решения.", "Дейвид Гогинс"],
  ["Твоят най-опасен враг е гласът, който ти казва „стига ти толкова“, докато все още имаш още.", "Дейвид Гогинс"],
  ["Мисията не е успешна, докато не станеш нещо повече от сегашния себе си.", "Кобе Брайънт"],
  ["Всичко негативно — натиск, предизвикателства — е шанс да се издигна.", "Кобе Брайънт"],
  ["Не се отказвай в средата на нещо трудно. Точно там се решава всичко.", "Майкъл Джордан"],
  ["Пропуснах повече от 9000 удара в кариерата си. Точно затова успявам.", "Майкъл Джордан"],
  ["Времето ти е ограничено, не го пилей, живеейки чужд живот.", "Стив Джобс"],
  ["Не открих 10 000 начина, които не работят. Открих 10 000 начина, които работят.", "Томас Едисон"],
  ["Ако мислиш, че можеш, или мислиш, че не можеш — прав си.", "Хенри Форд"],
  ["Знам със сигурност само едно: колкото повече благодарност, толкова повече изобилие.", "Опра Уинфри"],
  ["Смелостта не винаги реве. Понякога е тихият глас в края на деня, който казва: утре пак ще опитам.", "Мери Ан Радмахър"],
  ["Не мери разстоянието, което ти остава, а измерваш ли пътя, който вече си изминал.", "Уинстън Чърчил"],
  ["Успехът е да преминеш от провал към провал, без да губиш ентусиазъм.", "Уинстън Чърчил"],
  ["Нищо велико не е постигано без ентусиазъм.", "Ралф Уолдо Емерсън"],
  ["Първо се научи да контролираш ума си, после ще контролираш всичко останало.", "Брус Лий"],
  ["Не се страхувам от човек, който е тренирал 10 000 удара веднъж. Страхувам се от този, който е тренирал един удар 10 000 пъти.", "Брус Лий"],
  ["Дай на всеки ден шанс да е достатъчно красив, за да заличи миналото.", "Майя Анджелоу"],
  ["Ще срещаш поражения, но никога не бива да бъдеш победен.", "Майя Анджелоу"],
];
function quoteOfWeek(dateObj) {
  const day = Math.max(challengeDay(dateObj), 1);
  const week = Math.floor((day - 1) / 7);
  const q = QUOTES[week % QUOTES.length];
  return { t: q[0], a: q[1] };
}

/* ---------- DOM помощници ---------- */
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
const ICON_PATHS = {
  flame: [["path",{d:"M12 2c1 4-3 5.5-3 9a3 3 0 006 0c0-1.5-.8-2.5-.8-2.5S17 10 17 13.5A5 5 0 017 13.5C7 8 12 6.5 12 2z"}]],
  bowl: [["path",{d:"M4 12h16a8 8 0 01-16 0z"}],["path",{d:"M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4","stroke-linecap":"round",fill:"none"}]],
  train: [["path",{d:"M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12","stroke-linecap":"round",fill:"none","stroke-width":"2.2"}]],
  habit: [["circle",{cx:12,cy:12,r:9,fill:"none","stroke-width":"2"}],["path",{d:"M8 12.5l2.6 2.6L16 9.5",fill:"none","stroke-width":"2.2","stroke-linecap":"round","stroke-linejoin":"round"}]],
  cam: [["rect",{x:3,y:7,width:13,height:11,rx:2.5,fill:"none","stroke-width":"2"}],["path",{d:"M16 11l5-2.5v8L16 14",fill:"none","stroke-width":"2","stroke-linejoin":"round"}]],
  chev: [["path",{d:"M9 6l6 6-6 6",fill:"none","stroke-width":"2.4","stroke-linecap":"round","stroke-linejoin":"round"}]],
  plus: [["path",{d:"M12 5v14M5 12h14",fill:"none","stroke-width":"2.4","stroke-linecap":"round"}]],
  x: [["path",{d:"M6 6l12 12M18 6L6 18",fill:"none","stroke-width":"2.2","stroke-linecap":"round"}]],
  chart: [["path",{d:"M4 20V10M10 20V4M16 20v-8M21 20H3",fill:"none","stroke-width":"2.2","stroke-linecap":"round"}]],
  cal: [["rect",{x:3,y:5,width:18,height:16,rx:3,fill:"none","stroke-width":"2"}],["path",{d:"M3 10h18M8 3v4M16 3v4",fill:"none","stroke-width":"2","stroke-linecap":"round"}]],
  cart: [["path",{d:"M3 4h2l2.6 12.5a1.5 1.5 0 001.5 1.2h7.9a1.5 1.5 0 001.5-1.2L20.5 8H6",fill:"none","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"}],["circle",{cx:10,cy:20.5,r:1.4}],["circle",{cx:17,cy:20.5,r:1.4}]],
  edit: [["path",{d:"M4 20l4.5-1L20 7.5a2.1 2.1 0 00-3-3L5.5 16 4 20z",fill:"none","stroke-width":"2","stroke-linejoin":"round"}]],
};
function icon(name, size = 20) {
  const s = svgEl("svg",{width:size,height:size,viewBox:"0 0 24 24",fill:"currentColor",stroke:"currentColor","stroke-width":name==="flame"?0:1.6,"aria-hidden":"true"});
  ICON_PATHS[name].forEach(([t,a]) => s.appendChild(svgEl(t,a)));
  return s;
}
function checkBtn(on, onTap, small) {
  const b = h("button",{class:`chk ${on?"on":""} ${small?"sm":""}`,"aria-pressed":on,"aria-label":on?"Отметнато":"Отметни",
    onclick:(ev)=>{ if(!on){ burst(ev.clientX,ev.clientY); if(navigator.vibrate) navigator.vibrate(12); } onTap(ev); }});
  const sv = svgEl("svg",{viewBox:"0 0 24 24",width:small?14:17,height:small?14:17});
  sv.appendChild(svgEl("path",{d:"M5 12.5l4.2 4.2L19 7",fill:"none",stroke:"currentColor","stroke-width":"3","stroke-linecap":"round","stroke-linejoin":"round"}));
  b.appendChild(sv);
  return b;
}

/* ---------- Toast с "Върни" (5 сек) ---------- */
function showToast(msg, undoFn) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  clearTimeout(toastTimer);
  const el = h("div", { class: "toast", role: "status" },
    h("span", { class: "toastMsg" }, msg),
    undoFn ? h("button", { class: "toastUndo", onclick: () => {
      clearTimeout(toastTimer); el.remove(); undoFn();
    }}, "Върни") : null);
  document.body.appendChild(el);
  toastTimer = setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 5000);
}

/* ---------- ЧАСТИЦИ: жарава фон + искри при отметка ---------- */
const emberCanvas = document.getElementById("embers");
const ctx2d = emberCanvas ? emberCanvas.getContext("2d") : null;
let embers = [], sparks = [];
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function resizeCanvas() {
  if (!emberCanvas) return;
  emberCanvas.width = window.innerWidth * devicePixelRatio;
  emberCanvas.height = window.innerHeight * devicePixelRatio;
  ctx2d.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
function initEmbers() {
  if (!ctx2d || REDUCED) return;
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  const W = () => window.innerWidth, H = () => window.innerHeight;
  const N = Math.min(68, Math.round(W()/9));
  for (let i=0;i<N;i++) embers.push({
    x: Math.random()*W(), y: Math.random()*H(),
    r: 1.1+Math.random()*3.1, vy: .25+Math.random()*.85, vx:(Math.random()-.5)*.3,
    a: .45+Math.random()*.55, tw: Math.random()*Math.PI*2 });
  let last = 0;
  (function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden) return;       // таб на заден план -> нула работа
    if (ts - last < 40) return; // ~25 fps — пести батерия
    last = ts;
    ctx2d.clearRect(0,0,W(),H());
    const glow = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--glow")) || 0;
    for (const p of embers) {
      p.y -= p.vy * (1 + glow*1.4); p.x += p.vx; p.tw += .05;
      if (p.y < -8) { p.y = H()+8; p.x = Math.random()*W(); }
      const alpha = p.a * (0.5+0.5*Math.sin(p.tw)) * (0.9 + glow*.4);
      ctx2d.beginPath(); ctx2d.arc(p.x,p.y,p.r,0,7);
      ctx2d.fillStyle = `rgba(255,${120+Math.round(60*Math.sin(p.tw))},40,${alpha.toFixed(3)})`;
      ctx2d.shadowColor = "rgba(255,77,20,.8)"; ctx2d.shadowBlur = 10;
      ctx2d.fill(); ctx2d.shadowBlur = 0;
    }
    // искри от отметки
    for (let i=sparks.length-1;i>=0;i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += .12; s.life -= 1;
      if (s.life <= 0) { sparks.splice(i,1); continue; }
      ctx2d.beginPath(); ctx2d.arc(s.x,s.y,s.r,0,7);
      ctx2d.fillStyle = `rgba(255,${140+Math.round(Math.random()*60)},60,${(s.life/s.max).toFixed(2)})`;
      ctx2d.fill();
    }
  })(0);
}
function burst(x, y) {
  if (!ctx2d || REDUCED || x==null) return;
  for (let i=0;i<14;i++) {
    const ang = Math.random()*Math.PI*2, sp = 1.5+Math.random()*3.5;
    sparks.push({ x, y, vx: Math.cos(ang)*sp, vy: Math.sin(ang)*sp-1.5, r: 1+Math.random()*1.8, life: 26+Math.random()*14, max: 40 });
  }
}
function bigCelebration() {
  if (!ctx2d || REDUCED) return;
  const W = window.innerWidth;
  for (let i=0;i<70;i++) setTimeout(() => burst(Math.random()*W, window.innerHeight*0.25+Math.random()*90), i*12);
}

/* ---------- count-up за статистики ---------- */
function countUp(el, target) {
  if (REDUCED) { el.textContent = String(target); return; }
  const dur = 600, t0 = performance.now();
  (function step(t) {
    const k = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-k,3);
    el.textContent = String(Math.round(target*e));
    if (k<1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- изчисления ---------- */
const dayChecks = (key) => state.checks[key] || {};
function dayScore(dateObj) {
  const key = dk(dateObj), o = dayChecks(key);
  const w = workoutFor(dateObj);
  const parts = [!!o.wake];
  if (w) parts.push(w.ex.every((_,i)=>o[`ex${i}`]));
  const meals = mealsFor(dateObj);
  if (meals) for (let i=0;i<meals.length;i++) parts.push(!!o[`meal${i}`]);
  const c = contentFor(dateObj);
  if (c && !c.rest) parts.push(!!o.content);
  parts.push(!!o.evening);
  (state.tasks[key]||[]).forEach((t)=>parts.push(!!t.done));
  return parts.filter(Boolean).length / parts.length;
}
function totals() {
  let workouts = 0, meals = 0, videos = 0;
  for (const key of Object.keys(state.checks)) {
    const u = state.checks[key];
    const b = new Date(key+"T00:00:00");
    const w = workoutFor(b);
    if (w && w.ex.every((_,i)=>u[`ex${i}`])) workouts++;
    for (let i=0;i<4;i++) if (u[`meal${i}`]) meals++;
    if (u.content) videos++;
  }
  // ръчни задачи: свършено кардио/тренировка (🏋️) и снимано видео (🎬) също се броят
  for (const key of Object.keys(state.tasks)) for (const t of state.tasks[key]||[]) {
    if (!t.done) continue;
    const ic = t.ico || detectTaskIcon(t.t);
    if (ic === "🏋️") workouts++;
    if (ic === "🎬") videos++;
  }
  const refls = Object.values(state.refl).filter((i)=>i.rate||i.plus||i.minus||i.note).length;
  return { workouts, meals, refls, videos };
}
// общо колко пъти е отметнат навикът досега (не поредни дни — колкото пъти изобщо си го направил)
function habitCount(id) {
  let n = 0;
  for (const key in state.checks) if (state.checks[key][id]) n++;
  return n;
}
/* ---------- четене: страници за деня + общо ---------- */
const readPages = (key) => (state.reading && +state.reading[key]) || 0;
function totalPages() {
  let n = 0;
  for (const key in state.reading) n += (+state.reading[key] || 0);
  return n;
}
function setReadPages(key, val) {
  val = Math.max(0, Math.min(99999, Math.round(val) || 0));
  const r = { ...state.reading };
  if (val > 0) r[key] = val; else delete r[key];
  state.reading = r;
  save();
}
function toggleCheck(id) {
  const key = dk(cur);
  const t = { ...dayChecks(key) };
  if (t[id]) delete t[id]; else t[id] = true;
  state.checks = { ...state.checks, [key]: t };
  save();
  const pct = dayScore(cur);
  render();
  if (pct >= 0.999 && prevPct < 0.999) bigCelebration();
  prevPct = pct;
}
function setRefl(patch) {
  const key = dk(cur);
  state.refl = { ...state.refl, [key]: { ...(state.refl[key]||{}), ...patch } };
  save();
}

/* ---------- БАДЖОВЕ ---------- */
const BADGES = [
  { id:"b1", ico:"🔥", name:"Първи ден 100%", test:(s)=>anyDayFull() },
  { id:"b2", ico:"📅", name:"7 дни серия", test:()=>bestStreak()>=7 },
  { id:"b3", ico:"⚡", name:"14 дни серия", test:()=>bestStreak()>=14 },
  { id:"b4", ico:"🏆", name:"30 дни серия", test:()=>bestStreak()>=30 },
  { id:"b5", ico:"💪", name:"10 тренировки", test:()=>totals().workouts>=10 },
  { id:"b6", ico:"🥇", name:"25 тренировки", test:()=>totals().workouts>=25 },
  { id:"b7", ico:"🎬", name:"10 видеа", test:()=>totals().videos>=10 },
  { id:"b8", ico:"✍️", name:"20 рефлексии", test:()=>totals().refls>=20 },
];
function anyDayFull() {
  const today = clampDate(new Date());
  for (let d = new Date(START); d <= today; d = addDays(d,1)) if (dayScore(d) >= 0.999) return true;
  return false;
}
function bestStreak() {
  const today = clampDate(new Date());
  let best = 0, run = 0;
  for (let d = new Date(START); d <= today; d = addDays(d,1)) {
    run = dayScore(d) >= 0.6 ? run+1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/* ============================================================
   ИЗГЛЕДИ
   ============================================================ */

/* ---------- ДНЕС (dashboard) ---------- */
function viewToday() {
  const key = dk(cur), o = dayChecks(key), k = state.refl[key]||{};
  const workday = isWorkday(cur);
  const w = workoutFor(cur);
  const meals = mealsFor(cur);
  const cont = contentFor(cur);
  const quote = quoteOfWeek(cur);
  const tasks = state.tasks[key]||[];
  const tot = totals();
  const m = monthData(cur);

  const P = w ? w.ex.filter((_,i)=>o[`ex${i}`]).length : 0;
  const N = w ? w.ex.length : 0;
  const workoutDone = w && P===N && N>0;

  const items = [];
  items.push({ id:"wake", time:"05:30", t:"Ставане + вода", s:"Телефонът остава далеч първите 30 мин", k:"habit" });
  if (w) items.push({ id:"__workout", time:"06:15", t:`Тренировка · ${w.t}`, s:`${w.dur} мин · ${P}/${N} упражнения`, k:"train", nav:["plan","train"], done:workoutDone });
  if (meals) {
    const times = ["07:30","13:00","16:30",workday?"20:00":"19:30"];
    const names = (m && m.mealTypes) || ["Закуска","Обяд","Следобед","Вечеря"];
    meals.forEach((meal,i) => {
      items.push({ id:`meal${i}`, time:times[i], t:`${names[i]} · ${meal.n}`, s:mealBenefit(meal), k:"food", nav:["plan","food"] });
      if (i===0 && workday) items.push({ id:"__leave", time:"09:10", t:"Тръгване за работа", k:"info" });
      if (i===2 && workday) items.push({ id:"__home", time:"19:30", t:"Прибиране", k:"info" });
    });
  }
  if (cont && !cont.rest) items.push({ id:"content", time:"21:00", t:`Контент · ${cont.f}`, s:cont.h, k:"cam", nav:["plan","content"] });
  else if (cont && cont.rest) items.push({ id:"content", time:"21:00", t:"Контент · без пост", s:cont.d.slice(0,60)+"…", k:"cam", nav:["plan","content"] });
  items.push({ id:"evening", time:"22:00", t:"Вечерна рутина", s:"Телефон извън спалнята · четене преди сън", k:"habit" });
  // ръчните задачи влизат в плана според часа си (като Google Calendar)
  tasks.forEach((tk) => items.push({
    custom:true, task:tk, id:"task"+tk.id, time:tk.time||"",
    t:tk.t, s:tk.time?"твоя задача":"твоя задача · без час", ico:tk.ico||detectTaskIcon(tk.t) }));
  items.sort((a,b) => parseTimeMin(a.time) - parseTimeMin(b.time)); // стабилно: равни часове пазят реда
  const icoMap = { habit:"habit", food:"bowl", train:"train", cam:"cam", info:"chev" };

  const statEls = [];
  const stat = (val,lbl) => { const b = h("b",null,"0"); statEls.push([b,val]); return h("div",{class:"stat"},b,h("span",null,lbl)); };
  const allHabits = [...state.habitsGood, ...state.habitsBad];
  const habitChip = (hb) => {
    const isRead = hb.id === READING_ID;
    const b = h("b",null,"0");
    statEls.push([b, isRead ? totalPages() : habitCount(hb.id)]);
    return h("div",{class:"habitChip"}, b, h("span",null, isRead ? "прочетени стр" : hb.name));
  };

  const sec = h("section", null,
    h("div",{class:"quoteBan"}, h("b",null,"ЦИТАТ НА СЕДМИЦАТА"),
      h("p",{class:"quoteTxt"},`„${quote.t}“`),
      h("span",{class:"quoteAuthor"},"— "+quote.a)),
    h("div",{class:"stats"}, stat(tot.workouts,"тренировки"), stat(tot.meals,"хранения"), stat(tot.videos,"видеа"), stat(tot.refls,"рефлексии")),
    allHabits.length ? h("div",{class:"habitChips"}, allHabits.map(habitChip)) : null,
    h("h2",{class:"secT"},"Планът за деня"),
    h("div",{class:"tl"},
      items.map((e) => {
        if (e.k==="info")
          return h("div",{class:"tlInfo","data-time":e.time}, h("span",{class:"tlTime"},e.time), h("span",null,e.t));
        if (e.k==="rest")
          return h("div",{class:"tlItem restRow","data-time":e.time},
            h("span",{class:"tlTime"},e.time),
            h("div",{class:"tlIco"},icon("flame",17)),
            h("button",{class:"tlBody",onclick:()=>{ if(e.nav) goToPlan(e.nav[1], e.id); }},
              h("span",{class:"tlT"},e.t),
              h("span",{class:"tlS"},e.s)));
        if (e.custom) {
          const tk = e.task;
          if (editingTask === tk.id) return taskForm(key, tk);
          return h("div",{class:`tlItem custom ${tk.done?"done":""}`,"data-time":e.time},
            h("span",{class:"tlTime"},tk.time||"—"),
            h("div",{class:"tlIco emoji","aria-hidden":"true"},e.ico),
            h("div",{class:"tlBody"},h("span",{class:"tlT"},tk.t),h("span",{class:"tlS"},e.s)),
            h("button",{class:"del","aria-label":"Редактирай задача",onclick:()=>{ editingTask=tk.id; addingTask=false; render(); }},icon("edit",14)),
            checkBtn(tk.done,()=>{ state.tasks[key]=tasks.map((t)=>t.id===tk.id?{...t,done:!t.done}:t); save(); render(); }),
            h("button",{class:"del","aria-label":"Изтрий задача",onclick:()=>{
              const removed = tk;
              state.tasks[key]=tasks.filter((t)=>t.id!==tk.id); save(); render();
              showToast(`Изтрито: ${removed.t}`, ()=>{
                state.tasks[key]=[...(state.tasks[key]||[]),removed]; save(); render();
              });
            }},icon("x",13)));
        }
        return h("div",{class:`tlItem ${(e.id==="__workout"?e.done:o[e.id])?"done":""}`,"data-time":e.time},
            h("span",{class:"tlTime"},e.time),
            h("div",{class:"tlIco"},icon(icoMap[e.k],17)),
            h("button",{class:"tlBody",onclick:()=>{ if(e.nav) goToPlan(e.nav[1], e.id); }},
              h("span",{class:"tlT"},e.t),
              e.s ? h("span",{class:"tlS"},e.s) : null),
            e.id==="__workout"
              ? checkBtn(e.done,()=>goToPlan("train","__workout"))
              : checkBtn(!!o[e.id],()=>toggleCheck(e.id)));
      })),
    addingTask ? taskForm(key)
      : h("button",{class:"addBtn",onclick:()=>{addingTask=true;render();}},icon("plus",15),` Добави задача за ${cur.getDate()} ${MON[cur.getMonth()]}`),
    h("h2",{class:"secT"},"Вечерна рефлексия"),
    h("div",{class:"card refl"},
      h("span",{class:"lbl"},"Как беше денят?"),
      h("div",{class:"flames"},[1,2,3,4,5].map((e)=>h("button",{class:`flame ${(k.rate||0)>=e?"lit":""}`,"aria-label":`Оценка ${e}`,
        onclick:(ev)=>{ if((k.rate||0)<e) burst(ev.clientX,ev.clientY); setRefl({rate:k.rate===e?0:e}); render(); }},icon("flame",24)))),
      reflArea("Какво проработи",k.plus,"Едно нещо, което свърши работа днес…",(v)=>setRefl({plus:v})),
      reflArea("Какво не проработи",k.minus,"Без извинения — какво се разпадна…",(v)=>setRefl({minus:v})),
      reflArea("Бележка към бъдещия ти",k.note,"Мисъл, идея за контент, каквото и да ��…",(v)=>setRefl({note:v}))));

  requestAnimationFrame(()=>statEls.forEach(([el,v])=>countUp(el,v)));
  return sec;
}
function reflArea(label,val,ph,onInput) {
  return [h("span",{class:"lbl"},label),
    h("textarea",{class:"ta",rows:2,placeholder:ph,oninput:(e)=>onInput(e.target.value)},val||"")];
}
function taskForm(key, existing) {
  const inp = h("input",{class:"inp",placeholder:"Задача (напр. подстрижка)",value:existing?existing.t:""});
  const time = h("input",{class:"inp time",type:"time","aria-label":"Час на задачата",value:existing&&existing.time?existing.time:""});
  let manualIco = existing ? (existing.ico||null) : null; // ръчно избрана икона има превес над авто-разпознатата
  const icoBtns = [];
  const markActive = () => {
    const act = manualIco || detectTaskIcon(inp.value);
    icoBtns.forEach(([b,e]) => b.classList.toggle("act", e===act));
  };
  const icoRow = h("div",{class:"icoPick",role:"group","aria-label":"Икона на задачата"},
    TASK_ICONS.map((it) => {
      const b = h("button",{type:"button",class:"icoBtn","aria-label":"Икона "+it.e,
        onclick:()=>{ manualIco = manualIco===it.e ? null : it.e; markActive(); }}, it.e);
      icoBtns.push([b,it.e]);
      return b;
    }));
  inp.addEventListener("input", markActive);
  const add = () => {
    const t = inp.value.trim(); if (!t) return;
    const ico = manualIco || detectTaskIcon(t);
    if (existing) {
      state.tasks[key]=(state.tasks[key]||[]).map((x)=>x.id===existing.id?{...x,t,time:time.value,ico}:x);
      editingTask=null;
    } else {
      state.tasks[key]=[...(state.tasks[key]||[]),{id:Date.now(),t,time:time.value,ico,done:false}];
      addingTask=false;
    }
    save(); render();
  };
  inp.addEventListener("keydown",(e)=>e.key==="Enter"&&add());
  requestAnimationFrame(markActive);
  return h("div",{class:"addForm"},inp,time,icoRow,
    h("button",{class:"btn",onclick:add},existing?"Запази":"Добави"),
    h("button",{class:"btnGhost",onclick:()=>{addingTask=false;editingTask=null;render();}},"Откажи"));
}

/* ---------- ПЛАН (под-табове: Хранене / Спорт / Контент) ---------- */
function viewPlan() {
  const subs = [["food","Хранене"],["train","Спорт"],["content","Контент"]];
  return h("section",null,
    h("div",{class:"subTabs"},subs.map(([id,lbl])=>
      h("button",{class:`subTab ${planSub===id?"act":""}`,onclick:()=>{planSub=id;openMeal=null;openEx=null;render();}},lbl))),
    planSub==="food" ? planFood() : planSub==="train" ? planTrain() : planContent());
}

function planFood() {
  const key = dk(cur), o = dayChecks(key);
  const m = monthData(cur);
  const meals = mealsFor(cur);
  if (!meals) return h("div",{class:"card hint"},h("p",null,"Няма меню за този месец. Добави data файл (виж README)."));
  const names = (m&&m.mealTypes)||["Закуска","Обяд","Следобед","Вечеря"];
  return [
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},`Меню · ${DOW[cur.getDay()].toLowerCase()}`),
      h("button",{class:"editToggle",onclick:()=>{editPlan=!editPlan;render();}},editPlan?"Готово":"Редактирай")),
    m&&m.macros ? h("p",{class:"secS"},m.macros) : null,
    meals.map((e,a)=>
      h("div",{class:`card meal ${o[`meal${a}`]?"done":""}`,"data-scroll":`meal${a}`},
        h("button",{class:"mealHead",onclick:()=>{openMeal=openMeal===a?null:a;render();}},
          h("div",{class:"mealHeadL"},
            h("span",{class:"eyebrow"},names[a]),
            h("span",{class:"mealN"},e.n),
            h("div",{class:"chips"},e.dev.map((t)=>h("span",{class:"chip"},t))),
            h("div",{class:"fuel"},"🔥 ",mealBenefit(e))),
          h("span",{class:`car ${openMeal===a?"up":""}`},icon("chev",16))),
        openMeal===a ? h("div",{class:"mealBody"},
          editPlan ? mealEditForm(key,a,e) : [
            h("span",{class:"lbl"},"Продукти"),
            h("p",{class:"ing"},e.ing),
            h("span",{class:"lbl"},"Приготвяне"),
            h("ol",{class:"steps"},e.steps.map((t)=>h("li",null,t)))]) : null,
        h("div",{class:"mealFoot"},
          h("span",null,o[`meal${a}`]?"Изядено ✓":"Отметни, когато е изядено"),
          checkBtn(!!o[`meal${a}`],()=>toggleCheck(`meal${a}`))))),
    m&&m.mealRotations ? h("div",{class:"card hint"},h("strong",null,"Ротации:"),h("p",null,m.mealRotations)) : null];
}
function mealEditForm(key,idx,meal) {
  const nInp = h("input",{class:"inp",value:meal.n,placeholder:"Име на ястието"});
  const iInp = h("textarea",{class:"ta",rows:2,placeholder:"Продукти"},meal.ing||"");
  const sInp = h("textarea",{class:"ta",rows:4,placeholder:"Стъпки — по една на ред"},(meal.steps||[]).join("\n"));
  return h("div",null,
    h("span",{class:"lbl"},"Редакция само за тази дата"),
    nInp, h("div",{style:"height:6px"}), iInp, h("div",{style:"height:6px"}), sInp,
    h("div",{class:"addForm"},
      h("button",{class:"btn",onclick:()=>{
        const ed={...dayEdits(key)}; ed.meals={...(ed.meals||{})};
        ed.meals[idx]={n:nInp.value.trim()||meal.n,ing:iInp.value.trim(),steps:sInp.value.split("\n").map(s=>s.trim()).filter(Boolean)};
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Запази"),
      h("button",{class:"btnGhost",onclick:()=>{
        const ed={...dayEdits(key)};
        if(ed.meals){delete ed.meals[idx]; if(!Object.keys(ed.meals).length) delete ed.meals;}
        state.edits={...state.edits,[key]:ed}; save(); render();
      }},"Върни оригинала")));
}

function planTrain() {
  const key = dk(cur), o = dayChecks(key);
  const m = monthData(cur);
  const w = workoutFor(cur);
  const day = challengeDay(cur);
  const P = w ? w.ex.filter((_,i)=>o[`ex${i}`]).length : 0;
  const N = w ? w.ex.length : 0;
  const done = w && P===N && N>0;
  return [
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},`Тренировка · Ден ${day}`),
      h("button",{class:"editToggle",onclick:()=>{editPlan=!editPlan;render();}},editPlan?"Готово":"Редактирай")),
    editPlan ? workoutEditForm(key,w) :
    !w ? h("div",{class:"card restCard","data-scroll":"__workout"},icon("flame",26),
        h("strong",null,"Почивен ден"),
        h("p",null,(m&&m.restNote)||"Крачките са активното възстановяване."),
        h("p",{class:"secS"},"Дисциплината включва и почивка. Жаравата тлее — не гасне."))
      : h("div",{"data-scroll":"__workout"},
         h("p",{class:"secS"},`${w.t} · ~${w.dur} мин ${w.note?"· "+w.note:""}`),
         h("div",{class:"exProg"},h("div",{class:"exProgBar",style:`width:${N?P/N*100:0}%`})),
         w.ex.map(([name,reps],t)=>
           h("div",{class:`card ex ${o[`ex${t}`]?"done":""}`},
             h("div",{class:"exRow"},
               h("button",{class:"exHead",onclick:()=>{openEx=openEx===t?null:t;render();}},
                 h("span",{class:"exN"},name),h("span",{class:"exR"},reps)),
               checkBtn(!!o[`ex${t}`],()=>toggleCheck(`ex${t}`))),
             openEx===t&&EX_DESC[name] ? h("p",{class:"exDesc"},EX_DESC[name]) : null)),
         done ? h("div",{class:"doneBanner"},"Тренировката е завършена. Жаравата гори. 🔥") : null),
    h("div",{class:"card hint"},
      h("strong",null,"Внимавай за:"),
      h("p",null,"Остра/режеща болка в кръста (не мускулна умора) — спри упражнението веднага и мини на по-лека вариация. Постоянна умора или лош сън — намали интензивността 2–3 дни. Загрявка ВИНАГИ: 5 мин — ставни кръгове, cat-cow ×8, glute bridge ×10, bird-dog ×6/страна."))];
}
function workoutEditForm(key,w) {
  const tInp = h("input",{class:"inp",value:w?w.t:"",placeholder:"Име на тренировката"});
  const dInp = h("input",{class:"inp time",value:w?String(w.dur):"40",placeholder:"мин"});
  const nInp = h("input",{class:"inp",value:w?(w.note||""):"",placeholder:"Бележка"});
  const eInp = h("textarea",{class:"ta",rows:6,placeholder:"Упражнения — по едно на ред: Име | серии×повт."},
    w?w.ex.map(([a,b])=>`${a} | ${b}`).join("\n"):"");
  return h("div",{class:"card"},
    h("span",{class:"lbl"},"Редакция само за тази дата"),
    h("div",{class:"addForm"},tInp,dInp),
    h("div",{style:"height:6px"}),nInp,h("div",{style:"height:6px"}),eInp,
    h("div",{class:"addForm"},
      h("button",{class:"btn",onclick:()=>{
        const ex=eInp.value.split("\n").map(l=>l.split("|").map(s=>s.trim())).filter(p=>p[0]).map(p=>[p[0],p[1]||""]);
        const ed={...dayEdits(key)};
        ed.workout=ex.length?{t:tInp.value.trim()||"Тренировка",dur:parseInt(dInp.value)||40,note:nInp.value.trim(),ex}: "rest";
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Запази"),
      h("button",{class:"btnOut",onclick:()=>{
        const ed={...dayEdits(key)}; ed.workout="rest";
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Почивен ден"),
      h("button",{class:"btnGhost",onclick:()=>{
        const ed={...dayEdits(key)}; delete ed.workout;
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Оригинал")));
}
const EX_DESC = {
  "Лицеви опори на наклон":"Ръце на ръба на маса или пейка, тяло в права линия. Свали гърдите към ръба с лакти под ~45°, избутай нагоре. Коремът стегнат — кръстът не провисва.",
  "Планк":"Опора на предмишници и пръсти, тяло в права линия. Стегни корем и седалище. Ако кръстът провисне — прекрати серията.",
  "Bird-dog":"На четири крака, гръб неутрален. Изпъни едновременно противоположна ръка и крак, задръж 2 сек, върни бавно.",
  "Dead bug":"Легнал по гръб, ръце нагоре, колене на 90°. Спусни противоположна ръка и крак почти до пода — кръстът остава притиснат.",
  "Side plank":"Лакът точно под рамото, тяло в права линия, таз повдигнат. По-лека версия: от колене.",
  "Glute bridge":"Легнал по гръб, свити колене. Повдигни таза, стискай седалището горе 1 сек. Качваш през глутеуса, не чрез извиване на кръста.",
  "Glute bridge на един крак":"Като моста, но единият крак е изпънат. Тазът остава хоризонтален.",
  "Клекове с телесно тегло":"Стъпала на ширина на раменете. Седни назад и надолу с прав гръб, тежест в петите.",
  "Reverse lunges":"Крачка назад, задното коляно към пода, торсът изправен. Връщаш се през предната пета.",
  "Повдигане на пръсти":"Повдигни се на пръсти максимално, задръж 1 сек, спусни бавно.",
  "Гоблет клек с дъмбел":"Дъмбелът на гърди с две ръце. Клек с прав гръб, лактите между коленете долу.",
  "Румънска мъртва тяга (леки дъмбели)":"ПЪРВОТО директно натоварване на кръста: неутрален гръб, движение от тазобедрената става, бавно. При най-малък дискомфорт → glute bridge.",
};

function planContent() {
  const key = dk(cur), o = dayChecks(key);
  const m = monthData(cur);
  const cont = contentFor(cur);
  const day = challengeDay(cur);
  const next = addDays(cur,1);
  const nc = next<=END ? contentFor(next) : null;
  return [
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},`Контент · Ден ${day}`),
      h("button",{class:"editToggle",onclick:()=>{editPlan=!editPlan;render();}},editPlan?"Готово":"Редактирай")),
    editPlan ? contentEditForm(key,cont) :
    !cont ? h("div",{class:"card hint"},h("p",null,"Няма контент план за тази дата.")) :
    cont.rest ?
      h("div",{class:"card restCard","data-scroll":"content"},icon("cam",24),
        h("strong",null,"Без пост днес"),
        h("p",null,cont.d||"Производствен ден.")) :
      h("div",{class:`card contCard ${o.content?"done":""}`,"data-scroll":"content"},
        h("div",{class:"chips"},h("span",{class:"chip hot"},cont.f),cont.p?h("span",{class:"chip"},cont.p):null,cont.len?h("span",{class:"chip"},cont.len):null),
        cont.when?h("p",{class:"secS",style:"margin-top:8px"},"⏰ "+cont.when):null,
        h("span",{class:"lbl"},"Hook"),h("p",{class:"hook"},`„${cont.h}“`),
        h("span",{class:"lbl"},"Концепция"),h("p",{class:"contD"},cont.d),
        cont.c?[h("span",{class:"lbl"},"CTA"),h("p",{class:"contD"},cont.c)]:null,
        cont.extra?[h("span",{class:"lbl"},"Батч задачи"),h("p",{class:"contD"},cont.extra)]:null,
        h("div",{class:"mealFoot"},
          h("span",null,o.content?"Публикувано ✓":"Отметни при публикуване"),
          checkBtn(!!o.content,()=>toggleCheck("content")))),
    nc&&!editPlan ? h("div",{class:"card hint"},
      h("strong",null,`Утре${nc.f?" ("+nc.f+")":""}:`),
      h("p",null,nc.rest?(nc.d||"Без пост"):nc.h)) : null,
    m&&m.videoRules&&!editPlan ? h("div",{class:"card hint"},
      h("strong",null,"Правила за watch rate (важат за всяко видео):"),
      h("ol",{class:"rules"},m.videoRules.map((r)=>h("li",null,r)))) : null];
}
function contentEditForm(key,cont) {
  const fInp = h("input",{class:"inp",value:cont&&!cont.rest?(cont.f||""):"",placeholder:"Формат (напр. Видео · Шаблон A)"});
  const hInp = h("textarea",{class:"ta",rows:2,placeholder:"Hook"},cont&&!cont.rest?(cont.h||""):"");
  const dInp = h("textarea",{class:"ta",rows:4,placeholder:"Концепция / описание"},cont?(cont.d||""):"");
  const cInp = h("textarea",{class:"ta",rows:2,placeholder:"CTA"},cont&&!cont.rest?(cont.c||""):"");
  return h("div",{class:"card"},
    h("span",{class:"lbl"},"Редакция само за тази дата"),
    fInp,h("div",{style:"height:6px"}),hInp,h("div",{style:"height:6px"}),dInp,h("div",{style:"height:6px"}),cInp,
    h("div",{class:"addForm"},
      h("button",{class:"btn",onclick:()=>{
        const ed={...dayEdits(key)};
        ed.content={f:fInp.value.trim()||"Видео",h:hInp.value.trim(),d:dInp.value.trim(),c:cInp.value.trim()};
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Запази"),
      h("button",{class:"btnOut",onclick:()=>{
        const ed={...dayEdits(key)}; ed.content={rest:true,d:dInp.value.trim()||"Без пост."};
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Без пост"),
      h("button",{class:"btnGhost",onclick:()=>{
        const ed={...dayEdits(key)}; delete ed.content;
        state.edits={...state.edits,[key]:ed}; save(); editPlan=false; render();
      }},"Оригинал")));
}

/* ---------- КАЛЕНДАР ---------- */
function viewCalendar() {
  const [yy,mm] = calMonth.split("-").map(Number);
  const first = new Date(yy,mm-1,1);
  const today = clampDate(new Date());
  const daysInMonth = new Date(yy,mm,0).getDate();
  const lead = (first.getDay()+6)%7;
  const cells = [];
  for (let i=0;i<lead;i++) cells.push(h("div",{class:"calCell empty"}));
  for (let dnum=1;dnum<=daysInMonth;dnum++) {
    const dt = new Date(yy,mm-1,dnum);
    const inRange = dt>=START&&dt<=END;
    const future = dt>today;
    const sc = (!inRange||future)?0:dayScore(dt);
    const lvl = future?0:sc>=0.999?4:sc>=0.7?3:sc>=0.4?2:sc>0?1:0;
    const w = inRange?workoutFor(dt):null;
    const c = inRange?contentFor(dt):null;
    const hasTasks = (state.tasks[dk(dt)]||[]).length>0;
    cells.push(h("div",{
      class:`calCell ${lvl?"l"+lvl:""} ${future?"future":""} ${dk(dt)===dk(today)?"today":""} ${dk(dt)===dk(cur)?"sel":""}`,
      style:`animation-delay:${(lead+dnum)*12}ms`,
      title:`${dnum} ${MON[mm-1]}${inRange?` · ${Math.round(sc*100)}%`:""}`,
      onclick:inRange?()=>{ cur=dt; tab="today"; render(); window.scrollTo(0,0); }:null},
      h("span",{class:"cd"},String(dnum)),
      h("div",{class:"calDots"},
        w?h("i",{class:"dW"}):null,
        c&&!c.rest?h("i",{class:"dV"}):null,
        hasTasks?h("i",{class:"dT"}):null)));
  }
  const monthKeys = ["2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"];
  const mi = monthKeys.indexOf(calMonth);
  const mLabel = MON_F[mm-1]+" "+yy;
  const mData = MONTHS[calMonth];
  return h("section",null,
    h("div",{class:"calHead"},
      h("button",{class:"navBtn",disabled:mi<=0,onclick:()=>{calMonth=monthKeys[mi-1];render();}},
        h("span",{style:"transform:rotate(180deg);display:inline-flex"},icon("chev",16))),
      h("div",{style:"text-align:center"},
        h("div",{class:"calMon"},mLabel),
        mData?h("div",{class:"secHint"},mData.theme||mData.label):h("div",{class:"secHint"},"няма зареден план")),
      h("button",{class:"navBtn",disabled:mi>=monthKeys.length-1,onclick:()=>{calMonth=monthKeys[mi+1];render();}},icon("chev",16))),
    h("div",{class:"calDows"},DOW_S.map((d)=>h("span",null,d))),
    h("div",{class:"calGrid"},cells),
    h("div",{class:"calLegend"},
      h("span",null,h("i",{style:"background:var(--ember)"}),"тренировка"),
      h("span",null,h("i",{style:"background:var(--amber)"}),"видео"),
      h("span",null,h("i",{style:"background:#8d8177"}),"твоя задача")),
    h("p",{class:"secS",style:"text-align:center;margin-top:10px"},"Цветът на клетката = % изпълнен ден. Докосни ден, за да го отвориш."));
}

/* ---------- ПРОГРЕС ---------- */
function viewProgress() {
  const today = clampDate(new Date());
  const tot = totals();
  const totalDays = challengeDay(today);
  let streak = 0, t = new Date(today);
  while (challengeDay(t)>=1 && dayScore(t)>=0.6) { streak++; t = addDays(t,-1); }
  const best = bestStreak();
  let sum = 0;
  for (let dd=new Date(START); dd<=today; dd=addDays(dd,1)) sum += dayScore(dd);
  const avg = totalDays?Math.round((sum/totalDays)*100):0;

  const bars = [];
  const curMonday = addDays(today,-((today.getDay()+6)%7));
  for (let wk=7;wk>=0;wk--) {
    const mon = addDays(curMonday,-7*wk);
    let s=0,n=0;
    for (let i=0;i<7;i++){ const dd=addDays(mon,i); if(dd<START||dd>today)continue; s+=dayScore(dd); n++; }
    const pct = n?Math.round((s/n)*100):0;
    bars.push(h("div",{class:"barCol"},
      h("span",{class:"barVal"},n?pct+"%":"–"),
      h("div",{class:"barFill",style:`height:${Math.max(pct,2)}%`}),
      h("span",{class:"barLbl"},`${mon.getDate()} ${MON[mon.getMonth()]}`)));
  }

  // тегло
  const wKeys = Object.keys(state.weights).sort();
  const wInp = h("input",{class:"inp",type:"number",step:"0.1",placeholder:"тегло кг (напр. 87.2)"});
  let sparkEl = null, wDelta = null;
  if (wKeys.length>=1) {
    const vals = wKeys.map((k)=>state.weights[k]);
    const mn=Math.min(...vals),mx=Math.max(...vals),range=(mx-mn)||1;
    const Wd=320,Hg=64,pad=6;
    const pts = vals.map((v,i)=>[pad+i*(Wd-2*pad)/Math.max(vals.length-1,1),Hg-pad-((v-mn)/range)*(Hg-2*pad)]);
    const path = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
    const sv = svgEl("svg",{class:"spark",viewBox:`0 0 ${Wd} ${Hg}`,preserveAspectRatio:"none"});
    if (pts.length>1) sv.appendChild(svgEl("path",{d:path,fill:"none",stroke:"url(#wg)","stroke-width":"2.5","stroke-linecap":"round"}));
    const defs = svgEl("defs",{}); const g = svgEl("linearGradient",{id:"wg",x1:0,y1:0,x2:1,y2:0});
    g.appendChild(svgEl("stop",{offset:"0%","stop-color":"#FF4D14"})); g.appendChild(svgEl("stop",{offset:"100%","stop-color":"#FFB86B"}));
    defs.appendChild(g); sv.appendChild(defs);
    pts.forEach((p)=>sv.appendChild(svgEl("circle",{cx:p[0],cy:p[1],r:3,fill:"#FFB86B"})));
    sparkEl = sv;
    if (vals.length>=2) {
      const d = vals[vals.length-1]-vals[0];
      wDelta = h("p",{class:"wDelta"},`${vals[0]} кг → ${vals[vals.length-1]} кг (${d>0?"+":""}${d.toFixed(1)} кг от началото)`);
    }
  }

  return h("section",null,
    h("h2",{class:"secT"},"Прогрес · 180 дни"),
    h("div",{class:"progGrid"},
      h("div",{class:"stat"},h("b",null,String(streak)),h("span",null,"текуща серия (дни)")),
      h("div",{class:"stat"},h("b",null,String(best)),h("span",null,"най-дълга серия")),
      h("div",{class:"stat"},h("b",null,avg+"%"),h("span",null,"средно изпълнение")),
      h("div",{class:"stat"},h("b",null,String(tot.workouts)),h("span",null,"тренировки"))),
    h("h2",{class:"secT"},"Постижения"),
    h("div",{class:"badges"},BADGES.map((b)=>{
      const on = b.test(state);
      return h("div",{class:`badge ${on?"on":""}`},h("span",{class:"bi"},b.ico),h("span",null,b.name));
    })),
    h("h2",{class:"secT"},"Седмици"),
    h("div",{class:"card"},h("div",{class:"barChart"},bars)),
    h("h2",{class:"secT"},"Тегло"),
    h("div",{class:"card"},
      h("div",{class:"wRow"},wInp,
        h("button",{class:"btn",onclick:()=>{
          const v=parseFloat(wInp.value); if(!v||v<30||v>250)return;
          state.weights={...state.weights,[dk(clampDate(new Date()))]:v}; save(); render();
        }},"Запиши")),
      sparkEl, wDelta,
      h("p",{class:"secS",style:"margin-top:8px"},"Записвай веднъж седмично (напр. неделя сутрин). Мерките > кантара — но кривата показва тенденцията.")),
    h("h2",{class:"secT"},"Навици · общо"),
    [...state.habitsGood,...state.habitsBad].map((e)=>
      h("div",{class:"card streakRow"},
        h("span",{class:"habN"},e.name),
        h("span",{class:"streakVal"},icon("flame",14),
          e.id===READING_ID?`${totalPages()} страници`:`${habitCount(e.id)} пъти`))),
    h("h2",{class:"secT"},"Данни"),
    cloudSection(),
    exportNudge(),
    h("p",{class:"secS"},"Всичко се пази локално на това устройство. Свали резервно копие или прехвърли на друго устройство."),
    h("div",{class:"dataBtns"},
      h("button",{class:"btn",onclick:exportData},"Експорт (JSON)"),
      h("button",{class:"btnOut",onclick:importData},"Импорт")));
}
/* ---------- облак: вход/изход + статус (Firebase) ---------- */
function cloudSection() {
  const cloud = window.ZHARAVA_CLOUD;
  if (!cloud || !cloud.enabled) return h("div",{class:"card hint"},
    h("strong",null,"Облачна синхронизация"),
    h("p",null,"Не е настроена — данните живеят само на това устройство. Настройката е безплатна и отнема 10 мин (виж README, раздел Firebase)."));
  const user = cloud.user();
  if (!user) return h("div",{class:"card"},
    h("strong",null,"Облачна синхронизация"),
    h("p",{class:"secS",style:"margin:6px 0 10px"},"Влез с Google и всяка отметка се пази в облака и се появява на всичките ти устройства."),
    h("button",{class:"btn",onclick:()=>cloud.signIn()},"Вход с Google"));
  return h("div",{class:"card"},
    h("strong",null,"Облачна синхронизация · включена"),
    h("p",{class:"secS",style:"margin:6px 0 10px"},`Влязъл си като ${user.email||user.displayName||"Google акаунт"}. Данните се синхронизират автоматично.`),
    h("button",{class:"btnGhost",onclick:()=>cloud.signOutUser()},"Изход"));
}
function exportData() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a = h("a",{href:URL.createObjectURL(blob),download:`zharava-backup-${dk(new Date())}.json`});
  document.body.appendChild(a); a.click(); a.remove();
  state.lastExport = dk(new Date()); save(); render();
}
function exportNudge() {
  const daysWithData = Object.keys(state.checks).length;
  if (daysWithData < 3) return null;
  const last = state.lastExport ? new Date(state.lastExport+"T00:00:00") : null;
  const stale = !last || (new Date() - last) / 864e5 >= 7;
  if (!stale) return null;
  return h("div",{class:"card nudge"},
    h("strong",null,"Време е за резервно копие"),
    h("p",null, last
      ? `Последен експорт: ${last.getDate()} ${MON[last.getMonth()]}. Данните живеят само на това устройство — свали копие.`
      : "Още нямаш резервно копие, а данните живеят само на това устройство. Свали едно за секунди."));
}
function importData() {
  const inp = h("input",{type:"file",accept:"application/json",style:"display:none"});
  inp.addEventListener("change",()=>{
    const f=inp.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const s=JSON.parse(rd.result);
        if(!s.checks&&!s.refl&&!s.tasks)throw 0;
        state={checks:s.checks||{},refl:s.refl||{},tasks:s.tasks||{},weights:s.weights||{},shopping:s.shopping||{},shopExtra:s.shopExtra||{},edits:s.edits||{},reading:s.reading||{},
          habitsGood:s.habitsGood||DEFAULT_HABITS_GOOD.slice(),habitsBad:s.habitsBad||DEFAULT_HABITS_BAD.slice()};
        migrateReading(state); save(); render();
      }catch(e){alert("Файлът не е валидно резервно копие на Жарава.");}
    };
    rd.readAsText(f);
  });
  document.body.appendChild(inp); inp.click(); inp.remove();
}

/* ---------- НАВИЦИ ---------- */
function viewHabits() {
  const key = dk(cur);
  const o = dayChecks(key);
  // специален ред: четенето се въвежда със страници за деня (сам избираш колко си прочел)
  const readingRow = (e,kind)=>{
    const pages = readPages(key);
    const totalNode = h("span",{class:"habS"},`днес ${pages} стр · общо ${totalPages()} страници`);
    const inp = h("input",{class:"pageInp",type:"number",inputmode:"numeric",min:"0",placeholder:"0",value:pages||"","aria-label":"Прочетени страници днес"});
    const refresh = ()=>{ totalNode.textContent = `днес ${readPages(key)} стр · общо ${totalPages()} страници`; };
    inp.addEventListener("input",()=>{ setReadPages(key, parseInt(inp.value,10)||0); refresh(); });
    inp.addEventListener("change",()=>render());
    const step = (d)=>{ const nv=Math.max(0,(parseInt(inp.value,10)||0)+d); inp.value=nv||""; setReadPages(key,nv); render(); };
    return h("div",{class:`card habitRow reading ${kind==="bad"?"bad":""} ${pages>0?"done":""}`},
      h("div",{class:"habL"},
        h("span",{class:"habN"},e.name),
        totalNode),
      h("div",{class:"pageStep"},
        h("button",{class:"stepBtn",type:"button","aria-label":"−5 страници",onclick:()=>step(-5)},"−"),
        inp,
        h("button",{class:"stepBtn",type:"button","aria-label":"+5 страници",onclick:()=>step(5)},"+")));
  };
  const rows = (list,kind,suffix)=>list.map((e)=>
    (e.id===READING_ID && kind==="good" && !editHabits)
    ? readingRow(e,kind)
    : h("div",{class:`card habitRow ${kind==="bad"?"bad":""} ${o[e.id]?"done":""}`},
      h("div",{class:"habL"},
        h("span",{class:"habN"},e.name),
        h("span",{class:"habS"},e.id===READING_ID?`${totalPages()} страници`:`${habitCount(e.id)} ${suffix}`)),
      editHabits
        ? h("button",{class:"del","aria-label":"Изтрий навик",onclick:()=>{
            const f=kind==="good"?"habitsGood":"habitsBad";
            const idx=state[f].findIndex((x)=>x.id===e.id);
            const removed=state[f][idx];
            state[f]=state[f].filter((x)=>x.id!==e.id); save(); render();
            showToast(`Изтрит навик: ${removed.name}`, ()=>{
              const arr=state[f].slice(); arr.splice(Math.min(idx,arr.length),0,removed);
              state[f]=arr; save(); render();
            });
          }},icon("x",15))
        : checkBtn(!!o[e.id],()=>toggleCheck(e.id))));
  const addRow = (kind,ph)=>{
    const inp=h("input",{class:"inp",placeholder:ph});
    const add=()=>{
      const t=inp.value.trim(); if(!t)return;
      const f=kind==="good"?"habitsGood":"habitsBad";
      state[f]=[...state[f],{id:(kind==="good"?"hgX":"hbX")+Date.now(),name:t}];
      save(); render();
    };
    inp.addEventListener("keydown",(e)=>e.key==="Enter"&&add());
    return h("div",{class:"addForm"},inp,h("button",{class:"btn",onclick:add},"Добави"));
  };
  return h("section",null,
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},"Изграждам"),
      h("button",{class:"editToggle",onclick:()=>{editHabits=!editHabits;render();}},editHabits?"Готово":"Редактирай")),
    rows(state.habitsGood,"good","пъти"),
    editHabits?addRow("good","Нов навик за изграждане"):null,
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},"Премахвам ",h("span",{class:"secHint"},"отметни = избегнато днес"))),
    rows(state.habitsBad,"bad","пъти избегнато"),
    editHabits?addRow("bad","Нов навик за премахване"):null);
}

/* ---------- ПАЗАР (интерактивен списък, разделен на 2 пазарувания в седмицата) ---------- */
const SHOP_TRIPS = [
  { id:1, label:"Пазаруване 1 · началото на седмицата", hint:"трайни продукти + прясно за първите дни" },
  { id:2, label:"Пазаруване 2 · сряда/четвъртък", hint:"ново прясно месо, зеленчуци и плодове — точно навреме за края на седмицата, без да се развалят" },
];
const shopGroups = (m, tripId) => (m.shopping||[]).filter((g) => (g.trip||0) === tripId);
function shopCard(groups, shopChecks, toggleShop) {
  return h("div",{class:"card"},
    groups.map((grp)=>[
      h("div",{class:"shopCat"},grp.cat),
      grp.items.map((it,i)=>{
        const id = (grp.trip||0)+"·"+grp.cat+"·"+i; // trip в ключа, за да не се сблъскват еднакви категории в различните пазарувания
        return h("div",{class:`shopItem ${shopChecks[id]?"on":""}`},
          checkBtn(!!shopChecks[id],()=>toggleShop(id),true),
          h("span",null,it));
      })]));
}
function viewShop() {
  const m = monthData(cur);
  const monday = addDays(cur,-((cur.getDay()+6)%7));
  const shopKey = dk(monday);
  const shopChecks = state.shopping[shopKey]||{};
  const toggleShop = (id) => {
    const t={...shopChecks}; if(t[id])delete t[id]; else t[id]=true;
    state.shopping={...state.shopping,[shopKey]:t}; save(); render();
  };
  const extra = state.shopExtra[shopKey]||[];

  if (!m || !m.shopping) return h("section",null,
    h("h2",{class:"secT"},"Пазар"),
    h("div",{class:"card hint"},h("p",null,"Няма пазарски списък за този месец.")),
    shopExtraSection(shopKey, extra));

  const staples = shopGroups(m,0);
  return h("section",null,
    h("h2",{class:"secT"},"Пазар ",h("span",{class:"secHint"},`седмица от ${monday.getDate()} ${MON[monday.getMonth()]}`)),
    h("p",{class:"secS"},"Разделен на две пазарувания, за да купуваш прясно месо, зеленчуци и плодове точно когато ти трябват."),
    SHOP_TRIPS.map((trip) => {
      const groups = shopGroups(m, trip.id);
      if (!groups.length) return null;
      return h("div",null,
        h("h3",{class:"shopTripT"},trip.label),
        h("p",{class:"secS"},trip.hint),
        shopCard(groups, shopChecks, toggleShop));
    }),
    staples.length ? h("div",null,
      h("h3",{class:"shopTripT"},"По всяко време ",h("span",{class:"secHint"},"веднъж месечно")),
      shopCard(staples, shopChecks, toggleShop)) : null,
    shopExtraSection(shopKey, extra));
}
function shopExtraSection(shopKey, extra) {
  const inp = h("input",{class:"inp",placeholder:"Добави нещо друго за пазаруване…"});
  const who = h("input",{class:"inp",style:"flex:0 0 128px;min-width:96px",placeholder:"от кого? (по избор)"});
  const add = () => {
    const t = inp.value.trim(); if (!t) return;
    const item = { id:Date.now(), t, who: who.value.trim(), done:false };
    state.shopExtra = { ...state.shopExtra, [shopKey]: [...(state.shopExtra[shopKey]||[]), item] };
    save(); render();
  };
  inp.addEventListener("keydown",(e)=>e.key==="Enter"&&add());
  who.addEventListener("keydown",(e)=>e.key==="Enter"&&add());
  const toggleExtra = (id) => {
    state.shopExtra = { ...state.shopExtra, [shopKey]: (state.shopExtra[shopKey]||[]).map((x)=>x.id===id?{...x,done:!x.done}:x) };
    save(); render();
  };
  const delExtra = (id) => {
    const removed = extra.find((x)=>x.id===id);
    state.shopExtra = { ...state.shopExtra, [shopKey]: extra.filter((x)=>x.id!==id) };
    save(); render();
    if (removed) showToast(`Изтрито: ${removed.t}`, ()=>{
      state.shopExtra = { ...state.shopExtra, [shopKey]: [...(state.shopExtra[shopKey]||[]), removed] };
      save(); render();
    });
  };
  return h("div",null,
    h("h3",{class:"shopTripT"},"Допълнително ",h("span",{class:"secHint"},"твои неща или молба от близък")),
    h("div",{class:"card"},
      extra.length ? extra.map((it)=>
        h("div",{class:`shopItem extra ${it.done?"on":""}`},
          checkBtn(!!it.done,()=>toggleExtra(it.id),true),
          h("span",null, it.t, it.who?h("i",{class:"shopWho"},` · ${it.who}`):null),
          h("button",{class:"del","aria-label":"Изтрий артикул",onclick:()=>delExtra(it.id)},icon("x",13)))
      ) : h("p",{class:"secS",style:"margin:0 0 10px"},"Все още няма добавени артикули — впиши каквото ти трябва (или каквото поиска половинката ти)."),
      h("div",{class:"addForm"}, inp, who, h("button",{class:"btn",onclick:add},"Добави"))));
}

/* ---------- рамка ---------- */
function ring(pct,day) {
  const C = 2*Math.PI*26;
  const wrap = h("div",{class:"ring"});
  const sv = svgEl("svg",{width:72,height:72,viewBox:"0 0 72 72"});
  sv.appendChild(svgEl("circle",{cx:36,cy:36,r:26,fill:"none",stroke:"var(--line)","stroke-width":5}));
  const arc = svgEl("circle",{cx:36,cy:36,r:26,fill:"none",stroke:"url(#emberGrad)","stroke-width":5,"stroke-linecap":"round",
    "stroke-dasharray":C,"stroke-dashoffset":C*(1-pct),transform:"rotate(-90 36 36)"});
  arc.style.transition="stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)";
  if(pct>0)arc.style.filter="drop-shadow(0 0 5px rgba(255,77,20,.55))";
  sv.appendChild(arc);
  const defs=svgEl("defs",{});const grad=svgEl("linearGradient",{id:"emberGrad",x1:0,y1:0,x2:1,y2:1});
  grad.appendChild(svgEl("stop",{offset:"0%","stop-color":"#FF4D14"}));
  grad.appendChild(svgEl("stop",{offset:"100%","stop-color":"#FFB86B"}));
  defs.appendChild(grad);sv.appendChild(defs);
  wrap.appendChild(sv);
  wrap.appendChild(h("div",{class:"ringLbl"},h("span",{class:"ringDay"},String(day)),h("span",{class:"ringOf"},"/180")));
  return wrap;
}
// от "Днес" -> отваря съответния под-раздел на "План" и скролва точно до него
function goToPlan(sub, itemId) {
  tab = "plan"; planSub = sub;
  if (itemId && itemId.indexOf("meal") === 0) openMeal = parseInt(itemId.slice(4), 10);
  pendingScroll = itemId || null;
  render();
}
function navDay(delta) {
  const a = addDays(cur,delta);
  if (a>=START&&a<=END){cur=a;openMeal=null;openEx=null;editPlan=false;editingTask=null;addingTask=false;render();}
}

function render() {
  const root = document.getElementById("root");
  const key = dk(cur), day = challengeDay(cur), workday = isWorkday(cur);
  const pct = dayScore(cur);
  const isToday = key===dk(clampDate(new Date()));
  document.documentElement.style.setProperty("--glow",pct.toFixed(2));

  const chevLeft = h("span",{style:"transform:rotate(180deg);display:inline-flex"},icon("chev",16));
  const header = h("header",{class:"hdr"},
    h("div",{class:"hdrTop"},
      h("div",{class:"brand"},icon("flame",16),h("span",{class:"brandTxt"},"ХЪСЪЛ")),
      h("span",{class:`sync ${syncLbl.indexOf("грешка")===0?"err":""}`},syncLbl)),
    h("div",{class:"hdrMain"},
      ring(Math.max(pct,0.02),day),
      h("div",{class:"hdrInfo"},
        h("div",{class:"dateNav"},
          h("button",{class:"navBtn","aria-label":"Предишен ден",disabled:day<=1,onclick:()=>navDay(-1)},chevLeft),
          h("div",{class:"dateLbl dateLblWrap"},
            h("input",{type:"date",class:"dateInputOverlay",min:dk(START),max:dk(END),value:key,"aria-label":"Избери дата",
              onchange:(e)=>{ if(!e.target.value)return;
                cur=clampDate(new Date(e.target.value+"T00:00:00"));
                openMeal=null;openEx=null;editPlan=false;render(); }}),
            h("strong",null,DOW[cur.getDay()]),
            h("span",null,`${cur.getDate()} ${MON[cur.getMonth()]} · ${workday?"работен ден":"почивен ден"}`)),
          h("button",{class:"navBtn","aria-label":"Следващ ден",disabled:key===dk(END),onclick:()=>navDay(1)},icon("chev",16))),
        h("div",{class:"hdrMeta"},
          h("span",{class:"pct"},`${Math.round(pct*100)}% от деня`),
          !isToday?h("button",{class:"todayBtn",onclick:()=>{cur=clampDate(new Date());scrollToNow=true;render();}},"към днес"):null))));

  const views = { today:viewToday, plan:viewPlan, shop:viewShop, calendar:viewCalendar, habits:viewHabits, progress:viewProgress };
  const main = h("main",{class:`main ${tab!==lastTab?"viewIn":""}`},views[tab]());
  lastTab = tab;
  const nav = h("nav",{class:"nav"},
    [["today","flame","Днес"],["plan","bowl","План"],["shop","cart","Пазар"],["calendar","cal","Календар"],["habits","habit","Навици"],["progress","chart","Прогрес"]]
      .map(([id,ic,lbl])=>h("button",{class:`navTab ${tab===id?"act":""}`,
        onclick:()=>{tab=id;editPlan=false;editingTask=null;addingTask=false;
          if(id==="calendar")calMonth=mk(cur);
          if(id==="today")scrollToNow=true;
          render();window.scrollTo(0,0);}},
        icon(ic,20),h("span",null,lbl))));

  root.replaceChildren(header,main,nav);

  // дошли сме от "Днес" по конкретна задача -> скролваме право до нея, не отгоре
  if (pendingScroll) {
    const target = pendingScroll; pendingScroll = null;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-scroll="${target}"]`);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      else window.scrollTo(0, 0);
    });
  }
  // еднократен автоскрол до текущия момент от деня
  else if (scrollToNow && tab === "today" && isToday) {
    scrollToNow = false;
    requestAnimationFrame(() => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin < 9 * 60) return; // сутрин планът и без това започва отгоре
      const rows = [...document.querySelectorAll(".tl [data-time]")];
      const target = rows.find((r) => parseTimeMin(r.dataset.time) >= nowMin) || rows[rows.length - 1];
      if (target) target.scrollIntoView({ block: "center" });
    });
  }
}

/* ---------- swipe за смяна на деня (Днес и План) ---------- */
(function initSwipe() {
  let x0 = 0, y0 = 0, t0 = 0;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (tab !== "today" && tab !== "plan") return;
    if (e.target.closest("input,textarea,.icoPick,.calGrid")) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Date.now() - t0 > 600) return;                       // бавно влачене = скрол
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 2) return;
    navDay(dx < 0 ? 1 : -1);
    window.scrollTo(0, 0);
  }, { passive: true });
})();

/* ---------- мост към облачната синхронизация (firebase-sync.js) ---------- */
window.ZHARAVA_APP = {
  getState: () => state,
  setSync,
  rerender: render,
  // данни от облака: пишем само в localStorage (без save(), за да не ги качим обратно)
  applyRemoteState: (s) => {
    state = normalizeState(s);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    prevPct = dayScore(cur);
    render();
  },
};

setSync("запазено");
prevPct = dayScore(cur);
initEmbers();
render();
})();


