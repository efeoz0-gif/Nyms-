import { auth, db, googleProvider, ADMIN_EMAIL } from "./firebase-config.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Kullanıcı adından basit bir "tag" üretir (örn: efe#4821)
export function generateTag() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Bir auth kullanıcısı için Firestore profili yoksa oluşturur, varsa son görülmeyi günceller.
// Hem Google girişi hem email/şifre (doğrulama sonrası) akışı bunu kullanır.
export async function createOrRefreshProfile(user, { displayNameOverride } = {}) {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    const baseUsername = (displayNameOverride || user.displayName || user.email.split("@")[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "kullanici";

    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: displayNameOverride || user.displayName || baseUsername,
      username: baseUsername,
      tag: generateTag(),
      photoURL: user.photoURL || null,
      status: "online",           // online | idle | dnd | invisible
      customStatus: "",
      isAdmin: user.email === ADMIN_EMAIL,
      isBanned: false,
      isMuted: false,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
  } else {
    await updateDoc(userRef, {
      lastSeen: serverTimestamp(),
      status: "online"
    });
  }
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await createOrRefreshProfile(result.user);
  return result.user;
}

export async function signOutUser() {
  const user = auth.currentUser;
  if (user) {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { status: "invisible", lastSeen: serverTimestamp() });
  }
  await signOut(auth);
}

export async function updateStatus(status) {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, "users", user.uid), { status });
}

export async function updateCustomStatus(text) {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, "users", user.uid), { customStatus: text });
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export function watchAuthState(onLogin, onLogout) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      if (profile?.isBanned) {
        alert("Hesabınız yasaklanmış. Giriş yapamazsınız.");
        await signOutUser();
        onLogout();
        return;
      }
      onLogin(user, profile);
    } else {
      onLogout();
    }
  });
}
