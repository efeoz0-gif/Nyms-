// ============================================================
// FOLLOWS.JS — Takip sistemi
// follows/{followerUid_followingUid}: { followerId, followingId, createdAt }
// ============================================================

async function getFollowingIds() {
  const snap = await db.collection('follows')
    .where('followerId', '==', currentUser.uid).get();
  return snap.docs.map(d => d.data().followingId);
}

async function followUser(targetUid) {
  const docId = `${currentUser.uid}_${targetUid}`;
  await db.collection('follows').doc(docId).set({
    followerId: currentUser.uid,
    followingId: targetUid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function unfollowUser(targetUid) {
  const docId = `${currentUser.uid}_${targetUid}`;
  await db.collection('follows').doc(docId).delete();
}

// ---- Basit "Kullanıcılar" keşif listesi (sağ panelde) ----
async function renderUserDiscovery() {
  const container = document.getElementById('user-discovery-list');
  if (!container) return;

  const [usersSnap, followingIds, viewerIsMod] = await Promise.all([
    db.collection('users').orderBy('createdAt', 'desc').limit(30).get(),
    getFollowingIds(),
    checkIsModerator(currentUser.uid, currentUser.email)
  ]);

  container.innerHTML = '';
  usersSnap.forEach(doc => {
    if (doc.id === currentUser.uid) return;
    const data = doc.data();
    const isFollowing = followingIds.includes(doc.id);

    const row = document.createElement('div');
    row.className = 'streak-item';
    row.innerHTML = `
      <span>@${data.username || doc.id}</span>
      <span style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" data-msg-uid="${doc.id}" title="Mesaj at">💬</button>
        ${viewerIsMod ? `<button class="btn btn-ghost btn-sm" data-mod-uid="${doc.id}" title="Moderasyon">🛡️</button>` : ''}
        <button class="btn btn-sm ${isFollowing ? 'btn-ghost' : 'btn-primary'}" data-uid="${doc.id}" data-following="${isFollowing}">
          ${isFollowing ? 'Takipten Çık' : 'Takip Et'}
        </button>
      </span>`;

    row.querySelector('[data-uid]').addEventListener('click', async (e) => {
      const uid = e.target.dataset.uid;
      const following = e.target.dataset.following === 'true';
      if (following) await unfollowUser(uid); else await followUser(uid);
      renderUserDiscovery();
      loadBirthdayCountdown();
      loadOnThisDay();
    });

    row.querySelector('[data-msg-uid]').addEventListener('click', () => {
      openOrCreateChat(doc.id, data.displayName || '@' + doc.id, data.photoURL);
    });

    row.querySelector('[data-mod-uid]')?.addEventListener('click', () => {
      openAdminPanelForUser(doc.id);
    });

    container.appendChild(row);
  });
}
