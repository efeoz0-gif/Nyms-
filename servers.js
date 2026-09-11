import { auth, db } from "./firebase-config.js";
import { generateTag } from "./auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
  query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function safeProfile(snap, fallbackUid) {
  const d = snap.data() || {};
  return {
    username: d.username || "kullanici",
    tag: d.tag || generateTag(),
    photoURL: d.photoURL || null,
    avatarEmoji: d.avatarEmoji || null
  };
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // karışabilecek karakterler (0/O, 1/I) çıkarıldı
  let code = "";
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createServer(name) {
  const user = auth.currentUser;
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  const profile = safeProfile(profileSnap);

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
    avatarEmoji: profile.avatarEmoji || null,
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

  // Kullanıcının kendi profiline bu sunucuyu ekle (listeleme artık buradan, index gerektirmez)
  await updateDoc(doc(db, "users", user.uid), { serverIds: arrayUnion(serverRef.id) });

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
    await updateDoc(doc(db, "users", user.uid), { serverIds: arrayUnion(serverDoc.id) });
    return serverDoc.id; // zaten üye
  }

  const profile = safeProfile(await getDoc(doc(db, "users", user.uid)));
  await setDoc(memberRef, {
    uid: user.uid,
    username: profile.username,
    tag: profile.tag,
    photoURL: profile.photoURL || null,
    avatarEmoji: profile.avatarEmoji || null,
    role: "member",
    isMuted: false,
    isBanned: false,
    joinedAt: serverTimestamp()
  });
  await updateDoc(doc(db, "users", user.uid), { serverIds: arrayUnion(serverDoc.id) });

  return serverDoc.id;
}

export async function renameServer(serverId, newName) {
  await updateDoc(doc(db, "servers", serverId), {
    name: newName.slice(0, 40),
    iconText: newName.slice(0, 2).toUpperCase()
  });
}

export async function deleteServer(serverId) {
  // Not: alt koleksiyonlar (kanallar/üyeler/mesajlar) client'tan tek tek silinmiyor —
  // Firestore bunları otomatik silmez, ama sunucu ana kaydı silinince artık kimse ona ulaşamaz.
  await deleteDoc(doc(db, "servers", serverId));
  await updateDoc(doc(db, "users", auth.currentUser.uid), { serverIds: arrayRemove(serverId) });
}

export async function leaveServer(serverId) {
  await deleteDoc(doc(db, "servers", serverId, "members", auth.currentUser.uid));
  await updateDoc(doc(db, "users", auth.currentUser.uid), { serverIds: arrayRemove(serverId) });
}

// Bir üyeyi sunucudan atar (ban DEĞİL — istersen tekrar davet koduyla katılabilir).
// Sadece owner/admin çağırabilir (Firestore Rules zaten bunu zorunlu kılıyor).
export async function kickMember(serverId, uid) {
  await deleteDoc(doc(db, "servers", serverId, "members", uid));
}

// Sunucuya özel takma ad — sadece o sunucuda görünür, global kullanıcı adını değiştirmez.
// UI sadece owner/global admin'e gösteriyor (bkz. app.html) — herkes çağırabilsin diye
// Rules geniş bırakıldı (isServerStaff), ama arayüz bunu owner + global admin'e kısıtlıyor.
export async function setMemberNickname(serverId, uid, nickname) {
  await updateDoc(doc(db, "servers", serverId, "members", uid), {
    serverNickname: nickname || null
  });
}

// Sunucuya özel ünvan. Ünvan tam olarak "admin" ise (büyük/küçük harf duyarsız) o üye
// otomatik olarak sunucu admin rolü kazanır (isim değiştirme/susturma gibi yetkiler) —
// başka bir ünvana değiştirilirse ve önceki rolü "admin" ise "member"a geri düşer (owner hariç).
export async function setMemberTitle(serverId, uid, title, currentRole) {
  const patch = { serverTitle: title || null };
  const isAdminTitle = (title || "").trim().toLowerCase() === "admin";
  if (isAdminTitle && currentRole !== "owner") patch.role = "admin";
  else if (!isAdminTitle && currentRole === "admin") patch.role = "member";
  await updateDoc(doc(db, "servers", serverId, "members", uid), patch);
}

export async function toggleTitleGroups(serverId, enabled) {
  await updateDoc(doc(db, "servers", serverId), { showTitleGroups: enabled });
}

// Kullanıcının üye olduğu sunucuları canlı dinler.
// Not: collectionGroup yerine kendi profilindeki serverIds listesini kullanır —
// böylece özel bir Firestore index'e ihtiyaç kalmaz. Ayrıca üyelik kaydı silinmiş
// (atılmış/ban'lanmış) ama serverIds'te unutulmuş sunucuları kendi listesinden temizler.
export function listenMyServers(callback) {
  const user = auth.currentUser;
  return onSnapshot(doc(db, "users", user.uid), async (userSnap) => {
    const ids = userSnap.data()?.serverIds || [];
    if (!ids.length) { callback([]); return; }

    const results = await Promise.all(ids.map(async (id) => {
      const [serverSnap, memberSnap] = await Promise.all([
        getDoc(doc(db, "servers", id)),
        getDoc(doc(db, "servers", id, "members", user.uid))
      ]);
      return { id, serverSnap, stillMember: memberSnap.exists() };
    }));

    const staleIds = results.filter(r => !r.stillMember || !r.serverSnap.exists()).map(r => r.id);
    if (staleIds.length) {
      updateDoc(doc(db, "users", user.uid), { serverIds: arrayRemove(...staleIds) }).catch(() => {});
    }

    const servers = results
      .filter(r => r.stillMember && r.serverSnap.exists())
      .map(r => ({ id: r.id, ...r.serverSnap.data() }));
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
