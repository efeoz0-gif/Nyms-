import { auth, db } from "./firebase-config.js";
import {
  doc, runTransaction, getDoc, updateDoc, increment,
  collection, addDoc, query, where, onSnapshot, serverTimestamp,
  orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function getLeaderboard(count = 10) {
  const q = query(collection(db, "users"), orderBy("cash", "desc"), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

const DAILY_AMOUNT = 5000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function claimDaily() {
  const myRef = doc(db, "users", auth.currentUser.uid);
  let result;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(myRef);
    const data = snap.data() || {};
    const last = data.lastDailyClaim?.toMillis?.() || 0;
    const elapsed = Date.now() - last;
    if (elapsed < DAILY_COOLDOWN_MS) {
      const remainingMs = DAILY_COOLDOWN_MS - elapsed;
      const h = Math.floor(remainingMs / 3600000);
      const m = Math.floor((remainingMs % 3600000) / 60000);
      throw new Error(`Günlük ödülünü zaten aldın. Tekrar için: ${h} saat ${m} dakika`);
    }
    const newBal = (data.cash || 0) + DAILY_AMOUNT;
    tx.update(myRef, { cash: newBal, lastDailyClaim: serverTimestamp() });
    result = { newBalance: newBal };
  });
  return result;
}

export async function getMyBalance() {
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  return snap.data()?.cash || 0;
}

// --- Kullanıcılar arası para gönderme (iki farklı kullanıcı belgesini aynı anda
// değiştiremediğimiz için: önce kendi bakiyemden düşüyoruz, sonra "cashTransfers"e
// bir kayıt bırakıyoruz — alıcı online olduğunda kendi client'ı bunu kendi bakiyesine ekliyor) ---
export async function sendCash(toUid, amount) {
  amount = Math.floor(amount);
  if (!amount || amount <= 0) throw new Error("Geçersiz miktar");
  const myRef = doc(db, "users", auth.currentUser.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(myRef);
    const bal = snap.data()?.cash || 0;
    if (bal < amount) throw new Error(`Yetersiz bakiye (bakiyen: ${bal}₺)`);
    tx.update(myRef, { cash: bal - amount });
  });
  await addDoc(collection(db, "cashTransfers"), {
    from: auth.currentUser.uid, to: toUid, amount, claimed: false, createdAt: serverTimestamp()
  });
}

// Sadece admin hesabı çağırabilir — Firestore Rules zaten başka kimseye izin vermiyor
export async function adminGrantCash(targetUid, amount) {
  amount = Math.floor(amount);
  if (!amount || amount === 0) throw new Error("Geçersiz miktar");
  await updateDoc(doc(db, "users", targetUid), { cash: increment(amount) });
}

// Bana gelen (henüz "claim" edilmemiş) para transferlerini dinler ve otomatik bakiyeme ekler
export function listenIncomingTransfers(onReceived) {
  const q = query(
    collection(db, "cashTransfers"),
    where("to", "==", auth.currentUser.uid),
    where("claimed", "==", false)
  );
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type !== "added") return;
      const transfer = change.doc.data();
      const myRef = doc(db, "users", auth.currentUser.uid);
      try {
        await runTransaction(db, async (tx) => {
          const mySnap = await tx.get(myRef);
          const bal = mySnap.data()?.cash || 0;
          tx.update(myRef, { cash: bal + transfer.amount });
          tx.update(change.doc.ref, { claimed: true });
        });
        onReceived?.(transfer);
      } catch (e) { /* başka bir sekme zaten claim etmiş olabilir, sorun değil */ }
    });
  });
}

// --- Bahis motoru: bakiyeyi transaction içinde güvenli şekilde günceller ---
async function placeBet(amount, computeOutcome) {
  amount = Math.floor(amount);
  if (!amount || amount <= 0) throw new Error("Geçerli bir bahis miktarı gir (ör: /bj 50)");
  const myRef = doc(db, "users", auth.currentUser.uid);
  let result;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(myRef);
    const bal = snap.data()?.cash || 0;
    if (bal < amount) throw new Error(`Yetersiz bakiye — bakiyen: ${bal}₺`);
    result = computeOutcome(amount);
    tx.update(myRef, { cash: bal + result.delta });
    result.newBalance = bal + result.delta;
  });
  return result;
}

// ---------- Blackjack (interaktif — "Kart Çek" / "Dur" ile oynanıyor) ----------
export function drawCard() {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  return ranks[Math.floor(Math.random() * ranks.length)] + suits[Math.floor(Math.random() * suits.length)];
}
export function cardValue(card) {
  const r = card.replace(/[♠♥♦♣]/, "");
  return r === "A" ? 11 : (r === "J" || r === "Q" || r === "K") ? 10 : Number(r);
}
export function handTotal(cards) {
  let total = cards.reduce((s, c) => s + cardValue(c), 0);
  let aces = cards.filter(c => c.startsWith("A")).length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// 1. adım: bahsi hemen düş, ilk 2+2 kartı dağıt (bakiye zaten düşürüldü)
export async function startBlackjack(amount) {
  amount = Math.floor(amount);
  if (!amount || amount <= 0) throw new Error("Geçerli bir bahis miktarı gir (ör: /bj 50)");
  const myRef = doc(db, "users", auth.currentUser.uid);
  let newBalance;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(myRef);
    const bal = snap.data()?.cash || 0;
    if (bal < amount) throw new Error(`Yetersiz bakiye — bakiyen: ${bal}₺`);
    newBalance = bal - amount;
    tx.update(myRef, { cash: newBalance });
  });
  return { player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()], amount, newBalance };
}

// 2. adım: "Dur"a basınca ya da oyuncu 21'i geçince çağrılır — krupiye kartlarını tamamlar,
// kazancı (varsa) bakiyeye geri ekler. Bahis zaten startBlackjack'te düşürülmüştü.
export async function resolveBlackjack(amount, player, dealerInitial) {
  amount = Math.floor(amount);
  const dealer = [...dealerInitial];
  let pTotal = handTotal(player), dTotal = handTotal(dealer);
  let outcome, credit; // credit: bakiyeye GERİ eklenecek miktar (0 = tamamen kaybettin)

  if (pTotal > 21) { outcome = "lose"; credit = 0; }
  else if (pTotal === 21 && player.length === 2 && !(dTotal === 21 && dealer.length === 2)) {
    outcome = "blackjack"; credit = Math.floor(amount * 2.5);
  } else {
    while (dTotal < 17) { dealer.push(drawCard()); dTotal = handTotal(dealer); }
    if (dTotal > 21) { outcome = "win"; credit = amount * 2; }
    else if (pTotal > dTotal) { outcome = "win"; credit = amount * 2; }
    else if (pTotal < dTotal) { outcome = "lose"; credit = 0; }
    else { outcome = "push"; credit = amount; }
  }

  let newBalance;
  if (credit > 0) {
    const myRef = doc(db, "users", auth.currentUser.uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(myRef);
      const bal = snap.data()?.cash || 0;
      newBalance = bal + credit;
      tx.update(myRef, { cash: newBalance });
    });
  } else {
    newBalance = await getMyBalance();
  }
  return { outcome, dealer, pTotal, dTotal, newBalance };
}

// ---------- Rulet ----------
const ROULETTE_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export async function playRoulette(amount, bet) {
  // bet: "kirmizi" | "siyah" | "tek" | "cift" | 0-36 arası bir sayı (string olarak da gelebilir)
  return placeBet(amount, (amt) => {
    const number = Math.floor(Math.random() * 37); // 0-36
    const isRed = ROULETTE_RED.has(number);
    let win = false, multiplier = 0;

    if (bet === "kirmizi") { win = isRed; multiplier = 2; }
    else if (bet === "siyah") { win = number !== 0 && !isRed; multiplier = 2; }
    else if (bet === "tek") { win = number !== 0 && number % 2 === 1; multiplier = 2; }
    else if (bet === "cift") { win = number !== 0 && number % 2 === 0; multiplier = 2; }
    else if (!isNaN(Number(bet))) { win = Number(bet) === number; multiplier = 36; }

    const delta = win ? amt * (multiplier - 1) : -amt;
    return { delta, win, number, color: number === 0 ? "yeşil" : (isRed ? "kırmızı" : "siyah") };
  });
}

// ---------- Slot ----------
const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "⭐", "💎", "7️⃣"];
export async function playSlots(amount) {
  return placeBet(amount, (amt) => {
    const reels = [0, 0, 0].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
    let delta;
    if (reels[0] === reels[1] && reels[1] === reels[2]) delta = amt * 9; // üçü aynı
    else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) delta = amt * 1; // ikisi aynı (küçük kazanç)
    else delta = -amt;
    return { delta, reels };
  });
}

// ---------- Yazı Tura ----------
export async function playCoinflip(amount, choice) {
  return placeBet(amount, (amt) => {
    const result = Math.random() < 0.5 ? "yazi" : "tura";
    const win = result === choice;
    return { delta: win ? amt : -amt, win, result };
  });
}

// ---------- Zar ----------
export async function playDice(amount, guess) {
  return placeBet(amount, (amt) => {
    const roll = 1 + Math.floor(Math.random() * 6);
    const win = Number(guess) === roll;
    return { delta: win ? amt * 4 : -amt, win, roll };
  });
}

// ---------- Yüksek / Düşük ----------
export async function playHigherLower(amount, guess) {
  // guess: "yuksek" | "dusuk" — 1-100 arası çekilen sayı 50'den yüksek mi düşük mi
  return placeBet(amount, (amt) => {
    const number = 1 + Math.floor(Math.random() * 100);
    const actual = number > 50 ? "yuksek" : "dusuk";
    const win = number !== 50 && guess === actual;
    return { delta: win ? amt : -amt, win, number };
  });
}
