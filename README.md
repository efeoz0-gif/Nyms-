# nyms — Kurulum Rehberi

Herkese açık, Instagram/Twitter/Discord karışımı sosyal platform.
Sunucu/kanal sistemi, sesli oda, moderasyon paneli dahil.

## 1. Firebase Projesi
1. Authentication > Sign-in method: **Google** ve **Email/Password** ikisi de açık olmalı
2. Authentication > Settings > Authorized domains: GitHub Pages adresin ekli olmalı
3. Firestore Database (production mode)
4. Storage (profil fotoğrafları için)
5. Extensions > "Trigger Email from Firestore" kur (doğrulama kodları için)

## 2. Firestore Rules
`firestore.rules` dosyasının içeriğini Firebase Console → Firestore →
Rules'a yapıştır, Publish de.

**Moderasyon artık şifreyle değil, sadece `efeoz5530@gmail.com` hesabının
e-postasına gönderilen 6 haneli kodla açılıyor** — hem client-side (kod
girişi) hem Firestore Rules seviyesinde (`isAdmin()` fonksiyonu bu email'i
kontrol ediyor) korumalı. Panel: sol menüdeki profil fotoğrafına 3 kere
hızlı tıkla.

## 3. GitHub'a Yükleme (Android/mobil için)
1. Bu zip'i indir, telefonunda "Dosyalar" (Files) uygulamasıyla aç → zip'e
   dokun, otomatik bir klasöre çıkartılacak.
2. GitHub reponu web tarayıcıdan aç → **Add file → Upload files**
3. Çıkardığın klasörün İÇİNDEKİ tüm dosya ve klasörleri seç (index.html,
   app.html, css/, js/, manifest.json, sw.js — firestore.rules ve
   README.md hariç, onlar repoya girmesi şart değil ama girse de sorun
   olmaz) → sürükle bırak veya "choose your files" ile seç
4. Commit changes

## 4. Yeni Özellikler
- **E-posta ile üye olma**: Google'a ek olarak email+şifre ile de kayıt/giriş
- **Sunucu/Kanal sistemi**: "Sunucularım" sekmesinden sunucu kur, metin ve
  sesli kanal ekle (Discord tarzı)
- **Sesli oda**: Temel WebRTC — küçük gruplarda (3-5 kişi) iyi çalışır.
  Bazı ağlarda (kısıtlı WiFi/mobil operatör) bağlantı kurulamayabilir;
  bunun kesin çözümü bir TURN sunucusu eklemek (ör. Twilio, Xirsys) ya da
  Agora/Daily.co gibi hazır bir sese geçmektir — istersen sonra ekleriz.
- **Ayarlar**: profil fotoğrafı, isim, kullanıcı adı, doğum günü, tema, çıkış
- **Moderasyon paneline ban/unban** eklendi (kalıcı yasaklama)

## 5. Yapılmayan özellikler (bilinçli olarak)
- Şifresiz başka birinin hesabına girip onun adına gönderi/mesaj atma
- Yazarken mesajı fark ettirmeden değiştirme
- Gerçek güvenlik tehdidi taklit eden sahte bildirimler
- Jumpscare/ekran dondurma gibi "şaka" özellikleri (açık platformda kaldırıldı)

## Dosya Yapısı
```
index.html              → giriş/kayıt (Google + e-posta/şifre + Gmail kod)
app.html                → ana panel (feed, sunucular, ayarlar, moderasyon)
firestore.rules         → Firebase Console'a yapıştırılacak güvenlik kuralları
css/styles.css          → tüm tasarım
js/firebase-config.js   → Firebase bağlantısı
js/auth.js              → giriş akışı (Google + email/şifre)
js/app.js               → feed, doğum günü sayacı, streak, view geçişleri
js/follows.js           → takip sistemi
js/moderation.js        → moderasyon paneli (email-kod korumalı, 3 tık)
js/notifications.js     → moderasyon bildirimleri + duyurular
js/profile-settings.js  → profil fotoğrafı, isim, tema, çıkış
js/servers.js           → sunucu/kanal sistemi (Discord tarzı)
js/voice.js             → sesli oda (WebRTC)
js/pwa-install.js       → ana ekrana ekle bildirimi
```
