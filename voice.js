// ============================================================
// VOICE.JS — Temel sesli oda (WebRTC, peer-to-peer mesh)
// ============================================================
// NOT: Bu, sinyal iletimi için Firestore kullanan basit bir
// "mesh" (herkes herkese direkt bağlanır) WebRTC uygulamasıdır.
// 3-5 kişilik gruplarda iyi çalışır. Kısıtlı ağlarda (bazı mobil
// operatör/kurumsal WiFi) bağlantı kurulamayabilir — bunun için
// gerçek bir TURN sunucusu (ör. Twilio, Xirsys, kendi coturn'ün)
// eklemek gerekir. STUN olarak şimdilik Google'ın ücretsiz
// sunucusu kullanılıyor, bu üretim için yeterli olmayabilir.
// Büyük/kaliteli sesli odalar için Agora/Daily.co gibi hazır bir
// servise geçmek çok daha sağlam olur.
// ============================================================

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let localStream = null;
let peerConnections = {}; // { uid: RTCPeerConnection }
let voiceChannelRef = null;
let voiceUnsubscribes = [];
let isMicMuted = false;

async function renderVoiceChannel(contentEl, channelId, name) {
  contentEl.innerHTML = `
    <h4 style="margin-bottom:10px;">🔊 ${name}</h4>
    <div id="voice-participants" style="margin-bottom:14px;"></div>
    <button class="btn btn-primary" id="btn-join-voice">Odaya Katıl</button>
    <button class="btn btn-ghost hidden" id="btn-leave-voice">Odadan Ayrıl</button>
    <button class="btn btn-ghost hidden" id="btn-toggle-mic">🎙️ Mikrofonu Kapat</button>
  `;

  voiceChannelRef = db.collection('servers').doc(currentServerId)
    .collection('channels').doc(channelId);

  renderVoiceParticipants();

  document.getElementById('btn-join-voice').addEventListener('click', () => joinVoiceChannel());
  document.getElementById('btn-leave-voice').addEventListener('click', () => leaveVoiceChannel());
  document.getElementById('btn-toggle-mic').addEventListener('click', toggleMic);
}

function renderVoiceParticipants() {
  const unsub = voiceChannelRef.collection('participants').onSnapshot(snap => {
    const container = document.getElementById('voice-participants');
    if (!container) return;
    container.innerHTML = '';
    snap.forEach(doc => {
      const p = document.createElement('span');
      p.style.cssText = 'display:inline-block;background:var(--surface-2);padding:6px 12px;border-radius:20px;margin:0 6px 6px 0;font-size:13px;';
      p.textContent = '🎤 ' + (doc.data().displayName || doc.id);
      container.appendChild(p);
    });
  });
  voiceUnsubscribes.push(unsub);
}

async function joinVoiceChannel() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    alert('Mikrofon izni gerekli: ' + err.message);
    return;
  }

  document.getElementById('btn-join-voice').classList.add('hidden');
  document.getElementById('btn-leave-voice').classList.remove('hidden');
  document.getElementById('btn-toggle-mic').classList.remove('hidden');

  // Kendini katılımcı olarak yaz
  await voiceChannelRef.collection('participants').doc(currentUser.uid).set({
    displayName: currentUserData.displayName,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Odadaki diğer herkesle bağlantı kur
  const existingSnap = await voiceChannelRef.collection('participants').get();
  existingSnap.forEach(doc => {
    if (doc.id !== currentUser.uid) connectToPeer(doc.id, true);
  });

  // Sonradan katılanlarla da bağlantı kur
  const unsub = voiceChannelRef.collection('participants').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && change.doc.id !== currentUser.uid && !peerConnections[change.doc.id]) {
        connectToPeer(change.doc.id, false);
      }
      if (change.type === 'removed' && peerConnections[change.doc.id]) {
        peerConnections[change.doc.id].close();
        delete peerConnections[change.doc.id];
      }
    });
  });
  voiceUnsubscribes.push(unsub);

  // Gelen sinyalleri dinle (bana yönelik offer/answer/ice)
  const sigUnsub = voiceChannelRef.collection('signals')
    .where('to', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return;
        const sig = change.doc.data();
        await handleSignal(sig);
        change.doc.ref.delete();
      });
    });
  voiceUnsubscribes.push(sigUnsub);
}

function connectToPeer(remoteUid, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections[remoteUid] = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    let audioEl = document.getElementById('audio-' + remoteUid);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'audio-' + remoteUid;
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      voiceChannelRef.collection('signals').add({
        from: currentUser.uid,
        to: remoteUid,
        type: 'ice',
        candidate: event.candidate.toJSON(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      voiceChannelRef.collection('signals').add({
        from: currentUser.uid,
        to: remoteUid,
        type: 'offer',
        sdp: offer.sdp,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    };
  }
}

async function handleSignal(sig) {
  let pc = peerConnections[sig.from];
  if (!pc) {
    connectToPeer(sig.from, false);
    pc = peerConnections[sig.from];
  }

  if (sig.type === 'offer') {
    await pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    voiceChannelRef.collection('signals').add({
      from: currentUser.uid,
      to: sig.from,
      type: 'answer',
      sdp: answer.sdp,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else if (sig.type === 'answer') {
    await pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
  } else if (sig.type === 'ice') {
    try { await pc.addIceCandidate(sig.candidate); } catch (e) { console.error(e); }
  }
}

function toggleMic() {
  if (!localStream) return;
  isMicMuted = !isMicMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
  document.getElementById('btn-toggle-mic').textContent = isMicMuted ? '🎙️ Mikrofonu Aç' : '🎙️ Mikrofonu Kapat';
}

async function leaveVoiceChannel() {
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};

  document.querySelectorAll('audio[id^="audio-"]').forEach(el => el.remove());

  if (voiceChannelRef) {
    await voiceChannelRef.collection('participants').doc(currentUser.uid).delete().catch(() => {});
  }

  voiceUnsubscribes.forEach(u => u());
  voiceUnsubscribes = [];

  document.getElementById('btn-join-voice').classList.remove('hidden');
  document.getElementById('btn-leave-voice').classList.add('hidden');
  document.getElementById('btn-toggle-mic').classList.add('hidden');
}
