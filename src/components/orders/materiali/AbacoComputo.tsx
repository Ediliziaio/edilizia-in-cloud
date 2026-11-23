import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { computoLetto, useComputiCommessa, useVociComputo } from "@/hooks/useComputoCommessa";
import { abacoDalComputo, riepilogoAbaco, type PosizioneAbaco } from "@/lib/distinta/abacoComputo";

function scarica(righe: PosizioneAbaco[]) {
  const celle = [
    ["Voce", "Riga misura", "Famiglia", "Tipologia", "Ubicazione", "Prospetto", "Pezzi da dimensioni/formule", "Ipotesi pezzi dal minimo", "Fonte conteggio", "Larghezza m", "Altezza m", "m² contabili", "Verifiche"],
    ...righe.map(r => [r.numero_voce, r.ordine_misura + 1, r.famiglia, r.tipologia, r.ubicazione, r.prospetto, r.pezzi, r.pezzi_ipotizzati, r.fonte_pezzi, r.larghezza_m, r.altezza_m, r.superficie_contabile_mq, r.avvisi.join(" · ")]),
  ];
  const csv = celle.map(rr => rr.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "Abaco-dal-computo-da-verificare.csv"; a.click(); URL.revokeObjectURL(url);
}

export function TabellaAbaco({ righe }: { righe: PosizioneAbaco[] }) {
  const t = useT();
  const num = (n: number | null) => n === null ? t("Da rilevare") : n.toLocaleString(intlCampo(), { maximumFractionDigits: 3 });
  const [famiglia, setFamiglia] = useState("");
  const [soloMancanti, setSoloMancanti] = useState(false);
  const visibili = righe.filter(r => (!famiglia || r.famiglia === famiglia) && (!soloMancanti || !r.larghezza_m || !r.altezza_m));
  const s = riepilogoAbaco(righe), finestre = riepilogoAbaco(righe.filter(r => r.famiglia === "serramento"));
  return <section className="space-y-3 text-xs" aria-label={t("Abaco dei serramenti dal computo")}>
    <p className="font-medium">{t("{righe} righe di abaco · {serramenti} serramenti provvisori · {conDimensioni} righe con dimensioni · {daRilevare} da rilevare", { righe: s.posizioni, serramenti: finestre.pezzi_ricostruiti, conDimensioni: s.posizioni_con_dimensioni, daRilevare: s.posizioni_da_rilevare })}</p>
    <p className="text-muted-foreground">{t("Serramenti: {daDimensioni} pezzi da dimensioni/formule + {ipotizzati} solo ipotizzati dai minimi. {senzaConteggio} righe senza conteggio esplicito nell'abaco complessivo.", { daDimensioni: finestre.pezzi_da_dimensioni_e_formule, ipotizzati: finestre.pezzi_solo_ipotizzati, senzaConteggio: s.posizioni_senza_conteggio })}</p>
    <p className="text-muted-foreground">{t("I pezzi ricostruiti dai minimi contabili richiedono conferma. Le dimensioni del computo vanno verificate sul vano prima della produzione. Le superfici di fatturazione restano separate.")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <select className="rounded border bg-background p-1" aria-label={t("Famiglia dell'abaco")} value={famiglia} onChange={e => setFamiglia(e.target.value)}>
        <option value="">{t("Tutte le forniture")}</option><option value="serramento">{t("Serramenti")}</option><option value="avvolgibile">{t("Avvolgibili")}</option><option value="oscurante">{t("Oscuranti")}</option>
      </select>
      <label className="flex items-center gap-1"><input type="checkbox" checked={soloMancanti} onChange={e => setSoloMancanti(e.target.checked)} />{t("Solo dimensioni mancanti")}</label>
      <Button className="ml-auto" type="button" size="sm" variant="outline" onClick={() => scarica(righe)}>{t("Esporta abaco CSV")}</Button>
    </div>
    <div className="max-h-[32rem] overflow-auto rounded border">
      <table className="w-full min-w-[900px] text-left">
        <thead className="sticky top-0 bg-muted"><tr>{[t("Voce/riga"), t("Fornitura"), t("Ubicazione"), t("Pezzi"), t("L × H dal PDF (m)"), t("m² contabili"), t("Verifica")].map(c => <th key={c} className="p-2">{c}</th>)}</tr></thead>
        <tbody>{visibili.map(r => <tr key={r.id} className="border-t align-top" data-posizione-abaco={r.id}>
          <td className="p-2 tabular-nums">{r.numero_voce}/{r.ordine_misura + 1}</td><td className="max-w-48 p-2">{r.tipologia}</td>
          <td className="p-2">{r.ubicazione || t("Ubicazione da definire")}<p className="text-muted-foreground">{r.prospetto}</p></td>
          <td className="p-2 tabular-nums">{r.pezzi === null ? t("Da confermare") : num(r.pezzi)}{r.pezzi_ipotizzati != null && <p className="text-amber-800">{t("Ipotesi: {n}", { n: r.pezzi_ipotizzati })}</p>}{r.fonte_pezzi !== "misure" && <p className="text-amber-800">{t("Da contabilizzazione")}</p>}</td>
          <td className="p-2 tabular-nums">{r.larghezza_m && r.altezza_m ? `${num(r.larghezza_m)} × ${num(r.altezza_m)}` : t("Da rilevare")}</td>
          <td className="p-2 tabular-nums">{num(r.superficie_contabile_mq)}{r.minimo_fatturabile && <p className="text-amber-800">{t("Minimo fatturabile")}</p>}</td>
          <td className="max-w-64 p-2 text-muted-foreground">{r.avvisi.join(" ")}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
function AbacoDelComputo({ id, voceIds }: { id: string; voceIds?: string[] }) {
  const t = useT();
  const voci = useVociComputo(id, true);
  const righe = useMemo(() => abacoDalComputo(voci.data ?? []).filter(r => !voceIds || voceIds.includes(r.voce_id)), [voci.data, voceIds]);
  if (voci.isPending) return <p role="status" className="text-xs">{t("Preparo l'abaco dalle misure salvate…")}</p>;
  if (voci.isError) return <p role="alert">{t("Abaco non disponibile.")} <button onClick={() => void voci.refetch()}>{t("Riprova")}</button></p>;
  return righe.length ? <TabellaAbaco righe={righe} /> : <p className="text-xs">{t("Questo computo non contiene un abaco di serramenti, avvolgibili o oscuranti con righe di misura.")}</p>;
}
export function AbacoComputo({ companyId, orderId, integrato = false, voceIds, computoId }: { companyId: string; orderId: string; integrato?: boolean; voceIds?: string[]; computoId?: string }) {
  const t = useT();
  const computi = useComputiCommessa(orderId, companyId);
  const [aperto, setAperto] = useState(() => new URLSearchParams(window.location.search).get("abaco") === "1");
  const [scelto, setScelto] = useState("");
  const letti = (computi.data ?? []).filter(computoLetto).filter(c => c.stato !== "archiviato");
  const c = letti.find(c => c.id === (computoId ?? scelto)) ?? letti.find(c => c.stato === "contrattuale") ?? letti[0];
  if (!c) return null;
  if (integrato) return <AbacoDelComputo key={c.id} id={c.id} voceIds={voceIds} />;
  return <div id="abaco-computo" className="scroll-mt-4 space-y-3 rounded-lg border bg-card p-3">
    <Button type="button" size="sm" variant="outline" aria-expanded={aperto} onClick={() => setAperto(v => !v)}>{aperto ? t("Chiudi abaco dal computo") : t("Abaco serramenti dal computo")}</Button>
    {aperto && <>{letti.length > 1 && <select aria-label={t("Computo dell'abaco")} value={c.id} onChange={e => setScelto(e.target.value)}>{letti.map(c => <option key={c.id} value={c.id}>{c.titolo ?? c.file_name}</option>)}</select>}<AbacoDelComputo key={c.id} id={c.id} /></>}
  </div>;
}
