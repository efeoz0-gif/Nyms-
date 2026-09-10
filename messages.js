import { auth, db } from "./firebase-config.js";
import {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// --- Yardımcı: bir kanalın veya DM'in mesaj koleksiyon referansını üretir ---
// --- "Yazıyor..." göstergesi: mesaj koleksiyonunun kardeşi olan "typing" alt koleksiyonunu kullanır ---
export function typingRef(messagesRef) {
  return collection(messagesRef.parent, "typing");
}

export async function setTyping(messagesRef) {
  const user = auth.currentUser;
  const profileSnap = await getDoc(doc(db, "users", user.uid));
  await setDoc(doc(typingRef(messagesRef), user.uid), {
    username: profileSnap.data()?.username || "biri",
    updatedAt: serverTimestamp()
  });
}

export async function clearTyping(messagesRef) {
  await deleteDoc(doc(typingRef(messagesRef), auth.currentUser.uid)).catch(() => {});
}

export function listenTyping(messagesRef, callback) {
  return onSnapshot(typingRef(messagesRef), (snap) => {
    const now = Date.now();
    const typers = snap.docs
      .filter(d => d.id !== auth.currentUser.uid)
      .map(d => d.data())
      .filter(t => t.updatedAt && (now - t.updatedAt.toMillis()) < 6000); // 6sn'den eski ise "yazıyor" sayma
    callback(typers.map(t => t.username));
  });
}

export function channelMessagesRef(serverId, channelId) {
  return collection(db, "servers", serverId, "channels", channelId, "messages");
}
export function dmMessagesRef(threadId) {
  return collection(db, "dmThreads", threadId, "messages");
}

// --- Metin formatlama: **kalın**, *italik*, ||spoiler|| → güvenli HTML ---
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function renderFormattedText(raw) {
  let text = escapeHtml(raw);
  text = text.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.add(\'revealed\')">$1</span>');
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>");
  // @bahsetme: @kullaniciadi, @herkes, @here — farklı renkte vurgulanır
  text = text.replace(/@(herkes|here|[a-zA-Z0-9_]+)/g, (m, name) => {
    const special = (name === "herkes" || name === "here");
    return `<span class="mention${special ? ' mention-everyone' : ''}">@${name}</span>`;
  });
  text = text.replace(/\n/g, "<br>");
  return text;
}

// --- Mesaj gönder ---
// Bir mesaj içeriği belirtilen kullanıcı adını (veya @herkes/@here) etiketliyor mu?
export function messageMentionsUser(content, username) {
  if (!content || !username) return false;
  const lower = content.toLowerCase();
  return lower.includes("@herkes") || lower.includes("@here") ||
    new RegExp(`@${username.toLowerCase()}\\b`).test(lower);
}

export async function sendMessage(messagesRef, content, { replyToId = null, replyToPreview = null } = {}) {
  const user = auth.currentUser;
  const profile = (await getDoc(doc(db, "users", user.uid))).data();

  if (profile.isMuted) throw new Error("Susturulduğunuz için mesaj gönderemezsiniz");

  await addDoc(messagesRef, {
    authorUid: user.uid,
    authorUsername: profile.username,
    authorTag: profile.tag,
    authorPhoto: profile.photoURL || null,
    authorAvatarEmoji: profile.avatarEmoji || null,
    content,
    editedAt: null,
    replyToId,
    replyToPreview, // kısa önizleme metni (thread/yanıt gösterimi için)
    reactions: {},
    createdAt: serverTimestamp()
  });
}

export async function editMessage(messagesRef, messageId, newContent) {
  await updateDoc(doc(messagesRef, messageId), {
    content: newContent,
    editedAt: serverTimestamp()
  });
}

// Herkesten silme — mesaj yazarı ya da sunucu admini/moderatörü yapabilir (kurallarla sınırlanır)
export async function deleteMessage(messagesRef, messageId) {
  await deleteDoc(doc(messagesRef, messageId));
}

export async function toggleReaction(messagesRef, messageId, emoji) {
  const user = auth.currentUser;
  const msgRef = doc(messagesRef, messageId);
  const snap = await getDoc(msgRef);
  const reactions = snap.data().reactions || {};
  const already = (reactions[emoji] || []).includes(user.uid);

  await updateDoc(msgRef, {
    [`reactions.${emoji}`]: already ? arrayRemove(user.uid) : arrayUnion(user.uid)
  });
}

// --- Canlı mesaj dinleyici ---
export function listenMessages(messagesRef, callback) {
  const q = query(messagesRef, orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
