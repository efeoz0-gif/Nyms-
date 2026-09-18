import { auth, db } from "./firebase-config.js";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function markChannelRead(serverId, channelId) {
  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    [`lastRead.${serverId}_${channelId}`]: serverTimestamp()
  });
}

export async function createChannel(serverId, name, type = "text") {
  const ref = doc(collection(db, "servers", serverId, "channels"));
  await setDoc(ref, {
    name: name.toLowerCase().replace(/\s+/g, "-"),
    type,
    order: Date.now(),
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function deleteChannel(serverId, channelId) {
  await deleteDoc(doc(db, "servers", serverId, "channels", channelId));
}

export async function renameChannel(serverId, channelId, newName) {
  const clean = newName.toLowerCase().replace(/\s+/g, "-").slice(0, 32);
  await updateDoc(doc(db, "servers", serverId, "channels", channelId), { name: clean });
}

export async function setChannelSlowMode(serverId, channelId, seconds) {
  await updateDoc(doc(db, "servers", serverId, "channels", channelId), { slowMode: seconds });
}

// Kanalın son mesaj zamanını günceller (okunmamış rozet karşılaştırması için)
export async function touchChannel(serverId, channelId) {
  await updateDoc(doc(db, "servers", serverId, "channels", channelId), { lastMessageAt: serverTimestamp() });
}

export function listenChannels(serverId, callback) {
  const q = query(collection(db, "servers", serverId, "channels"), orderBy("order"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
