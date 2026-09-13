import { auth, db, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID } from "./firebase-config.js";
import { createOrRefreshProfile } from "./auth.js";
import {
  signInAnonymously,
  signInWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 haneli
}

// EmailJS'in tarayıcı SDK'sını sayfaya dinamik olarak yükler (bir kere)
let emailjsLoaded = null;
function loadEmailJS() {
  if (emailjsLoaded) return emailjsLoaded;
  emailjsLoaded = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    script.onload = () => {
      window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      resolve(window.emailjs);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return emailjsLoaded;
}

/**
 * 1. adım: email+şifre alınır, anonim oturum açılır (henüz kalıcı hesap yok),
 * 6 haneli kod üretilip Firestore'a (sadece bu anonim uid okuyabilir/yazabilir
 * şekilde) kaydedilir ve EmailJS ile kullanıcıya gönderilir.
 */
export async function startEmailSignup(email, password) {
  if (password.length < 6) throw new Error("Şifre en az 6 karakter olmalı");

  let user = auth.currentUser;
  if (!user) {
    const result = await signInAnonymously(auth);
    user = result.user;
  }

  const code = generateCode();
  const expiresAt = Timestamp.fromMillis(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await setDoc(doc(db, "emailVerifications", user.uid), {
    email,
    code,
    attempts: 0,
    expiresAt,
    createdAt: serverTimestamp()
  });

  const emailjs = await loadEmailJS();
  // EmailJS'in hazır "One-Time Password" şablonu genelde {{passcode}} ve {{time}}
  // değişkenlerini kullanır; ihtimale karşı yaygın isimlerin hepsini gönderiyoruz,
  // şablon kullanmadığı değişkeni zaten yok sayar.
  await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: email,
    email,
    code,
    passcode: code,
    time: `${CODE_TTL_MINUTES} dakika`
  });

  return user.uid;
}

/**
 * 2. adım: kullanıcı emailine gelen kodu girer. Doğruysa anonim hesap,
 * gerçek email+şifre hesabına dönüştürülür (linkWithCredential) ve profil oluşturulur.
 */
export async function confirmEmailSignup(inputCode, email, password) {
  const user = auth.currentUser;
  if (!user) throw new Error("Oturum bulunamadı, lütfen tekrar başla");

  const verifRef = doc(db, "emailVerifications", user.uid);
  const snap = await getDoc(verifRef);
  if (!snap.exists()) throw new Error("Doğrulama isteği bulunamadı, kodu tekrar gönder");

  const data = snap.data();

  if (data.attempts >= MAX_ATTEMPTS) {
    await deleteDoc(verifRef);
    throw new Error("Çok fazla yanlış deneme. Lütfen yeni kod iste");
  }
  if (Date.now() > data.expiresAt.toMillis()) {
    await deleteDoc(verifRef);
    throw new Error("Kodun süresi doldu. Lütfen yeni kod iste");
  }
  if (data.code !== inputCode.trim()) {
    await setDoc(verifRef, { attempts: data.attempts + 1 }, { merge: true });
    throw new Error("Kod yanlış");
  }

  // Kod doğru: anonim hesabı kalıcı email/şifre hesabına dönüştür
  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(user, credential);
  await createOrRefreshProfile(user, { displayNameOverride: email.split("@")[0] });
  await deleteDoc(verifRef);

  return user;
}

// Daha önce email+şifre ile hesap açmış (doğrulanmış) kullanıcı girişi
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  await createOrRefreshProfile(result.user);
  return result.user;
}
