// ============================================================
// FRIENDS.JS — Discord tarzı karşılıklı arkadaşlık sistemi
// friendships/{sıralı_uid_çifti}: { users:[uidA,uidB], requestedBy, status:'pending'|'accepted', createdAt }
// (follows.js'teki tek yönlü "takip" sisteminden ayrı ve ek bir özellik)
// ============================================================

function friendshipId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

async function sendFriendRequest(targetUid) {
  const id = friendshipId(currentUser.uid, targetUid);
  const ref = db.collection('friendships').doc(id);
  const doc = await ref.get();
  if (doc.exists) return; // zaten istek var ya da arkadaşsınız

  await ref.set({
    users: [currentUser.uid, targetUid],
    requestedBy: currentUser.uid,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await db.collection('users').doc(targetUid).collection('notifications').add({
    text: `${currentUserData.displayName} sana arkadaşlık isteği gönderdi.`,
    from: 'nyms',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    read: false
  });
}

async function acceptFriendRequest(targetUid) {
  const id = friendshipId(currentUser.uid, targetUid);
  await db.collection('friendships').doc(id).update({
    status: 'accepted',
    respondedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function declineOrRemoveFriend(targetUid) {
  const id = friendshipId(currentUser.uid, targetUid);
  await db.collection('friendships').doc(id).delete();
}

// Bir kullanıcıyla aramdaki ilişki durumu: null | 'sent' | 'received' | 'accepted'
async function getFriendshipStatus(targetUid) {
  const id = friendshipId(currentUser.uid, targetUid);
  const doc = await db.collection('friendships').doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.status === 'accepted') return 'accepted';
  return data.requestedBy === currentUser.uid ? 'sent' : 'received';
}

// ---- Gelen arkadaşlık istekleri — gerçek zamanlı, sağ panelde ----
function initFriendRequestsListener() {
  db.collection('friendships')
    .where('users', 'array-contains', currentUser.uid)
    .where('status', '==', 'pending')
    .onSnapshot(async snap => {
      const incoming = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.requestedBy !== currentUser.uid) {
          incoming.push({ id: doc.id, otherUid: data.users.find(u => u !== currentUser.uid) });
        }
      });

      const container = document.getElementById('friend-requests-list');
      const card = document.getElementById('friend-requests-card');
      if (!container || !card) return;

      if (incoming.length === 0) { card.classList.add('hidden'); return; }
      card.classList.remove('hidden');
      container.innerHTML = '';

      for (const req of incoming) {
        const userDoc = await db.collection('users').doc(req.otherUid).get();
        const uData = userDoc.data() || {};
        const row = document.createElement('div');
        row.className = 'streak-item';
        row.innerHTML = `
          <span>@${uData.username || req.otherUid}</span>
          <span style="display:flex;gap:6px;">
            <button class="btn btn-primary btn-sm" data-accept="${req.otherUid}">Kabul Et</button>
            <button class="btn btn-ghost btn-sm" data-decline="${req.otherUid}">Reddet</button>
          </span>`;
        row.querySelector('[data-accept]').addEventListener('click', async (e) => {
          await acceptFriendRequest(e.target.dataset.accept);
          renderUserDiscovery();
        });
        row.querySelector('[data-decline]').addEventListener('click', async (e) => {
          await declineOrRemoveFriend(e.target.dataset.decline);
        });
        container.appendChild(row);
      }
    });
}
