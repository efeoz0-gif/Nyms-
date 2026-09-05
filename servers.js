// ============================================================
// SERVERS.JS — Discord tarzı sunucu + kanal sistemi
// servers/{serverId}: { name, ownerId, members: [uids], createdAt }
// servers/{serverId}/channels/{channelId}: { name, type: 'text'|'voice' }
// servers/{serverId}/channels/{channelId}/messages/{msgId}
// ============================================================

let currentServerId = null;
let currentChannelId = null;

document.getElementById('btn-create-server').addEventListener('click', () => {
  document.getElementById('server-create-overlay').classList.remove('hidden');
});
document.getElementById('server-create-cancel').addEventListener('click', () => {
  document.getElementById('server-create-overlay').classList.add('hidden');
});

document.getElementById('server-create-submit').addEventListener('click', async () => {
  const name = document.getElementById('server-name-input').value.trim();
  if (!name) return;

  const serverRef = await db.collection('servers').add({
    name,
    ownerId: currentUser.uid,
    members: [currentUser.uid],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Varsayılan kanallar
  await serverRef.collection('channels').add({
    name: 'genel', type: 'text', createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await serverRef.collection('channels').add({
    name: 'Genel Sesli', type: 'voice', createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById('server-name-input').value = '';
  document.getElementById('server-create-overlay').classList.add('hidden');
  renderServerList();
});

async function renderServerList() {
  const listEl = document.getElementById('server-list');
  const detailEl = document.getElementById('server-detail');
  detailEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  const snap = await db.collection('servers')
    .where('members', 'array-contains', currentUser.uid).get();

  listEl.innerHTML = '';
  if (snap.empty) {
    listEl.innerHTML = '<div class="card"><p style="color:var(--text-dim);font-size:13px;">Henüz bir sunucun yok. Yukarıdan bir tane kur.</p></div>';
    return;
  }

  snap.forEach(doc => {
    const data = doc.data();
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.innerHTML = `<strong>${data.name}</strong>
      <p style="color:var(--text-dim);font-size:12.5px;margin-top:4px;">${data.members.length} üye</p>`;
    card.addEventListener('click', () => openServer(doc.id, data));
    listEl.appendChild(card);
  });
}

async function openServer(serverId, serverData) {
  currentServerId = serverId;
  const listEl = document.getElementById('server-list');
  const detailEl = document.getElementById('server-detail');
  listEl.classList.add('hidden');
  detailEl.classList.remove('hidden');

  const channelsSnap = await db.collection('servers').doc(serverId).collection('channels')
    .orderBy('createdAt').get();

  let channelsHtml = '';
  channelsSnap.forEach(doc => {
    const c = doc.data();
    const icon = c.type === 'voice' ? '🔊' : '#';
    channelsHtml += `<div class="nav-item" data-channel-id="${doc.id}" data-channel-type="${c.type}" data-channel-name="${c.name}" style="margin-bottom:4px;">${icon} ${c.name}</div>`;
  });

  detailEl.innerHTML = `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
      <button class="btn btn-ghost btn-sm" id="btn-back-servers">← Sunucular</button>
      <h3 style="font-size:15px;">${serverData.name}</h3>
      <button class="btn btn-primary btn-sm" id="btn-create-channel">+ Kanal</button>
    </div>
    <div class="card" id="channel-nav">${channelsHtml}</div>
    <div class="card" id="channel-content">
      <p style="color:var(--text-dim);font-size:13px;">Bir kanal seç.</p>
    </div>
  `;

  document.getElementById('btn-back-servers').addEventListener('click', renderServerList);
  document.getElementById('btn-create-channel').addEventListener('click', () => {
    document.getElementById('channel-create-overlay').classList.remove('hidden');
  });

  detailEl.querySelectorAll('[data-channel-id]').forEach(item => {
    item.addEventListener('click', () => openChannel(item.dataset.channelId, item.dataset.channelType, item.dataset.channelName));
  });
}

document.getElementById('channel-create-cancel').addEventListener('click', () => {
  document.getElementById('channel-create-overlay').classList.add('hidden');
});

document.getElementById('channel-create-submit').addEventListener('click', async () => {
  const name = document.getElementById('channel-name-input').value.trim();
  const type = document.getElementById('channel-type-select').value;
  if (!name || !currentServerId) return;

  await db.collection('servers').doc(currentServerId).collection('channels').add({
    name, type, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById('channel-name-input').value = '';
  document.getElementById('channel-create-overlay').classList.add('hidden');

  const serverDoc = await db.collection('servers').doc(currentServerId).get();
  openServer(currentServerId, serverDoc.data());
});

function openChannel(channelId, type, name) {
  currentChannelId = channelId;
  const contentEl = document.getElementById('channel-content');

  if (type === 'voice') {
    renderVoiceChannel(contentEl, channelId, name);
  } else {
    renderTextChannel(contentEl, channelId, name);
  }
}

function renderTextChannel(contentEl, channelId, name) {
  contentEl.innerHTML = `
    <h4 style="margin-bottom:10px;"># ${name}</h4>
    <div id="channel-messages" style="max-height:280px;overflow-y:auto;margin-bottom:10px;"></div>
    <div style="display:flex;gap:8px;">
      <input type="text" id="channel-message-input" class="code-input" style="font-size:14px;letter-spacing:0;text-align:left;margin:0;" placeholder="Mesaj yaz...">
      <button class="btn btn-primary btn-sm" id="btn-send-channel-msg">Gönder</button>
    </div>
  `;

  const msgsRef = db.collection('servers').doc(currentServerId)
    .collection('channels').doc(channelId).collection('messages');

  msgsRef.orderBy('createdAt').limitToLast(50).onSnapshot(snap => {
    const container = document.getElementById('channel-messages');
    if (!container) return;
    container.innerHTML = '';
    snap.forEach(doc => {
      const m = doc.data();
      const p = document.createElement('p');
      p.style.fontSize = '13.5px';
      p.style.marginBottom = '6px';
      p.innerHTML = `<strong>${m.authorName || '?'}:</strong> ${m.text}`;
      container.appendChild(p);
    });
    container.scrollTop = container.scrollHeight;
  });

  document.getElementById('btn-send-channel-msg').addEventListener('click', async () => {
    const input = document.getElementById('channel-message-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await msgsRef.add({
      text,
      authorId: currentUser.uid,
      authorName: currentUserData.displayName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
}
