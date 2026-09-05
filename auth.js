// ============================================================
// AUTH.JS — Google ile giriş + Gmail 6 haneli onay kodu
// ============================================================
// Onay kodu mantığı Firebase Extensions > "Trigger Email" eklentisini
// kullanır (Firestore'a "mail" koleksiyonuna belge yazınca otomatik
// e-posta gönderir). Kurulum:
//   1. Firebase Console > Extensions > "Trigger Email from Firestore" kur
//   2. Kendi SMTP bilgilerini (ör. Gmail App Password) eklentiye gir
//   3. Koleksiyon adını "mail" olarak bırak (varsayılan)
// Eklenti kurulmadan kod gönderimi çalışmaz — kurana kadar test için
// console.log ile kodu ekrana da yazdırıyoruz (DEV_MODE_SHOW_CODE).
// ============================================================

const DEV_MODE_SHOW_CODE = false; // Eklenti kurulu, artık ekrana kod yazdırmıyoruz

let pendingUser = null;
let pendingCode = null;
let isNewUser = false;

const stepGoogle = document.getElementById('step-google');
const stepConsent = document.getElementById('step-consent');
const stepCode = document.getElementById('step-code');
const authMessage = document.getElementById('auth-message');

function showMessage(text, isError = true) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? '#E36B6B' : '#7FC7A6';
}

function showStep(step) {
  [stepGoogle, stepConsent, stepCode].forEach(s => s.classList.add('hidden'));
  step.classList.remove('hidden');
}

// Zaten giriş yapılmış (kalıcı) bir oturum varsa ve daha önce doğrulanmışsa
// giriş ekranını hiç göstermeden direkt uygulamaya geç — her seferinde
// tekrar giriş yapmak / kod girmek zorunda kalmamak için.
auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  const doc = await db.collection('users').doc(user.uid).get();
  if (doc.exists && doc.data().emailVerified) {
    window.location.href = 'app.html';
  }
});

// ---- ADIM 1: Google ile giriş (redirect yöntemi — mobil Safari'de popup güvenilir çalışmıyor) ----
document.getElementById('btn-google').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithRedirect(provider);
  } catch (err) {
    console.error(err);
    showMessage('Giriş başlatılamadı: ' + err.message);
  }
});

// Sayfa Google'dan geri döndüğünde çalışır
auth.getRedirectResult().then(async (result) => {
  if (!result || !result.user) return;
  await handleAuthenticatedUser(result.user);
}).catch((err) => {
  console.error(err);
  showMessage('Giriş başarısız: ' + err.message);
});

// ---- E-posta ile Üye Ol ----
document.getElementById('btn-email-signup').addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;

  if (!email || password.length < 6) {
    showMessage('Geçerli bir e-posta gir ve en az 6 karakterli şifre seç.');
    return;
  }

  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    await handleAuthenticatedUser(result.user);
  } catch (err) {
    console.error(err);
    showMessage('Üye olunamadı: ' + err.message);
  }
});

// ---- E-posta ile Giriş Yap ----
document.getElementById('btn-email-login').addEventListener('click', async () => {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;

  if (!email || !password) {
    showMessage('E-posta ve şifreni gir.');
    return;
  }

  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    await handleAuthenticatedUser(result.user);
  } catch (err) {
    console.error(err);
    showMessage('Giriş yapılamadı: ' + err.message);
  }
});

// Google/e-posta hangi yoldan gelirse gelsin ortak akış
async function handleAuthenticatedUser(user) {
  pendingUser = user;
  const userDoc = await db.collection('users').doc(user.uid).get();
  isNewUser = !userDoc.exists;

  if (isNewUser) {
    showStep(stepConsent);
  } else if (userDoc.data().emailVerified) {
    // Daha önce doğrulanmış — her girişte tekrar kod istemeye gerek yok
    window.location.href = 'app.html';
  } else {
    await sendVerificationCode();
  }
}

// ---- ADIM 2: Rıza metni ----
document.getElementById('btn-consent-continue').addEventListener('click', async () => {
  const accepted = document.getElementById('consent-checkbox').checked;

  if (!accepted) {
    showMessage('Devam etmek için kullanım koşullarını kabul etmelisin.');
    return;
  }

  await db.collection('users').doc(pendingUser.uid).set({
    email: pendingUser.email,
    displayName: pendingUser.displayName || pendingUser.email.split('@')[0],
    photoURL: pendingUser.photoURL || '',
    username: pendingUser.email.split('@')[0] + Math.floor(Math.random() * 1000),
    termsAccepted: accepted,
    isSuspended: false,
    isMuted: false,
    isBanned: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await sendVerificationCode();
});

// ---- ADIM 3: Gmail onay kodu üret + gönder ----
async function sendVerificationCode() {
  pendingCode = Math.floor(100000 + Math.random() * 900000).toString();

  await db.collection('pendingCodes').doc(pendingUser.uid).set({
    code: pendingCode,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    expiresInMinutes: 10
  });

  // Trigger Email eklentisi için "mail" koleksiyonuna yazıyoruz
  try {
    await db.collection('mail').add({
      to: [pendingUser.email],
      message: {
        subject: 'nyms doğrulama kodun',
        text: `Doğrulama kodun: ${pendingCode}\n\nBu kodu kimseyle paylaşma.`,
        html: `<p>Doğrulama kodun: <strong style="font-size:20px">${pendingCode}</strong></p><p>Bu kodu kimseyle paylaşma.</p>`
      }
    });
  } catch (err) {
    console.error('Mail gönderilemedi (eklenti kurulu mu?):', err);
  }

  document.getElementById('code-sent-to').textContent = `${pendingUser.email} adresine 6 haneli kod gönderildi.`;
  showStep(stepCode);

  if (DEV_MODE_SHOW_CODE) {
    console.log('%c[DEV] Doğrulama kodu: ' + pendingCode, 'font-size:16px;color:#E3A008;');
  }
}

document.getElementById('btn-resend').addEventListener('click', sendVerificationCode);

// ---- Kod doğrulama ----
document.getElementById('btn-verify').addEventListener('click', async () => {
  const entered = document.getElementById('code-input').value.trim();
  const codeDoc = await db.collection('pendingCodes').doc(pendingUser.uid).get();

  if (!codeDoc.exists) {
    showMessage('Kod bulunamadı, tekrar gönder.');
    return;
  }

  const data = codeDoc.data();
  const createdAt = data.createdAt ? data.createdAt.toDate() : new Date();
  const minutesPassed = (Date.now() - createdAt.getTime()) / 60000;

  if (minutesPassed > data.expiresInMinutes) {
    showMessage('Kodun süresi doldu, tekrar gönder.');
    return;
  }

  if (entered !== data.code) {
    showMessage('Kod yanlış.');
    return;
  }

  // Doğrulandı — kullanılan kodu sil, giriş yapılmış say
  await db.collection('pendingCodes').doc(pendingUser.uid).delete();
  await db.collection('users').doc(pendingUser.uid).set({
    lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
    emailVerified: true
  }, { merge: true });

  window.location.href = 'app.html';
});
