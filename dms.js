import { auth, db } from "./firebase-config.js";
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 1:1 DM için iki uid'den her zaman aynı deterministik id üretir (çift kayıt oluşmasın diye)
function directThreadId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

export async function getThread(threadId) {
  const snap = await getDoc(doc(db, "dmThreads", threadId));
  return snap.exists() ? { id: threadId, ...snap.data() } : null;
}

export async function getOrCreateDirectThread(otherUid) {
  const me = auth.currentUser;
  const threadId = directThreadId(me.uid, otherUid);
  const ref = doc(db, "dmThreads", threadId);
  const existing = await getDoc(ref);
  if (existing.exists()) return threadId;

  const [myProfile, otherProfile] = await Promise.all([
    getDoc(doc(db, "users", me.uid)),
    getDoc(doc(db, "users", otherUid))
  ]);

  await setDoc(ref, {
    type: "direct",
    memberUids: [me.uid, otherUid],
    memberInfo: {
      [me.uid]: pickProfile(myProfile.data()),
      [otherUid]: pickProfile(otherProfile.data())
    },
    name: null,
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: ""
  });
  return threadId;
}

export async function createGroupThread(memberUids, name) {
  const me = auth.currentUser;
  const allUids = [...new Set([me.uid, ...memberUids])];

  const profiles = await Promise.all(allUids.map(uid => getDoc(doc(db, "users", uid))));
  const memberInfo = {};
  profiles.forEach((snap, i) => { memberInfo[allUids[i]] = pickProfile(snap.data()); });

  const ref = doc(collection(db, "dmThreads"));
  await setDoc(ref, {
    type: "group",
    memberUids: allUids,
    memberInfo,
    name: name || null,
    ownerUid: me.uid,
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: ""
  });
  return ref.id;
}

function pickProfile(p) {
  return { username: p.username, tag: p.tag, photoURL: p.photoURL || null, avatarEmoji: p.avatarEmoji || null };
}

export async function addMemberToGroup(threadId, newUid) {
  const profileSnap = await getDoc(doc(db, "users", newUid));
  await updateDoc(doc(db, "dmThreads", threadId), {
    memberUids: arrayUnion(newUid),
    [`memberInfo.${newUid}`]: pickProfile(profileSnap.data() || {})
  });
}

export async function removeMemberFromGroup(threadId, uid) {
  await updateDoc(doc(db, "dmThreads", threadId), {
    memberUids: arrayRemove(uid)
  });
}

export async function leaveGroupThread(threadId) {
  const me = auth.currentUser;
  await updateDoc(doc(db, "dmThreads", threadId), {
    memberUids: arrayRemove(me.uid)
  });
}

export async function touchThread(threadId, preview) {
  await updateDoc(doc(db, "dmThreads", threadId), {
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: preview.slice(0, 80)
  });
}

// Kullanıcının içinde olduğu tüm DM/grup sohbetlerini canlı dinler
export function listenMyThreads(callback) {
  const me = auth.currentUser;
  const q = query(collection(db, "dmThreads"), where("memberUids", "array-contains", me.uid));
  return onSnapshot(q, (snap) => {
    const threads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    threads.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
    callback(threads);
  });
}
