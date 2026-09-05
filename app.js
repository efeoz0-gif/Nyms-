// ============================================================
// APP.JS — Giriş kontrolü, feed, seri (streak) sistemi
// ============================================================

let currentUser = null;
let currentUserData = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }

  currentUser = user;
  const doc = await db.collection('users').doc(user.uid).get();
  if (!doc.exists) { window.location.href = 'index.html'; return; }
  currentUserData = doc.data();

  // Banlı kullanıcı içeri alınmaz
  if (currentUserData.isBanned) {
    alert('Hesabın kalıcı olarak yasaklandı.' + (currentUserData.banReason ? ' Sebep: ' + currentUserData.banReason : ''));
    await auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  // Askıya alınmış kullanıcı süresi geçene kadar giremez
  if (currentUserData.isSuspended) {
    const until = currentUserData.suspendedUntil ? currentUserData.suspendedUntil.toDate() : null;
    if (until && until > new Date()) {
      alert('Hesabın askıya alındı. Bitiş: ' + until.toLocaleString('tr-TR'));
      await auth.signOut();
      window.location.href = 'index.html';
      return;
    }
  }

  document.getElementById('app-shell').style.display = 'grid';
  document.getElementById('my-avatar').src = currentUserData.photoURL || '';

  db.collection('users').doc(user.uid).update({
    lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  loadTodayQuestion();
  loadBirthdayCountdown();
  loadStreaks();
  loadOnThisDay();
  renderUserDiscovery();
  applyForcedThemeListener();
  loadSettingsForm();
});

// ---- Nav geçişi — gerçek view değiştirme ----
const VIEW_IDS = ['feed', 'servers', 'settings'];
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    const view = item.dataset.view;
    VIEW_IDS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== view);
    });

    if (view === 'servers') renderServerList();
    // Diğer view'lar (chat, stories, soundboard vb.) henüz bu sürümde
    // ayrı bir ekran olarak inşa edilmedi — akış ekranında kalır.
  });
});

// ---- Günün Saçma Sorusu ----
async function loadTodayQuestion() {
  const today = new Date().toISOString().slice(0, 10);
  const doc = await db.collection('dailyQuestions').doc(today).get();
  const card = document.getElementById('today-question-card');
  if (doc.exists) {
    card.innerHTML = `<h3 style="font-size:14px;color:var(--accent);">🎲 Günün Sorusu</h3>
      <p style="margin-top:8px;">${doc.data().question}</p>`;
  } else {
    card.style.display = 'none';
  }
}

// ---- Doğum Günü Sayacı (sadece takip edilenler) ----
async function loadBirthdayCountdown() {
  const card = document.getElementById('birthday-card');
  const followingIds = await getFollowingIds();

  if (!followingIds.length) {
    card.innerHTML = `<h3 style="font-size:14px;color:var(--accent-2);">🎂 Doğum Günleri</h3>
      <p style="margin-top:8px;color:var(--text-dim);font-size:13px;">Takip ettiğin biri olunca burada görünecek.</p>`;
    return;
  }

  const usersSnap = await db.collection('users').get();
  const birthdays = [];
  usersSnap.forEach(d => {
    if (!followingIds.includes(d.id)) return;
    const data = d.data();
    if (data.birthday) birthdays.push({ name: data.displayName, date: data.birthday });
  });

  if (!birthdays.length) {
    card.innerHTML = `<h3 style="font-size:14px;color:var(--accent-2);">🎂 Doğum Günleri</h3>
      <p style="margin-top:8px;color:var(--text-dim);font-size:13px;">Takip ettiklerin doğum gününü henüz eklemedi.</p>`;
    return;
  }

  function nextBirthday(dateStr) {
    const [m, day] = dateStr.split('-').map(Number);
    const now = new Date();
    let next = new Date(now.getFullYear(), m - 1, day);
    if (next < now) next = new Date(now.getFullYear() + 1, m - 1, day);
    return next;
  }

  birthdays.forEach(b => b.next = nextBirthday(b.date));
  birthdays.sort((a, b) => a.next - b.next);
  const soonest = birthdays[0];

  function tick() {
    const diff = soonest.next - new Date();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    card.innerHTML = `<h3 style="font-size:14px;color:var(--accent-2);">🎂 Sıradaki Doğum Günü</h3>
      <p style="margin-top:8px;">${soonest.name}: <strong>${days} gün ${hours} sa ${mins} dk</strong></p>`;
  }
  tick();
  setInterval(tick, 60000);
}

// ---- Seri (Streak) Sistemi ----
// chats/{chatId}: { participants: [uid1,uid2], streakCount, lastMessageDate }
async function loadStreaks() {
  const snap = await db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid).get();

  const list = document.getElementById('streak-list');
  list.innerHTML = '';

  if (snap.empty) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">Henüz seri yok.</p>';
    return;
  }

  snap.forEach(doc => {
    const data = doc.data();
    const otherUid = data.participants.find(p => p !== currentUser.uid);
    const lastMsg = data.lastMessageDate ? data.lastMessageDate.toDate() : null;
    const hoursSince = lastMsg ? (Date.now() - lastMsg.getTime()) / 3600000 : 999;
    const atRisk = hoursSince > 20 && hoursSince < 24;
    const expired = hoursSince >= 24;

    const row = document.createElement('div');
    row.className = 'streak-item';
    row.innerHTML = `
      <span>${data.otherName || otherUid}</span>
      <span class="${expired ? 'streak-warning' : atRisk ? 'streak-warning' : 'streak-fire'}">
        ${expired ? '💔 sıfırlandı' : `🔥 ${data.streakCount || 0} gün` + (atRisk ? ' ⚠️' : '')}
      </span>`;
    list.appendChild(row);
  });
}

// Mesaj gönderildiğinde çağrılacak fonksiyon (chat.js içinden import edilir gibi düşün)
async function updateStreakOnMessage(chatId) {
  const chatRef = db.collection('chats').doc(chatId);
  const chatDoc = await chatRef.get();
  const data = chatDoc.data();

  const now = new Date();
  const last = data.lastMessageDate ? data.lastMessageDate.toDate() : null;
  const hoursSince = last ? (now - last) / 3600000 : 999;

  let newStreak = data.streakCount || 0;
  if (!last) {
    newStreak = 1;
  } else if (hoursSince < 24) {
    // Aynı takvim günü içinde tekrar mesajlaşma streak'i artırmaz,
    // sadece farklı bir günde ilk mesaj artırır
    const sameDay = last.toDateString() === now.toDateString();
    if (!sameDay) newStreak += 1;
  } else {
    newStreak = 1; // 24 saat geçmiş, sıfırdan başla
  }

  await chatRef.update({
    streakCount: newStreak,
    lastMessageDate: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// GÜNDE BİR KEZ ÇALIŞACAK SIFIRLAMA KONTROLÜ
// Not: Gerçek/güvenilir sıfırlama için bu mantığın bir Cloud Function
// (scheduled function, her gece 00:00) olarak sunucu tarafında da
// çalıştırılması gerekir — client kapalıyken de sıfırlasın diye.
// Örnek Cloud Function pseudo-kodu js/CLOUD_FUNCTIONS_ORNEK.md dosyasında.
async function checkExpiredStreaksClientSide() {
  const snap = await db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid).get();
  snap.forEach(async doc => {
    const data = doc.data();
    const last = data.lastMessageDate ? data.lastMessageDate.toDate() : null;
    if (last && (Date.now() - last.getTime()) / 3600000 >= 24 && data.streakCount > 0) {
      await doc.ref.update({ streakCount: 0 });
    }
  });
}
checkExpiredStreaksClientSide();

// ---- Tarihte Bugün (sadece takip edilenlerin anıları) ----
async function loadOnThisDay() {
  const container = document.getElementById('on-this-day');
  const followingIds = await getFollowingIds();

  if (!followingIds.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">Takip ettiğin biri olunca anıları burada görünecek.</p>';
    return;
  }

  const todayKey = new Date().toISOString().slice(5, 10); // MM-DD
  const snap = await db.collection('posts').where('dateKey', '==', todayKey).get();

  container.innerHTML = '';
  let found = false;
  snap.forEach(doc => {
    const data = doc.data();
    if (!followingIds.includes(data.authorId)) return;
    found = true;
    const p = document.createElement('p');
    p.style.fontSize = '13px';
    p.textContent = `${data.year || ''}: ${data.caption || ''}`;
    container.appendChild(p);
  });

  if (!found) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">Bu gün için anı yok.</p>';
  }
}

// ---- Zorla tema uygulaması (admin master theme kontrolü) ----
function applyForcedThemeListener() {
  db.collection('globalSettings').doc('theme').onSnapshot(doc => {
    if (doc.exists && doc.data().active) {
      document.documentElement.setAttribute('data-theme', doc.data().name);
    }
  });
}

// 3 kere tıkla admin girişini başlat (moderation.js içindeki startAdminGate)
let clickCount = 0, clickTimer = null;
document.getElementById('my-avatar').addEventListener('click', () => {
  clickCount++;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => clickCount = 0, 800);
  if (clickCount === 3) {
    clickCount = 0;
    startAdminGate();
  }
});
