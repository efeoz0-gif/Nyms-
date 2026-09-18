// Firebase yapılandırması
// NOT: Bu değerlerin client-side'da görünmesi normaldir ve güvenlik açığı OLUŞTURMAZ.
// Gerçek güvenlik Firestore Security Rules ile sağlanır (bkz. README.md).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// EmailJS ayarları — Service ID ve Template ID'yi emailjs.com panelinden alıp buraya yapıştır
export const EMAILJS_PUBLIC_KEY = "T7dDdmCAp6iAZju8C";
export const EMAILJS_SERVICE_ID = "service_4pomuid";
export const EMAILJS_TEMPLATE_ID = "template_d2etbuz"; // One-Time Password şablonu

const firebaseConfig = {
  apiKey: "AIzaSyA910hi9NRItGo-t5Gh26XMqFdAYmSalEU",
  authDomain: "arkadas-web.firebaseapp.com",
  projectId: "arkadas-web",
  storageBucket: "arkadas-web.firebasestorage.app",
  messagingSenderId: "386589453043",
  appId: "1:386589453043:web:62f80ae47e18d196f6a586",
  measurementId: "G-KDR0FH05N8"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Sadece bu hesap admin olabilir (ilk profil oluşturulurken kontrol edilir)
export const ADMIN_EMAIL = "efeoz5530@gmail.com";
