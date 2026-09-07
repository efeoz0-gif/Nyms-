import { auth, db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// --- Kullanıcı arama (username#tag ile) ---
export async function findUserByUsernameTag(username, tag) {
  const q = query(
    collection(db, "users"),
    where("username", "==", username.toLowerCase()),
    where("tag", "==", tag)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

// --- Engelli mi kontrolü (istek göndermeden önce şart) ---
async function isBlockedEitherWay(uidA, uidB) {
  const a = await getDoc(doc(db, "users", uidA, "blocked", uidB));
  const b = await getDoc(doc(db, "users", uidB, "blocked", uidA));
  return a.exists() || b.exists();
}

// --- Arkadaşlık isteği gönder ---
export async function sendFriendRequest(targetUid) {
  const me = auth.currentUser;
  if (!me || me.uid === targetUid) throw new Error("Geçersiz istek");

  if (await isBlockedEitherWay(me.uid, targetUid)) {
    throw new Error("Bu kullanıcıyla arkadaşlık isteği gönderilemiyor");
  }

  const meProfile = await getDoc(doc(db, "users", me.uid));
  const reqId = `${me.uid}_${targetUid}`;
  await setDoc(doc(db, "friendRequests", reqId), {
    from: me.uid,
    to: targetUid,
    fromUsername: meProfile.data().username,
    fromTag: meProfile.data().tag,
    fromPhoto: meProfile.data().photoURL || null,
    status: "pending",
    createdAt: serverTimestamp()
  });
}

// --- İsteği kabul et: iki tarafın da friends alt koleksiyonuna ekler ---
export async function acceptFriendRequest(requestId, fromUid, toUid) {
  await setDoc(doc(db, "users", toUid, "friends", fromUid), { since: serverTimestamp() });
  await setDoc(doc(db, "users", fromUid, "friends", toUid), { since: serverTimestamp() });
  await deleteDoc(doc(db, "friendRequests", requestId));
}

export async function declineFriendRequest(requestId) {
  await deleteDoc(doc(db, "friendRequests", requestId));
}

export async function removeFriend(myUid, friendUid) {
  await deleteDoc(doc(db, "users", myUid, "friends", friendUid));
  await deleteDoc(doc(db, "users", friendUid, "friends", myUid));
}

// --- Engelleme: engellenen kişi otomatik arkadaşlıktan çıkar ---
export async function blockUser(myUid, targetUid) {
  await setDoc(doc(db, "users", myUid, "blocked", targetUid), { since: serverTimestamp() });
  await deleteDoc(doc(db, "users", myUid, "friends", targetUid)).catch(() => {});
  await deleteDoc(doc(db, "users", targetUid, "friends", myUid)).catch(() => {});
  // Aradaki bekleyen istekleri de temizle
  await deleteDoc(doc(db, "friendRequests", `${myUid}_${targetUid}`)).catch(() => {});
  await deleteDoc(doc(db, "friendRequests", `${targetUid}_${myUid}`)).catch(() => {});
}

export async function unblockUser(myUid, targetUid) {
  await deleteDoc(doc(db, "users", myUid, "blocked", targetUid));
}

// --- Canlı dinleyiciler (real-time güncellenen listeler) ---
export function listenIncomingRequests(myUid, callback) {
  const q = query(collection(db, "friendRequests"), where("to", "==", myUid), where("status", "==", "pending"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function listenFriends(myUid, callback) {
  return onSnapshot(collection(db, "users", myUid, "friends"), async (snap) => {
    const friends = await Promise.all(snap.docs.map(async (d) => {
      const profile = await getDoc(doc(db, "users", d.id));
      return { uid: d.id, ...profile.data() };
    }));
    callback(friends);
  });
}

export function listenBlocked(myUid, callback) {
  return onSnapshot(collection(db, "users", myUid, "blocked"), async (snap) => {
    const blocked = await Promise.all(snap.docs.map(async (d) => {
      const profile = await getDoc(doc(db, "users", d.id));
      return { uid: d.id, ...profile.data() };
    }));
    callback(blocked);
  });
}
