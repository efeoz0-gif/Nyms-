// ============================================================
// FIREBASE KONFİGÜRASYONU
// ============================================================
// Firebase Console > Project Settings > General > Your apps
// kısmından kendi bilgilerini buraya yapıştır.
// https://console.firebase.google.com adresinden yeni proje aç.
//
// Etkinleştirilmesi gereken servisler:
//  - Authentication > Sign-in method > Google (aç)
//  - Authentication > Sign-in method > Email Link / Passwordless (aç)
//  - Firestore Database (üret, "production mode")
//  - Storage (fotoğraf/video/ses için)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyA910hi9NRItGo-t5Gh26XMqFdAYmSalEU",
  authDomain: "arkadas-web.firebaseapp.com",
  projectId: "arkadas-web",
  storageBucket: "arkadas-web.firebasestorage.app",
  messagingSenderId: "386589453043",
  appId: "1:386589453043:web:62f80ae47e18d196f6a586",
  measurementId: "G-KDR0FH05N8"
};

// Firebase'i başlat (index.html'de compat SDK'ları yükledik)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Moderasyon erişimi artık şifre değil, efeoz5530@gmail.com hesabına
// gönderilen doğrulama koduyla korunuyor (bkz. js/moderation.js)
