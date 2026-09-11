import { auth, db } from "./firebase-config.js";
import {
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Ücretsiz genel STUN sunucuları (NAT arkasındaki iki tarayıcıyı birbirine bağlamaya yarar).
// NOT: TURN sunucusu yok (ücretli) — çok katı NAT/firewall arkasındaki bazı ağlarda
// (bazı kurumsal/mobil operatör ağları) bağlantı kurulamayabilir. Küçük arkadaş
// gruplarında/ev ağlarında normalde sorunsuz çalışır.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

let localStream = null;
let peerConnections = {};      // uid -> RTCPeerConnection
let remoteAudioEls = {};       // uid -> <audio> elementi
let unsubParticipants = null;
let unsubSignals = {};         // uid -> [unsub fonksiyonları]
let currentPath = null;        // { serverId, channelId }
let callbacks = {};
let isMuted = false;
let isDeafened = false;

function participantsRef(serverId, channelId) {
  return collection(db, "servers", serverId, "channels", channelId, "voiceParticipants");
}
function signalRef(serverId, channelId, otherUid) {
  const id = [auth.currentUser.uid, otherUid].sort().join("_");
  return doc(db, "servers", serverId, "channels", channelId, "voiceSignals", id);
}

function createPeerConnection(otherUid) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    let audioEl = remoteAudioEls[otherUid];
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.dataset.peerUid = otherUid;
      document.body.appendChild(audioEl);
      remoteAudioEls[otherUid] = audioEl;
    }
    audioEl.srcObject = event.streams[0];
  };

  pc.onconnectionstatechange = () => {
    callbacks.onPeerStateChange?.(otherUid, pc.connectionState);
  };

  peerConnections[otherUid] = pc;
  return pc;
}

// Bir katılımcıyla (ben ↔ otherUid) bağlantı kurar. Kim "arayan" (offer oluşturan)
// olacağına uid'lerin string karşılaştırmasıyla karar verilir — bu sayede iki taraf da
// aynı anda birbirini aramaya çalışmaz (çakışma olmaz), sıra kimin önce/sonra
// katıldığından bağımsızdır.
async function connectToPeer(serverId, channelId, otherUid) {
  if (peerConnections[otherUid]) return;
  const me = auth.currentUser.uid;
  const amCaller = me > otherUid;
  const ref = signalRef(serverId, channelId, otherUid);
  const pc = createPeerConnection(otherUid);

  const myCandidatesCol = collection(ref, amCaller ? "callerCandidates" : "calleeCandidates");
  const theirCandidatesCol = collection(ref, amCaller ? "calleeCandidates" : "callerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(myCandidatesCol, event.candidate.toJSON());
  };

  const unsubSnap = onSnapshot(ref, async (snap) => {
    const data = snap.data();
    if (!data) return;
    try {
      if (amCaller && data.answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
      if (!amCaller && data.offer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(ref, { answer: { type: answer.type, sdp: answer.sdp } });
      }
    } catch (e) { console.error("Sinyalleşme hatası:", e); }
  });

  const unsubCandidates = onSnapshot(theirCandidatesCol, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    });
  });

  unsubSignals[otherUid] = [unsubSnap, unsubCandidates];

  if (amCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await setDoc(ref, { offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });
  }
}

function closePeer(uid) {
  peerConnections[uid]?.close();
  delete peerConnections[uid];
  (unsubSignals[uid] || []).forEach(fn => fn());
  delete unsubSignals[uid];
  if (remoteAudioEls[uid]) {
    remoteAudioEls[uid].remove();
    delete remoteAudioEls[uid];
  }
}

export async function joinVoiceChannel(serverId, channelId, cbs = {}) {
  callbacks = cbs;

  // Mikrofon erişimini ayrı bir hata olarak yakala — Firestore/sinyalleşme hatalarıyla karışmasın
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    const reason = e.name === "NotAllowedError" ? "Mikrofon izni reddedildi (tarayıcı ayarlarından kontrol et)"
      : e.name === "NotFoundError" ? "Bu cihazda mikrofon bulunamadı"
      : `Mikrofona erişilemedi (${e.name || e.message})`;
    throw new Error(reason);
  }

  currentPath = { serverId, channelId };
  localStream = stream;
  isMuted = false;
  isDeafened = false;
  callbacks.onLocalStream?.(localStream);

  const me = auth.currentUser;
  const profileSnap = await getDoc(doc(db, "users", me.uid));
  const profile = profileSnap.data() || {};

  try {
    await setDoc(doc(participantsRef(serverId, channelId), me.uid), {
      uid: me.uid, username: profile.username || "biri",
      avatarEmoji: profile.avatarEmoji || null, photoURL: profile.photoURL || null,
      joinedAt: serverTimestamp(), muted: false, deafened: false
    });
  } catch (e) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    currentPath = null;
    throw new Error("Kanala katılma kaydı yapılamadı (izin hatası olabilir): " + e.message);
  }

  unsubParticipants = onSnapshot(participantsRef(serverId, channelId), (snap) => {
    const participants = snap.docs.map(d => d.data());
    callbacks.onParticipants?.(participants);

    snap.docChanges().forEach(change => {
      const uid = change.doc.id;
      if (uid === me.uid) return;
      if (change.type === "added") connectToPeer(serverId, channelId, uid);
      if (change.type === "removed") closePeer(uid);
    });
  });
}

export async function leaveVoiceChannel() {
  if (!currentPath) return;
  const { serverId, channelId } = currentPath;
  const me = auth.currentUser.uid;

  Object.keys(peerConnections).forEach(closePeer);
  if (unsubParticipants) unsubParticipants();
  localStream?.getTracks().forEach(t => t.stop());
  localStream = null;

  await deleteDoc(doc(participantsRef(serverId, channelId), me)).catch(() => {});
  currentPath = null;
}

export function toggleMute() {
  if (!localStream) return isMuted;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  if (currentPath) {
    updateDoc(doc(participantsRef(currentPath.serverId, currentPath.channelId), auth.currentUser.uid), { muted: isMuted }).catch(() => {});
  }
  return isMuted;
}

// Sağırlaştır: kendi mikrofonunu değil, gelen tüm sesleri kapatır/açar (Discord'daki "deafen" gibi)
export function toggleDeafen() {
  isDeafened = !isDeafened;
  Object.values(remoteAudioEls).forEach(el => { el.muted = isDeafened; });
  // Sağırlaşınca konuşmak da anlamsız — mikrofonu da otomatik susturuyoruz (Discord'un davranışı da böyle)
  if (isDeafened && !isMuted) toggleMute();
  if (currentPath) {
    updateDoc(doc(participantsRef(currentPath.serverId, currentPath.channelId), auth.currentUser.uid), { deafened: isDeafened }).catch(() => {});
  }
  return isDeafened;
}

// Kanala katılmadan sadece o kanalda kimlerin olduğunu izler (kanal listesindeki rozet için)
export function watchChannelPresence(serverId, channelId, callback) {
  return onSnapshot(participantsRef(serverId, channelId), (snap) => {
    callback(snap.docs.map(d => d.data()));
  });
}

export function isInVoiceChannel() {
  return currentPath !== null;
}
export function currentVoiceChannelPath() {
  return currentPath;
}
