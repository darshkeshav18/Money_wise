// ============================================================
//  MoneyWise — Firebase Integration Layer
//  Replaces localStorage with Firebase Auth + Firestore
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── CONFIG ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCYNGGSeFvF-5qF4rcT1bNGL2w57aLisac",
  authDomain: "moneywise-e86c7.firebaseapp.com",
  projectId: "moneywise-e86c7",
  storageBucket: "moneywise-e86c7.firebasestorage.app",
  messagingSenderId: "227605767301",
  appId: "1:227605767301:web:e1a2e5c2b4bd3c2fc0b5ec"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── EXPOSE TO GLOBAL SCOPE (used by app.js) ────────────────
window._fb = { auth, db, doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, where, writeBatch, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged };

// ─── USER DOC HELPER ────────────────────────────────────────
function userDoc(uid) {
  return doc(db, "users", uid);
}

// ─── SAVE ENTIRE STATE TO FIRESTORE ─────────────────────────
window.saveStateToCloud = async function() {
  const user = auth.currentUser;
  if (!user || state.user.isGuest) return;

  try {
    await setDoc(userDoc(user.uid), {
      username: state.user.username,
      profile: state.profile || null,
      expenses: state.expenses,
      subscriptions: state.subscriptions,
      goals: state.goals,
      preferences: state.preferences,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Firestore save error:", err);
    showToast("Cloud sync failed. Data saved locally.", "warning");
    // Fallback to localStorage
    _localSave();
  }
};

// ─── LOAD STATE FROM FIRESTORE ───────────────────────────────
window.loadStateFromCloud = async function(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      state.profile = data.profile || null;
      state.expenses = data.expenses || [];
      state.subscriptions = data.subscriptions || [];
      state.goals = data.goals || [];
      if (data.preferences) state.preferences = data.preferences;
      if (data.username) state.user.username = data.username;
      return true;
    }
    return false;
  } catch (err) {
    console.error("Firestore load error:", err);
    return false;
  }
};

// ─── LOCAL FALLBACK ──────────────────────────────────────────
function _localSave() {
  localStorage.setItem('mw_user', JSON.stringify(state.user));
  if (state.profile) localStorage.setItem('mw_profile', JSON.stringify(state.profile));
  localStorage.setItem('mw_expenses', JSON.stringify(state.expenses));
  localStorage.setItem('mw_subscriptions', JSON.stringify(state.subscriptions));
  localStorage.setItem('mw_goals', JSON.stringify(state.goals));
  localStorage.setItem('mw_preferences', JSON.stringify(state.preferences));
}

// ─── AUTH STATE WATCHER — boots the app ─────────────────────
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    // User is signed in
    state.user = {
      loggedIn: true,
      username: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      isGuest: false
    };

    const hasData = await loadStateFromCloud(firebaseUser.uid);

    document.getElementById('auth-overlay').style.display = 'none';

    if (hasData && state.profile) {
      document.getElementById('onboarding-overlay').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      syncAppProfileUI();
      renderAll();
    } else {
      document.getElementById('onboarding-overlay').style.display = 'flex';
      goToOnboardStep(1);
    }

    initTheme();
    lucide.createIcons();

  } else {
    // Not signed in — check for guest session
    const guestSession = localStorage.getItem('mw_guest_session');
    if (guestSession) {
      const guestData = JSON.parse(guestSession);
      state.user = { loggedIn: true, username: 'Guest User', isGuest: true };
      if (guestData.profile) state.profile = guestData.profile;
      state.expenses = guestData.expenses || [];
      state.subscriptions = guestData.subscriptions || [];
      state.goals = guestData.goals || [];

      document.getElementById('auth-overlay').style.display = 'none';
      if (state.profile) {
        document.getElementById('onboarding-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        syncAppProfileUI();
        renderAll();
      } else {
        document.getElementById('onboarding-overlay').style.display = 'flex';
        goToOnboardStep(1);
      }
      initTheme();
      lucide.createIcons();
    } else {
      document.getElementById('auth-overlay').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
      document.getElementById('onboarding-overlay').style.display = 'none';
    }
  }
});

