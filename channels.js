import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

export function listenChannels(serverId, callback) {
  const q = query(collection(db, "servers", serverId, "channels"), orderBy("order"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
