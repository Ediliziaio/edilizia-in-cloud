/**
 * markdownLite — renderer Markdown minimale e SICURO per contenuti brevi
 * (changelog, annunci di piattaforma). Supporta: **bold**, `code`,
 * [testo](url), e gli a-capo (\n → <br/>, \n\n → nuovo paragrafo).
 *
 * ⚠️  Sicurezza (anti-XSS):
 *  - Ogni input passa da `escapeHtml` PRIMA delle trasformazioni inline. Oltre
 *    a & < > vengono neutralizzati anche " e ': così un URL malevolo non può
 *    "rompere" l'attributo href="…" e iniettare un event-handler
 *    (XSS via attribute breakout, es. `[x](https://ok" onmouseover="alert(1))`).
 *  - `sanitizeUrl` ammette solo http(s), mailto, tel e path relativi/anchor;
 *    qualunque altro schema (javascript:, data:, vbscript:, …) diventa "#".
 *
 * Il contenuto del changelog è scritto da admin di piattaforma ma è renderizzato
 * nel browser di TUTTI gli utenti: la neutralizzazione è difesa in profondità.
 */

/** Escapa i 5 caratteri HTML-sensibili (& < > " '). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sanitizza un URL: consente solo http(s), mailto, tel, path relativi/anchor. */
export function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  // Path relativo / anchor → OK
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  // Protocolli ammessi
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^tel:/i.test(trimmed)) return trimmed;
  // Tutto il resto (javascript:, data:, ecc.) viene neutralizzato
  return "#";
}

/**
 * Renderer markdown molto semplice: **bold**, `code`, [link](url), newline.
 * Restituisce HTML sicuro da iniettare via dangerouslySetInnerHTML.
 */
export function renderMarkdownLite(md: string): string {
  const html = escapeHtml(md)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_m, label: string, url: string) => {
      const safe = sanitizeUrl(url);
      return `<a href="${safe}" rel="noopener noreferrer" class="text-primary hover:underline">${label}</a>`;
    })
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
  return "<p>" + html + "</p>";
}
