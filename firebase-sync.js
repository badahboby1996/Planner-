/* ============================================================
   ЖАРАВА · ОБЛАЧНА СИНХРОНИЗАЦИЯ (Firebase Auth + Firestore)
   - Работи "върху" localStorage: локалното винаги е първо,
     облакът е резервно копие + мост между устройствата.
   - Състоянието се пази като един документ: planners/{uid}
     (целият state като JSON низ — прост, стабилен, < 1 MB).
   - Конфликт между устройства: печели по-новият updatedAt.
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

const app = () => window.ZHARAVA_APP; // изложено от app.js
const docRef = (uid) => db.collection("planners").doc(uid);
const setSync = (t) => { const a = app(); if (a) a.setSync(t); };

function serialize(state) {
  return { data: JSON.stringify(state), updatedAt: state.updatedAt || Date.now(),
           at: firebase.firestore.FieldValue.serverTimestamp() };
}

/* ---------- запис към облака (вика се от save() в app.js) ---------- */
function push(state) {
  if (!currentUser) return;
  clearTimeout(pushTimer);
  setSync("синхронизира…");
  pushTimer = setTimeout(() => {
    const payload = serialize(state);
    lastPushedAt = payload.updatedAt;
    docRef(currentUser.uid).set(payload)
      .then(() => setSync("в облака ✓"))
      .catch(() => setSync("локално (офлайн)"));
  }, 800);
}

/* ---------- първо сливане + живо слушане ---------- */
function startListening(uid) {
  stopListening();
  let first = true;
  unsubscribe = docRef(uid).onSnapshot((snap) => {
    const a = app(); if (!a) return;
    const local = a.getState();
    const localAt = local.updatedAt || 0;

    if (!snap.exists) {
      // нов акаунт → качваме локалните данни
      if (first) { first = false; push(local); }
      return;
    }
    const remote = snap.data();
    const remoteAt = remote.updatedAt || 0;

    if (first) {
      first = false;
      if (remoteAt > localAt) applyRemote(remote);
      else if (localAt > remoteAt) push(local);
      else setSync("в облака ✓");
      return;
    }
    // промяна от друго устройство (нашите записи имат pendingWrites или същия updatedAt)
    if (snap.metadata.hasPendingWrites) return;
    if (remoteAt > localAt && remoteAt !== lastPushedAt) applyRemote(remote);
  }, () => setSync("грешка в облака"));
}
function applyRemote(remote) {
  try {
    const s = JSON.parse(remote.data);
    app().applyRemoteState(s);
    setSync("в облака ✓");
  } catch (e) { setSync("грешка в облака"); }
}
function stopListening() { if (unsubscribe) { unsubscribe(); unsubscribe = null; } }

/* ---------- вход / изход ---------- */
function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((err) => {
    // на телефон/PWA попъпът често е блокиран → redirect
    if (err && (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment"
        || err.code === "auth/cancelled-popup-request")) {
      auth.signInWithRedirect(provider).catch(() => setSync("грешка при вход"));
    } else if (err && err.code !== "auth/popup-closed-by-user") {
      setSync("грешка при вход");
    }
  });
}
function signOutUser() { auth.signOut().catch(() => {}); }

auth.getRedirectResult().catch(() => {});
auth.onAuthStateChanged((user) => {
  currentUser = user || null;
  if (user) { startListening(user.uid); }
  else { stopListening(); setSync("локално"); }
  const a = app(); if (a) a.rerender();
});

window.ZHARAVA_CLOUD = {
  enabled: true,
  active: () => !!currentUser,
  user: () => currentUser,
  signIn, signOutUser, push,
};
})();
