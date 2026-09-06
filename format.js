// ============================================================
// FORMAT.JS — Zengin metin: **kalın**, *italik*, `kod`, ||spoiler||
// ============================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Önce HTML kaçışı yapılır (XSS'e karşı), SONRA biçimlendirme uygulanır —
// böylece kullanıcı **<script>** gibi bir şey yazsa bile güvenli kalır.
function renderRichText(raw) {
  let html = escapeHtml(raw);

  html = html.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\n/g, '<br>');

  return html;
}
