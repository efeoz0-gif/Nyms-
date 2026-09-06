// ============================================================
// FEED.JS — Gerçek gönderi paylaşma (metin + fotoğraf) ve akış
// posts/{postId}: { authorId, authorName, authorPhoto, text,
//   imageURL, likes:[uids], createdAt, dateKey (AA-GG), year }
// ============================================================

function renderFeedComposer() {
  const el = document.getElementById('feed-composer');
  el.innerHTML = `
    <div style="display:flex;gap:10px;">
      <img src="${currentUserData.photoURL || ''}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;">
      <div style="flex:1;">
        <textarea id="feed-text-input" rows="2" placeholder="Ne düşünüyorsun?"
          style="width:100%;resize:vertical;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-family:inherit;font-size:14px;"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <input type="file" id="feed-image-input" accept="image/*" style="font-size:12px;max-width:150px;">
          <button class="btn btn-primary btn-sm" id="btn-feed-post">Paylaş</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-feed-post').addEventListener('click', async () => {
    const text = document.getElementById('feed-text-input').value.trim();
    const fileInput = document.getElementById('feed-image-input');
    const file = fileInput.files[0];

    if (!text && !file) return;

    const btn = document.getElementById('btn-feed-post');
    btn.textContent = 'Paylaşılıyor...';
    btn.disabled = true;

    try {
      let imageURL = null;
      if (file) {
        const ref = storage.ref(`posts/${currentUser.uid}_${Date.now()}`);
        await ref.put(file);
        imageURL = await ref.getDownloadURL();
      }

      const now = new Date();
      await db.collection('posts').add({
        authorId: currentUser.uid,
        authorName: currentUserData.displayName,
        authorPhoto: currentUserData.photoURL || '',
        text,
        imageURL,
        likes: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        dateKey: now.toISOString().slice(5, 10),
        year: now.getFullYear()
      });

      document.getElementById('feed-text-input').value = '';
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      alert('Paylaşılamadı: ' + err.message);
    }

    btn.textContent = 'Paylaş';
    btn.disabled = false;
  });
}

function renderFeedPosts() {
  db.collection('posts').orderBy('createdAt', 'desc').limit(50)
    .onSnapshot(snap => {
      const container = document.getElementById('feed-posts');
      container.innerHTML = '';

      if (snap.empty) {
        container.innerHTML = '<div class="card"><p style="color:var(--text-dim);font-size:13px;">Henüz gönderi yok. İlk paylaşımı sen yap!</p></div>';
        return;
      }

      snap.forEach(doc => {
        const p = doc.data();
        const liked = (p.likes || []).includes(currentUser.uid);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <img src="${p.authorPhoto || ''}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
            <strong style="font-size:14px;">${p.authorName || '?'}</strong>
          </div>
          ${p.text ? `<p style="font-size:14px;margin-bottom:${p.imageURL ? '10px' : '8px'};">${renderRichText(p.text)}</p>` : ''}
          ${p.imageURL ? `<img src="${p.imageURL}" style="width:100%;border-radius:10px;margin-bottom:8px;">` : ''}
          <button class="btn btn-ghost btn-sm" data-like-id="${doc.id}" style="color:${liked ? 'var(--accent)' : 'var(--text-dim)'};">
            ${liked ? '❤️' : '🤍'} ${(p.likes || []).length}
          </button>
        `;
        card.querySelector('[data-like-id]').addEventListener('click', () => toggleLike(doc.id, liked));
        container.appendChild(card);
      });
    });
}

async function toggleLike(postId, currentlyLiked) {
  const ref = db.collection('posts').doc(postId);
  await ref.update({
    likes: currentlyLiked
      ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  });
}
