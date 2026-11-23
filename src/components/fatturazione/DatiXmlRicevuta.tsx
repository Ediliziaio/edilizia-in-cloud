import type { CampoXml, FatturaXmlStampabile, RigaXmlStampabile } from '@/lib/fatturazione/fatturaXmlTabellare';
import { ETICHETTE_XML } from '@/lib/fatturazione/xmlLeggibile';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const tTesto = useT();
  if (!fattura.riferimenti.length) return null;
  return <section aria-label={tTesto("Riferimenti indicati nell’XML")} className="space-y-2">
    <h3 className="text-sm font-semibold">{tTesto("Riferimenti indicati in fattura")}</h3>
    <p className="text-xs text-muted-foreground">{tTesto("Riferimenti del fornitore presenti nel documento.")}</p>
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
  const t = useT();
  if (!righe.length) return null;
  return <section aria-label={t("Ulteriori righe XML")} className="space-y-2">
    <h4 className="text-sm font-medium">{t("Ulteriori righe presenti nell’XML")}</h4>
    <ul className="divide-y rounded-lg border">
      {righe.map((r, i) => <li key={i} className="p-3 text-sm">
        <p className="whitespace-pre-wrap break-words">{t("Riga {numero} · {descrizione}", { numero: r.numero ?? "", descrizione: r.descrizione ?? "" })}</p>
        <p className="text-xs text-muted-foreground">{r.quantita} {r.unitaMisura} × {r.prezzoUnitario} {valuta} · {t("Totale")} {r.importo} {valuta} · {t("IVA")} {r.iva}</p>
        <CampiXmlRicevuta campi={r.dettagli} />
      </li>)}
    </ul>
  </section>;
}

export function AltriDatiXmlRicevuta({ fattura }: { fattura: FatturaXmlStampabile }) {
  const tTesto = useT();
  return <section className="space-y-2">
    {fattura.causali.length > 0 && <div className="text-sm"><h3 className="font-semibold">{tTesto("Causale del documento")}</h3>{fattura.causali.map((c, i) => <p key={i} className="whitespace-pre-wrap break-words">{c}</p>)}</div>}
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">{tTesto("Dati del documento e pagamenti XML")}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
        {([['Fornitore nell’XML', fattura.cedente], ['Destinatario nell’XML', fattura.cliente]] as const).map(([titolo, righe]) => <div key={titolo}><h4 className="font-medium">{tTesto(titolo)}</h4>{righe.map((r, i) => <p key={i} className="break-words">{r}</p>)}</div>)}
      </div>
      {fattura.tabelle.filter(t => !['righe', 'riferimenti', 'altri'].includes(t.tipo ?? '') && t.titolo !== 'Causale / annotazioni del documento').map((t, i) => <div key={i} className="mt-3 overflow-x-auto rounded border">
        <table aria-label={t.titolo || (t.tipo === 'totale' ? tTesto("Totale nell’XML") : tTesto("Identificazione del documento XML"))} className="w-full text-xs">
          {t.titolo && <caption className="p-2 text-left font-medium">{t.titolo}</caption>}
          <thead className="bg-muted/50"><tr>{t.intestazioni.map((h, j) => <th key={j} className="p-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{t.righe.map((r, j) => <tr key={j} className="border-t align-top">{r.map((v, k) => <td key={k} className="p-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{v || '—'}</td>)}</tr>)}</tbody>
        </table>
      </div>)}
    </details>
    {fattura.datiAggiuntivi.length > 0 && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">{tTesto("Altri dati presenti nell’XML ({n})", { n: fattura.datiAggiuntivi.length })}</summary>
      <CampiXmlRicevuta campi={fattura.datiAggiuntivi} />
    </details>}
  </section>;
}
