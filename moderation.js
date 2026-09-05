// ============================================================
// MODERATION.JS — Şeffaf moderasyon paneli (nyms)
// Panel artık gizli bir tıklamayla değil, SADECE moderatör olan
// kullanıcılara görünen bir menü öğesiyle açılıyor — moderatör
// değilsen o menü öğesi hiç yok, yanlışlıkla bulunamaz.
//
// efeoz5530@gmail.com "birincil sahip" — istediği kullanıcıyı
// panelden moderatör yapabilir/geri alabilir. Gerçek yetki
// Firestore Rules'da da kontrol ediliyor (bkz. firestore.rules),
// yani arayüzü atlatmaya çalışan biri yine de yazamaz.
// ============================================================

const PRIMARY_OWNER_EMAIL = 'efeoz5530@gmail.com';

// Bu kullanıcı moderatör mü? (email eşleşmesi VEYA moderators koleksiyonunda kayıtlı)
async function checkIsModerator(uid, email) {
  if (email === PRIMARY_OWNER_EMAIL) return true;
  const doc = await db.collection('moderators').doc(uid).get();
  return doc.exists;
}

document.getElementById('admin-close').addEventListener('click', () => {
  document.getElementById('admin-panel-overlay').classList.add('hidden');
});

let modUsersCache = [];
let selectedModUid = null;
let moderatorIdsCache = [];

async function openAdminPanel(preselectUid) {
  const [usersSnap, modsSnap] = await Promise.all([
    db.collection('users').orderBy('createdAt', 'desc').limit(200).get(),
    db.collection('moderators').get()
  ]);

  moderatorIdsCache = modsSnap.docs.map(d => d.id);
  modUsersCache = [];
  usersSnap.forEach(doc => {
    const data = doc.data();
    modUsersCache.push({
      id: doc.id, ...data,
      isModerator: data.email === PRIMARY_OWNER_EMAIL || moderatorIdsCache.includes(doc.id)
    });
  });

  selectedModUid = preselectUid || null;
  renderModUserList();

  const preselected = modUsersCache.find(u => u.id === preselectUid);
  document.getElementById('mod-detail').innerHTML = preselected
    ? '' : '<p class="hint" style="text-align:left;">Soldan bir kullanıcı seç.</p>';
  if (preselected) renderModDetail(preselected);

  document.getElementById('admin-panel-overlay').classList.remove('hidden');
}

// Kullanıcılar listesindeki 🛡️ ikonundan direkt o kişi seçili panel açmak için
function openAdminPanelForUser(uid) {
  openAdminPanel(uid);
}

function renderModUserList() {
  const listEl = document.getElementById('mod-userlist');
  listEl.innerHTML = '';
  modUsersCache.forEach(u => {
    const row = document.createElement('div');
    row.className = 'mod-user-row' + (u.id === selectedModUid ? ' active' : '');
    const statusDot = u.isBanned ? '🚫' : u.isSuspended ? '⛔' : u.isMuted ? '🔇' : '';
    const modBadge = u.isModerator ? ' 🛡️' : '';
    row.innerHTML = `
      <img src="${u.photoURL || ''}" class="mod-user-avatar">
      <span>@${u.username || u.id}${modBadge} ${statusDot}</span>`;
    row.addEventListener('click', () => {
      selectedModUid = u.id;
      renderModUserList();
      renderModDetail(u);
    });
    listEl.appendChild(row);
  });
}

function modStatusMsg(text, isError = false) {
  const el = document.getElementById('mod-status-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--accent-2)';
}

function renderModDetail(u) {
  const detail = document.getElementById('mod-detail');
  detail.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <img src="${u.photoURL || ''}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
      <div>
        <strong>${u.displayName || '@' + u.id}</strong>
        <p style="color:var(--text-dim);font-size:12.5px;">@${u.username || u.id}</p>
      </div>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
      ${u.isBanned ? '<span class="mod-tag mod-tag-danger">Banlı</span>' : ''}
      ${u.isSuspended ? '<span class="mod-tag mod-tag-danger">Askıda</span>' : ''}
      ${u.isMuted ? '<span class="mod-tag mod-tag-warn">Susturuldu</span>' : ''}
      ${(!u.isBanned && !u.isSuspended && !u.isMuted) ? '<span class="mod-tag">Temiz kayıt</span>' : ''}
    </div>

    <div class="mod-action-block">
      <label>⚠️ Uyarı gönder</label>
      <div class="mod-inline-form">
        <input type="text" id="mod-warn-reason" placeholder="Uyarı sebebi">
        <button class="btn btn-primary btn-sm" id="mod-warn-submit">Gönder</button>
      </div>
    </div>

    <div class="mod-action-block">
      <label>🔇 Sustur</label>
      <div class="mod-inline-form">
        <select id="mod-mute-minutes">
          <option value="15">15 dakika</option>
          <option value="60" selected>1 saat</option>
          <option value="1440">1 gün</option>
        </select>
        <button class="btn btn-primary btn-sm" id="mod-mute-submit">Sustur</button>
        ${u.isMuted ? '<button class="btn btn-ghost btn-sm" id="mod-unmute-submit">Kaldır</button>' : ''}
      </div>
    </div>

    <div class="mod-action-block">
      <label>⛔ Askıya al</label>
      <div class="mod-inline-form">
        <select id="mod-suspend-days">
          <option value="1" selected>1 gün</option>
          <option value="3">3 gün</option>
          <option value="7">7 gün</option>
        </select>
        <button class="btn btn-primary btn-sm" id="mod-suspend-submit">Askıya Al</button>
        ${u.isSuspended ? '<button class="btn btn-ghost btn-sm" id="mod-unsuspend-submit">Kaldır</button>' : ''}
      </div>
    </div>

    <div class="mod-action-block">
      <label>🚫 Kalıcı ban</label>
      <div class="mod-inline-form">
        ${u.isBanned
          ? '<button class="btn btn-ghost btn-sm" id="mod-unban-submit">Banı Kaldır</button>'
          : `<input type="text" id="mod-ban-reason" placeholder="Ban sebebi">
             <button class="btn btn-primary btn-sm" style="background:var(--danger);" id="mod-ban-submit">Banla</button>`}
      </div>
    </div>

    <div class="mod-action-block">
      <label>🎖️ Rozet ver</label>
      <div class="mod-inline-form">
        <input type="text" id="mod-badge-name" placeholder="Rozet adı">
        <button class="btn btn-primary btn-sm" id="mod-badge-submit">Ver</button>
      </div>
    </div>

    <div class="mod-action-block">
      <label>🗑️ Gönderi sil (Post ID)</label>
      <div class="mod-inline-form">
        <input type="text" id="mod-post-id" placeholder="Gönderi ID">
        <button class="btn btn-ghost btn-sm" id="mod-deletepost-submit">Sil</button>
      </div>
    </div>

    ${currentUser.email === PRIMARY_OWNER_EMAIL && u.email !== PRIMARY_OWNER_EMAIL ? `
    <div class="mod-action-block" style="border-color:var(--accent-2);">
      <label>🛡️ Moderatörlük Yetkisi</label>
      <div class="mod-inline-form">
        ${u.isModerator
          ? '<button class="btn btn-ghost btn-sm" id="mod-demote-submit">Moderatörlükten Al</button>'
          : '<button class="btn btn-primary btn-sm" id="mod-promote-submit">Moderatör Yap</button>'}
      </div>
    </div>` : ''}

    <p id="mod-status-msg" style="font-size:12.5px;min-height:16px;margin-top:6px;"></p>
  `;

  document.getElementById('mod-warn-submit').addEventListener('click', async () => {
    const reason = document.getElementById('mod-warn-reason').value.trim();
    if (!reason) { modStatusMsg('Sebep yazmalısın.', true); return; }
    await db.collection('users').doc(u.id).collection('warnings').add({
      reason, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await notifyUser(u.id, `Topluluk kuralları uyarınca uyarıldın. Sebep: ${reason}`);
    modStatusMsg('Uyarı gönderildi.');
  });

  document.getElementById('mod-mute-submit').addEventListener('click', async () => {
    const mins = parseInt(document.getElementById('mod-mute-minutes').value, 10);
    const until = new Date(Date.now() + mins * 60000);
    await db.collection('users').doc(u.id).update({
      isMuted: true, mutedUntil: firebase.firestore.Timestamp.fromDate(until)
    });
    await notifyUser(u.id, `${mins} dakika boyunca gönderi/yorum paylaşamayacaksın.`);
    modStatusMsg('Susturuldu.'); refreshSelectedUser(u.id);
  });

  document.getElementById('mod-unmute-submit')?.addEventListener('click', async () => {
    await db.collection('users').doc(u.id).update({ isMuted: false, mutedUntil: null });
    await notifyUser(u.id, 'Susturman kaldırıldı.');
    modStatusMsg('Susturma kaldırıldı.'); refreshSelectedUser(u.id);
  });

  document.getElementById('mod-suspend-submit').addEventListener('click', async () => {
    const days = parseInt(document.getElementById('mod-suspend-days').value, 10);
    const until = new Date(Date.now() + days * 86400000);
    await db.collection('users').doc(u.id).update({
      isSuspended: true, suspendedUntil: firebase.firestore.Timestamp.fromDate(until)
    });
    await notifyUser(u.id, `Hesabın topluluk kuralları ihlali nedeniyle ${days} gün askıya alındı.`);
    modStatusMsg('Askıya alındı.'); refreshSelectedUser(u.id);
  });

  document.getElementById('mod-unsuspend-submit')?.addEventListener('click', async () => {
    await db.collection('users').doc(u.id).update({ isSuspended: false, suspendedUntil: null });
    await notifyUser(u.id, 'Hesabındaki askı kaldırıldı.');
    modStatusMsg('Askı kaldırıldı.'); refreshSelectedUser(u.id);
  });

  document.getElementById('mod-ban-submit')?.addEventListener('click', async () => {
    const reason = document.getElementById('mod-ban-reason').value.trim();
    if (!reason) { modStatusMsg('Ban sebebi yazmalısın.', true); return; }
    await db.collection('users').doc(u.id).update({
      isBanned: true, banReason: reason, bannedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await notifyUser(u.id, `Hesabın kalıcı olarak yasaklandı. Sebep: ${reason}`);
    modStatusMsg('Kullanıcı banlandı.'); refreshSelectedUser(u.id);
  });

  document.getElementById('mod-unban-submit')?.addEventListener('click', async () => {
    await db.collection('users').doc(u.id).update({ isBanned: false, banReason: null });
    await notifyUser(u.id, 'Hesabındaki ban kaldırıldı.');
    modStatusMsg('Ban kaldırıldı.'); refreshSelectedUser(u.id);
  });

  document.getElementById('mod-badge-submit').addEventListener('click', async () => {
    const badge = document.getElementById('mod-badge-name').value.trim();
    if (!badge) { modStatusMsg('Rozet adı yazmalısın.', true); return; }
    await db.collection('users').doc(u.id).update({
      badges: firebase.firestore.FieldValue.arrayUnion(badge)
    });
    await notifyUser(u.id, `🎖️ "${badge}" rozetini kazandın!`);
    modStatusMsg('Rozet verildi.');
  });

  document.getElementById('mod-deletepost-submit').addEventListener('click', async () => {
    const postId = document.getElementById('mod-post-id').value.trim();
    if (!postId) { modStatusMsg('Gönderi ID yazmalısın.', true); return; }
    await db.collection('posts').doc(postId).delete();
    await notifyUser(u.id, 'Bir gönderin topluluk kurallarını ihlal ettiği için kaldırıldı.');
    modStatusMsg('Gönderi silindi.');
  });

  document.getElementById('mod-promote-submit')?.addEventListener('click', async () => {
    await db.collection('moderators').doc(u.id).set({
      addedBy: currentUser.uid,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await notifyUser(u.id, '🛡️ Artık bir moderatörsün! Sol menüde "Moderasyon" sekmesi belirecek.');
    modStatusMsg('Moderatör yapıldı.');
    refreshSelectedUser(u.id);
  });

  document.getElementById('mod-demote-submit')?.addEventListener('click', async () => {
    await db.collection('moderators').doc(u.id).delete();
    await notifyUser(u.id, 'Moderatörlük yetkin kaldırıldı.');
    modStatusMsg('Moderatörlük kaldırıldı.');
    refreshSelectedUser(u.id);
  });
}

// Bir işlemden sonra kullanıcının güncel halini (moderatörlük dahil) tekrar çekip paneli tazeler
async function refreshSelectedUser(uid) {
  const [userDoc, modDoc] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('moderators').doc(uid).get()
  ]);
  const data = userDoc.data();
  const updated = { id: uid, ...data, isModerator: data.email === PRIMARY_OWNER_EMAIL || modDoc.exists };
  const idx = modUsersCache.findIndex(x => x.id === uid);
  if (idx > -1) modUsersCache[idx] = updated;
  renderModUserList();
  renderModDetail(updated);
}

async function notifyUser(uid, text) {
  await db.collection('users').doc(uid).collection('notifications').add({
    text,
    from: 'nyms Moderasyon',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  });
}

// Platform duyurusu (kullanıcıya özel değil, herkese)
document.getElementById('mod-announcement-btn').addEventListener('click', async () => {
  const text = document.getElementById('mod-announcement-input').value.trim();
  if (!text) return;
  await db.collection('announcements').add({
    text, from: 'nyms Ekibi',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    active: true
  });
  document.getElementById('mod-announcement-input').value = '';
  document.getElementById('mod-announcement-status').textContent = 'Duyuru yayınlandı.';
  setTimeout(() => { document.getElementById('mod-announcement-status').textContent = ''; }, 2500);
});
