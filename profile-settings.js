// ============================================================
// PROFILE-SETTINGS.JS — Profil fotoğrafı, isim, tema, çıkış
// ============================================================

function loadSettingsForm() {
  document.getElementById('settings-avatar-preview').src = currentUserData.photoURL || '';
  document.getElementById('settings-displayname').value = currentUserData.displayName || '';
  document.getElementById('settings-username').value = currentUserData.username || '';
  document.getElementById('settings-custom-status').value = currentUserData.customStatus || '';

  document.querySelectorAll('[data-presence-btn]').forEach(btn => {
    btn.classList.toggle('active-presence', btn.dataset.presenceBtn === (currentUserData.presenceStatus || 'online'));
  });

  const compactSaved = localStorage.getItem('nyms_compact') === 'true';
  document.getElementById('settings-compact-mode').checked = compactSaved;
  document.body.classList.toggle('compact', compactSaved);
}

// ---- Durum (presence) ----
document.querySelectorAll('[data-presence-btn]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const status = btn.dataset.presenceBtn;
    await db.collection('users').doc(currentUser.uid).update({ presenceStatus: status });
    currentUserData.presenceStatus = status;
    document.querySelectorAll('[data-presence-btn]').forEach(b => b.classList.toggle('active-presence', b === btn));
  });
});

document.getElementById('btn-save-custom-status').addEventListener('click', async () => {
  const text = document.getElementById('settings-custom-status').value.trim();
  await db.collection('users').doc(currentUser.uid).update({
    customStatus: text,
    presenceStatus: text ? 'custom' : (currentUserData.presenceStatus === 'custom' ? 'online' : currentUserData.presenceStatus)
  });
  currentUserData.customStatus = text;
  alert('Durum güncellendi.');
});

// ---- Kompakt mod ----
document.getElementById('settings-compact-mode').addEventListener('change', (e) => {
  document.body.classList.toggle('compact', e.target.checked);
  localStorage.setItem('nyms_compact', e.target.checked);
});

// Profil fotoğrafı önizleme + yükleme
document.getElementById('settings-avatar-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('settings-avatar-preview').src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-settings');
  btn.textContent = 'Kaydediliyor...';
  btn.disabled = true;

  try {
    const updates = {
      displayName: document.getElementById('settings-displayname').value.trim(),
      username: document.getElementById('settings-username').value.trim()
    };

    const fileInput = document.getElementById('settings-avatar-input');
    if (fileInput.files[0]) {
      const file = fileInput.files[0];
      const ref = storage.ref(`avatars/${currentUser.uid}`);
      await ref.put(file);
      updates.photoURL = await ref.getDownloadURL();
    }

    await db.collection('users').doc(currentUser.uid).update(updates);
    Object.assign(currentUserData, updates);
    document.getElementById('my-avatar').src = currentUserData.photoURL || '';
    alert('Ayarlar kaydedildi.');
  } catch (err) {
    console.error(err);
    alert('Kaydedilemedi: ' + err.message);
  }

  btn.textContent = 'Kaydet';
  btn.disabled = false;
});

// Tema butonları
document.querySelectorAll('[data-theme-btn]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme', btn.dataset.themeBtn);
    localStorage.setItem('nyms_theme', btn.dataset.themeBtn);
  });
});

// Sayfa açılışında kayıtlı tema tercihi varsa uygula
const savedTheme = localStorage.getItem('nyms_theme');
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

// Çıkış yap
document.getElementById('btn-logout').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = 'index.html';
});
