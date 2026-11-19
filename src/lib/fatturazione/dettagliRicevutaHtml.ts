import { dataLeggibile, type NodoXml } from './xmlLeggibile';

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valore = (n: NodoXml) => n.binario ? n.valore : n.valore?.startsWith(`${n.grezzo} — `) ? n.valore : dataLeggibile(n.grezzo ?? n.valore ?? '');
const attributi = (n: NodoXml) => (n.attributi ?? []).map(a => `<div class="xml-campo"><dt>${esc(a.nome)}</dt><dd>${esc(a.valore)}</dd></div>`).join('');

/** Solo la presentazione: nessun campo viene interpretato come HTML o ricalcolato. */
export function campoRicevutaHtml(n: NodoXml): string {
  const attrs = attributi(n);
  if (n.tag === 'AltriDatiGestionali') {
    const tipo = n.figli.find(f => f.tag === 'TipoDato');
    const refs = n.figli.filter(f => ['RiferimentoTesto', 'RiferimentoNumero', 'RiferimentoData'].includes(f.tag));
    const altri = n.figli.filter(f => f !== tipo && !refs.includes(f));
    const testo = refs.map(r => valore(r)).filter(v => v !== '').join(' · ');
    if (tipo && !tipo.figli.length && refs.length && !n.testoMisto && !tipo.attributi?.length && !refs.some(r => r.attributi?.length || r.figli.length || r.binario)) {
      return `<div class="xml-gestionale"><span class="etichetta">${esc(tipo.grezzo || 'Altri dati')}:</span> ${esc(testo)}${attrs ? `<dl>${attrs}</dl>` : ''}${altri.map(campoRicevutaHtml).join('')}</div>`;
    }
  }
  const titolo = n.tag === 'DettaglioLinee' ? `${n.etichetta} ${n.figli.find(f => f.tag === 'NumeroLinea')?.grezzo ?? ''}`.trim() : n.etichetta === n.tag ? n.nomeXml ?? n.etichetta : n.etichetta;
  if (!n.figli.length) return `<dl class="xml-foglia"><div class="xml-campo"><dt>${esc(titolo)}</dt><dd>${esc(valore(n)) || '—'}</dd></div>${attrs}</dl>`;
  return `<div class="xml-gruppo"><h4>${esc(titolo)}</h4>${attrs ? `<dl>${attrs}</dl>` : ''}${n.testoMisto ? `<p class="xml-valore">${esc(n.testoMisto)}</p>` : ''}${n.figli.map(campoRicevutaHtml).join('')}</div>`;
}

// I soli campi già riportati nelle colonne della riga. Ogni altra voce,
// anche di un fornitore sconosciuto, compare accanto al proprio articolo.
const COLONNE_RIGA = new Set(['NumeroLinea', 'Descrizione', 'UnitaMisura', 'Quantita', 'PrezzoUnitario', 'PrezzoTotale', 'AliquotaIVA', 'Natura']);
export function dettagliRigaRicevuta(n: NodoXml | undefined): string {
  if (!n) return '';
  return `${n.testoMisto ? `<p class="xml-valore">${esc(n.testoMisto)}</p>` : ''}${n.attributi?.length ? `<dl>${attributi(n)}</dl>` : ''}${n.figli.filter(f => !COLONNE_RIGA.has(f.tag) || f.attributi?.length || f.figli.length).map(campoRicevutaHtml).join('')}`;
}

/** La sezione di completamento evita di ripetere le righe già stampate,
 * conservando tutti gli altri dati e la loro struttura originale. */
export function altriDatiRicevuta(n: NodoXml): NodoXml | null {
  if (n.tag === 'DettaglioLinee') return null; // Tutti i suoi figli sono nelle righe, compresi quelli non noti.
  const figli = n.figli.map(altriDatiRicevuta).filter((f): f is NodoXml => !!f);
  if (n.figli.length && !figli.length && !n.attributi?.length && !n.testoMisto) return null;
  return { ...n, figli };
}
