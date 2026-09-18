import { auth, db } from "./firebase-config.js";
import { doc, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// --- Market kataloğu (istemci tarafında sabit — Firestore'a gerek yok) ---
export const SHOP_CATALOG = {
  "İsim Renkleri 🎨": [
    { id: "color_ice", type: "nameColor", value: "#7DD3FC", name: "Buz Mavisi", price: 500, emoji: "🧊" },
    { id: "color_mint", type: "nameColor", value: "#6EE7B7", name: "Nane Yeşili", price: 500, emoji: "🌿" },
    { id: "color_rose", type: "nameColor", value: "#FDA4AF", name: "Gül Pembesi", price: 800, emoji: "🌹" },
    { id: "color_violet", type: "nameColor", value: "#C4B5FD", name: "Ametist", price: 1200, emoji: "💜" },
    { id: "color_gold", type: "nameColor", value: "#FBBF24", name: "Altın", price: 3000, emoji: "🏆" },
    { id: "color_rainbow", type: "nameColor", value: "rainbow", name: "Gökkuşağı (Efsanevi)", price: 12000, emoji: "🌈", legendary: true }
  ],
  "Avatar Çerçeveleri ✨": [
    { id: "frame_silver", type: "avatarFrame", value: "silver", name: "Gümüş Çerçeve", price: 600, emoji: "⚪" },
    { id: "frame_gold", type: "avatarFrame", value: "gold", name: "Altın Çerçeve", price: 2500, emoji: "🟡" },
    { id: "frame_fire", type: "avatarFrame", value: "fire", name: "Ateş Çerçevesi", price: 5000, emoji: "🔥" },
    { id: "frame_galaxy", type: "avatarFrame", value: "galaxy", name: "Galaksi (Efsanevi)", price: 15000, emoji: "🌌", legendary: true }
  ],
  "Rozetler / Ünvanlar 👑": [
    { id: "title_vip", type: "title", value: "VIP", name: "VIP Rozeti", price: 1000, emoji: "👑" },
    { id: "title_lucky", type: "title", value: "Şanslı", name: "Şanslı Rozeti", price: 1500, emoji: "🍀" },
    { id: "title_legend", type: "title", value: "Efsane", name: "Efsane Rozeti", price: 4000, emoji: "⚡" },
    { id: "title_rich", type: "title", value: "Zengin", name: "Zengin Rozeti", price: 8000, emoji: "💎" }
  ]
};

export function findShopItem(itemId) {
  for (const items of Object.values(SHOP_CATALOG)) {
    const found = items.find(i => i.id === itemId);
    if (found) return found;
  }
  return null;
}

// Satın alma — bakiyeyi transaction ile güvenli şekilde düşürür, sonra ilgili alanı kendi profiline uygular.
// Kendi profilini güncellemek (isSelf) zaten Rules'ta serbest, market için ekstra izin gerekmiyor.
export async function buyShopItem(itemId) {
  const item = findShopItem(itemId);
  if (!item) throw new Error("Eşya bulunamadı");

  const myRef = doc(db, "users", auth.currentUser.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(myRef);
    const bal = snap.data()?.cash || 0;
    if (bal < item.price) throw new Error(`Yetersiz bakiye — bakiyen: ${bal}₺, gereken: ${item.price}₺`);
    const owned = snap.data()?.ownedItems || [];
    if (owned.includes(itemId)) throw new Error("Bu eşyaya zaten sahipsin");
    tx.update(myRef, {
      cash: bal - item.price,
      ownedItems: [...owned, itemId]
    });
  });
}

// Sahip olunan (daha önce satın alınmış) bir eşyayı aktif olarak giyme/kullanma — ücretsiz, sınırsız değiştirilebilir
export async function equipShopItem(itemId) {
  const item = findShopItem(itemId);
  if (!item) throw new Error("Eşya bulunamadı");
  const field = item.type; // "nameColor" | "avatarFrame" | "title"
  await updateDoc(doc(db, "users", auth.currentUser.uid), { [field]: item.value });
}

export async function unequipField(field) {
  await updateDoc(doc(db, "users", auth.currentUser.uid), { [field]: null });
}
