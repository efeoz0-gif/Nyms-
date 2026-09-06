// ============================================================
// CHAT.JS — Gerçek zamanlı özel mesajlaşma (DM) + grup sohbetleri
// 1'e-1 sohbetler UÇTAN UCA ŞİFRELİ (bkz. crypto.js).
// Grup sohbetleri (3+ kişi) ŞİFRELİ DEĞİL — bkz. crypto.js'teki not.
//
// chats/{chatId}: {
//   participants: [uid...], isGroup: bool, groupName (grup ise),
//   otherName (1'e-1 ise), streakCount, lastMessageDate
// }
// chats/{chatId}/messages/{msgId}: {
//   senderId, createdAt, editedAt, deleted,
//   text (grup) VEYA textEncrypted:{iv,data} (1'e-1),
//   reactions: {emoji:[uid]}, replyTo: msgId
// }
// ============================================================

let currentChatIdOpen = null;
let currentChatIsGroup = false;
let currentChatOtherUid = null;
let chatMessagesUnsub = null;
let chatListUnsub = null;
let replyingToMsgId = null;
let openMessagesCache = {}; // msgId -> {decryptedText, ...} — yanıt önizlemesi için

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

async function openOrCreateChat(targetUid, targetName, targetPhoto) {
  const chatId = chatIdFor(currentUser.uid, targetUid);
  const chatRef = db.collection('chats').doc(chatId);
  const doc = await chatRef.get();

  if (!doc.exists) {
    await chatRef.set({
      participants: [currentUser.uid, targetUid],
      isGroup: false,
      otherName: targetName,
      streakCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector('[data-view="chat"]')?.classList.add('active');
  ['feed', 'servers', 'settings', 'chat'].forEach(v => {
    document.getElementById('view-' + v)?.classList.toggle('hidden', v !== 'chat');
  });

  openChatConversation(chatId, targetName, targetPhoto, false, targetUid);
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
        listEl.innerHTML = '<div class="card"><p style="color:var(--text-dim);font-size:13px;">Henüz sohbetin yok.</p></div>';
        return;
      }

      snap.forEach(doc => {
        const data = doc.data();
        const otherUid = data.participants.find(p => p !== currentUser.uid);
        const row = document.createElement('div');
        row.className = 'card';
        row.style.cssText = 'cursor:pointer;display:flex;justify-content:space-between;align-items:center;';
        row.innerHTML = `
          <strong>${data.isGroup ? '👥 ' + (data.groupName || 'Grup') : (data.otherName || otherUid)}</strong>
          ${!data.isGroup ? `<span style="color:var(--accent);font-size:12.5px;">🔥 ${data.streakCount || 0}</span>` : `<span style="color:var(--text-dim);font-size:12px;">${data.participants.length} kişi</span>`}
        `;
        row.addEventListener('click', () => openChatConversation(doc.id, data.isGroup ? (data.groupName || 'Grup') : (data.otherName || otherUid), '', data.isGroup, otherUid));
        listEl.appendChild(row);
      });
    });
}

function openChatConversation(chatId, partnerName, partnerPhoto, isGroup, otherUid) {
  currentChatIdOpen = chatId;
  currentChatIsGroup = isGroup;
  currentChatOtherUid = otherUid;
  replyingToMsgId = null;
  openMessagesCache = {};

  document.getElementById('chat-list-view').classList.add('hidden');
  document.getElementById('chat-conversation-view').classList.remove('hidden');
  document.getElementById('chat-partner-name').textContent = partnerName + (isGroup ? '' : ' 🔒');
  document.getElementById('chat-partner-avatar').src = partnerPhoto || '';

  if (chatMessagesUnsub) chatMessagesUnsub();

  chatMessagesUnsub = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt').limitToLast(100)
    .onSnapshot(async snap => {
      const container = document.getElementById('chat-messages');
      container.innerHTML = '';

      let sharedKey = null;
      if (!isGroup) sharedKey = await getSharedKey(otherUid);

      for (const doc of snap.docs) {
        const m = doc.data();
        const isMe = m.senderId === currentUser.uid;

        let displayText;
        if (m.deleted) {
          displayText = null;
        } else if (isGroup) {
          displayText = m.text || '';
        } else if (m.textEncrypted && sharedKey) {
          displayText = await decryptText(sharedKey, m.textEncrypted);
        } else {
          displayText = '🔒 [şifre çözülemedi]';
        }

        openMessagesCache[doc.id] = { text: displayText, senderId: m.senderId };

        const wrap = document.createElement('div');
        wrap.style.cssText = `margin-bottom:10px;text-align:${isMe ? 'right' : 'left'};`;

        let replyHtml = '';
        if (m.replyTo && openMessagesCache[m.replyTo]) {
          replyHtml = `<div class="reply-preview">↩️ ${escapeHtml((openMessagesCache[m.replyTo].text || '').slice(0, 60))}</div>`;
        }

        if (m.deleted) {
          wrap.innerHTML = `<span class="msg-bubble msg-bubble-deleted">Bu mesaj silindi.</span>`;
        } else {
          wrap.innerHTML = `
            ${replyHtml}
            <span class="msg-bubble ${isMe ? 'msg-bubble-me' : 'msg-bubble-them'}">
              <span class="msg-bubble-text">${renderRichText(displayText)}</span>
              ${m.editedAt ? '<span class="msg-edited-tag">(düzenlendi)</span>' : ''}
            </span>
            ${messageActionsToolbarHtml(isMe)}
            <div class="reactions-row">${buildReactionsHtml(m.reactions)}</div>
          `;
        }

        container.appendChild(wrap);

        if (!m.deleted) {
          attachMessageActions(wrap, {
            ref: doc.ref,
            isOwn: isMe,
            encryptFn: isGroup ? null : (text) => encryptText(sharedKey, text),
            getRawTextForEdit: async () => displayText,
            onReply: (msgId) => startReply(msgId, displayText)
          });
        }
      }

      container.scrollTop = container.scrollHeight;
    });
}

function startReply(msgId, previewText) {
  replyingToMsgId = msgId;
  const banner = document.getElementById('chat-reply-banner');
  banner.classList.remove('hidden');
  banner.querySelector('span').textContent = '↩️ Yanıtlanıyor: ' + (previewText || '').slice(0, 50);
}

document.getElementById('chat-reply-cancel')?.addEventListener('click', () => {
  replyingToMsgId = null;
  document.getElementById('chat-reply-banner').classList.add('hidden');
});

document.getElementById('btn-back-chats').addEventListener('click', () => {
  if (chatMessagesUnsub) chatMessagesUnsub();
  renderChatList();
});

document.getElementById('btn-send-chat-msg').addEventListener('click', sendChatMessage);
document.getElementById('chat-message-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});

async function sendChatMessage() {
  const input = document.getElementById('chat-message-input');
  const text = input.value.trim();
  if (!text || !currentChatIdOpen) return;
  input.value = '';

  const msgData = {
    senderId: currentUser.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    reactions: {}
  };
  if (replyingToMsgId) msgData.replyTo = replyingToMsgId;

  if (currentChatIsGroup) {
    msgData.text = text;
  } else {
    const sharedKey = await getSharedKey(currentChatOtherUid);
    if (!sharedKey) {
      alert('Karşı taraf henüz uygulamayı hiç açmadığı için şifreli anahtarı yok. Biraz sonra tekrar dene.');
      return;
    }
    msgData.textEncrypted = await encryptText(sharedKey, text);
  }

  await db.collection('chats').doc(currentChatIdOpen).collection('messages').add(msgData);

  replyingToMsgId = null;
  document.getElementById('chat-reply-banner').classList.add('hidden');

  if (!currentChatIsGroup) await updateStreakOnMessage(currentChatIdOpen);
}

// ---- Grup sohbeti oluşturma ----
document.getElementById('btn-create-group-chat')?.addEventListener('click', async () => {
  const usersSnap = await db.collection('users').get();
  const options = [];
  usersSnap.forEach(d => { if (d.id !== currentUser.uid) options.push(`${d.id}:${d.data().username}`); });
  const chosen = prompt('Gruba eklenecek kullanıcı ID\'lerini virgülle yaz:\n' + options.join('\n'));
  if (!chosen) return;
  const groupName = prompt('Grup adı:', 'Yeni Grup') || 'Yeni Grup';
  const participantIds = chosen.split(',').map(s => s.trim()).filter(Boolean);
  participantIds.push(currentUser.uid);

  const ref = await db.collection('chats').add({
    participants: participantIds,
    isGroup: true,
    groupName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  openChatConversation(ref.id, groupName, '', true, null);
});
