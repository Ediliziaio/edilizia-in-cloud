import type { CampoXml, FatturaXmlStampabile, RigaXmlStampabile } from '@/lib/fatturazione/fatturaXmlTabellare';
import { ETICHETTE_XML } from '@/lib/fatturazione/xmlLeggibile';

const etichettaCampo = (s: string) => s.split(' / ').map(p => {
  const m = /^([\w:]+)(.*)$/.exec(p);
  return m ? (ETICHETTE_XML[m[1]] ?? m[1]) + m[2] : p;
}).join(' / ');

/** Solo testo del documento: nessun riferimento implica un collegamento contabile. */
export function CampiXmlRicevuta({ campi }: { campi: CampoXml[] }) {
  if (!campi.length) return null;
  return <dl className="mt-1.5 space-y-1 text-xs text-muted-foreground">
    {campi.map((c, i) => <div key={i} className="flex flex-wrap gap-x-1">
      <dt className="font-medium break-words" title={c.campo}>{etichettaCampo(c.campo)}:</dt>
      <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.valore}</dd>
    </div>)}
  </dl>;
}

export function RiferimentiXmlRicevuta({ fattura }: { fattura: FatturaXmlStampabile }) {
  if (!fattura.riferimenti.length) return null;
  return <section aria-label="Riferimenti indicati nell’XML" className="space-y-2">
    <h3 className="text-sm font-semibold">Riferimenti indicati in fattura</h3>
    <p className="text-xs text-muted-foreground">Riferimenti del fornitore presenti nel documento.</p>
    {fattura.riferimenti.map((t, i) => <div key={i} className="overflow-x-auto rounded-lg border">
      <table aria-label={t.titolo} className="w-full text-xs">
        <caption className="px-2 py-1.5 text-left font-medium">{t.titolo}</caption>
        <thead className="bg-muted/50"><tr>{t.intestazioni.map((h, j) => <th key={j} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{t.righe.map((r, j) => <tr key={j} className="border-t align-top">{r.map((v, k) => <td key={k} className="px-2 py-1.5 whitespace-pre-wrap break-words">{v || '—'}</td>)}</tr>)}</tbody>
      </table>
    </div>)}
  </section>;
}

export function RigheXmlAggiuntiveRicevuta({ righe, valuta }: { righe: RigaXmlStampabile[]; valuta: string }) {
  if (!righe.length) return null;
  return <section aria-label="Ulteriori righe XML" className="space-y-2">
    <h4 className="text-sm font-medium">Ulteriori righe presenti nell’XML</h4>
    <ul className="divide-y rounded-lg border">
      {righe.map((r, i) => <li key={i} className="p-3 text-sm">
        <p className="whitespace-pre-wrap break-words">Riga {r.numero} · {r.descrizione}</p>
        <p className="text-xs text-muted-foreground">{r.quantita} {r.unitaMisura} × {r.prezzoUnitario} {valuta} · Totale {r.importo} {valuta} · IVA {r.iva}</p>
        <CampiXmlRicevuta campi={r.dettagli} />
      </li>)}
    </ul>
  </section>;
}

export function AltriDatiXmlRicevuta({ fattura }: { fattura: FatturaXmlStampabile }) {
  if (!fattura.datiAggiuntivi.length && !fattura.causali.length) return null;
  return <section className="space-y-2">
    {fattura.causali.length > 0 && <div className="text-sm"><h3 className="font-semibold">Causale del documento</h3>{fattura.causali.map((c, i) => <p key={i} className="whitespace-pre-wrap break-words">{c}</p>)}</div>}
    {fattura.datiAggiuntivi.length > 0 && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Altri dati presenti nell’XML ({fattura.datiAggiuntivi.length})</summary>
      <CampiXmlRicevuta campi={fattura.datiAggiuntivi} />
    </details>}
  </section>;
}
