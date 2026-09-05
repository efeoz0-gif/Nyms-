// ============================================================
// MODERATION.JS — Şeffaf moderasyon paneli (nyms)
// Sadece efeoz5530@gmail.com hesabı erişebilir, üstelik o hesaba
// giriş yapılmış olsa BİLE bu gmail'e ayrıca bir doğrulama kodu
// gönderilir — kod girilmeden panel açılmaz (2 katmanlı koruma).
// Gerçek yetki Firestore Rules'da da bu email'e kilitlenmiştir.
// ============================================================

const MODERATOR_EMAIL = 'efeoz5530@gmail.com';
let adminPendingCode = null;

// 3 kere tıkla admin akışını başlat (app.js'deki click listener bunu çağırıyor)
async function startAdminGate() {
  if (!currentUser || currentUser.email !== MODERATOR_EMAIL) {
    alert('Bu özelliğe erişim yetkin yok.');
    return;
  }

  document.getElementById('admin-pass-overlay').classList.remove('hidden');
  document.getElementById('admin-gate-status').textContent =
    `${MODERATOR_EMAIL} adresine kod gönderiliyor...`;

  adminPendingCode = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await db.collection('mail').add({
      to: [MODERATOR_EMAIL],
      message: {
        subject: 'nyms Moderasyon Girişi Kodu',
        text: `Moderasyon paneline giriş kodun: ${adminPendingCode}`,
        html: `<p>Moderasyon paneline giriş kodun: <strong style="font-size:20px">${adminPendingCode}</strong></p>`
      }
    });
    document.getElementById('admin-gate-status').textContent =
      `${MODERATOR_EMAIL} adresine kod gönderildi.`;
  } catch (err) {
    console.error(err);
  }

  // Trigger Email eklentisi kurulana kadar test amaçlı ekranda da göster
  console.log('%c[DEV] Moderasyon kodu: ' + adminPendingCode, 'font-size:16px;color:#E3A008;');
  document.getElementById('admin-gate-status').textContent += ' (Test modu kodu: ' + adminPendingCode + ')';
}

document.getElementById('admin-code-submit').addEventListener('click', () => {
  const entered = document.getElementById('admin-code-input').value.trim();
  if (entered === adminPendingCode) {
    document.getElementById('admin-pass-overlay').classList.add('hidden');
    document.getElementById('admin-code-input').value = '';
    openAdminPanel();
  } else {
    alert('Kod yanlış.');
  }
});

document.getElementById('admin-pass-cancel').addEventListener('click', () => {
  document.getElementById('admin-pass-overlay').classList.add('hidden');
});

document.getElementById('admin-close').addEventListener('click', () => {
  document.getElementById('admin-panel-overlay').classList.add('hidden');
});

async function openAdminPanel() {
  const select = document.getElementById('admin-target-user');
  select.innerHTML = '';
  const snap = await db.collection('users').orderBy('createdAt', 'desc').limit(200).get();
  snap.forEach(doc => {
    const data = doc.data();
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = `@${data.username || doc.id}` +
      (data.isBanned ? '  (BANLI)' : data.isSuspended ? '  (askıda)' : '') +
      (data.isMuted ? '  (susturuldu)' : '');
    select.appendChild(opt);
  });
  document.getElementById('admin-panel-overlay').classList.remove('hidden');
}

document.querySelectorAll('.prank-btn').forEach(btn => {
  btn.addEventListener('click', () => handleAdminAction(btn.dataset.action));
});

function getTargetUid() {
  return document.getElementById('admin-target-user').value;
}

async function notifyUser(uid, text) {
  await db.collection('users').doc(uid).collection('notifications').add({
    text,
    from: 'nyms Moderasyon',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  });
}

async function handleAdminAction(action) {
  const targetUid = getTargetUid();
  if (!targetUid) return;

  switch (action) {

    case 'warn': {
      const reason = prompt('Uyarı sebebi:');
      if (!reason) return;
      await db.collection('users').doc(targetUid).collection('warnings').add({
        reason,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await notifyUser(targetUid, `Topluluk kuralları uyarınca uyarıldın. Sebep: ${reason}`);
      alert('Uyarı gönderildi.');
      break;
    }

    case 'mute': {
      const minutes = prompt('Kaç dakika susturulsun? (0 = kaldır)', '60');
      if (minutes === null) return;
      const mins = parseInt(minutes, 10);
      if (mins === 0) {
        await db.collection('users').doc(targetUid).update({ isMuted: false, mutedUntil: null });
        await notifyUser(targetUid, 'Susturman kaldırıldı.');
      } else {
        const until = new Date(Date.now() + mins * 60000);
        await db.collection('users').doc(targetUid).update({
          isMuted: true,
          mutedUntil: firebase.firestore.Timestamp.fromDate(until)
        });
        await notifyUser(targetUid, `${mins} dakika boyunca gönderi/yorum paylaşamayacaksın.`);
      }
      alert('İşlem tamamlandı.');
      break;
    }

    case 'suspend': {
      const days = prompt('Kaç gün askıya alınsın? (0 = kaldır)', '1');
      if (days === null) return;
      const d = parseInt(days, 10);
      if (d === 0) {
        await db.collection('users').doc(targetUid).update({ isSuspended: false, suspendedUntil: null });
        await notifyUser(targetUid, 'Hesabındaki askı kaldırıldı.');
      } else {
        const until = new Date(Date.now() + d * 86400000);
        await db.collection('users').doc(targetUid).update({
          isSuspended: true,
          suspendedUntil: firebase.firestore.Timestamp.fromDate(until)
        });
        await notifyUser(targetUid, `Hesabın topluluk kuralları ihlali nedeniyle ${d} gün askıya alındı.`);
      }
      alert('İşlem tamamlandı.');
      break;
    }

    // Kalıcı ban — Discord'daki gibi
    case 'ban': {
      const reason = prompt('Ban sebebi:');
      if (!reason) return;
      await db.collection('users').doc(targetUid).update({
        isBanned: true,
        banReason: reason,
        bannedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await notifyUser(targetUid, `Hesabın kalıcı olarak yasaklandı. Sebep: ${reason}`);
      alert('Kullanıcı banlandı.');
      break;
    }

    case 'unban': {
      await db.collection('users').doc(targetUid).update({ isBanned: false, banReason: null });
      await notifyUser(targetUid, 'Hesabındaki ban kaldırıldı.');
      alert('Ban kaldırıldı.');
      break;
    }

    case 'deletepost': {
      const postId = prompt('Silinecek gönderi ID:');
      if (!postId) return;
      await db.collection('posts').doc(postId).delete();
      await notifyUser(targetUid, 'Bir gönderin topluluk kurallarını ihlal ettiği için kaldırıldı.');
      alert('Gönderi silindi.');
      break;
    }

    case 'badge': {
      const badge = prompt('Rozet adı (ör. Erken Kullanıcı, Topluluk Yıldızı):');
      if (!badge) return;
      await db.collection('users').doc(targetUid).update({
        badges: firebase.firestore.FieldValue.arrayUnion(badge)
      });
      await notifyUser(targetUid, `🎖️ "${badge}" rozetini kazandın!`);
      alert('Rozet verildi.');
      break;
    }

    case 'announcement': {
      const text = prompt('Duyuru metni (herkese "nyms Ekibi" imzasıyla görünecek):');
      if (!text) return;
      await db.collection('announcements').add({
        text,
        from: 'nyms Ekibi',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        active: true
      });
      alert('Duyuru yayınlandı.');
      break;
    }
  }
}
