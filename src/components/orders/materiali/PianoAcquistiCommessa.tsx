import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePianoAcquistiComputo } from "@/hooks/usePianoAcquistiComputo";
import { pianoAcquisti } from "@/lib/distinta/pianoAcquisti";
import { PianoAcquistiComputo } from "./PianoAcquistiComputo";
import { materialiEsistentiPerPiano } from "@/lib/distinta/materialiEsistentiPerPiano";
import { VerificaDatiMaterialeDialog } from "./VerificaDatiMateriale";
import { DataPianoAcquisti } from "./DataPianoAcquisti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function Piano({ companyId, orderId, nomeFase, soloDaVerificareIniziale, faseId, puoVerificare, puoDatare, onSelezionaArticoli }: { companyId: string; orderId: string; nomeFase: (id: string | null) => string; soloDaVerificareIniziale: boolean; faseId?: string; puoVerificare?: boolean; puoDatare?: boolean; onSelezionaArticoli?: (ids: string[]) => void }) {
  const t = useT();
  const [chiaveInVerifica, setChiaveInVerifica] = useState<string | null>(null);
  const [chiaveData, setChiaveData] = useState<string | null>(null);
  const query = usePianoAcquistiComputo(companyId, orderId, true);
  const righe = useMemo(() => {
    if (!query.data) return [];
    const materiali = materialiEsistentiPerPiano(query.data.esistenti);
    return pianoAcquisti(materiali, query.data).map(r => {
      const verificaResa = (r.materiale.verifica_acquisto?.stato !== "confermata" && r.materiale.note.some(n => /resa e unità/i.test(n))) || !r.materiale.unita_misura;
      return { ...r, avvisi: [...new Set([...r.avvisi, ...r.materiale.note])], ...(verificaResa ? { daComprare: null, nuovoOrdine: null, acquisto: null, ordinaEntro: null } : {}) };
    });
  }, [query.data]);
  if (query.isPending) return <p role="status" className="p-3 text-xs">{t("Aggiorno magazzino, ordini e date delle fasi…")}</p>;
  if (query.isError) return <p role="alert" className="p-3 text-xs text-amber-800">{t("Non riesco a verificare le disponibilità.")} <button type="button" className="underline" onClick={() => query.refetch()}>{t("Riprova")}</button></p>;
  const daVerificare = query.data?.esistenti.find(r => r.chiave_materiale === chiaveInVerifica);
  const daDatare = query.data?.esistenti.find(r => r.chiave_materiale === chiaveData);
  return <><Button type="button" variant="ghost" size="sm" className="mb-2" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? t("Aggiornamento…") : t("Aggiorna disponibilità")}</Button>
    <PianoAcquistiComputo righe={faseId ? righe.filter(r => r.materiale.phase_id === faseId) : righe} nomeFase={nomeFase} soloDaVerificareIniziale={soloDaVerificareIniziale} onCompleta={puoVerificare ? setChiaveInVerifica : undefined}
      onData={puoDatare ? setChiaveData : undefined} onGestisci={onSelezionaArticoli ? chiavi => onSelezionaArticoli(query.data!.esistenti.filter(e => e.chiave_materiale && chiavi.includes(e.chiave_materiale)).map(e => e.id)) : undefined} />
    {puoDatare && daDatare && <DataPianoAcquisti key={daDatare.id} id={daDatare.id} nome={daDatare.name ?? t("Materiale")} dataAttuale={daDatare.data_fabbisogno}
      dataFase={query.data?.fasi.find(f => f.id === daDatare.phase_id)?.start_date} onChiudi={() => setChiaveData(null)} />}
    {puoVerificare && daVerificare && <VerificaDatiMaterialeDialog key={daVerificare.id} m={{ id: daVerificare.id, order_id: orderId,
      name: daVerificare.name ?? "Materiale", quantity: Number(daVerificare.quantity), unita_misura: daVerificare.unita_misura ?? null,
      specifiche: daVerificare.specifiche ?? null, origini: daVerificare.origini ?? null }} aperto
      onAperto={aperto => { if (!aperto) setChiaveInVerifica(null); }} onConfermata={() => setChiaveInVerifica(null)} />}
  </>;
}

export function PianoAcquistiCommessa(props: { companyId: string; orderId: string; nomeFase: (id: string | null) => string; integrato?: boolean; faseId?: string; puoVerificare?: boolean; puoDatare?: boolean; onSelezionaArticoli?: (ids: string[]) => void }) {
  const t = useT();
  const [aperto, setAperto] = useState(() => new URLSearchParams(window.location.search).get("piano_acquisti") === "1");
  const [soloDaVerificareIniziale] = useState(() => new URLSearchParams(window.location.search).get("verifiche") === "1");
  if (props.integrato) return <Piano {...props} soloDaVerificareIniziale={soloDaVerificareIniziale} />;
  return <div id="piano-acquisti-commessa" className="scroll-mt-4 rounded-lg border bg-card p-3">
    <Button type="button" variant="outline" size="sm" aria-expanded={aperto} onClick={() => setAperto(v => !v)}>{aperto ? t("Chiudi piano acquisti") : t("Piano acquisti aggiornato")}</Button>
    {aperto && <div className="mt-3"><Piano {...props} soloDaVerificareIniziale={soloDaVerificareIniziale} /></div>}
  </div>;
}
