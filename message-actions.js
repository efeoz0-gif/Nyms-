// ============================================================
// MESSAGE-ACTIONS.JS — Tepki (emoji reaction), yanıtla (reply),
// düzenle, herkesten sil — DM ve sunucu kanallarında ortak kullanılır.
// ============================================================

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function buildReactionsHtml(reactions) {
  if (!reactions) return '';
  return Object.entries(reactions)
    .filter(([, list]) => list && list.length > 0)
    .map(([emoji, list]) => {
      const mine = list.includes(currentUser.uid);
      return `<span class="reaction-badge ${mine ? 'mine' : ''}" data-reaction-emoji="${emoji}">${emoji} ${list.length}</span>`;
    }).join('');
}

async function toggleReaction(ref, emoji) {
  const doc = await ref.get();
  const list = (doc.data().reactions || {})[emoji] || [];
  const mine = list.includes(currentUser.uid);
  await ref.update({
    [`reactions.${emoji}`]: mine
      ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      : firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
  });
}

function showReactionPicker(anchorEl, ref) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = REACTION_EMOJIS.map(e => `<span data-pick="${e}">${e}</span>`).join('');
  anchorEl.parentElement.style.position = 'relative';
  anchorEl.parentElement.appendChild(picker);

  picker.querySelectorAll('[data-pick]').forEach(el => {
    el.addEventListener('click', async () => {
      await toggleReaction(ref, el.dataset.pick);
      picker.remove();
    });
  });

  setTimeout(() => {
    document.addEventListener('click', function handler(ev) {
      if (!picker.contains(ev.target) && ev.target !== anchorEl) {
        picker.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

// opts: { ref, isOwn, encryptFn (yoksa düz metin), onReply, getRawTextForEdit }
function attachMessageActions(el, opts) {
  el.querySelectorAll('[data-reaction-emoji]').forEach(badge => {
    badge.addEventListener('click', () => toggleReaction(opts.ref, badge.dataset.reactionEmoji));
  });

  el.querySelector('.msg-action-react')?.addEventListener('click', (e) => showReactionPicker(e.currentTarget, opts.ref));
  el.querySelector('.msg-action-reply')?.addEventListener('click', () => opts.onReply(opts.ref.id));

  el.querySelector('.msg-action-edit')?.addEventListener('click', async () => {
    const bubble = el.querySelector('.msg-bubble-text');
    if (!bubble) return;
    const current = await opts.getRawTextForEdit();
    const textarea = document.createElement('textarea');
    textarea.value = current;
    textarea.className = 'msg-edit-textarea';
    bubble.replaceWith(textarea);
    textarea.focus();

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Kaydet';
    saveBtn.className = 'btn btn-primary btn-sm';
    saveBtn.style.marginTop = '4px';
    textarea.insertAdjacentElement('afterend', saveBtn);

    saveBtn.addEventListener('click', async () => {
      const newText = textarea.value.trim();
      if (!newText) return;
      const updates = { editedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (opts.encryptFn) updates.textEncrypted = await opts.encryptFn(newText);
      else updates.text = newText;
      await opts.ref.update(updates);
    });
  });

  el.querySelector('.msg-action-delete')?.addEventListener('click', async () => {
    if (!confirm('Bu mesaj herkesten silinsin mi?')) return;
    const updates = { deleted: true };
    if (opts.encryptFn) updates.textEncrypted = null;
    else updates.text = '';
    await opts.ref.update(updates);
  });
}

function messageActionsToolbarHtml(isOwn) {
  return `
    <span class="msg-actions">
      <button class="msg-action-react" title="Tepki ver">😀</button>
      <button class="msg-action-reply" title="Yanıtla">↩️</button>
      ${isOwn ? '<button class="msg-action-edit" title="Düzenle">✏️</button>' : ''}
      ${isOwn ? '<button class="msg-action-delete" title="Herkesten sil">🗑️</button>' : ''}
    </span>`;
}
