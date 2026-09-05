// ============================================================
// CHAT.JS — Gerçek zamanlı özel mesajlaşma (DM)
// chats/{chatId}: { participants: [uidA, uidB], otherName, streakCount, lastMessageDate }
// chats/{chatId}/messages/{msgId}: { text, senderId, createdAt }
// ============================================================

let currentChatIdOpen = null;
let chatMessagesUnsub = null;
let chatListUnsub = null;

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

// Kullanıcılar listesindeki "💬 Mesaj" butonundan çağrılır
async function openOrCreateChat(targetUid, targetName, targetPhoto) {
  const chatId = chatIdFor(currentUser.uid, targetUid);
  const chatRef = db.collection('chats').doc(chatId);
  const doc = await chatRef.get();

  if (!doc.exists) {
    await chatRef.set({
      participants: [currentUser.uid, targetUid],
      otherName: targetName, // basitlik için — gerçek uygulamada her katılımcı için ayrı isim tutulur
      streakCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // Sohbet view'ına geç
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector('[data-view="chat"]').classList.add('active');
  ['feed', 'servers', 'settings', 'chat'].forEach(v => {
    document.getElementById('view-' + v)?.classList.toggle('hidden', v !== 'chat');
  });

  openChatConversation(chatId, targetName, targetPhoto);
}

function renderChatList() {
  document.getElementById('chat-list-view').classList.remove('hidden');
  document.getElementById('chat-conversation-view').classList.add('hidden');

  if (chatListUnsub) chatListUnsub();

  chatListUnsub = db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid)
    .onSnapshot(snap => {
      const listEl = document.getElementById('chat-list');
      listEl.innerHTML = '';

      if (snap.empty) {
        listEl.innerHTML = '<div class="card"><p style="color:var(--text-dim);font-size:13px;">Henüz sohbetin yok. Kullanıcılar listesinden birine mesaj at.</p></div>';
        return;
      }

      snap.forEach(doc => {
        const data = doc.data();
        const otherUid = data.participants.find(p => p !== currentUser.uid);
        const row = document.createElement('div');
        row.className = 'card';
        row.style.cursor = 'pointer';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.innerHTML = `
          <strong>${data.otherName || otherUid}</strong>
          <span style="color:var(--accent);font-size:12.5px;">🔥 ${data.streakCount || 0}</span>`;
        row.addEventListener('click', () => openChatConversation(doc.id, data.otherName || otherUid, ''));
        listEl.appendChild(row);
      });
    });
}

function openChatConversation(chatId, partnerName, partnerPhoto) {
  currentChatIdOpen = chatId;
  document.getElementById('chat-list-view').classList.add('hidden');
  document.getElementById('chat-conversation-view').classList.remove('hidden');
  document.getElementById('chat-partner-name').textContent = partnerName;
  document.getElementById('chat-partner-avatar').src = partnerPhoto || '';

  if (chatMessagesUnsub) chatMessagesUnsub();

  chatMessagesUnsub = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt').limitToLast(100)
    .onSnapshot(snap => {
      const container = document.getElementById('chat-messages');
      container.innerHTML = '';
      snap.forEach(doc => {
        const m = doc.data();
        const isMe = m.senderId === currentUser.uid;
        const p = document.createElement('p');
        p.style.cssText = `font-size:13.5px;margin-bottom:8px;text-align:${isMe ? 'right' : 'left'};`;
        p.innerHTML = `<span style="background:${isMe ? 'var(--accent)' : 'var(--surface-2)'};color:${isMe ? '#1B1420' : 'var(--text)'};padding:6px 12px;border-radius:14px;display:inline-block;max-width:75%;">${m.text}</span>`;
        container.appendChild(p);
      });
      container.scrollTop = container.scrollHeight;
    });
}

document.getElementById('btn-back-chats').addEventListener('click', () => {
  if (chatMessagesUnsub) chatMessagesUnsub();
  renderChatList();
});

document.getElementById('btn-send-chat-msg').addEventListener('click', sendChatMessage);
document.getElementById('chat-message-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

async function sendChatMessage() {
  const input = document.getElementById('chat-message-input');
  const text = input.value.trim();
  if (!text || !currentChatIdOpen) return;
  input.value = '';

  await db.collection('chats').doc(currentChatIdOpen).collection('messages').add({
    text,
    senderId: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await updateStreakOnMessage(currentChatIdOpen);
}
