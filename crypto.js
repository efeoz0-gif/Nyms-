// ============================================================
// CRYPTO.JS — Gerçek E2EE: tarayıcının Web Crypto API'si
// (ECDH P-256 anahtar değişimi + AES-GCM) kullanılıyor.
// Özel anahtar SADECE tarayıcında (localStorage) tutulur, hiçbir
// zaman Firestore'a gönderilmez. Sunucu (Firebase) mesaj içeriğini
// asla düz metin göremez — sadece şifreli veriyi saklar.
//
// DÜRÜST SINIRLAR:
// - Şu an sadece 1'e-1 DM'lerde çalışıyor. Grup sohbetleri/sunucu
//   kanalları şifreli DEĞİL (çoklu alıcıya güvenli anahtar dağıtımı
//   ayrı ve daha büyük bir iş — Signal'ın yaptığı gibi).
// - Bu basit implementasyonda anahtar doğrulama (parmak izi kontrolü,
//   "bu gerçekten o kişi mi" onayı) yok — bir orta-adam saldırısına
//   karşı tam koruma için bu da eklenmeli. Yine de sunucu tarafında
//   (Firestore konsolunda dahi) mesajlar düz metin olarak görünmez.
// ============================================================

const sharedKeyCache = {}; // { otherUid: CryptoKey }

async function ensureMyKeypair() {
  const storageKey = 'nyms_privkey_' + currentUser.uid;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    const jwk = JSON.parse(stored);
    return await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
    );
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
  );
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  localStorage.setItem(storageKey, JSON.stringify(privJwk));
  await db.collection('users').doc(currentUser.uid).update({ publicKey: pubJwk });

  return keyPair.privateKey;
}

async function getSharedKey(otherUid) {
  if (sharedKeyCache[otherUid]) return sharedKeyCache[otherUid];

  const myPriv = await ensureMyKeypair();
  const otherDoc = await db.collection('users').doc(otherUid).get();
  const pubJwk = otherDoc.data()?.publicKey;
  if (!pubJwk) return null; // karşı taraf henüz hiç mesajlaşma ekranını açmamış

  const otherPub = await crypto.subtle.importKey(
    'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );

  const shared = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: otherPub },
    myPriv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  sharedKeyCache[otherUid] = shared;
  return shared;
}

async function encryptText(sharedKey, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptText(sharedKey, payload) {
  try {
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, data);
    return new TextDecoder().decode(plain);
  } catch (err) {
    console.error('Şifre çözme hatası:', err);
    return '🔒 [şifre çözülemedi]';
  }
}
