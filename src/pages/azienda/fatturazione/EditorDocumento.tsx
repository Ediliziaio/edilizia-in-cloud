import { useEffect, useRef, useMemo, useState, useCallback } from "react";
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
  useCreateDocumento,
  useEmittiDocumento,
  useDeleteDocumento,
} from "@/hooks/useDocumentiFiscali";
import { supabase } from "@/integrations/supabase/client";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { toast } from "sonner";
import { useEditorState } from "./editor/useEditorState";
import { validateDocumento } from "@/lib/fatturazione/calcoli";
import { EditorTopBar } from "./editor/EditorTopBar";
import { EditorClienteSection } from "./editor/EditorClienteSection";
import { EditorDatiDocumento } from "./editor/EditorDatiDocumento";
import { EditorRigheSection } from "./editor/EditorRigheSection";
import { EditorTotaliSection } from "./editor/EditorTotaliSection";
import { EditorPagamentoSection } from "./editor/EditorPagamentoSection";
import { EditorNoteSection } from "./editor/EditorNoteSection";
import { EditorPreviewDialog } from "./editor/EditorPreviewDialog";
import { EditorDDTSection } from "./editor/EditorDDTSection";
import { EditorDDTOpzioniCard } from "./editor/EditorDDTOpzioniCard";
import { EditorDDTModelloCard } from "./editor/EditorDDTModelloCard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { EditorOrdineSection } from "./editor/EditorOrdineSection";
import { EditorFatturazioneElettronicaSection } from "./editor/EditorFatturazioneElettronicaSection";
import { EditorOpzioniAvanzateSection } from "./editor/EditorOpzioniAvanzateSection";
import { EditorContributiRitenuteSection } from "./editor/EditorContributiRitenuteSection";
import { EditorPersonalizzazioneSection } from "./editor/EditorPersonalizzazioneSection";
import { EditorSendEmailDialog } from "./editor/EditorSendEmailDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { TipoDocumento, DocumentoFiscale } from "@/types/fatturazione";

export default function EditorDocumento() {
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

  const createMutation = useCreateDocumento();
  const { data: loadedDoc, isLoading } = useDocumentoFiscale(id);
  const emittiMutation = useEmittiDocumento();
  const deleteMutation = useDeleteDocumento();

  // Auto-create on mount for /nuovo
  useEffect(() => {
    if (isCreate && !createdRef.current) {
      // If ordine param specified, wait until the query has completed (success OR error)
      // but don't block forever — proceed after fetch attempt
      if (ordineParam && !ordineDataFetched) return;

      createdRef.current = true;

      // Build prefilled data from order if available
      const mergedPrefill: Partial<DocumentoFiscale> = { ...prefilled };
      if (ordineData && !mergedPrefill.note_documento) {
        mergedPrefill.note_documento = ordineData.description || undefined;
      }

      createMutation.mutate(
        { tipo: tipoParam, ...mergedPrefill },
        {
          onSuccess: (doc) => {
            const newUrl = ordineParam
              ? `/azienda/documenti/${doc.id}?ordine_link=${ordineParam}`
              : `/azienda/documenti/${doc.id}`;
            navigate(newUrl, { replace: true });
          },
          onError: (err) => {
            console.error("[EditorDocumento] Create mutation failed:", err);
            // Reset flag so user can retry, and navigate back
            createdRef.current = false;
            navigate(-1);
          },
        }
      );
    }
  }, [isCreate, tipoParam, createMutation, navigate, ordineParam, ordineData, ordineDataFetched]);

  const { state, dispatch, isSaving, lastSaved, isDirty, saveNow } = useEditorState(loadedDoc);
  const isBozza = state.stato === "bozza";
  const [isInviaSDILoading, setIsInviaSDILoading] = useState(false);
  const [isConvertLoading, setIsConvertLoading] = useState(false);

  // Convert proforma/preventivo to fattura
  const handleConvertToFattura = useCallback(async () => {
    if (!state.id) return;
    setIsConvertLoading(true);
    try {
      const fattura = await convertiProformaInFattura(state.id);
      toast.success(`Convertito in fattura ${fattura.numero}`);
      navigate(`/azienda/documenti/${fattura.id}`);
    } catch (err: any) {
      toast.error("Errore nella conversione", { description: err.message });
    } finally {
      setIsConvertLoading(false);
    }
  }, [state.id, navigate]);

  const handleInviaSDI = useCallback(async () => {
    if (!state.id) return;
    setIsInviaSDILoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke("invia-sdi", {
        body: { documento_id: state.id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (resp.error) throw new Error(resp.error.message);
      const result = resp.data as { success: boolean; sdi_id?: string; errors?: any[] };
      if (!result.success) {
        toast.error("Errore invio SDI", { description: JSON.stringify(result.errors) });
        return;
      }
      toast.success("Fattura inviata al SDI", { description: `ID trasmissione: ${result.sdi_id}` });
    } catch (err: any) {
      toast.error("Errore invio SDI", { description: err.message });
    } finally {
      setIsInviaSDILoading(false);
    }
  }, [state.id]);

  const handleDownloadPDF = useCallback(async () => {
    if (!state.id || !state.numero) return;
    try { await downloadNativePDF(state.id, state.numero); toast.success("PDF scaricato"); }
    catch (err: any) { toast.error("Errore download PDF", { description: err.message }); }
  }, [state.id, state.numero]);

  // Duplicate document as new draft
  const handleDuplicate = useCallback(() => {
    if (!state.id) return;
    const prefillData: Partial<DocumentoFiscale> = {
      anagrafica_id: state.anagrafica_id,
      cliente_snapshot: state.cliente_snapshot as DocumentoFiscale["cliente_snapshot"],
      righe: (state.righe ?? []).map((r, i) => ({
        ...r,
        id: crypto.randomUUID(),
        numero_linea: i + 1,
      })),
      note_documento: state.note_documento,
      metodo_pagamento_codice: state.metodo_pagamento_codice,
      iban_pagamento: state.iban_pagamento,
      bic_pagamento: state.bic_pagamento,
      nome_banca: state.nome_banca,
      intestatario_conto: state.intestatario_conto,
      esigibilita_iva: state.esigibilita_iva as DocumentoFiscale["esigibilita_iva"],
      serie: state.serie,
    };
    createMutation.mutate(
      { tipo: (state.tipo ?? "fattura") as TipoDocumento, ...prefillData },
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
  }, [state, createMutation, navigate]);

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
      const { error } = await (supabase.rpc as unknown as (
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
        lastSaved={lastSaved}
        onEmetti={() => state.id && emittiMutation.mutate(state.id)}
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
        onPreview={() => setPreviewOpen(true)}
        onBack={handleBack}
        onInviaSDI={handleInviaSDI}
        onDownloadPDF={handleDownloadPDF}
        onSendEmail={() => setEmailDialogOpen(true)}
        onDuplicate={handleDuplicate}
        onConvertToFattura={handleConvertToFattura}
        isInviaSDILoading={isInviaSDILoading}
        isConvertLoading={isConvertLoading}
      />

      {/* Single-page scrollable form — full width, like Fatture in Cloud */}
      <div className="flex-1 overflow-auto bg-gradient-to-b from-muted/40 to-muted/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 pb-24">

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
            /* ═══ DDT LAYOUT — replica Fatture in Cloud (compatto, 3 card) ═══ */
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <EditorClienteSection state={state} dispatch={dispatch} disabled={!isBozza} />
                <EditorDatiDocumento state={state} dispatch={dispatch} disabled={!isBozza} />
                <EditorDDTOpzioniCard state={state} dispatch={dispatch} disabled={!isBozza} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                <EditorDDTModelloCard />
                <div />
              </div>

              {/* Dettagli trasporto avanzati (subappaltatore + conducente + targa) */}
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium hover:bg-muted/40 transition">
                  <span>Dettagli trasporto avanzati (vettore, conducente, targa)</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <EditorDDTSection state={state} dispatch={dispatch} disabled={!isBozza} />
                </CollapsibleContent>
              </Collapsible>

              {(state.ordine_id || searchParams.get("ordine_link")) && (
                <EditorOrdineSection state={state} dispatch={dispatch} disabled={!isBozza} />
              )}
            </>
          ) : (
            <>
              {/* ═══ TOP SECTION: 3-column layout (Cliente | Dati + FE + Contributi | Pagamento + Opzioni + Personalizzazione) ═══ */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-4">
                {/* LEFT: Cliente */}
                <EditorClienteSection state={state} dispatch={dispatch} disabled={!isBozza} />

                {/* CENTER: Dati documento + Fatturazione Elettronica + Contributi e Ritenute */}
                <div className="space-y-4">
                  <EditorDatiDocumento state={state} dispatch={dispatch} disabled={!isBozza} />
                  {state.tipo !== "preventivo" && state.tipo !== "proforma" && (
                    <EditorFatturazioneElettronicaSection state={state} dispatch={dispatch} disabled={!isBozza} />
                  )}
                  <EditorContributiRitenuteSection state={state} dispatch={dispatch} disabled={!isBozza} />
                </div>

                {/* RIGHT: Pagamento + Opzioni avanzate + Personalizzazione */}
                <div className="space-y-4">
                  <EditorPagamentoSection state={state} dispatch={dispatch} disabled={!isBozza} />
                  <EditorOpzioniAvanzateSection state={state} dispatch={dispatch} disabled={!isBozza} />
                  <EditorPersonalizzazioneSection state={state} dispatch={dispatch} disabled={!isBozza} />
                </div>
              </div>

              {/* Ordine collegato (solo se presente) */}
              {(state.ordine_id || searchParams.get("ordine_link")) && (
                <EditorOrdineSection state={state} dispatch={dispatch} disabled={!isBozza} />
              )}
            </>
          )}

          {/* ═══ RIGHE + RIEPILOGO ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <EditorRigheSection state={state} dispatch={dispatch} disabled={!isBozza} />
            <EditorTotaliSection state={state} dispatch={dispatch} disabled={!isBozza} />
          </div>

          {/* ═══ NOTE ═══ */}
          <EditorNoteSection state={state} dispatch={dispatch} disabled={!isBozza} />
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
