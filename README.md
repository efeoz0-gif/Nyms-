# nyms — Faz 1, 2 & 3: Auth + Arkadaşlık + Sunucular + Kanallar + DM/Grup

> **Önemli:** Tüm dosyalar artık **tek düzeyde (klasörsüz)** — `styles.css`, `firebase-config.js`
> gibi dosyaların hepsi repo'nun ana dizininde. GitHub'a yüklerken hepsini
> **tek seferde, aynı ekrandan** seçip yükle (birini yükleyip sonra tekrar
> "Add file" ile diğerini eklemek yerine). Klasör YOK, hepsi düz.


## Firebase Console'da yapman gerekenler (bir kereye mahsus)

1. **Authentication → Sign-in method**'de şunları aktif et:
   - **Google**
   - **Email/Password**
   - **Anonymous** (email doğrulama akışı bunu kullanıyor — kod doğrulanana kadar geçici anonim oturum açılıyor)
2. **Authentication → Settings → Authorized domains**'e test ettiğin adresi ekle.
   Google girişi çalışmıyorsa **en sık sebep budur** — `file://` ile açtıysan hiç çalışmaz,
   bir local server (`npx serve` gibi) ya da GitHub Pages linkiyle test et.
3. **Firestore Database → Veritabanı oluştur**, "production mode" seç.
4. **Firestore → Rules** kısmına aşağıdaki kuralları yapıştır ve yayınla:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }
    function isAdmin() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    match /users/{uid} {
      allow read: if isSignedIn();
      allow create: if isSelf(uid);
      // Kullanıcı kendi profilini günceller, admin herkesi (ban/mute/rol için) günceller
      allow update: if isSelf(uid) || isAdmin();
      allow delete: if false;

      match /friends/{friendId} {
        allow read: if isSelf(uid) || isAdmin();
        allow write: if isSelf(uid);
      }
      match /blocked/{blockedId} {
        allow read, write: if isSelf(uid);
      }
    }

    match /friendRequests/{reqId} {
      allow read: if isSignedIn() &&
        (resource.data.from == request.auth.uid || resource.data.to == request.auth.uid);
      allow create: if isSignedIn() && request.resource.data.from == request.auth.uid;
      allow delete: if isSignedIn() &&
        (resource.data.from == request.auth.uid || resource.data.to == request.auth.uid);
    }

    // Email doğrulama kodları — sadece kodun sahibi (anonim uid) kendi belgesini görebilir
    match /emailVerifications/{uid} {
      allow read, write: if isSelf(uid);
    }

    // ---- Faz 2: Sunucular, kanallar, mesajlar ----
    match /servers/{serverId} {
      function isMember() {
        return isSignedIn() &&
          exists(/databases/$(database)/documents/servers/$(serverId)/members/$(request.auth.uid));
      }
      function myRole() {
        return get(/databases/$(database)/documents/servers/$(serverId)/members/$(request.auth.uid)).data.role;
      }
      function isServerStaff() {
        return isMember() && (myRole() == "owner" || myRole() == "admin");
      }

      allow read: if isMember();
      allow create: if isSignedIn();
      allow update, delete: if isMember() && myRole() == "owner";

      match /members/{memberUid} {
        allow read: if isMember();
        allow create: if isSelf(memberUid);
        allow update: if isSelf(memberUid) || isServerStaff() || isAdmin();
        allow delete: if isSelf(memberUid) || isServerStaff();
      }

      match /channels/{channelId} {
        allow read: if isMember();
        allow create, delete: if isServerStaff();
        allow update: if isServerStaff();

        match /messages/{messageId} {
          allow read: if isMember();
          allow create: if isMember() && request.resource.data.authorUid == request.auth.uid;
          allow update: if isMember() && resource.data.authorUid == request.auth.uid;
          allow delete: if isMember() &&
            (resource.data.authorUid == request.auth.uid || isServerStaff());
        }
      }
    }

    // ---- Faz 3: DM & Grup sohbetleri ----
    match /dmThreads/{threadId} {
      function isThreadMember() {
        return isSignedIn() && request.auth.uid in resource.data.memberUids;
      }
      function isThreadMemberOnCreate() {
        return isSignedIn() && request.auth.uid in request.resource.data.memberUids;
      }

      allow read: if isThreadMember();
      allow create: if isThreadMemberOnCreate();
      // Sadece üye listesi güncellenebilir (gruptan ayrılma vb.) — thread'i sadece üye günceller
      allow update: if isThreadMember();
      allow delete: if false;

      match /messages/{messageId} {
        allow read: if isSignedIn() &&
          request.auth.uid in get(/databases/$(database)/documents/dmThreads/$(threadId)).data.memberUids;
        allow create: if isSignedIn() && request.resource.data.authorUid == request.auth.uid &&
          request.auth.uid in get(/databases/$(database)/documents/dmThreads/$(threadId)).data.memberUids;
        allow update: if isSignedIn() && resource.data.authorUid == request.auth.uid;
        allow delete: if isSignedIn() && resource.data.authorUid == request.auth.uid;
      }
    }
  }
}
```

4. **Firestore → Indexes**: `username == && tag ==` sorgusu için bileşik index istenebilir.
   İlk aramada Firebase konsolu hatada otomatik bir link verir — o linke tıklaman yeterli, index kendini oluşturur (birkaç dakika sürer).

5. **efeoz5530@gmail.com ile bir kez giriş yap.** `auth.js` bu maili görünce
   `isAdmin: true` alanını otomatik set ediyor — elle bir şey yapmana gerek yok.

## EmailJS Kurulumu (kod gönderimi için şart)

Zaten bir servisin (`service_4pomuid` — Gmail) ve hazır bir **One-Time Password** şablonun
(`template_d2etbuz`) var, ikisi de `js/firebase-config.js`'e işlendi. Tek kontrol etmen gereken:

1. EmailJS panelinde **Email Templates → One-Time Password → şablona tıkla**
2. Şablonun **"To Email"** alanının `{{to_email}}` veya `{{email}}` olarak ayarlı olduğundan emin ol
   (değilse alıcı adresi boş gider, mail gitmez)
3. Şablon içeriğinde kodun göründüğü yerde `{{passcode}}` ya da `{{code}}` yazıyor olmalı —
   kod tarafında ikisini de gönderiyoruz, şablon hangisini kullanıyorsa o dolacak

Bunlar uyuşmazsa "Kod Gönder" butonu hata vermez ama mail boş/eksik gelebilir —
ilk testte kendi emailinle dene ve gelen maili kontrol et.

## Firestore Şeması (Faz 1)

```
users/{uid}
  uid, email, username, tag, displayName, photoURL
  status: online | idle | dnd | invisible
  customStatus: string
  isAdmin, isBanned, isMuted: boolean
  createdAt, lastSeen

users/{uid}/friends/{friendUid}
  since: timestamp

users/{uid}/blocked/{blockedUid}
  since: timestamp

friendRequests/{fromUid_toUid}
  from, to, fromUsername, fromTag, fromPhoto
  status: "pending"
  createdAt

emailVerifications/{uid}   (geçici — doğrulama tamamlanınca silinir)
  email, code, attempts, expiresAt, createdAt

dmThreads/{threadId}   (1:1 için id = uid'lerin sıralı birleşimi, grup için otomatik id)
  type: "direct" | "group"
  memberUids: [uid, ...]
  memberInfo: { uid: {username, tag, photoURL} }
  name (sadece grup), ownerUid (sadece grup)
  createdAt, lastMessageAt, lastMessagePreview

dmThreads/{threadId}/messages/{messageId}   (servers/.../messages ile aynı yapı)
```

## GitHub Pages'e yayınlama

Bu klasörü olduğu gibi bir GitHub reposuna at, **Settings → Pages → Deploy from branch**
seç. Firebase Authentication → Settings → **Authorized domains**'e
`<kullaniciadi>.github.io` adresini eklemeyi unutma, yoksa Google girişi çalışmaz.

## Şu an çalışan özellikler
- Google (Gmail) ile giriş + Email/şifre kayıt (EmailJS ile kod doğrulama)
- Otomatik profil oluşturma (username#tag sistemi, Discord'daki gibi)
- Arkadaşlık isteği gönderme / kabul / reddetme, arkadaş silme
- Engelleme / engel kaldırma
- Durum sistemi (Çevrimiçi / Boşta / Rahatsız Etmeyin / Görünmez)
- Karanlık / Aydınlık tema
- **Sunucu oluşturma** (otomatik "genel" metin + "Genel Ses" kanalıyla), **davet kodu ile katılma**
- **Kanal oluşturma** (metin/ses), kanal listesi
- **Mesajlaşma:** gönderme, düzenleme, herkesten silme, emoji tepkisi, yanıtla (thread benzeri)
- **Formatlama:** `**kalın**`, `*italik*`, `||spoiler||` (tıklayınca açılıyor)
- **Özel Mesajlar (DM):** arkadaş listesinden "Mesaj" ile 1:1 sohbet başlatma
- **Grup Sohbeti:** birden fazla arkadaşı seçip isimli/isimsiz grup sohbeti kurma
- DM/grup mesajlarında da aynı formatlama, düzenleme, silme, tepki, yanıtlama özellikleri çalışıyor

> **Not — Firestore Index:** `listenMyServers` fonksiyonu bir *collectionGroup* sorgusu
> kullanıyor. İlk kez bir sunucuya girdiğinde tarayıcı konsolunda (F12) Firebase'den
> "bu sorgu için index gerekiyor" diye bir link gelirse, o linke tıklaman yeterli —
> birkaç dakikada index kendini oluşturur ve hata kaybolur. `listenMyThreads` için de
> benzer bir index istenebilir (memberUids array-contains sorgusu).

## Sırada ne var?

**Faz 4 — Sesli Kanallar** (WebRTC) — şimdi bunu yazıyorum
**Faz 5 — Moderasyon Paneli** (3 nokta menüsü: banla/sustur/rol ver)
**Faz 6 — E2EE** (DM'lerde opsiyonel)
