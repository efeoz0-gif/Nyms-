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

// ---- Durum (presence) noktası ----
function presenceDotHtml(status, customStatus) {
  const colors = { online: '🟢', dnd: '🔴', invisible: '⚪', custom: '🟣' };
  const dot = colors[status] || '⚪';
  const title = status === 'custom' && customStatus ? ` title="${customStatus}"` : '';
  return `<span${title}>${dot}</span>`;
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
  for (const doc of usersSnap.docs) {
    if (doc.id === currentUser.uid) continue;
    const data = doc.data();
    const isFollowing = followingIds.includes(doc.id);
    const friendStatus = await getFriendshipStatus(doc.id);

    let friendBtnHtml;
    if (friendStatus === 'accepted') {
      friendBtnHtml = `<button class="btn btn-ghost btn-sm" data-remove-friend="${doc.id}">✅ Arkadaş</button>`;
    } else if (friendStatus === 'sent') {
      friendBtnHtml = `<button class="btn btn-ghost btn-sm" disabled>İstek Gönderildi</button>`;
    } else if (friendStatus === 'received') {
      friendBtnHtml = `<button class="btn btn-primary btn-sm" data-accept-friend="${doc.id}">Kabul Et</button>`;
    } else {
      friendBtnHtml = `<button class="btn btn-ghost btn-sm" data-add-friend="${doc.id}">➕ Arkadaş Ekle</button>`;
    }

    const row = document.createElement('div');
    row.className = 'streak-item';
    row.style.flexWrap = 'wrap';
    const presenceDot = presenceDotHtml(data.presenceStatus, data.customStatus);
    row.innerHTML = `
      <span>${presenceDot} @${data.username || doc.id}</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" data-msg-uid="${doc.id}" title="Mesaj at">💬</button>
        ${viewerIsMod ? `<button class="btn btn-ghost btn-sm" data-mod-uid="${doc.id}" title="Moderasyon">🛡️</button>` : ''}
        ${friendBtnHtml}
        <button class="btn btn-sm ${isFollowing ? 'btn-ghost' : 'btn-primary'}" data-uid="${doc.id}" data-following="${isFollowing}">
          ${isFollowing ? 'Takipten Çık' : 'Takip Et'}
        </button>
      </span>`;

    row.querySelector('[data-uid]').addEventListener('click', async (e) => {
      const uid = e.target.dataset.uid;
      const following = e.target.dataset.following === 'true';
      if (following) await unfollowUser(uid); else await followUser(uid);
      renderUserDiscovery();
      loadOnThisDay();
    });

    row.querySelector('[data-msg-uid]').addEventListener('click', () => {
      openOrCreateChat(doc.id, data.displayName || '@' + doc.id, data.photoURL);
    });

    row.querySelector('[data-mod-uid]')?.addEventListener('click', () => {
      openAdminPanelForUser(doc.id);
    });

    row.querySelector('[data-add-friend]')?.addEventListener('click', async (e) => {
      await sendFriendRequest(e.target.dataset.addFriend);
      renderUserDiscovery();
    });

    row.querySelector('[data-accept-friend]')?.addEventListener('click', async (e) => {
      await acceptFriendRequest(e.target.dataset.acceptFriend);
      renderUserDiscovery();
    });

    row.querySelector('[data-remove-friend]')?.addEventListener('click', async (e) => {
      if (confirm('Arkadaşlıktan çıkarılsın mı?')) {
        await declineOrRemoveFriend(e.target.dataset.removeFriend);
        renderUserDiscovery();
      }
    });

    container.appendChild(row);
  }
}
