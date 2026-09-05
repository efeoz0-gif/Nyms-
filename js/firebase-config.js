// ============================================================
// FIREBASE KONFİGÜRASYONU
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

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Moderatör paneli şifresi
const ADMIN_PASSWORD = "Efeoz1907fenerbahçe";
