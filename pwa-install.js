// ============================================================
// PWA-INSTALL.JS — "Ana ekrana ekle" bildirimi
// ============================================================

let deferredInstallPrompt = null;
const installBanner = document.getElementById('install-banner');
const btnInstall = document.getElementById('btn-install');
const btnDismiss = document.getElementById('btn-install-dismiss');

// Kullanıcı daha önce kapattıysa tekrar gösterme (localStorage yerine
// sessionStorage kullanmıyoruz çünkü artifact kısıtı değil, gerçek site;
// yine de basit tutmak için burada tarayıcı hafızası kullanılabilir)
const DISMISSED_KEY = 'nyms_install_dismissed';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

  installBanner.classList.remove('hidden');
});

btnInstall?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log('Kurulum sonucu:', outcome);
  deferredInstallPrompt = null;
  installBanner.classList.add('hidden');
});

btnDismiss?.addEventListener('click', () => {
  installBanner.classList.add('hidden');
  localStorage.setItem(DISMISSED_KEY, 'true');
});

// iOS Safari beforeinstallprompt desteklemez — manuel talimat göster
const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

if (isIOS && !isInStandaloneMode && localStorage.getItem(DISMISSED_KEY) !== 'true') {
  installBanner.classList.remove('hidden');
  installBanner.querySelector('span').textContent =
    'nyms: Paylaş ikonuna dokun, sonra "Ana Ekrana Ekle" seç.';
  btnInstall.style.display = 'none';
}

// Service worker kaydı (PWA yüklenebilir olması için gerekli)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW kayıt hatası:', err));
  });
}
