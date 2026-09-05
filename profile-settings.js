// ============================================================
// PROFILE-SETTINGS.JS — Profil fotoğrafı, isim, tema, çıkış
// ============================================================

function loadSettingsForm() {
  document.getElementById('settings-avatar-preview').src = currentUserData.photoURL || '';
  document.getElementById('settings-displayname').value = currentUserData.displayName || '';
  document.getElementById('settings-username').value = currentUserData.username || '';
  document.getElementById('settings-birthday').value = currentUserData.birthday || '';
}

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
      username: document.getElementById('settings-username').value.trim(),
      birthday: document.getElementById('settings-birthday').value.trim()
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
