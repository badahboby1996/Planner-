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
const DEFAULT_HABITS_GOOD = [
  { id: "hg0", name: "Ставане 05:30–06:00" }, { id: "hg1", name: "Развиване на умение" },
  { id: "hg2", name: "Четене 20 страници" }, { id: "hg3", name: "Спорт / движение" },
  { id: "hg4", name: "Здравословно готвене" }];
const DEFAULT_HABITS_BAD = [
  { id: "hb0", name: "Безцелно скролване" }, { id: "hb1", name: "Телефон в спалнята" },
  { id: "hb2", name: "Късно ядене" }, { id: "hb3", name: "Нездравословна храна" },
  { id: "hb4", name: "Късно лягане" }, { id: "hb5", name: "Мързел / отлагане" }];

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
let saveTimer = null, syncLbl = "локално";
let prevPct = 0;

function loadState() {
  const empty = { checks:{}, refl:{}, tasks:{}, weights:{}, shopping:{}, edits:{},
    habitsGood: DEFAULT_HABITS_GOOD.slice(), habitsBad: DEFAULT_HABITS_BAD.slice() };
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) { // миграция от v1
      const old = localStorage.getItem(LS_KEY_V1);
      if (old) { const s = JSON.parse(old); return { ...empty, checks:s.checks||{}, refl:s.refl||{}, tasks:s.tasks||{}, habitsGood:s.habitsGood||empty.habitsGood, habitsBad:s.habitsBad||empty.habitsBad }; }
      return empty;
    }
    const s = JSON.parse(raw);
    return { ...empty, ...s,
      habitsGood: s.habitsGood || empty.habitsGood, habitsBad: s.habitsBad || empty.habitsBad };
  } catch (e) { return empty; }
}
function save() {
  clearTimeout(saveTimer); setSync("запис…");
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); setSync("запазено"); }
    catch (e) { setSync("грешка при запис"); }
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
// Контент за конкретна дата
function contentFor(dateObj) {
  const key = dk(dateObj), ed = dayEdits(key);
  if (ed.content) return ed.content;
  const m = monthData(dateObj);
  if (!m) return null;
  return m.content[dateObj.getDate()] || null;
}
function weekThemeFor(dateObj) {
  const m = monthData(dateObj);
  if (!m || !m.weekThemes) return null;
  const d = dateObj.getDate();
  return m.weekThemes.find((w) => d >= w.from && d <= w.to) || null;
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
    onclick:(ev)=>{ if(!on) burst(ev.clientX,ev.clientY); onTap(ev); }});
  const sv = svgEl("svg",{viewBox:"0 0 24 24",width:small?14:17,height:small?14:17});
  sv.appendChild(svgEl("path",{d:"M5 12.5l4.2 4.2L19 7",fill:"none",stroke:"currentColor","stroke-width":"3","stroke-linecap":"round","stroke-linejoin":"round"}));
  b.appendChild(sv);
  return b;
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
  const N = Math.min(48, Math.round(W()/12));
  for (let i=0;i<N;i++) embers.push({
    x: Math.random()*W(), y: Math.random()*H(),
    r: 1+Math.random()*2.8, vy: .25+Math.random()*.85, vx:(Math.random()-.5)*.3,
    a: .35+Math.random()*.55, tw: Math.random()*Math.PI*2 });
  let last = 0;
  (function loop(ts) {
    requestAnimationFrame(loop);
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
  const refls = Object.values(state.refl).filter((i)=>i.rate||i.plus||i.minus||i.note).length;
  return { workouts, meals, refls, videos };
}
function habitStreak(id, from) {
  let a = 0, t = new Date(from);
  while (challengeDay(t) >= 1 && dayChecks(dk(t))[id]) { a++; t = addDays(t,-1); }
  return a;
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
  const theme = weekThemeFor(cur);
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
      items.push({ id:`meal${i}`, time:times[i], t:`${names[i]} · ${meal.n}`, s:meal.dev.join(" · "), k:"food", nav:["plan","food"] });
      if (i===0 && workday) items.push({ id:"__leave", time:"09:10", t:"Тръгване за работа", k:"info" });
      if (i===2 && workday) items.push({ id:"__home", time:"19:30", t:"Прибиране", k:"info" });
    });
  }
  if (cont && !cont.rest) items.push({ id:"content", time:"21:00", t:`Контент · ${cont.f}`, s:cont.h, k:"cam", nav:["plan","content"] });
  else if (cont && cont.rest) items.push({ id:"content", time:"21:00", t:"Контент · без пост", s:cont.d.slice(0,60)+"…", k:"cam", nav:["plan","content"] });
  items.push({ id:"evening", time:"22:00", t:"Вечерна рутина", s:"Телефон извън спалнята · 20 страници четене", k:"habit" });
  const icoMap = { habit:"habit", food:"bowl", train:"train", cam:"cam", info:"chev" };

  const statEls = [];
  const stat = (val,lbl) => { const b = h("b",null,"0"); statEls.push([b,val]); return h("div",{class:"stat"},b,h("span",null,lbl)); };

  const sec = h("section", null,
    theme ? h("div",{class:"themeBan"}, h("b",null,"ТЕМА НА СЕДМИЦАТА"), theme.t) : null,
    h("div",{class:"stats"}, stat(tot.workouts,"тренировки"), stat(tot.meals,"хранения"), stat(tot.videos,"видеа"), stat(tot.refls,"рефлексии")),
    h("h2",{class:"secT"},"Планът за деня"),
    h("div",{class:"tl"},
      items.map((e) => e.k==="info"
        ? h("div",{class:"tlInfo"}, h("span",{class:"tlTime"},e.time), h("span",null,e.t))
        : h("div",{class:`tlItem ${(e.id==="__workout"?e.done:o[e.id])?"done":""}`},
            h("span",{class:"tlTime"},e.time),
            h("div",{class:"tlIco"},icon(icoMap[e.k],17)),
            h("button",{class:"tlBody",onclick:()=>{ if(e.nav){ tab=e.nav[0]; planSub=e.nav[1]; render(); window.scrollTo(0,0);} }},
              h("span",{class:"tlT"},e.t),
              e.s ? h("span",{class:"tlS"},e.s) : null),
            e.id==="__workout"
              ? checkBtn(e.done,()=>{ tab="plan"; planSub="train"; render(); window.scrollTo(0,0); })
              : checkBtn(!!o[e.id],()=>toggleCheck(e.id)))),
      tasks.map((e) =>
        h("div",{class:`tlItem custom ${e.done?"done":""}`},
          h("span",{class:"tlTime"},e.time||"—"),
          h("div",{class:"tlIco"},icon("plus",15)),
          h("div",{class:"tlBody"},h("span",{class:"tlT"},e.t),h("span",{class:"tlS"},"твоя задача")),
          checkBtn(e.done,()=>{ state.tasks[key]=tasks.map((t)=>t.id===e.id?{...t,done:!t.done}:t); save(); render(); }),
          h("button",{class:"del","aria-label":"Изтрий",onclick:()=>{ state.tasks[key]=tasks.filter((t)=>t.id!==e.id); save(); render(); }},icon("x",13))))),
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
function taskForm(key) {
  const inp = h("input",{class:"inp",placeholder:"Задача (напр. подстрижка)"});
  const time = h("input",{class:"inp time",placeholder:"час"});
  const add = () => {
    const t = inp.value.trim(); if (!t) return;
    state.tasks[key]=[...(state.tasks[key]||[]),{id:Date.now(),t,time:time.value,done:false}];
    addingTask=false; save(); render();
  };
  inp.addEventListener("keydown",(e)=>e.key==="Enter"&&add());
  return h("div",{class:"addForm"},inp,time,
    h("button",{class:"btn",onclick:add},"Добави"),
    h("button",{class:"btnGhost",onclick:()=>{addingTask=false;render();}},"Откажи"));
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
      h("div",{class:`card meal ${o[`meal${a}`]?"done":""}`},
        h("button",{class:"mealHead",onclick:()=>{openMeal=openMeal===a?null:a;render();}},
          h("div",{class:"mealHeadL"},
            h("span",{class:"eyebrow"},names[a]),
            h("span",{class:"mealN"},e.n),
            h("div",{class:"chips"},e.dev.map((t)=>h("span",{class:"chip"},t)))),
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
    !w ? h("div",{class:"card restCard"},icon("flame",26),
        h("strong",null,"Почивен ден"),
        h("p",null,(m&&m.restNote)||"Крачките са активното възстановяване."),
        h("p",{class:"secS"},"Дисциплината включва и почивка. Жаравата тлее — не гасне."))
      : [h("p",{class:"secS"},`${w.t} · ~${w.dur} мин ${w.note?"· "+w.note:""}`),
         h("div",{class:"exProg"},h("div",{class:"exProgBar",style:`width:${N?P/N*100:0}%`})),
         w.ex.map(([name,reps],t)=>
           h("div",{class:`card ex ${o[`ex${t}`]?"done":""}`},
             h("div",{class:"exRow"},
               h("button",{class:"exHead",onclick:()=>{openEx=openEx===t?null:t;render();}},
                 h("span",{class:"exN"},name),h("span",{class:"exR"},reps)),
               checkBtn(!!o[`ex${t}`],()=>toggleCheck(`ex${t}`))),
             openEx===t&&EX_DESC[name] ? h("p",{class:"exDesc"},EX_DESC[name]) : null)),
         done ? h("div",{class:"doneBanner"},"Тренировката е завършена. Жаравата гори. 🔥") : null],
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
      h("div",{class:"card restCard"},icon("cam",24),
        h("strong",null,"Без пост днес"),
        h("p",null,cont.d||"Производствен ден.")) :
      h("div",{class:`card contCard ${o.content?"done":""}`},
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
    h("h2",{class:"secT"},"Серии по навици"),
    state.habitsGood.map((e)=>
      h("div",{class:"card streakRow"},
        h("span",{class:"habN"},e.name),
        h("span",{class:"streakVal"},icon("flame",14),`${habitStreak(e.id,today)} дни`))),
    h("h2",{class:"secT"},"Данни"),
    h("p",{class:"secS"},"Всичко се пази локално на това устройство. Свали резервно копие или прехвърли на друго устройство."),
    h("div",{class:"dataBtns"},
      h("button",{class:"btn",onclick:exportData},"Експорт (JSON)"),
      h("button",{class:"btnOut",onclick:importData},"Импорт")));
}
function exportData() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a = h("a",{href:URL.createObjectURL(blob),download:`zharava-backup-${dk(new Date())}.json`});
  document.body.appendChild(a); a.click(); a.remove();
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
        state={checks:s.checks||{},refl:s.refl||{},tasks:s.tasks||{},weights:s.weights||{},shopping:s.shopping||{},edits:s.edits||{},
          habitsGood:s.habitsGood||DEFAULT_HABITS_GOOD.slice(),habitsBad:s.habitsBad||DEFAULT_HABITS_BAD.slice()};
        save(); render();
      }catch(e){alert("Файлът не е валидно резервно копие на Жарава.");}
    };
    rd.readAsText(f);
  });
  document.body.appendChild(inp); inp.click(); inp.remove();
}

/* ---------- НАВИЦИ (+ пазарски списък) ---------- */
function viewHabits() {
  const key = dk(cur), o = dayChecks(key);
  const m = monthData(cur);
  const rows = (list,kind,suffix)=>list.map((e)=>
    h("div",{class:`card habitRow ${kind==="bad"?"bad":""} ${o[e.id]?"done":""}`},
      h("div",{class:"habL"},
        h("span",{class:"habN"},e.name),
        h("span",{class:"habS"},`${habitStreak(e.id,cur)} ${suffix}`)),
      editHabits
        ? h("button",{class:"del","aria-label":"Изтрий навик",onclick:()=>{
            const f=kind==="good"?"habitsGood":"habitsBad";
            state[f]=state[f].filter((x)=>x.id!==e.id); save(); render();
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
  // пазарски списък — отметките се пазят на седмица (ключ = понеделник)
  const monday = addDays(cur,-((cur.getDay()+6)%7));
  const shopKey = dk(monday);
  const shopChecks = state.shopping[shopKey]||{};
  const toggleShop=(id)=>{
    const t={...shopChecks}; if(t[id])delete t[id]; else t[id]=true;
    state.shopping={...state.shopping,[shopKey]:t}; save(); render();
  };
  return h("section",null,
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},"Изграждам"),
      h("button",{class:"editToggle",onclick:()=>{editHabits=!editHabits;render();}},editHabits?"Готово":"Редактирай")),
    rows(state.habitsGood,"good","дни поред"),
    editHabits?addRow("good","Нов навик за изграждане"):null,
    h("div",{class:"secTRow"},
      h("h2",{class:"secT"},"Премахвам ",h("span",{class:"secHint"},"отметни = избегнато днес"))),
    rows(state.habitsBad,"bad","дни чисто"),
    editHabits?addRow("bad","Нов навик за премахване"):null,
    m&&m.shopping?[
      h("h2",{class:"secT"},"Пазар за седмицата ",h("span",{class:"secHint"},`седмица от ${monday.getDate()} ${MON[monday.getMonth()]}`)),
      h("div",{class:"card"},
        m.shopping.map((grp)=>[
          h("div",{class:"shopCat"},grp.cat),
          grp.items.map((it,i)=>{
            const id=grp.cat+"·"+i;
            return h("div",{class:`shopItem ${shopChecks[id]?"on":""}`},
              checkBtn(!!shopChecks[id],()=>toggleShop(id),true),
              h("span",null,it));
          })]))]:null);
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
function navDay(delta) {
  const a = addDays(cur,delta);
  if (a>=START&&a<=END){cur=a;openMeal=null;openEx=null;editPlan=false;render();}
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
      h("div",{class:"brand"},icon("flame",16),h("span",null,"ЖАРАВА")),
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
          !isToday?h("button",{class:"todayBtn",onclick:()=>{cur=clampDate(new Date());render();}},"към днес"):null))));

  const views = { today:viewToday, plan:viewPlan, calendar:viewCalendar, habits:viewHabits, progress:viewProgress };
  const main = h("main",{class:"main"},views[tab]());
  const nav = h("nav",{class:"nav"},
    [["today","flame","Днес"],["plan","bowl","План"],["calendar","cal","Календар"],["habits","habit","Навици"],["progress","chart","Прогрес"]]
      .map(([id,ic,lbl])=>h("button",{class:`navTab ${tab===id?"act":""}`,
        onclick:()=>{tab=id;editPlan=false;if(id==="calendar")calMonth=mk(cur);render();window.scrollTo(0,0);}},
        icon(ic,20),h("span",null,lbl))));

  root.replaceChildren(header,main,nav);
}

setSync("запазено");
prevPct = dayScore(cur);
initEmbers();
render();
})();


