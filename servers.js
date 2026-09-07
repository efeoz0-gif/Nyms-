import { auth, db } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, collectionGroup
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function generateInviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // karışabilecek karakterler (0/O, 1/I) çıkarıldı
  let code = "";
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createServer(name) {
  const user = auth.currentUser;
  const profile = (await getDoc(doc(db, "users", user.uid))).data();

  const serverRef = doc(collection(db, "servers"));
  await setDoc(serverRef, {
    name,
    ownerUid: user.uid,
    inviteCode: generateInviteCode(),
    iconText: name.slice(0, 2).toUpperCase(),
    createdAt: serverTimestamp()
  });

  // Sahibi otomatik üye + owner rolüyle ekle
  await setDoc(doc(db, "servers", serverRef.id, "members", user.uid), {
    uid: user.uid,
    username: profile.username,
    tag: profile.tag,
    photoURL: profile.photoURL || null,
    role: "owner",
    isMuted: false,
    isBanned: false,
    joinedAt: serverTimestamp()
  });

  // Varsayılan kanallar
  await setDoc(doc(collection(db, "servers", serverRef.id, "channels")), {
    name: "genel", type: "text", order: 0, createdAt: serverTimestamp()
  });
  await setDoc(doc(collection(db, "servers", serverRef.id, "channels")), {
    name: "Genel Ses", type: "voice", order: 1, createdAt: serverTimestamp()
  });

  return serverRef.id;
}

export async function joinServerByInvite(inviteCode) {
  const user = auth.currentUser;
  const q = query(collection(db, "servers"), where("inviteCode", "==", inviteCode.trim().toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("Geçersiz davet kodu");

  const serverDoc = snap.docs[0];
  const memberRef = doc(db, "servers", serverDoc.id, "members", user.uid);
  const existing = await getDoc(memberRef);
  if (existing.exists()) {
    if (existing.data().isBanned) throw new Error("Bu sunucudan yasaklandınız");
    return serverDoc.id; // zaten üye
  }

  const profile = (await getDoc(doc(db, "users", user.uid))).data();
  await setDoc(memberRef, {
    uid: user.uid,
    username: profile.username,
    tag: profile.tag,
    photoURL: profile.photoURL || null,
    role: "member",
    isMuted: false,
    isBanned: false,
    joinedAt: serverTimestamp()
  });

  return serverDoc.id;
}

export async function leaveServer(serverId) {
  await deleteDoc(doc(db, "servers", serverId, "members", auth.currentUser.uid));
}

// Kullanıcının üye olduğu sunucuları canlı dinler (collectionGroup sorgusu
// ilk seferde Firestore konsolunda index istek linki verebilir, tıklaman yeterli)
export function listenMyServers(callback) {
  const user = auth.currentUser;
  const q = query(collectionGroup(db, "members"), where("uid", "==", user.uid));
  return onSnapshot(q, async (snap) => {
    const servers = await Promise.all(snap.docs.map(async (memberDoc) => {
      const serverId = memberDoc.ref.parent.parent.id;
      const serverSnap = await getDoc(doc(db, "servers", serverId));
      return { id: serverId, ...serverSnap.data(), myRole: memberDoc.data().role };
    }));
    callback(servers);
  });
}

export function listenMembers(serverId, callback) {
  return onSnapshot(collection(db, "servers", serverId, "members"), (snap) => {
    callback(snap.docs.map(d => d.data()));
  });
}

export async function getMyRole(serverId) {
  const user = auth.currentUser;
  const snap = await getDoc(doc(db, "servers", serverId, "members", user.uid));
  return snap.exists() ? snap.data().role : null;
}
