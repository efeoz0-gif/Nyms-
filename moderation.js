import { auth, db } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function getFullProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function isCurrentUserAdmin() {
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  return snap.exists() && snap.data().isAdmin === true;
}

// Firestore Rules zaten bu işlemleri sadece isAdmin()==true olan hesaba izin veriyor;
// buradaki fonksiyonlar admin olmayan biri çağırırsa "permission denied" ile döner.
export async function banUser(uid) {
  await updateDoc(doc(db, "users", uid), { isBanned: true });
}
export async function unbanUser(uid) {
  await updateDoc(doc(db, "users", uid), { isBanned: false });
}
export async function muteUser(uid) {
  await updateDoc(doc(db, "users", uid), { isMuted: true });
}
export async function unmuteUser(uid) {
  await updateDoc(doc(db, "users", uid), { isMuted: false });
}
export async function setUserTitle(uid, title) {
  await updateDoc(doc(db, "users", uid), { title: title.slice(0, 24) });
}
export async function setUserNickname(uid, newUsername) {
  const clean = newUsername.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  if (!clean) throw new Error("Geçersiz kullanıcı adı");
  await updateDoc(doc(db, "users", uid), { username: clean });
}
export async function setUserNameColor(uid, hexColor) {
  await updateDoc(doc(db, "users", uid), { nameColor: hexColor });
}
export async function clearUserNameColor(uid) {
  await updateDoc(doc(db, "users", uid), { nameColor: null });
}
