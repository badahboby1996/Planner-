/* ============================================================
   ЖАРАВА · ОБЛАЧНА СИНХРОНИЗАЦИЯ (Firebase Auth + Firestore)
   - Работи "върху" localStorage: локалното винаги е първо,
     облакът е резервно копие + мост между устройствата.
   - Състоянието се пази като един документ: planners/{uid}
     (целият state като JSON низ — прост, стабилен, < 1 MB).
   - Конфликт между устройства: печели по-новият updatedAt,
     НО празно състояние никога не изтрива реални данни.
   - Без попълнен firebase-config.js модулът стои изключен
     и приложението е 100% каквото беше досега.
   ============================================================ */
(function () {
"use strict";

const cfg = window.ZHARAVA_FIREBASE_CONFIG || {};
const configured = !!(cfg.apiKey && cfg.projectId);
const sdkLoaded = typeof firebase !== "undefined" && firebase.initializeApp;

// стъб, когато облакът не е настроен — app.js проверява .enabled
if (!configured || !sdkLoaded) {
  window.ZHARAVA_CLOUD = {
    enabled: false,
    reason: !sdkLoaded ? "Firebase SDK не се зареди (няма мрежа?)" : "не е конфигуриран",
    active: () => false, user: () => null,
    signIn: () => {}, signOutUser: () => {}, push: () => {},
  };
  return;
}

firebase.initializeApp(cfg);
const auth = firebase.auth();
const db = firebase.firestore();

// офлайн кеш на Firestore — четенията работят и без мрежа
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

let currentUser = null;
let unsubscribe = null;   // слушателят на документа
let pushTimer = null;
let lastPushedAt = 0;     // за да не прилагаме собствения си запис обратно
let lastError = null;     // последната грешка (за диагностика)
let lastPushOk = null;    // час на последния успешен запис в облака
let lastPullOk = null;    // час на последното успешно четене от облака
const errText = (err) => (err && (err.code || err.message)) || String(err);

const app = () => window.ZHARAVA_APP; // изложено от app.js
const docRef = (uid) => db.collection("planners").doc(uid);
const setSync = (t) => { const a = app(); if (a) a.setSync(t); };

// има ли реални потребителски данни (отметки, задачи, тегло…) —
// празно състояние никога не бива да замени пълно
function hasData(s) {
  return !!s && ["checks","refl","tasks","weights","reading","edits","shopping","shopExtra"]
    .some((k) => s[k] && Object.keys(s[k]).length > 0);
}
function parseRemote(remote) {
  try { return JSON.parse(remote.data); } catch (e) { return null; }
}

/* ---------- запис към облака (вика се от save() в app.js) ---------- */
function push(state) {
  if (!currentUser) return;
  clearTimeout(pushTimer);
  setSync("синхронизира…");
  pushTimer = setTimeout(() => {
    // празно състояние без история не получава пресен печат,
    // за да не "победи" реалните данни от друго устройство
    const at = state.updatedAt || (hasData(state) ? Date.now() : 0);
    lastPushedAt = at;
    docRef(currentUser.uid).set({
      data: JSON.stringify(state), updatedAt: at,
      at: firebase.firestore.FieldValue.serverTimestamp(),
    })
      .then(() => { lastPushOk = new Date(); lastError = null; setSync("в облака ✓"); })
      .catch((err) => { lastError = "запис: " + errText(err);
        setSync(err && err.code === "permission-denied"
          ? "грешка: Firestore правила" : "локално (офлайн)"); });
  }, 800);
}

/* ---------- първо сливане + живо слушане ---------- */
function startListening(uid) {
  stopListening();
  let first = true;
  unsubscribe = docRef(uid).onSnapshot({ includeMetadataChanges: false }, (snap) => {
    const a = app(); if (!a) return;
    const local = a.getState();
    const localAt = local.updatedAt || 0;

    lastPullOk = new Date();
    if (!snap.exists) {
      // нов акаунт → качваме локалните данни
      if (first) { first = false; push(local); }
      return;
    }
    const remote = snap.data();
    const remoteAt = remote.updatedAt || 0;
    const remoteState = parseRemote(remote);

    // повреден или празен облак при пълно локално → локалното печели винаги
    if (!remoteState || (!hasData(remoteState) && hasData(local))) {
      if (first || (!snap.metadata.hasPendingWrites && remoteAt !== lastPushedAt)) push(local);
      first = false;
      return;
    }

    if (first) {
      first = false;
      if (!hasData(local) && hasData(remoteState)) applyRemote(remoteState); // ново устройство
      else if (remoteAt > localAt) applyRemote(remoteState);
      else if (localAt > remoteAt) push(local);
      else setSync("в облака ✓");
      return;
    }
    // промяна от друго устройство (нашите записи имат pendingWrites или същия updatedAt)
    if (snap.metadata.hasPendingWrites) return;
    if (remoteAt > localAt && remoteAt !== lastPushedAt) applyRemote(remoteState);
  }, (err) => { lastError = "четене: " + errText(err);
    setSync(err && err.code === "permission-denied"
      ? "грешка: Firestore правила" : "грешка в облака"); });
}
function applyRemote(remoteState) {
  const a = app();
  // предпазен колан: пазим копие на локалното преди да го заменим
  try {
    const local = a.getState();
    if (hasData(local)) localStorage.setItem("zharava-backup-before-cloud", JSON.stringify(local));
  } catch (e) {}
  a.applyRemoteState(remoteState);
  setSync("в облака ✓");
}
function stopListening() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } }

/* ---------- вход / изход ---------- */
function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((err) => {
    lastError = "вход: " + errText(err);
    // на телефон/PWA попъпът често е блокиран → redirect
    if (err && (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment"
        || err.code === "auth/cancelled-popup-request")) {
      auth.signInWithRedirect(provider).catch((e2) => { lastError = "вход: " + errText(e2); setSync("грешка при вход"); });
    } else if (err && err.code === "auth/unauthorized-domain") {
      setSync("грешка: домейнът не е разрешен");
      alert("Firebase: добави badahboby1996.github.io в Authentication → Settings → Authorized domains.");
    } else if (err && err.code !== "auth/popup-closed-by-user") {
      setSync("грешка при вход");
    }
    const a = app(); if (a) a.rerender();
  });
}
function signOutUser() { auth.signOut().catch(() => {}); }

auth.getRedirectResult().catch((err) => { lastError = "вход: " + errText(err); });
auth.onAuthStateChanged((user) => {
  currentUser = user || null;
  if (user) { startListening(user.uid); }
  else { stopListening(); setSync("не си влязъл"); }
  const a = app(); if (a) a.rerender();
});

const fmtT = (d) => d ? d.toLocaleTimeString("bg-BG",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "още не";
window.ZHARAVA_CLOUD = {
  enabled: true,
  active: () => !!currentUser,
  user: () => currentUser,
  signIn, signOutUser, push,
  debug: () => ({
    user: currentUser ? (currentUser.email || currentUser.uid) : "не си влязъл",
    listening: !!unsubscribe,
    lastPushOk: fmtT(lastPushOk),
    lastPullOk: fmtT(lastPullOk),
    lastError: lastError || "няма",
  }),
};
})();
