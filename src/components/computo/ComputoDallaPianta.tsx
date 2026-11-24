import { lazy, Suspense, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ListChecks, Map, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlanimetria, useVersionePlanimetria, type VersionePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { formatCurrency } from "@/lib/formatters";
import { calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import { confrontaComputoConPianta, gruppiMisureDallaPianta, importoProposto, misureDalProgetto, tipiDaQuotare, vociDallaPianta, type MisuraPropostaDallaPianta, type OrigineComputoPianta } from "@/lib/computo/computoDallaPianta";
import { useFontiPrezzi } from "@/lib/planimetrie/fontiPrezzi";
import { usePermissions } from "@/hooks/usePermissions";
import { esigiVerificaDocumento } from "../../../shared/planimetrie/verificaDocumento";
import type { Planimetria } from "../../../shared/planimetrie/modello";
import type { Selezione } from "@/components/planimetrie/editor/TelaPlanimetria";
import type { ControlliEditorPlanimetria } from "@/components/planimetrie/editor/EditorPlanimetria";
import { ConversazioneProgettoSilvio, riferimentoProgettoSilvio } from "@/components/quotes/conversazioneProgettoSilvio";
import { AnteprimaComputoSilvio, type PropostaPdfComputo, type RendiPdfComputo } from "./AnteprimaComputoSilvio";
import LavorazioniDallaPianta from "./LavorazioniDallaPianta";

const EditorPianta = lazy(() => import("@/components/planimetrie/editor/EditorConSalvataggio").then(m => ({ default: m.EditorConSalvataggio })));

const numero = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const sigle: Readonly<Record<string, string>> = { mq: "m²", mc: "m³", ml: "m" };
const unitaVisibile = (unita: string) => sigle[unita] ?? unita;
const nessunaMisura: MisuraPropostaDallaPianta[] = [];

type BozzaDisegno = { documento: Planimetria; base: VersionePlanimetria };
type ConfermaDisegno = { documento: Planimetria; versioneAttesa: number };
export type RipristinoProgettoComputo = {
  origine: OrigineComputoPianta;
  base: VersionePlanimetria;
  vociPrima: VoceEditor[];
  versione: number;
  vociConfermate: string;
};

export default function ComputoDallaPianta({ origine, voci, companyId, modifica, affiancata, inSilvio, conSalvataggioCongiunto, computoSalvato, ripristino, onRipristino, onModificaPianta, onApply, renderPdf, chiavePdf, tavolaNelPdf }: {
  origine: OrigineComputoPianta;
  voci: VoceEditor[];
  companyId?: string;
  modifica: boolean;
  affiancata?: boolean;
  inSilvio?: boolean;
  conSalvataggioCongiunto?: boolean;
  computoSalvato?: boolean;
  ripristino: RipristinoProgettoComputo | null;
  onRipristino: (ripristino: RipristinoProgettoComputo | null) => void;
  onModificaPianta?: (modificata: boolean) => void;
  onApply: (origine: OrigineComputoPianta, voci: VoceEditor[], prima: VoceEditor[], disegno?: ConfermaDisegno) => void | VoceEditor[] | Promise<void | VoceEditor[]>;
  renderPdf?: RendiPdfComputo;
  chiavePdf?: string;
  tavolaNelPdf?: boolean;
}) {
  const conversazione = useContext(ConversazioneProgettoSilvio);
  const pianta = usePlanimetria(companyId ? origine.id : null, true);
  const [mostraPdf, setMostraPdf] = useState(false);
  const [ultimaVocePdf, setUltimaVocePdf] = useState<VoceEditor>();
  const [aperto, setAperto] = useState(false);
  const [attesa, setAttesa] = useState(false);
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [aggiornamenti, setAggiornamenti] = useState<Set<string>>(new Set());
  const [revisioneAperta, setRevisioneAperta] = useState<number | null>(null);
  const [vociAperte, setVociAperte] = useState<VoceEditor[]>();
  const [disegnoAperto, setDisegnoAperto] = useState<Planimetria>();
  const [bozza, setBozza] = useState<BozzaDisegno | null>(null);
  const [propostaChat, setPropostaChat] = useState<(BozzaDisegno & { applicabile: boolean }) | null>(null);
  const [chatOccupata, setChatOccupata] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState("");
  const [versioneSalvata, setVersioneSalvata] = useState(0);
  const [resetEditor, setResetEditor] = useState(0);
  const [selezione, setSelezione] = useState<Selezione | null>(null);
  const controlli = useRef<ControlliEditorPlanimetria>(null);
  const piantaAzienda = pianta.data?.riga.company_id === companyId ? pianta.data : undefined;
  const versioneLetta = piantaAzienda?.versione;
  const attendeVersioneSalvata = Boolean(versioneLetta && versioneSalvata > versioneLetta.numero);
  const attiva = propostaChat ?? bozza;
  const versioneEditor = attiva?.base ?? versioneLetta;
  const bozzaPerConfronto = useDeferredValue(attiva?.documento);
  const bloccaUscita = !!attiva || chatOccupata || attesa;
  useEffect(() => { onModificaPianta?.(bloccaUscita); }, [bloccaUscita, onModificaPianta]);
  const numeroRaggruppamento = useMemo(() => voci.flatMap(v => v.misure).find(m =>
    m.dallaPianta?.chiave.includes("|") && !m.dallaPianta.componenti)?.dallaPianta?.versione, [voci]);
  const storica = useVersionePlanimetria(piantaAzienda?.riga.id,
    numeroRaggruppamento && numeroRaggruppamento !== versioneLetta?.numero ? numeroRaggruppamento : null);
  const documentoStorico = storica.data?.documento ?? (numeroRaggruppamento === versioneLetta?.numero ? versioneLetta?.documento : undefined);
  const aggiornaAnteprima = useCallback((documento: Planimetria) => {
    if (!versioneEditor || !modifica) return;
    setBozza({ documento, base: versioneEditor });
  }, [modifica, versioneEditor]);
  // Le voci nuove nascono quotate come nello studio della variante: solo per chi vede gli importi.
  const permessi = usePermissions();
  const vedePrezzi = permessi.canViewPreventivi;
  const documentoPrezzi = bozzaPerConfronto ?? piantaAzienda?.versione.documento;
  const tipiPrezzi = useMemo(() => {
    try { return documentoPrezzi ? tipiDaQuotare(documentoPrezzi, origine) : []; } catch { return []; }
  }, [documentoPrezzi, origine]);
  const { fonti: fontiCaricate } = useFontiPrezzi(companyId, tipiPrezzi, vedePrezzi);
  const fonti = vedePrezzi ? fontiCaricate : null;
  const leggiPropostaChat = useCallback((proposta: { documento: Planimetria; applicabile: boolean } | null) => {
    setPropostaChat(proposta && versioneEditor ? { ...proposta, base: versioneEditor } : null);
  }, [versioneEditor]);

  const dati = useMemo(() => {
    if (!piantaAzienda || attendeVersioneSalvata) return null;
    const { riga, versione } = piantaAzienda;
    try {
      const documento = bozzaPerConfronto ?? versione.documento;
      esigiVerificaDocumento(documento, "computo");
      if (versione.numero < origine.versione) throw new Error("Riprova a leggere l’ultima versione del disegno.");
      const precedenti = documentoStorico ? misureDalProgetto(documentoStorico, origine, fonti)
        : numeroRaggruppamento ? [] : undefined;
      return {
        numero: versione.numero, titolo: riga.titolo,
        confronto: confrontaComputoConPianta(voci, misureDalProgetto(documento, origine, fonti), bozzaPerConfronto ? versione.numero + 1 : versione.numero, precedenti),
      };
    } catch (e) {
      return { errore: e instanceof Error ? e.message : "Le misure della pianta sono da verificare." };
    }
  }, [attendeVersioneSalvata, bozzaPerConfronto, documentoStorico, fonti, numeroRaggruppamento, origine, piantaAzienda, voci]);
  const confronto = dati?.confronto;
  const numeroVersione = dati?.numero;
  const daAggiornare = Boolean(confronto?.haMisureDaAggiornare);
  const disponibili = confronto?.disponibili ?? nessunaMisura;
  const chiaviPrecedenti = useMemo(() => {
    if (!attiva || !dati?.confronto) return undefined;
    return new Set(misureDalProgetto(attiva.base.documento, origine).map(m => m.chiave));
  }, [attiva, dati, origine]);
  const novitaDisegno = useMemo(() => chiaviPrecedenti
    ? disponibili.filter(m => !chiaviPrecedenti.has(m.chiave)) : undefined, [chiaviPrecedenti, disponibili]);
  const cambiaVersione = aperto && (dati?.numero !== revisioneAperta || vociAperte !== voci || disegnoAperto !== attiva?.documento);
  const scelteValide = disponibili.filter(p => scelte.has(p.chiave));
  const variazioni = new Set(confronto?.variazioni.map(r => r.prima.id));
  const vociScelte = confronto?.voci.map((v, i) => !attiva && variazioni.has(v.id) && !aggiornamenti.has(v.id) ? voci[i] : v);
  const ciSonoAggiornamenti = Boolean(vociScelte?.some((v, i) => v !== voci[i]));
  const lavoroInBozza = !!attiva || !!bozzaPerConfronto;
  const misurePerConferma = lavoroInBozza ? novitaDisegno ?? [] : disponibili;
  const confrontoInAggiornamento = bozzaPerConfronto !== attiva?.documento;
  const disegnoLaCuiBaseECambiata = !!attiva && attiva.base.numero !== versioneLetta?.numero;
  const puoConfermareDisegno = !!(conSalvataggioCongiunto && computoSalvato && attiva && !confrontoInAggiornamento &&
    !disegnoLaCuiBaseECambiata && (!chatOccupata || propostaChat?.applicabile));
  const inLettura = pianta.isFetching || storica.isFetching || attendeVersioneSalvata;
  const propostaPdf = useMemo((): PropostaPdfComputo | undefined => {
    if (!mostraPdf || !attiva || !numeroVersione || !confronto || confrontoInAggiornamento || disegnoLaCuiBaseECambiata) return undefined;
    const nuove = (novitaDisegno ?? []).filter(m => !aperto || scelte.has(m.chiave));
    return { voci: [...confronto.voci, ...vociDallaPianta(nuove, numeroVersione + 1)], dallaPianta: true };
  }, [mostraPdf, attiva, numeroVersione, confronto, confrontoInAggiornamento, disegnoLaCuiBaseECambiata, novitaDisegno, aperto, scelte]);
  const vocePdf = propostaPdf ? confronto?.variazioni[0]?.dopo : ultimaVocePdf;

  function registraSalvataggio(versione: number, testo: string) {
    conversazione?.setMessaggi(corrente => [...corrente, {
      role: "assistant" as const, text: testo, origineProgetto: true as const,
      riferimentoProgetto: riferimentoProgettoSilvio({ ...origine, versione }), diagnostic: true,
    }].slice(-50));
  }

  function apriConfronto() {
    if (!confronto || (lavoroInBozza && !puoConfermareDisegno)) return;
    setRevisioneAperta(dati?.numero ?? null);
    setVociAperte(voci);
    setDisegnoAperto(attiva?.documento);
    setErroreSalvataggio("");
    // Le novità del comando sono proposte insieme alle variazioni delle righe già collegate.
    setScelte(new Set(novitaDisegno?.map(m => m.chiave) ?? []));
    setAggiornamenti(variazioni);
    setAperto(true);
  }

  function chiudiModifica() {
    setBozza(null); setPropostaChat(null); setChatOccupata(false); setSelezione(null);
  }

  async function applica() {
    if (!modifica || !dati?.numero || !vociScelte || cambiaVersione || attesa ||
      (lavoroInBozza ? !puoConfermareDisegno : !ciSonoAggiornamenti && !scelteValide.length)) return;
    setAttesa(true);
    setErroreSalvataggio("");
    try {
      const r = await pianta.refetch();
      if (r.isError || !r.data || r.data.riga.company_id !== companyId) throw new Error("Non riesco a verificare l’ultima versione della planimetria.");
      if (r.data.versione.numero !== dati.numero) throw new Error("La planimetria è cambiata. Riapri il confronto per vedere le nuove misure.");
      const numeroDaUsare = dati.numero + (attiva ? 1 : 0);
      const importate = vociDallaPianta(scelteValide, numeroDaUsare);
      if (voci.length + importate.length > 5000) throw new Error("Il computo può contenere al massimo 5.000 voci.");
      const vociNuove = [...vociScelte, ...importate];
      const confermate = await onApply({ ...origine, titolo: dati.titolo.slice(0, 160), versione: numeroDaUsare }, vociNuove, voci,
        attiva ? { documento: attiva.documento, versioneAttesa: attiva.base.numero } : undefined);
      const aggiornate = confronto?.variazioni.filter(({ prima }) => attiva || aggiornamenti.has(prima.id)) ?? [];
      if (inSilvio) setUltimaVocePdf(aggiornate[0]?.dopo ?? importate[0]);
      const misureAggiornate = aggiornate.slice(0, 5)
        .map(({ dopo }) => {
          const valore = calcolaVoce(dopo).quantita;
          return `${dopo.descrizione.slice(0, 160)} · ${valore === null ? "misura da verificare" : `${numero.format(valore)} ${unitaVisibile(dopo.unita)}`}`;
        });
      registraSalvataggio(numeroDaUsare, [
        `Progetto v${numeroDaUsare} e computo aggiornati nella stessa bozza.`,
        ...misureAggiornate,
      ].join("\n"));
      if (attiva) {
        onRipristino({ origine, base: attiva.base, vociPrima: voci, versione: numeroDaUsare, vociConfermate: JSON.stringify(confermate ?? vociNuove) });
        setVersioneSalvata(numeroDaUsare);
        chiudiModifica();
        void pianta.refetch();
      }
      setAperto(false);
    } catch (e) {
      setErroreSalvataggio(e instanceof Error ? e.message : "Aggiornamento non riuscito.");
    } finally { setAttesa(false); }
  }

  const piano = versioneEditor?.documento.livelli.find(l => l.id === origine.livelloId);
  const ambitoDisponibile = piano && (!origine.propostaId || piano.proposte.some(p => p.id === origine.propostaId));
  const nomeVariante = piano?.proposte.find(p => p.id === origine.propostaId)?.nome ?? "Stato di fatto";
  const puoAnnullare = !!ripristino && modifica && !bloccaUscita && computoSalvato && origine.id === ripristino.origine.id &&
    origine.livelloId === ripristino.origine.livelloId && origine.propostaId === ripristino.origine.propostaId &&
    versioneLetta?.numero === ripristino.versione && JSON.stringify(voci) === ripristino.vociConfermate;
  async function annullaUltimo() {
    if (!ripristino || !puoAnnullare) return;
    setAttesa(true);
    try {
      const versione = ripristino.versione + 1;
      const ripristinate = ripristino.vociPrima.map(v => ({
        ...v, misure: v.misure.map(m => m.dallaPianta?.versione === ripristino.base.numero
          ? { ...m, dallaPianta: { ...m.dallaPianta, versione } } : m),
      }));
      await onApply({ ...origine, versione }, ripristinate, voci,
        { documento: ripristino.base.documento, versioneAttesa: ripristino.versione });
      registraSalvataggio(versione, `Ultimo aggiornamento annullato. Pianta e quantità ripristinate nella versione ${versione}.`);
      onRipristino(null);
      setVersioneSalvata(versione);
      void pianta.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ripristino non riuscito.");
    } finally { setAttesa(false); }
  }

  const riquadroVariazioni = confrontoInAggiornamento
    ? <p role="status" className="self-start rounded-xl border bg-white p-3 text-sm text-muted-foreground">Ricalcolo le quantità del computo…</p>
    : confronto ? <LavorazioniDallaPianta confronto={confronto} voci={voci} selezione={selezione} bozzaPianta={lavoroInBozza}
      attesa={inLettura || pianta.isError} modifica={modifica} inSilvio={inSilvio} propostaDaChat={!!propostaChat}
      puoConfermareDisegno={puoConfermareDisegno} novitaDisegno={novitaDisegno}
      onPunta={oggetto => controlli.current?.evidenzia(oggetto, oggetto.vista ?? "progetto")}
      onRivedi={apriConfronto} />
    : <p role="status" className="rounded-xl border p-3 text-sm text-muted-foreground">{dati?.errore ?? "Le misure saranno disponibili al termine della lettura."}</p>;

  return <>
    <section aria-label="Planimetria collegata" className="shrink-0 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2">
        <Map aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-blue-700" />
        <div>
          <h3 className="break-words font-medium">{origine.titolo}</h3>
          <p role="status" className="text-xs text-muted-foreground">
            {inSilvio && piano && <>{piano.nome} · {nomeVariante} · </>}
            {pianta.isLoading || attendeVersioneSalvata ? "Leggo la versione della planimetria…" : dati?.errore || (pianta.isError || !dati ? "Planimetria non disponibile." :
              dati.numero > origine.versione ? `Nuova versione ${dati.numero} · computo dalla versione ${origine.versione}` :
                inSilvio ? `v${origine.versione} nel computo` : `Planimetria collegata · versione ${origine.versione}`)}
            {!!confronto?.daVerificare.length && ` · ${confronto.daVerificare.length} misure da verificare`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {puoAnnullare && <Button type="button" variant="outline" size="sm" onClick={() => void annullaUltimo()}>Annulla ultimo aggiornamento</Button>}
        {!bloccaUscita && <Button asChild variant="ghost" size="sm"><Link to={percorsiPlanimetrie.pianta(origine.id, origine.livelloId, origine.propostaId ? `progetto:${origine.propostaId}` : undefined)}>Apri planimetria</Link></Button>}
        <Button type="button" variant="ghost" size="icon" aria-label="Controlla la versione della planimetria"
          disabled={!companyId || pianta.isFetching} onClick={() => void pianta.refetch()}><RefreshCcw aria-hidden="true" className={`size-4 ${pianta.isFetching ? "motion-safe:animate-spin" : ""}`} /></Button>
        {!affiancata && confronto && (daAggiornare || disponibili.length > 0 || confronto.daVerificare.length > 0) &&
          <Button type="button" size="sm" variant="outline" disabled={pianta.isError || inLettura}
            onClick={apriConfronto}>
            {daAggiornare || confronto.daVerificare.length ? "Rivedi misure" : "Scegli misure dalla pianta"}
          </Button>}
      </div>
    </div>
    </section>
    {affiancata && versioneEditor && ambitoDisponibile && piano && !attendeVersioneSalvata && companyId && <div className="quote-wizard-ai-project-layout grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,30%)]">
      <section aria-label="Disegno collegato" className="quote-wizard-ai-project-drawing min-w-0 rounded-xl border bg-white p-3">
        {!inSilvio && <p className="mb-2 text-xs text-muted-foreground">{piano.nome} · {nomeVariante}</p>}
        <Suspense fallback={<p role="status" className="text-sm">Apro l’editor della pianta…</p>}>
          <EditorPianta key={`${origine.id}:${versioneEditor.numero}:${resetEditor}`}
            companyId={companyId} titoloPagina="Planimetria" iniziale={versioneEditor.documento}
            planimetriaId={origine.id} versioneAttesa={versioneEditor.numero}
            nelComputo={{
              ambitoComputo: { livelloId: origine.livelloId, propostaId: origine.propostaId ?? null }, modifica,
              onSelezione: setSelezione, controlli,
              inSilvio,
              onPropostaComputo: conSalvataggioCongiunto ? leggiPropostaChat : undefined,
              onRivediNelComputo: conSalvataggioCongiunto ? apriConfronto : undefined,
              puoRivedereNelComputo: puoConfermareDisegno && !inLettura,
              onStatoChat: setChatOccupata,
              annulla: () => { chiudiModifica(); setResetEditor(n => n + 1); },
            }}
            onModificaDisegno={aggiornaAnteprima}
            onSalvata={salvata => { setVersioneSalvata(salvata.versione); chiudiModifica(); void pianta.refetch(); }} />
        </Suspense>
      </section>
      {renderPdf ? <aside className="quote-wizard-ai-project-results flex min-h-0 min-w-0 flex-col gap-2" aria-label="Computo e PDF del progetto">
        <div role="group" aria-label="Vista del preventivo" className="flex shrink-0 flex-wrap gap-1 rounded-lg border bg-white p-1.5">
          <Button type="button" size="sm" variant={mostraPdf ? "ghost" : "secondary"} aria-pressed={!mostraPdf} onClick={() => setMostraPdf(false)}>
            <ListChecks aria-hidden="true" className="size-4" /> Variazioni
          </Button>
          <Button type="button" size="sm" variant={mostraPdf ? "secondary" : "ghost"} aria-pressed={mostraPdf} onClick={() => setMostraPdf(true)}>
            <FileText aria-hidden="true" className="size-4" /> PDF preventivo
          </Button>
        </div>
        <div hidden={mostraPdf}>{riquadroVariazioni}</div>
        {mostraPdf && <div className="quote-wizard-ai-project-pdf flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white">
          {lavoroInBozza && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-blue-50 p-2.5">
            <p role="status" className="text-xs text-blue-950">{propostaPdf
              ? tavolaNelPdf ? "Misure proposte. La tavola entra nel PDF dopo il salvataggio." : "Misure proposte da confermare."
              : confrontoInAggiornamento ? "Ricalcolo le quantità del computo…" : "Mostro il preventivo salvato. Controlla le misure in Variazioni."}</p>
            {puoConfermareDisegno && <Button type="button" size="sm" disabled={inLettura}
              className={propostaChat ? "hidden xl:inline-flex" : undefined} onClick={apriConfronto}>Rivedi modifiche</Button>}
          </div>}
          <div className="min-h-0 flex-1"><AnteprimaComputoSilvio renderPdf={renderPdf} chiave={chiavePdf ?? ""}
            proposta={propostaPdf} voce={vocePdf} visibile={!confrontoInAggiornamento} /></div>
        </div>}
      </aside> : riquadroVariazioni}
    </div>}
    <Dialog open={aperto} onOpenChange={v => { if (!attesa) setAperto(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lavoroInBozza ? "Conferma le modifiche al progetto" : "Misure dalla planimetria"}</DialogTitle>
          <DialogDescription>{lavoroInBozza ? "Con un salvataggio aggiorni il disegno e le quantità della stessa bozza."
            : `Versione ${dati?.numero ?? origine.versione} di ${origine.titolo}. Gli importi seguono i prezzi già inseriti.`}</DialogDescription>
        </DialogHeader>
        {cambiaVersione && <p role="alert" className="text-sm text-amber-800">Il disegno o le voci sono cambiati. Chiudi e riapri il confronto.</p>}
        {erroreSalvataggio && <p role="alert" className="text-sm text-red-800">{erroreSalvataggio}</p>}
        {confronto && <>
          {!!confronto.variazioni.length && <ul aria-label="Quantità e importi prima e dopo" className="divide-y rounded-md border">
            {confronto.variazioni.map(({ prima, dopo }) => {
              const a = calcolaVoce(prima);
              const b = calcolaVoce(dopo);
              return <li key={prima.id} className="grid gap-2 p-3 text-sm">
                <label className="flex items-start gap-2 break-words font-medium">
                  {modifica && !lavoroInBozza && <Checkbox checked={aggiornamenti.has(prima.id)} onCheckedChange={valore => setAggiornamenti(aperti => {
                    const nuovi = new Set(aperti);
                    if (valore === true) nuovi.add(prima.id);
                    else nuovi.delete(prima.id);
                    return nuovi;
                  })} />}
                  {prima.descrizione}
                </label>
                <dl className="grid grid-cols-2 gap-2 tabular-nums">
                  <div className="rounded-md bg-muted/50 p-2">
                    <dt className="text-xs text-muted-foreground">Prima</dt>
                    <dd className="font-medium">{a.quantita === null ? "—" : `${numero.format(a.quantita)} ${unitaVisibile(prima.unita)}`}</dd>
                    {a.importo !== null && <dd className="text-xs text-muted-foreground">{formatCurrency(a.importo)}</dd>}
                  </div>
                  <div className="rounded-md bg-blue-50 p-2">
                    <dt className="text-xs text-blue-900">Dopo</dt>
                    <dd className="font-semibold">{b.quantita === null ? "—" : `${numero.format(b.quantita)} ${unitaVisibile(prima.unita)}`}</dd>
                    {b.importo !== null && <dd className="text-xs text-blue-900">{formatCurrency(b.importo)}</dd>}
                  </div>
                </dl>
              </li>;
            })}
          </ul>}
          {!confronto.variazioni.length && daAggiornare && <p className="text-sm text-muted-foreground">Le quantità coincidono. Puoi aggiornare il riferimento alla nuova versione.</p>}
          {!!confronto.daVerificare.length && <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-950">
            <p className="font-medium">Controlla queste misure nel computo</p>
            <ul className="mt-1 space-y-1">{confronto.daVerificare.map(({ voce, misura, motivo }) => <li key={`${voce.id}:${misura.id}`}>{voce.descrizione} · {motivo}</li>)}</ul>
          </div>}
          {modifica && !!misurePerConferma.length && <fieldset className="space-y-1 rounded-md border p-2.5">
            <legend className="px-1 text-sm font-medium">Misure da aggiungere</legend>
            {gruppiMisureDallaPianta(misurePerConferma).map(({ prima, misure, quantita }) => <label key={prima.chiave} className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox checked={misure.every(m => scelte.has(m.chiave))} onCheckedChange={valore => setScelte(precedenti => {
                const nuove = new Set(precedenti);
                for (const misura of misure) {
                  if (valore === true) nuove.add(misura.chiave);
                  else nuove.delete(misura.chiave);
                }
                return nuove;
              })} />
              <span className="min-w-0 flex-1 break-words">{prima.nome} · {prima.riferimento}{misure.some(m => m.origine === "stimata") && " · Stima"}
                {prima.prezzo && <span className="block text-xs text-muted-foreground">{formatCurrency(prima.prezzo.importo)}/{unitaVisibile(prima.unita)} · {prima.prezzo.fonte}</span>}</span>
              <span className="shrink-0 text-right tabular-nums">{numero.format(quantita)} {unitaVisibile(prima.unita)}
                {prima.prezzo && <span className="block text-xs text-muted-foreground">{formatCurrency(importoProposto(quantita, prima.prezzo)!)}</span>}</span>
            </label>)}
          </fieldset>}
        </>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={attesa} onClick={() => setAperto(false)}>{lavoroInBozza ? "Torna al progetto" : "Chiudi"}</Button>
          {modifica && <Button type="button" disabled={attesa || cambiaVersione || inLettura || pianta.isError ||
            (lavoroInBozza ? !puoConfermareDisegno : !ciSonoAggiornamenti && !scelteValide.length)}
            onClick={() => void applica()}>{attesa ? "Salvo…" : lavoroInBozza ? "Salva progetto e computo" : "Aggiorna il computo"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
