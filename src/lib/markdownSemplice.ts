/**
 * Markdown "semplice" (quello che producono l'AI e il modello standard delle
 * condizioni) → HTML per l'editor ricco: # → h2, ## → h3, ### → h4, "- " → ul/li,
 * **grassetto**, righe → paragrafi. Niente HTML in ingresso: viene escapato.
 */
function escapa(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return escapa(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<em>$2</em>");
}

export function markdownSempliceToHtml(md: string): string {
  const righe = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let lista = false;
  const chiudiLista = () => { if (lista) { out.push("</ul>"); lista = false; } };
  for (const raw of righe) {
    const r = raw.trim();
    if (!r) { chiudiLista(); continue; }
    const h = /^(#{1,3})\s+(.+)$/.exec(r);
    if (h) { chiudiLista(); const l = h[1].length + 1; out.push(`<h${l}>${inline(h[2])}</h${l}>`); continue; }
    const li = /^[-*]\s+(.+)$/.exec(r);
    if (li) { if (!lista) { out.push("<ul>"); lista = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    chiudiLista(); out.push(`<p>${inline(r)}</p>`);
  }
  chiudiLista();
  return out.join("\n");
}

/** Vero se il testo sembra markdown (titoli o elenchi) e non HTML. */
export function sembraMarkdown(testo: string): boolean {
  const t = testo.trim();
  if (!t || /<\/?[a-z][^>]*>/i.test(t)) return false;
  return /^#{1,3}\s+/m.test(t) || /^[-*]\s+/m.test(t);
}
