// ============================================================
// NOTIFICATIONS.JS — Moderasyon bildirimleri + platform duyuruları
// Tamamen şeffaf: kullanıcı başına gelen her şey görünür.
// ============================================================

function initNotificationListener() {
  db.collection('users').doc(currentUser.uid).collection('notifications')
    .where('read', '==', false)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          alert(`🔔 ${data.from}: ${data.text}`);
          change.doc.ref.update({ read: true });
        }
      });
    });
}

function initAnnouncementListener() {
  db.collection('announcements').orderBy('createdAt', 'desc').limit(1)
    .onSnapshot(snap => {
      if (snap.empty) return;
      const doc = snap.docs[0];
      const data = doc.data();
      if (data.active && !sessionStorage.getItem('seen_announcement_' + doc.id)) {
        sessionStorage.setItem('seen_announcement_' + doc.id, '1');
        alert(`📢 ${data.from}: ${data.text}`);
      }
    });
}

const _notifyInit = setInterval(() => {
  if (currentUser && currentUserData) {
    clearInterval(_notifyInit);
    initNotificationListener();
    initAnnouncementListener();
  }
}, 300);
