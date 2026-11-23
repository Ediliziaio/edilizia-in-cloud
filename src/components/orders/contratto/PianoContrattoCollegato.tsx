import { useMemo } from "react";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import type { ContractExtract } from "@/lib/orders/contractExtract";
import { pianoOperativoContratto } from "@/lib/orders/pianoOperativoContratto";
import { pianoAcquisti } from "@/lib/distinta/pianoAcquisti";
import { usePianoAcquistiComputo } from "@/hooks/usePianoAcquistiComputo";

export function PianoContrattoCollegato({ extract, companyId, orderId = null }: { extract: ContractExtract; companyId: string; orderId?: string | null }) {
  const t = useT();
  const q = (n: number | null | undefined) => n == null ? t("Da verificare") : n.toLocaleString(intlCampo(), { maximumFractionDigits: 3 });
  const piano = useMemo(() => pianoOperativoContratto(extract), [extract]);
  const contesto = usePianoAcquistiComputo(companyId, orderId, piano.materiali.length > 0, true);
  const acquisti = useMemo(() => {
    const dati = contesto.data;
    if (!dati || contesto.isError) return [];
    const materiali = piano.materiali.map(m => {
      const e = dati.esistenti.find(e => e.chiave_materiale === m.chiave);
      return { ...m, phase_id: e?.phase_id ?? m.phase_id, supplier_id: e?.supplier_id ?? m.supplier_id };
    });
    return pianoAcquisti(materiali, dati);
  }, [piano, contesto.data, contesto.isError]);
  if (!piano.fasi.length && !piano.materiali.length) return <p className="text-sm text-muted-foreground">{t("Il documento non contiene lavorazioni o forniture quantificate. Collega il preventivo o il capitolato compilato per preparare il piano.")}</p>;
  return <div className="space-y-3" aria-label={t("Piano collegato di lavori e acquisti")}>
    <p className="text-xs text-muted-foreground">{t("Le quantità da eseguire e il fabbisogno degli articoli derivano dalle stesse posizioni. Magazzino e ordini riducono gli acquisti, senza ridurre il lavoro previsto.")}</p>
    {piano.fasi.map(f => {
      const totali = new Map<string, number>();
      for (const l of f.lavorazioni) if (l.quantita != null && l.unita) totali.set(l.unita, (totali.get(l.unita) ?? 0) + l.quantita);
      return <details key={f.riferimento} open className="rounded-md border p-2">
        <summary className="cursor-pointer text-sm font-medium">{f.nome} <span className="font-normal text-muted-foreground">· {t("{n} sottofasi", { n: f.lavorazioni.length })}{[...totali].map(([u, n]) => ` · ${q(n)} ${u}`).join("")}</span></summary>
        {f.origine === "proposta_operativa" && <p className="mt-1 text-xs text-amber-800">{t("Organizzazione proposta: verifica le prestazioni prima di applicarla.")}</p>}
        <ul className="mt-2 space-y-1 text-xs">{f.lavorazioni.map(l => <li key={l.riferimento} className="flex justify-between gap-2"><span>{l.descrizione}</span><span className="shrink-0 tabular-nums">{q(l.quantita)} {l.unita}</span></li>)}</ul>
      </details>;
    })}
    {piano.materiali.length > 0 && <>
      <h4 className="text-sm font-medium">{t("Articoli e acquisti · {n} righe", { n: piano.materiali.length })}</h4>
      {contesto.isPending && <p role="status" className="text-xs">{t("Verifica di magazzino e ordini…")}</p>}
      {contesto.isError && <p role="alert" className="text-xs text-amber-800">{t("Magazzino o ordini non disponibili: il residuo da comprare è da verificare.")}</p>}
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="p-1">{t("Articolo e fase")}</th><th className="p-1 text-right">{t("Necessari")}</th><th className="p-1 text-right">{t("Già ordinati")}</th><th className="p-1 text-right">{t("Da magazzino")}</th><th className="p-1 text-right">{t("Da comprare")}</th><th className="p-1">{t("Quando")}</th></tr></thead>
        <tbody>{piano.materiali.map((m, i) => {
          const r = acquisti[i];
          const resaMancante = m.verifiche.some(v => /resa e unità/i.test(v));
          return <tr key={m.chiave} className="border-b align-top"><td className="p-1"><p className="font-medium">{m.descrizione}{m.larghezza_mm && m.altezza_mm ? ` · ${m.larghezza_mm}×${m.altezza_mm} mm` : ""}</p><p className="text-muted-foreground">{piano.fasi.find(f => f.riferimento === m.phase_id)?.nome ?? t("Fornitura senza fase di posa")}</p>
            {m.verifiche.map(v => <p key={v} className="mt-1 text-amber-800">{v}</p>)}
            {r?.avvisi.map(v => <p key={v} className="mt-1 text-amber-800">{v}</p>)}
          </td><td className="p-1 text-right tabular-nums">{q(m.quantita_calcolata)} {m.unita_misura}</td>
            <td className="p-1 text-right tabular-nums">{q(r?.ordinato)}</td><td className="p-1 text-right tabular-nums">{q(r?.daMagazzino)}</td>
            <td className="p-1 text-right tabular-nums">{q(resaMancante ? null : r?.daComprare)}{r?.inBozza ? <p className="text-muted-foreground">{t("{n} in bozza", { n: q(r.inBozza) })}</p> : null}{r?.acquisto && r.acquisto.unita !== m.unita_misura && <p className="text-muted-foreground">{q(r.acquisto.quantita)} {r.acquisto.unita}</p>}</td>
            <td className="p-1">{r?.ordinaEntro ?? t("Data da definire")}{r?.ordinaEntro && <p className="text-muted-foreground">{t("{n} giorni", { n: r.anticipo })} · {r.fonteAnticipo === "stima" ? t("stima da confermare") : t("dal fornitore")}</p>}</td></tr>;
        })}</tbody></table></div>
      <p className="text-xs text-muted-foreground">{t("La disponibilità libera proposta va riservata. Le bozze sono indicate separatamente dagli ordini emessi. Senza date e tempi confermati non è assegnata una scadenza certa.")}</p>
    </>}
    {piano.avvisi.map(a => <p key={a} role="note" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">{a}</p>)}
  </div>;
}
