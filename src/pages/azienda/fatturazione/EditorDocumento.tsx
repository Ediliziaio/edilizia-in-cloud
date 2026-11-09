import { useDeferredValue, useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDocumentoFiscale,
  rileggiDocumentoFiscale,
  useCreateDocumento,
  useEmittiDocumento,
  useDeleteDocumento,
} from "@/hooks/useDocumentiFiscali";
import { supabase } from "@/integrations/supabase/client";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { scaricaXmlFattura } from "@/lib/fatturazione/scaricaXml";
import { faseSdi } from "@/lib/fatturazione/sdiCassetto";
import { useInvioSdi, useAggiornaStatoSdi } from "@/hooks/useInvioSdi";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { datiCopiaDocumento, siPuoDuplicare } from "@/lib/fatturazione/duplicaDocumento";
import { datiFatturaDaDdt } from "@/lib/fatturazione/fatturaDaDdt";
import { toast } from "sonner";
import { useEditorState } from "./editor/useEditorState";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { validateDocumento } from "@/lib/fatturazione/calcoli";
import { EditorTopBar } from "./editor/EditorTopBar";
import { EditorClienteSection } from "./editor/EditorClienteSection";
import { EditorDatiDocumento } from "./editor/EditorDatiDocumento";
import { EditorRigheSection } from "./editor/EditorRigheSection";
import { EditorTotaliSection } from "./editor/EditorTotaliSection";
import { EditorPagamentoSection } from "./editor/EditorPagamentoSection";
import { EditorNoteSection } from "./editor/EditorNoteSection";
import { APRI_FATTURAZIONE_ELETTRONICA } from "./editor/EditorFatturazioneElettronicaSection";
import { AllegatiFattura } from "@/components/fatturazione/AllegatiFattura";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { useAuth } from "@/contexts/AuthContext";
import { PanelRight } from "lucide-react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { TIPI_SDI } from "@/lib/fatturazione/sdiCassetto";
import { EditorPreviewDialog } from "./editor/EditorPreviewDialog";
import { EditorDDTOpzioniCard } from "./editor/EditorDDTOpzioniCard";
import { EditorDDTModelloCard } from "./editor/EditorDDTModelloCard";
import { EditorOrdineSection } from "./editor/EditorOrdineSection";
import { EditorFatturazioneElettronicaSection } from "./editor/EditorFatturazioneElettronicaSection";
import { EditorOpzioniAvanzateSection } from "./editor/EditorOpzioniAvanzateSection";
import { EditorContributiRitenuteSection } from "./editor/EditorContributiRitenuteSection";
import { EditorPersonalizzazioneSection } from "./editor/EditorPersonalizzazioneSection";
import { EditorSendEmailDialog } from "./editor/EditorSendEmailDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { TipoDocumento, DocumentoFiscale } from "@/types/fatturazione";

// Un'istanza per documento: l'editor si inizializza una volta sola, e passando da
// un documento all'altro (Duplica, Converti) sarebbe rimasto sul primo, salvando lì.
export default function EditorDocumento() {
  const { id } = useParams();
  return <EditorDelDocumento key={id ?? "nuovo"} />;
}

function EditorDelDocumento() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isCreate = !id;
  const createdRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const location = useLocation();
  const prefilled = (location.state as { prefilled?: Partial<DocumentoFiscale> } | null)?.prefilled;
  const tipoParam = (searchParams.get("tipo") ?? "fattura") as TipoDocumento;
  const ordineParam = searchParams.get("ordine");
  // Fatturare un rendiconto d'appalto: il documento nasce qui, e qui si chiude
  // l'aggancio — prima non esiste un id da agganciare. Vedi SalAppalto.tsx.
  const appaltoSalParam = searchParams.get("appalto_sal");
  const fromDdtParam = searchParams.get("from_ddt");

  // Leave dialog state
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Fetch order data for pre-fill when creating from an order
  // We don't block document creation on this — it's optional pre-fill only
  const { data: ordineData, isFetched: ordineDataFetched } = useQuery({
    queryKey: ["order-prefill", ordineParam],
    enabled: isCreate && !!ordineParam,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, description, total_amount")
        .eq("id", ordineParam!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fattura da DDT: si legge il DDT; se ha già una bozza di fattura si riapre quella.
  const { data: ddtData, isFetched: ddtFetched, isError: ddtErrore } = useQuery({
    queryKey: ["ddt-prefill", fromDdtParam],
    enabled: isCreate && !!fromDdtParam,
    retry: 1,
    queryFn: async () => {
      const ddt = await rileggiDocumentoFiscale(fromDdtParam!);
      if (!ddt.ddt_fattura_id) return { ddt, bozzaId: null };
      const { data } = await supabase.from("documenti_fiscali" as never).select("id")
        .eq("id", ddt.ddt_fattura_id).eq("stato", "bozza").is("deleted_at", null).maybeSingle();
      return { ddt, bozzaId: (data as { id: string } | null)?.id ?? null };
    },
  });

  const createMutation = useCreateDocumento();
  const { data: loadedDoc, isLoading } = useDocumentoFiscale(id);
  const emittiMutation = useEmittiDocumento();
  const deleteMutation = useDeleteDocumento();

  // Ref alla mutation per evitare deps instabili (la reference di
  // createMutation cambia ad ogni render del componente parent ma il suo
  // .mutate è stabile; usiamo il ref per leggere l'ultima istanza senza
  // far re-fire l'effect).
  const createMutationRef = useRef(createMutation);
  createMutationRef.current = createMutation;

  // Auto-create on mount for /nuovo. Deps minimizzate: solo i flag che
  // davvero determinano se procedere. createMutation viene letta dal ref.
  useEffect(() => {
    if (!isCreate || createdRef.current) return;
    // If ordine param specified, wait until the query has completed (success OR error)
    // but don't block forever — proceed after fetch attempt
    if (ordineParam && !ordineDataFetched) return;
    if (fromDdtParam && !ddtFetched) return;

    createdRef.current = true;

    if (fromDdtParam && (ddtErrore || !ddtData)) {
      toast.error("DDT non letto: la fattura non è stata creata");
      navigate(-1);
      return;
    }
    if (ddtData?.bozzaId) {
      navigate(`/azienda/documenti/${ddtData.bozzaId}`, { replace: true });
      return;
    }

    // Build prefilled data from order if available
    const mergedPrefill: Partial<DocumentoFiscale> = { ...prefilled, ...(ddtData ? datiFatturaDaDdt(ddtData.ddt) : {}) };
    if (ordineData && !mergedPrefill.note_documento) {
      mergedPrefill.note_documento = ordineData.description || undefined;
    }

    createMutationRef.current.mutate(
      { tipo: tipoParam, ...mergedPrefill },
      {
        onSuccess: async (doc) => {
          if (fromDdtParam) {
            const { error } = await supabase.from("documenti_fiscali" as never)
              .update({ ddt_fattura_id: doc.id } as never).eq("id", fromDdtParam);
            if (error) toast.error("Fattura creata, ma non agganciata al DDT", { description: error.message });
          }
          if (appaltoSalParam) {
            const { error } = await (supabase as any).rpc("appalto_sal_collega_fattura", {
              p_sal_id: appaltoSalParam,
              p_documento_id: doc.id,
            });
            // La bozza è nata: se l'aggancio non riesce non si butta via il
            // documento, si dice che il rendiconto è rimasto scollegato.
            if (error) {
              toast.error("Fattura creata, ma non agganciata al rendiconto", { description: error.message });
            }
          }
          const newUrl = ordineParam
            ? `/azienda/documenti/${doc.id}?ordine_link=${ordineParam}`
            : `/azienda/documenti/${doc.id}`;
          navigate(newUrl, { replace: true });
        },
        onError: (err) => {
          console.error("[EditorDocumento] Create mutation failed:", err);
          toast.error("Impossibile creare il documento", {
            description: (err as Error).message,
          });
          createdRef.current = false;
          navigate(-1);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, tipoParam, ordineParam, ordineDataFetched, appaltoSalParam, fromDdtParam, ddtFetched]);

  const { state, dispatch, isSaving, lastSaved, isDirty, saveNow } = useEditorState(loadedDoc);
  const isBozza = state.stato === "bozza";
  // La fattura verso lo SDI (24/09/2026). Una scartata per l'Agenzia non è
  // emessa: si corregge qui (tranne numero e data) e si rimanda.
  const fase = faseSdi(state)?.fase;
  const scartata = fase === "scartata";
  const modificabile = isBozza || scartata;
  const aziendaAllegati = useEffectiveCompanyId();
  const { data: aziendaAnagrafica } = useAnagraficaAzienda();

  // 2026-05-27 (Form UX audit): warn su chiusura tab / Cmd+W / F5 quando ci
  // sono modifiche non salvate. Prima esisteva solo un dialog sulla freccia
  // back; tutti gli altri path (refresh, link sidebar, close tab) facevano
  // perdere le modifiche fatte negli ultimi 2s (autosave window).
  useBeforeUnload(isDirty && modificabile);
  const [isConvertLoading, setIsConvertLoading] = useState(false);

  // Convert proforma/preventivo to fattura
  const handleConvertToFattura = useCallback(async () => {
    if (!state.id) return;
    setIsConvertLoading(true);
    try {
      const fattura = await convertiProformaInFattura(state.id);
      toast.success("Convertito in fattura", { description: "È una bozza: prende il numero quando la emetti." });
      navigate(`/azienda/documenti/${fattura.id}`);
    } catch (err: any) {
      toast.error("Errore nella conversione", { description: err.message });
    } finally {
      setIsConvertLoading(false);
    }
  }, [state.id, navigate]);

  // Invio e esito: dopo l'invio si rilegge il documento, così la pagina passa
  // subito a «In elaborazione» (prima restava «non inviata al SDI»).
  const rimetti = useCallback((doc: DocumentoFiscale) => dispatch({ type: "INIT", payload: doc }), [dispatch]);
  const invioSdi = useInvioSdi(rimetti);
  const aggiornaStatoSdi = useAggiornaStatoSdi(rimetti);

  const handleInviaSDI = useCallback(async () => {
    if (!state.id || invioSdi.isPending) return;
    // Una scartata appena corretta: prima si salvano le correzioni, poi parte.
    try {
      await saveNow();
    } catch (err) {
      toast.error("Correzioni non salvate: la fattura non è partita", { description: (err as Error).message });
      return;
    }
    invioSdi.mutate(state.id);
  }, [state.id, invioSdi, saveNow]);

  // Mentre lo SDI la elabora, si rilegge ogni minuto: l'esito lo scrive il giro
  // automatico (ogni quarto d'ora) o «Aggiorna stato», e la pagina lo mostra
  // senza ricaricarla.
  useEffect(() => {
    if (!state.id || (fase !== "in_elaborazione" && fase !== "invio_in_corso")) return;
    const id = state.id;
    const prima = `${state.stato}|${state.sdi_stato ?? ""}`;
    const giro = window.setInterval(async () => {
      try {
        const doc = await rileggiDocumentoFiscale(id);
        if (`${doc.stato}|${doc.sdi_stato ?? ""}` !== prima) rimetti(doc);
      } catch { /* si riprova al giro dopo */ }
    }, 60_000);
    return () => window.clearInterval(giro);
  }, [state.id, fase, state.stato, state.sdi_stato, rimetti]);

  const handleDownloadXML = useCallback(async () => {
    if (!state.id) return;
    try {
      await scaricaXmlFattura(state as unknown as DocumentoFiscale, aziendaAnagrafica);
    } catch (err) {
      toast.error("XML non scaricato", { description: (err as Error).message });
    }
  }, [state, aziendaAnagrafica]);

  const handleDownloadPDF = useCallback(async () => {
    if (!state.id) return;
    try { await downloadNativePDF(state.id, state.numero); toast.info("Stampa richiesta", { description: "Per salvare il file scegli «Salva come PDF» nel dialogo del browser. Il file non viene scaricato automaticamente.", duration: 12000 }); }
    catch (err: any) { toast.error("Errore download PDF", { description: err.message }); }
  }, [state.id, state.numero]);

  // Duplicate document as new draft
  const handleDuplicate = useCallback(async () => {
    if (!state.id) return;
    // Uscendo dall'originale il salvataggio automatico in attesa si perderebbe.
    if (isDirty) {
      try {
        await saveNow();
      } catch (err) {
        toast.error("Modifiche non salvate: il documento non è stato duplicato", { description: (err as Error).message });
        return;
      }
    }
    createMutation.mutate(
      { tipo: (state.tipo ?? "fattura") as TipoDocumento, ...datiCopiaDocumento(state) },
      {
        onSuccess: (doc) => {
          toast.success("Documento duplicato");
          navigate(`/azienda/documenti/${doc.id}`);
        },
        onError: (err) => {
          toast.error("Errore nella duplicazione", { description: (err as Error).message });
        },
      }
    );
  }, [state, createMutation, navigate, isDirty, saveNow]);

  // ── Auto-cleanup draft "vuote" ─────────────────────────────────
  //
  // L'editor crea sempre un draft su mount per assegnare l'ID. Se l'utente
  // esce senza compilare niente (no cliente + no righe + no causale ecc.),
  // il documento è di fatto rifiuti che brucia la numerazione. Lo
  // eliminiamo silenziosamente sia su back che su unmount (cambio rotta).
  const isEmpty = useMemo(() => {
    if (!state || !state._initialized) return false;
    const cs = (state.cliente_snapshot ?? {}) as Record<string, unknown>;
    const hasCliente =
      !!state.anagrafica_id ||
      !!(cs.ragione_sociale || cs.business_name || cs.name || cs.nome || cs.cognome);
    const hasRighe = (state.righe ?? []).some((r) =>
      !!(r?.descrizione?.trim?.()) || (r?.quantita ?? 0) > 0 || (r?.prezzo_unitario ?? 0) > 0,
    );
    const hasDdtFields =
      !!state.ddt_causale_trasporto ||
      !!state.ddt_aspetto_beni ||
      !!state.ddt_mezzo_trasporto ||
      !!state.ddt_peso ||
      !!(state.ddt_numero_colli && state.ddt_numero_colli > 0) ||
      !!state.note_documento;
    return !hasCliente && !hasRighe && !hasDdtFields;
  }, [state]);

  // Ref per cleanup di unmount — useEffect cleanup non vede lo state corrente.
  const cleanupRef = useRef({ id: null as string | null, isEmpty: false, isBozza: false });
  useEffect(() => {
    cleanupRef.current = { id: state.id ?? null, isEmpty, isBozza };
  }, [state.id, isEmpty, isBozza]);

  // Cleanup di un draft vuoto: tenta RPC `rilascia_numero_documento` per
  // restituire il numero al counter (se era l'ultimo emesso), altrimenti
  // fallback a delete diretto. In entrambi i casi il doc viene cancellato.
  // Guard via ref: previene doppia delete su back-click rapidi o
  // back-click + unmount cleanup simultanei.
  const releaseInFlightRef = useRef<Set<string>>(new Set());
  const releaseEmptyDraft = useCallback(async (docId: string) => {
    if (releaseInFlightRef.current.has(docId)) return;
    releaseInFlightRef.current.add(docId);
    try {
      const { error } = await (supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { code?: string; message: string } | null }>)(
        "rilascia_numero_documento",
        { p_documento_id: docId },
      );
      if (!error) return;
      // RPC non disponibile (migration non applicata) → fallback delete diretto
      if (error.code === "PGRST202" || /function .* does not exist/i.test(error.message)) {
        await supabase.from("documenti_fiscali").delete().eq("id", docId);
        return;
      }
      console.warn("[EditorDocumento] rilascia_numero_documento errore", error);
    } catch (e) {
      console.warn("[EditorDocumento] cleanup draft vuoto fallito", e);
    } finally {
      releaseInFlightRef.current.delete(docId);
    }
  }, []);

  // Cleanup su unmount: se la bozza è ancora vuota, eliminala (best-effort).
  useEffect(() => {
    return () => {
      const { id, isEmpty: empty, isBozza: bozza } = cleanupRef.current;
      if (id && empty && bozza) {
        void releaseEmptyDraft(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle navigation when leaving with unsaved changes
  const handleBack = useCallback(() => {
    // Draft vuoto → elimina silenziosamente senza dialog (no spreco numerazione)
    // Naviga IMMEDIATA (no await) — il cleanup avviene in background, evita
    // freeze UI se il network è lento. L'unmount cleanup useEffect riprova.
    if (state.id && isEmpty && isBozza) {
      void releaseEmptyDraft(state.id);
      navigate("/azienda/documenti");
      return;
    }
    if (isDirty && isBozza) {
      setPendingNavigation("/azienda/documenti");
      setShowLeaveDialog(true);
    } else {
      navigate("/azienda/documenti");
    }
  }, [state.id, isEmpty, isDirty, isBozza, navigate, releaseEmptyDraft]);

  const validationErrors = useMemo(
    () => validateDocumento(state),
    [state]
  );
  const criticalErrorCount = validationErrors.filter((e) => e.severity === "error").length;

  const vaiAlCampo = useCallback((campo: string) => {
    const sezione = campo.startsWith("righe") ? "ed-righe"
      : campo === "cliente" ? "ed-cliente"
      : campo === "scadenze" ? "ed-pagamento"
      : campo === "sconto_globale" ? "ed-totali"
      : ["cig", "esigibilita_iva", "bollo_virtuale"].includes(campo) ? "ed-fe"
      : "ed-dati";
    if (sezione === "ed-fe") window.dispatchEvent(new Event(APRI_FATTURAZIONE_ELETTRONICA));
    const el = document.getElementById(sezione);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-destructive/50", "rounded-lg");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-destructive/50", "rounded-lg"), 1800);
  }, []);

  // Il foglio accanto al modulo, sugli schermi che ne hanno lo spazio. La scelta si ricorda.
  const [anteprimaAccanto, setAnteprimaAccanto] = useState(() => {
    try {
      const salvata = localStorage.getItem("editor-fattura-anteprima");
      if (salvata !== null) return salvata === "1";
    } catch { /* senza memoria si usa la larghezza */ }
    return typeof window !== "undefined" && window.innerWidth >= 1536;
  });
  const cambiaAnteprima = useCallback(() => {
    setAnteprimaAccanto((prima) => {
      try { localStorage.setItem("editor-fattura-anteprima", prima ? "0" : "1"); } catch { /* facoltativo */ }
      return !prima;
    });
  }, []);
  // Il foglio segue con calma: scrivere nel modulo resta fluido.
  const statoAnteprima = useDeferredValue(state);
  const { effectiveCompany: aziendaAnteprima } = useAuth();

  if (isCreate || isLoading || !state._initialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-3.5rem)]">
      <EditorTopBar
        state={state}
        isSaving={isSaving}
        isDirty={isDirty}
        lastSaved={lastSaved}
        onEmetti={async () => {
          if (!state.id || emittiMutation.isPending) return;
          // Il salvataggio automatico aspetta 2 secondi. Chi correggeva un
          // prezzo e premeva subito «Emetti» emetteva la versione PRECEDENTE:
          // la mutation rilegge il documento dal database, e il salvataggio in
          // volo arrivava dopo, quando ormai il documento è immutabile.
          try {
            await saveNow();
          } catch (err) {
            toast.error("Modifiche non salvate: il documento non è stato emesso", { description: (err as Error).message });
            return;
          }
          emittiMutation.mutate(state.id, {
            // Risincronizza lo state locale col documento emesso: l'editor
            // si inizializza una sola volta, senza questo restava "Bozza"
            // (e modificabile) fino a un reload manuale.
            onSuccess: (doc) => dispatch({ type: "INIT", payload: doc }),
          });
        }}
        isEmitting={emittiMutation.isPending}
        onDelete={() => {
          if (state.id) {
            deleteMutation.mutate(state.id, {
              onSuccess: () => navigate("/azienda/documenti"),
            });
          }
        }}
        onFieldChange={(field, value) => dispatch({ type: "SET_FIELD", field, value })}
        validationErrorCount={criticalErrorCount}
        validationErrors={validationErrors}
        onVaiAlCampo={vaiAlCampo}
        onPreview={() => setPreviewOpen(true)}
        onBack={handleBack}
        onInviaSDI={handleInviaSDI}
        onAggiornaStatoSdi={state.id ? () => aggiornaStatoSdi.mutate(state.id!) : undefined}
        onDownloadPDF={handleDownloadPDF}
        onDownloadXML={handleDownloadXML}
        onSendEmail={() => setEmailDialogOpen(true)}
        onDuplicate={siPuoDuplicare(state.tipo) ? handleDuplicate : undefined}
        onConvertToFattura={handleConvertToFattura}
        isInviaSDILoading={invioSdi.isPending}
        isAggiornaStatoLoading={aggiornaStatoSdi.isPending}
        isConvertLoading={isConvertLoading}
      />

      {/* Single-page scrollable form — full width, like Fatture in Cloud */}
      <div className="flex-1 overflow-auto bg-gradient-to-b from-muted/40 to-muted/20">
        <div className={anteprimaAccanto ? "mx-auto flex max-w-[1800px] items-start gap-4 px-4 sm:px-6" : undefined}>
        <div className={anteprimaAccanto ? "min-w-0 flex-1 py-6 space-y-5 pb-24" : "max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-24"}>
          <div className="hidden justify-end xl:flex">
            <button type="button" onClick={cambiaAnteprima} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <PanelRight className="h-3.5 w-3.5" />
              {anteprimaAccanto ? "Nascondi anteprima" : "Anteprima a lato"}
            </button>
          </div>

          {/* NC banner */}
          {state.tipo === "nota_credito" && state.documento_correlato_id && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Nota di Credito</p>
                <p className="text-amber-700 text-xs mt-0.5">{state.note_documento}</p>
                <div className="mt-2">
                  <Select
                    value={(state as any)._motivo_nc ?? ""}
                    onValueChange={(v) => dispatch({ type: "SET_FIELD", field: "_motivo_nc" as any, value: v })}
                    disabled={!isBozza}
                  >
                    <SelectTrigger className="h-8 w-48">
                      <SelectValue placeholder="Motivo storno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reso">Reso</SelectItem>
                      <SelectItem value="annullamento">Annullamento</SelectItem>
                      <SelectItem value="errore">Errore</SelectItem>
                      <SelectItem value="sconto_postvendita">Sconto post-vendita</SelectItem>
                      <SelectItem value="altro">Altro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {state.tipo === "reverse_charge_interno" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm">
              <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-800">Integrazione TD16 — Reverse charge interno</p>
                <p className="text-blue-700 text-xs mt-0.5">
                  Il <strong>Fornitore</strong> è il cedente della fattura ricevuta senza IVA. Il destinatario sei tu: qui si aggiunge l'IVA che quella fattura non ha.
                </p>
              </div>
            </div>
          )}

          {/* Autofattura estera (TD17/18/19) banner */}
          {["integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"].includes(state.tipo) && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm">
              <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-800">
                  {state.tipo === "integrazione_servizi_estero" ? "Autofattura TD17 — Acquisto servizi dall'estero" :
                   state.tipo === "integrazione_beni_ue" ? "Integrazione TD18 — Acquisto beni intracomunitari (UE)" :
                   "Integrazione TD19 — Acquisto beni extra-UE (art.17 c.2)"}
                </p>
                <p className="text-blue-700 text-xs mt-0.5">
                  Il campo <strong>Fornitore Estero</strong> rappresenta il cedente nella fattura originale ricevuta.
                  Inserisci i dati del fornitore straniero. Il destinatario (Cessionario) sarà automaticamente la tua azienda.
                </p>
              </div>
            </div>
          )}

          {state.tipo === "ddt" ? (
            // DDT layout compatto: 3 card. Opzioni Avanzate contiene tutti i
            // campi trasporto (Causale, Aspetto, Mezzo, Porto, Colli, Peso,
            // Luogo, Vettore + conducente/targa, Data consegna, Annotazioni).
            <>
              <EditorDDTModelloCard />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <EditorClienteSection state={state} dispatch={dispatch} disabled={!modificabile} />
                <EditorDatiDocumento state={state} dispatch={dispatch} disabled={!modificabile} dataBloccata={scartata} />
                <EditorDDTOpzioniCard state={state} dispatch={dispatch} disabled={!modificabile} />
              </div>

              {(state.ordine_id || searchParams.get("ordine_link")) && (
                <EditorOrdineSection state={state} dispatch={dispatch} disabled={!modificabile} />
              )}
            </>
          ) : (
            <>
              {/* ═══ TOP SECTION: 3-column layout (Cliente | Dati + FE + Contributi | Pagamento + Opzioni + Personalizzazione) ═══ */}
              <div className={`grid grid-cols-1 gap-4 ${anteprimaAccanto ? "2xl:grid-cols-2" : "lg:grid-cols-[1fr_1fr_280px]"}`}>
                {/* LEFT: Cliente */}
                <div id="ed-cliente" className="h-full [&>*]:h-full">
                  <EditorClienteSection state={state} dispatch={dispatch} disabled={!modificabile} />
                </div>

                {/* CENTER: Dati documento + Fatturazione Elettronica + Contributi e Ritenute */}
                <div className="space-y-4">
                  <div id="ed-dati"><EditorDatiDocumento state={state} dispatch={dispatch} disabled={!modificabile} dataBloccata={scartata} /></div>
                  {state.tipo !== "preventivo" && state.tipo !== "proforma" && (
                    <div id="ed-fe"><EditorFatturazioneElettronicaSection state={state} dispatch={dispatch} disabled={!modificabile} /></div>
                  )}
                  <EditorContributiRitenuteSection state={state} dispatch={dispatch} disabled={!modificabile} />
                </div>

                {/* RIGHT: Pagamento + Opzioni avanzate + Personalizzazione */}
                <div className="space-y-4">
                  <div id="ed-pagamento"><EditorPagamentoSection state={state} dispatch={dispatch} disabled={!modificabile} /></div>
                  <EditorOpzioniAvanzateSection state={state} dispatch={dispatch} disabled={!modificabile} />
                  <EditorPersonalizzazioneSection state={state} dispatch={dispatch} disabled={!modificabile} />
                </div>
              </div>

              {/* Ordine collegato (solo se presente) */}
              {(state.ordine_id || searchParams.get("ordine_link")) && (
                <EditorOrdineSection state={state} dispatch={dispatch} disabled={!modificabile} />
              )}
            </>
          )}

          {/* ═══ RIGHE + RIEPILOGO ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-4">
            <div id="ed-righe" className="min-w-0"><EditorRigheSection state={state} dispatch={dispatch} disabled={!modificabile} /></div>
            <div id="ed-totali"><EditorTotaliSection state={state} dispatch={dispatch} disabled={!modificabile} /></div>
          </div>

          {/* ═══ NOTE ═══ */}
          <EditorNoteSection state={state} dispatch={dispatch} disabled={!modificabile} />

          {/* Allegati: stessi del dettaglio, ora anche mentre si prepara il documento.
              Servono l'id, quindi la bozza già salvata (il salvataggio è automatico). */}
          <div className="rounded-xl border bg-card p-4">
            {state.id ? (
              <AllegatiFattura
                companyId={aziendaAllegati}
                madre={{ documentoFiscaleId: state.id }}
                invioSdi={modificabile && TIPI_SDI.includes(state.tipo) && !["preventivo", "proforma"].includes(state.tipo)}
                sola_lettura={!modificabile}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Allegati: si possono aggiungere appena la bozza è salvata.</p>
            )}
          </div>
        </div>
        {anteprimaAccanto && (
          <aside aria-label="Anteprima del documento" className="sticky top-4 mt-6 hidden max-h-[calc(100vh-8rem)] w-[460px] shrink-0 justify-center overflow-y-auto overflow-x-hidden rounded-lg border bg-muted/30 xl:flex">
            <div className="shrink-0">
              <PreviewFattura documento={statoAnteprima} azienda={aziendaAnagrafica ?? null} logoAziendale={aziendaAnteprima?.logo_url} scale={0.55} />
            </div>
          </aside>
        )}
        </div>
      </div>

      {/* Preview Dialog */}
      <EditorPreviewDialog
        state={state}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {/* Send Email Dialog */}
      <EditorSendEmailDialog
        state={state}
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        saveNow={saveNow}
      />

      {/* Leave dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvare come bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              Hai modifiche non salvate. Desideri salvarle prima di uscire?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowLeaveDialog(false);
              setPendingNavigation(null);
            }}>
              Annulla
            </AlertDialogCancel>
            <button
              onClick={() => {
                setShowLeaveDialog(false);
                setPendingNavigation(null);
                navigate("/azienda/documenti");
              }}
              className="text-destructive hover:text-destructive/80 text-sm font-medium"
            >
              Esci senza salvare
            </button>
            <AlertDialogAction onClick={async () => {
              setShowLeaveDialog(false);
              try {
                await saveNow();
                toast.success("Bozza salvata");
              } catch {
                toast.error("Errore nel salvataggio");
              }
              navigate(pendingNavigation || "/azienda/documenti");
              setPendingNavigation(null);
            }}>
              Salva bozza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
