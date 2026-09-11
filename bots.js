import { auth, db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function createBot(serverId, name, avatarEmoji, triggers) {
  const ref = doc(collection(db, "servers", serverId, "bots"));
  await setDoc(ref, {
    name: name.slice(0, 24),
    avatarEmoji: avatarEmoji || "🤖",
    triggers, // [{ match: "selam", response: "Selam!" }, ...]
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function deleteBot(serverId, botId) {
  await deleteDoc(doc(db, "servers", serverId, "bots", botId));
}

export function listenBots(serverId, callback) {
  return onSnapshot(collection(db, "servers", serverId, "bots"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// Bir mesaj içeriği hangi botların hangi tetikleyicilerine uyuyor? (ilk eşleşen tetikleyici, bot başına)
export function findTriggerMatches(bots, content) {
  const lower = content.toLowerCase();
  const replies = [];
  bots.forEach(bot => {
    const hit = (bot.triggers || []).find(t => t.match && lower.includes(t.match.toLowerCase()));
    if (hit) replies.push({ bot, response: hit.response });
  });
  return replies;
}

// "tetikleyici|yanıt" formatındaki satırları diziye çevirir (bot oluşturma formunda kullanılıyor)
export function parseTriggerLines(text) {
  return text.split("\n")
    .map(line => line.split("|"))
    .filter(parts => parts.length === 2 && parts[0].trim() && parts[1].trim())
    .map(([match, response]) => ({ match: match.trim(), response: response.trim() }))
    .slice(0, 20);
}
