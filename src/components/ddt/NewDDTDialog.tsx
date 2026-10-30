// ============================================================================
// NewDDTDialog — Wizard procedurale per la registrazione di un nuovo DDT
// ----------------------------------------------------------------------------
// 3 step:
//   1) Documento — da dove nasce la bolla, numero, data, foto/PDF e lettura AI
//   2) Consegna & corriere — corriere, targa, autista, ore arrivo
//   3) Verifica & conferma — righe lette, quantità, stato, magazzino, difformità
//
// Appena confermato lo step 3 crea il DDT nel DB. Gli upload file avvengono
// post-creazione (serve l'id DDT per il path storage {company_id}/{ddt_id}/).
//
// 29/10/2026 — L'ORDINE D'ACQUISTO NON È PIÙ OBBLIGATORIO. Prima la maschera
// pretendeva un ODA e diceva «Nessun ODA disponibile. Crea prima un Ordine
// d'Acquisto»: in cantiere la merce arriva anche senza ordine, e la bolla non si
// caricava proprio. Ora la bolla nasce in tre modi (da ODA, da commessa, da
// sola) e la prima scelta decide che cosa viene chiesto dopo.
//
// E LE RIGHE LETTE DALL'AI SI SALVANO. Prima la chiamata chiedeva
// `legacy_format: true` — il formato piatto — e di ogni prodotto restava solo la
// somma delle quantità in un campo: codici, descrizioni e PREZZI venivano letti
// dal modello e buttati via da noi. Ora passano da `leggiDDTdaAI` e finiscono
// in `ddt_righe`, col loro prezzo.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileCheck, Truck, ClipboardCheck, Loader2, ChevronLeft, ChevronRight,
  Check, ShoppingCart, Package, Calendar, Clock, User, Phone, Hash,
  AlertTriangle, FileText, Warehouse as WarehouseIcon, Paperclip,
  Info, MapPin, Sparkles, Wand2, HardHat, Building2, ListTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDDTRicezioneMutations,
  useDDTAttachments,
  type DDTStato,
  type DDTAttachmentKind,
  type DDTRigaNuova,
} from "@/hooks/useDDTRicezione";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { DDTAttachmentUploader } from "./DDTAttachmentUploader";
import { leggiDDTdaAI, quantitaTotale, importoTotale } from "@/lib/ddt/letturaAI";
import { abbinaFornitore, type FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";

/** Da dove nasce la bolla: è la scelta che decide tutto il resto dello step 1. */
type OrigineBolla = "oda" | "commessa" | "sola";

/**
 * Chi ha portato la merce. Non è un dettaglio: con «noi» non c'è nessun
 * corriere da registrare — siamo andati a ritirarla col nostro furgone, e i
 * campi da chiedere sono altri. Misurato il 29/10/2026: su 232 bolle, 231 non
 * avevano nessun corriere, e il riquadro restava vuoto.
 */
type TrasportoACuraDi = "fornitore" | "noi" | "terzi";

const TRASPORTI: { key: TrasportoACuraDi; label: string; aiuto: string; icona: typeof Truck }[] = [
  { key: "fornitore", label: "L'ha portata il fornitore", aiuto: "Col suo mezzo, fino a noi.", icona: Building2 },
  { key: "noi", label: "Siamo andati a ritirarla", aiuto: "Nostro furgone, nostro uomo.", icona: Package },
  { key: "terzi", label: "Un corriere", aiuto: "GLS, DHL, un padroncino.", icona: Truck },
];

const ORIGINI: { key: OrigineBolla; label: string; icona: typeof ShoppingCart; aiuto: string }[] = [
  { key: "oda", label: "Da un ordine", icona: ShoppingCart, aiuto: "La merce era ordinata: commessa e fornitore li prende dall'ODA." },
  { key: "commessa", label: "Da una commessa", icona: HardHat, aiuto: "Nessun ordine a monte, ma si sa su quale cantiere va la merce." },
  { key: "sola", label: "Solo la bolla", icona: FileText, aiuto: "La foto e il fornitore. Il cantiere si aggancia dopo." },
];

// ─── Step definition ────────────────────────────────────────────────────
const STEPS = [
  {
    key: "documento" as const,
    title: "Documento DDT",
    short: "Documento",
    icon: FileCheck,
    description: "Da dove nasce la bolla, e il documento come foto o PDF",
  },
  {
    key: "consegna" as const,
    title: "Chi ha portato la merce",
    short: "Trasporto",
    icon: Truck,
    description: "Consegnata, ritirata da noi o da un corriere, e gli orari",
  },
  {
    key: "verifica" as const,
    title: "Verifica & conferma",
    short: "Verifica",
    icon: ClipboardCheck,
    description: "Righe lette, quantità, stato ed eventuali non conformità",
  },
];

interface NewDDTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-seleziona un ODA (usato dal dettaglio PO per "Registra DDT") */
  prefillPurchaseOrderId?: string | null;
  /** Callback dopo la creazione (es. refetch) */
  onCreated?: (ddtId: string) => void;
}

type LocalFile = { file: File; kind: DDTAttachmentKind; id: string };

export function NewDDTDialog({
  open,
  onOpenChange,
  prefillPurchaseOrderId,
  onCreated,
}: NewDDTDialogProps) {
  const navigate = useNavigate();
  const { orders } = usePurchaseOrders();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = STEPS[stepIdx];

  // ── Step 1: documento ─────────────────────────────
  const [origine, setOrigine] = useState<OrigineBolla>("oda");
  const [poId, setPoId] = useState(prefillPurchaseOrderId ?? "");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [ddtFile, setDdtFile] = useState<LocalFile | null>(null);
  const [extraFiles, setExtraFiles] = useState<LocalFile[]>([]);

  // ── Quello che l'AI ha letto ──────────────────────
  const [righe, setRighe] = useState<DDTRigaNuova[]>([]);
  const [aiLettura, setAiLettura] = useState<Record<string, unknown> | null>(null);
  const [aiConfidenza, setAiConfidenza] = useState<number | null>(null);
  const [aiAvvisi, setAiAvvisi] = useState<string[]>([]);
  const [fornitoreLetto, setFornitoreLetto] = useState<string | null>(null);
  const [fornitoreAbbinatoPer, setFornitoreAbbinatoPer] = useState<string | null>(null);

  // ── Step 2: chi ha portato la merce ──────────────
  const [trasportoACuraDi, setTrasportoACuraDi] = useState<TrasportoACuraDi | null>(null);
  const [porto, setPorto] = useState<"franco" | "assegnato" | null>(null);
  const [corriere, setCorriere] = useState("");
  const [targaMezzo, setTargaMezzo] = useState("");
  const [autistaNome, setAutistaNome] = useState("");
  const [autistaTelefono, setAutistaTelefono] = useState("");
  const [oraArrivo, setOraArrivo] = useState("");
  const [oraPartenza, setOraPartenza] = useState("");

  // ── Step 3: verifica ─────────────────────────────
  const [destinazione, setDestinazione] = useState<"magazzino" | "cantiere">("magazzino");
  const [qty, setQty] = useState("");
  const [stato, setStato] = useState<DDTStato>("ricevuto");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [ricevutoDaNome, setRicevutoDaNome] = useState("");
  const [hasDamages, setHasDamages] = useState(false);
  const [nonConformita, setNonConformita] = useState("");
  const [note, setNote] = useState("");

  const { createDDT } = useDDTRicezioneMutations(poId || null);
  const { uploadMainDDT, uploadAttachments } = useDDTAttachments();

  // La rubrica fornitori, leggera: serve solo a riconoscere il mittente letto
  // sulla bolla. Senza questo confronto il nome estratto non serviva a nulla e
  // chi carica doveva ritrovare il fornitore a mano fra centinaia.
  const { data: fornitori = [] } = useQuery<FornitoreInRubrica[]>({
    queryKey: ["ddt-fornitori-abbinamento", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, vat_number, fiscal_code")
        .eq("company_id", companyId!)
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as FornitoreInRubrica[];
    },
    enabled: open && !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  /**
   * Quello che l'AI ha letto, messo nei campi. Lo schema è quello ricco di
   * `ddt-ai-extract`: righe con codice, unità di misura, quantità e PREZZO.
   * I campi già scritti a mano non si sovrascrivono: chi ha corretto ha ragione.
   */
  const applicaLetturaAI = (grezzo: unknown) => {
    const letta = leggiDDTdaAI(grezzo);
    if (letta.numero && !numero) setNumero(letta.numero);
    if (letta.data) setData(letta.data);
    if (letta.corriere && !corriere) setCorriere(letta.corriere);
    // Chi ha portato la merce e il porto: l'AI li legge dal documento, e fino
    // al 29/10/2026 li buttavamo via.
    if (letta.trasportoACuraDi && !trasportoACuraDi) setTrasportoACuraDi(letta.trasportoACuraDi);
    if (letta.porto && !porto) setPorto(letta.porto);
    if (letta.targaMezzo && !targaMezzo) setTargaMezzo(letta.targaMezzo.toUpperCase());
    if (letta.autistaNome && !autistaNome) setAutistaNome(letta.autistaNome);
    if (letta.oraInizioTrasporto && !oraArrivo) setOraArrivo(letta.oraInizioTrasporto);
    if (letta.note && !note) setNote(letta.note);

    setRighe(letta.righe);
    const totale = quantitaTotale(letta.righe);
    if (totale > 0 && !qty) setQty(String(totale));

    setAiLettura(grezzo && typeof grezzo === "object" ? (grezzo as Record<string, unknown>) : null);
    setAiConfidenza(letta.confidenza);
    setAiAvvisi(letta.avvisi);
    setFornitoreLetto(letta.fornitoreNome);

    // Il fornitore: si abbina solo quando è certo (partita IVA, codice fiscale,
    // o un unico nome che corrisponde). Nel dubbio resta la tendina.
    if (!supplierId) {
      const trovato = abbinaFornitore(letta, fornitori);
      if (trovato) {
        setSupplierId(trovato.id);
        setFornitoreAbbinatoPer(trovato.motivo);
      } else {
        setFornitoreAbbinatoPer(null);
      }
    }

    toast.success(
      letta.righe.length > 0
        ? `Letti ${letta.righe.length} ${letta.righe.length === 1 ? "articolo" : "articoli"} dalla bolla`
        : "Dati del documento letti (nessuna riga merce riconosciuta)",
    );
  };

  // Reset al chiudere (con cleanup: senza clearTimeout, se il componente
  // smonta nei 200ms tra dialog close e timeout fire, setState scatta su
  // unmounted → warning React + timer handle leak).
  useEffect(() => {
    if (!open) {
      const timerId = window.setTimeout(() => {
        setStepIdx(0);
        setOrigine("oda");
        setPoId(prefillPurchaseOrderId ?? "");
        setOrderId(null);
        setSupplierId(undefined);
        setRighe([]);
        setAiLettura(null);
        setAiConfidenza(null);
        setAiAvvisi([]);
        setFornitoreLetto(null);
        setFornitoreAbbinatoPer(null);
        setNumero("");
        setData(format(new Date(), "yyyy-MM-dd"));
        setDdtFile(null);
        setExtraFiles([]);
        setTrasportoACuraDi(null);
        setPorto(null);
        setCorriere("");
        setTargaMezzo("");
        setAutistaNome("");
        setAutistaTelefono("");
        setOraArrivo("");
        setOraPartenza("");
        setQty("");
        setDestinazione("magazzino");
        setStato("ricevuto");
        setWarehouseId(null);
        setRicevutoDaNome("");
        setHasDamages(false);
        setNonConformita("");
        setNote("");
      }, 200);
      return () => window.clearTimeout(timerId);
    }
  }, [open, prefillPurchaseOrderId]);

  const availablePOs = useMemo(
    () => orders.filter((o) => o.status !== "annullato"),
    [orders]
  );

  const selectedPO = useMemo(
    () => availablePOs.find((o) => o.id === poId) ?? null,
    [availablePOs, poId]
  );

  /**
   * Scegliere l'ODA propone anche il corriere, se il campo è vuoto: su un
   * trasporto proprio è il fornitore stesso. Prima lo faceva un effetto che
   * rincorreva lo stato a ogni render; è un gesto dell'utente, e va qui.
   */
  const scegliOda = (id: string) => {
    setPoId(id);
    if (!corriere && trasportoACuraDi !== "noi") {
      const po = availablePOs.find((o) => o.id === id);
      if (po?.suppliers?.name) setCorriere(po.suppliers.name);
    }
  };

  // ── Validation per step ───────────────────────────
  const canGoNext = useMemo(() => {
    if (currentStep.key === "documento") {
      // Il numero della bolla serve sempre. L'ordine e la commessa solo a chi
      // ha scelto di partire da lì: è questo che prima bloccava il cantiere.
      if (numero.trim().length === 0) return false;
      if (origine === "oda") return !!poId;
      if (origine === "commessa") return !!orderId;
      return true;
    }
    if (currentStep.key === "consegna") {
      return true; // tutto opzionale
    }
    return true;
  }, [currentStep.key, poId, orderId, origine, numero]);

  // «Va in cantiere» si può dire solo se si sa quale: con l'ODA la commessa
  // arriva dall'ordine, altrimenti è quella scelta a mano. Senza commessa la
  // merce non ha un cantiere dove andare, e il database rifiuta la riga.
  const commessaNota = useMemo(() => {
    if (origine === "oda") return !!selectedPO?.orders?.order_code;
    if (origine === "commessa") return !!orderId;
    return false;
  }, [origine, selectedPO, orderId]);

  // La destinazione che vale davvero: senza una commessa «in cantiere» non si
  // può dire, e si ricade su «magazzino». Si DERIVA, non si corregge in un
  // effetto: così tornare indietro a togliere la commessa non lascia mai una
  // scelta che il database rifiuterebbe.
  const destinazioneEffettiva: "magazzino" | "cantiere" =
    commessaNota && destinazione === "cantiere" ? "cantiere" : "magazzino";

  const isFinalStep = stepIdx === STEPS.length - 1;

  // ── Confirm submit (all'ultimo step) ───────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    // Guard interno contro double-submit: prima c'erano solo button
    // `disabled={isSubmitting}` ma tra primo click e setIsSubmitting(true)
    // c'è micro-finestra che doppio click ravvicinato attraversa → 2 DDT
    // duplicati creati. Pattern identico al P2 FIX di QuoteBuilder.
    if (isSubmitting) return;
    if (!numero.trim()) return;
    if (origine === "oda" && !poId) return;
    if (origine === "commessa" && !orderId) return;
    setIsSubmitting(true);
    try {
      const created = await createDDT.mutateAsync({
        // Con «solo la bolla» non si manda né ordine né commessa: il database
        // accetta il vuoto, e l'aggancio si fa dopo dalla scheda della bolla.
        purchase_order_id: origine === "oda" ? poId : null,
        order_id: origine === "commessa" ? orderId : null,
        supplier_id: origine === "oda" ? null : supplierId ?? null,
        destinazione: destinazioneEffettiva,
        trasporto_a_cura_di: trasportoACuraDi,
        porto,
        righe,
        ai_lettura: aiLettura,
        ai_confidenza: aiConfidenza,
        ai_avvisi: aiAvvisi,
        numero_ddt: numero.trim(),
        data_ricezione: data,
        quantita_ricevuta: parseFloat(qty) || 0,
        stato: stato,
        note: note.trim() || null,
        warehouse_id: warehouseId,
        corriere: corriere.trim() || null,
        targa_mezzo: targaMezzo.trim() || null,
        autista_nome: autistaNome.trim() || null,
        autista_telefono: autistaTelefono.trim() || null,
        ora_arrivo: oraArrivo ? new Date(`${data}T${oraArrivo}`).toISOString() : null,
        ora_partenza: oraPartenza ? new Date(`${data}T${oraPartenza}`).toISOString() : null,
        ricevuto_da_nome: ricevutoDaNome.trim() || null,
        non_conformita: nonConformita.trim() || null,
        has_damages: hasDamages,
      });

      // Upload DDT principale
      if (ddtFile) {
        await uploadMainDDT.mutateAsync({ ddtId: created.id, file: ddtFile.file });
      }

      // Upload allegati extra
      if (extraFiles.length > 0) {
        await uploadAttachments.mutateAsync({
          ddtId: created.id,
          files: extraFiles.map((f) => ({ file: f.file, kind: f.kind })),
        });
      }

      onCreated?.(created.id);
      onOpenChange(false);
      navigate(`/azienda/ddt/${created.id}`);
    } catch {
      // Toast gestito dalle mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNext = () => {
    if (isFinalStep) {
      void handleSubmit();
    } else {
      setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
    }
  };
  const goBack = () => setStepIdx((i) => Math.max(0, i - 1));

  // ── Render ───────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 overflow-hidden flex flex-col max-h-[95vh]">
        {/* ── Header with stepper ─── */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-br from-primary/5 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileCheck className="h-5 w-5 text-primary" />
            Nuovo DDT fornitore
            <Badge variant="secondary" className="ml-auto text-[10px] font-normal">
              Step {stepIdx + 1} / {STEPS.length}
            </Badge>
          </DialogTitle>

          {/* Step progress */}
          <div className="flex items-center gap-1 sm:gap-2 mt-3 overflow-x-auto scrollbar-none">
            {STEPS.map((s, idx) => {
              const StepIcon = s.icon;
              const isActive = idx === stepIdx;
              const isDone = idx < stepIdx;
              return (
                <div key={s.key} className="flex items-center gap-1 sm:gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => idx < stepIdx && setStepIdx(idx)}
                    disabled={idx > stepIdx}
                    className={cn(
                      "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                      isActive && "bg-primary text-primary-foreground shadow-sm",
                      isDone && "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30",
                      !isActive && !isDone && "bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {isDone ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <StepIcon className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden xs:inline">{s.short}</span>
                    <span className="xs:hidden">{idx + 1}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={cn(
                      "h-[2px] w-4 sm:w-8 rounded-full",
                      idx < stepIdx ? "bg-primary" : "bg-muted"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {currentStep.description}
          </p>
        </DialogHeader>

        {/* ── Step body ──────────────────────────────── */}
        <div className="px-5 py-4 flex-1 overflow-y-auto">
          {currentStep.key === "documento" && (
            <DocumentoStep
              origine={origine}
              onOrigineChange={setOrigine}
              orderId={orderId}
              onOrderIdChange={setOrderId}
              supplierId={supplierId}
              onSupplierIdChange={setSupplierId}
              fornitoreLetto={fornitoreLetto}
              fornitoreAbbinatoPer={fornitoreAbbinatoPer}
              righeLette={righe}
              aiConfidenza={aiConfidenza}
              aiAvvisi={aiAvvisi}
              poId={poId}
              onPoIdChange={scegliOda}
              numero={numero}
              onNumeroChange={setNumero}
              data={data}
              onDataChange={setData}
              ddtFile={ddtFile}
              onDdtFileChange={setDdtFile}
              extraFiles={extraFiles}
              onExtraFilesChange={setExtraFiles}
              selectedPO={selectedPO}
              availablePOs={availablePOs}
              disabledPOSelect={!!prefillPurchaseOrderId}
              onLetturaAI={applicaLetturaAI}
              companyId={companyId}
            />
          )}

          {currentStep.key === "consegna" && (
            <ConsegnaStep
              trasportoACuraDi={trasportoACuraDi}
              onTrasportoACuraDiChange={setTrasportoACuraDi}
              porto={porto}
              onPortoChange={setPorto}
              corriere={corriere}
              onCorriereChange={setCorriere}
              targaMezzo={targaMezzo}
              onTargaMezzoChange={setTargaMezzo}
              autistaNome={autistaNome}
              onAutistaNomeChange={setAutistaNome}
              autistaTelefono={autistaTelefono}
              onAutistaTelefonoChange={setAutistaTelefono}
              oraArrivo={oraArrivo}
              onOraArrivoChange={setOraArrivo}
              oraPartenza={oraPartenza}
              onOraPartenzaChange={setOraPartenza}
            />
          )}

          {currentStep.key === "verifica" && (
            <VerificaStep
              qty={qty}
              onQtyChange={setQty}
              stato={stato}
              onStatoChange={setStato}
              warehouseId={warehouseId}
              onWarehouseIdChange={setWarehouseId}
              ricevutoDaNome={ricevutoDaNome}
              onRicevutoDaNomeChange={setRicevutoDaNome}
              hasDamages={hasDamages}
              onHasDamagesChange={setHasDamages}
              nonConformita={nonConformita}
              onNonConformitaChange={setNonConformita}
              note={note}
              onNoteChange={setNote}
              selectedPO={selectedPO}
              righe={righe}
              onRigheChange={setRighe}
              destinazione={destinazioneEffettiva}
              onDestinazioneChange={setDestinazione}
              commessaNota={commessaNota}
            />
          )}
        </div>

        {/* ── Footer nav ─────────────────────────────── */}
        <DialogFooter className="flex-row justify-between sm:justify-between border-t px-4 py-3 bg-muted/30 gap-2">
          {stepIdx === 0 ? (
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-muted-foreground"
            >
              Annulla
            </Button>
          ) : (
            <Button variant="outline" onClick={goBack} disabled={isSubmitting}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Indietro
            </Button>
          )}
          <Button
            onClick={goNext}
            disabled={!canGoNext || isSubmitting}
            className="gap-1.5 min-w-[120px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isFinalStep ? (
              <>
                <Check className="h-4 w-4" />
                Registra DDT
              </>
            ) : (
              <>
                Avanti
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// STEP 1 — Documento DDT
// ============================================================================
interface DocumentoStepProps {
  origine: OrigineBolla;
  onOrigineChange: (v: OrigineBolla) => void;
  orderId: string | null;
  onOrderIdChange: (v: string | null) => void;
  supplierId: string | undefined;
  onSupplierIdChange: (v: string | undefined) => void;
  fornitoreLetto: string | null;
  fornitoreAbbinatoPer: string | null;
  righeLette: DDTRigaNuova[];
  aiConfidenza: number | null;
  aiAvvisi: string[];
  poId: string;
  onPoIdChange: (v: string) => void;
  numero: string;
  onNumeroChange: (v: string) => void;
  data: string;
  onDataChange: (v: string) => void;
  ddtFile: LocalFile | null;
  onDdtFileChange: (f: LocalFile | null) => void;
  extraFiles: LocalFile[];
  onExtraFilesChange: (f: LocalFile[]) => void;
  selectedPO: { id: string; oda_number: string; suppliers?: { name: string } | null; orders?: { order_code: string } | null; status: string; expected_delivery_date?: string | null } | null;
  availablePOs: Array<{ id: string; oda_number: string; suppliers?: { name: string } | null; orders?: { order_code: string } | null; status: string; expected_delivery_date?: string | null }>;
  disabledPOSelect?: boolean;
  /** Riceve il JSON ricco di `ddt-ai-extract`, non il formato piatto. */
  onLetturaAI?: (grezzo: unknown) => void;
  companyId?: string | null;
}

function DocumentoStep({
  origine, onOrigineChange, orderId, onOrderIdChange,
  supplierId, onSupplierIdChange, fornitoreLetto, fornitoreAbbinatoPer,
  righeLette, aiConfidenza, aiAvvisi,
  poId, onPoIdChange, numero, onNumeroChange, data, onDataChange,
  ddtFile, onDdtFileChange, extraFiles, onExtraFilesChange,
  selectedPO, availablePOs, disabledPOSelect,
  onLetturaAI, companyId,
}: DocumentoStepProps) {
  const [isAIExtracting, setIsAIExtracting] = useState(false);

  const runAIExtract = async () => {
    if (!ddtFile || !companyId || !onLetturaAI) return;
    setIsAIExtracting(true);
    try {
      const file = ddtFile.file;
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);

      // Lo schema RICCO, non più `legacy_format: true`. Il formato piatto
      // perdeva codice articolo, unità di misura e prezzo di ogni riga: era il
      // motivo per cui «l'AI non prendeva i prodotti».
      const { data: aiData, error } = await supabase.functions.invoke("ddt-ai-extract", {
        body: {
          image_base64: base64,
          mime_type: file.type || "image/jpeg",
          file_name: file.name,
          company_id: companyId,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Estrazione fallita"));
      if (!aiData?.success) throw new Error(aiData?.error ?? "Estrazione fallita");
      onLetturaAI(aiData.ddt ?? {});
    } catch (err) {
      toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAIExtracting(false);
    }
  };
  return (
    <div className="space-y-5">
      {/* ── Da dove nasce la bolla: la scelta che decide il resto ── */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Da dove nasce questa bolla</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {ORIGINI.map((o) => {
            const Icona = o.icona;
            const attiva = origine === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => onOrigineChange(o.key)}
                disabled={disabledPOSelect && o.key !== "oda"}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors disabled:opacity-40",
                  attiva ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Icona className={cn("h-3.5 w-3.5", attiva ? "text-primary" : "text-muted-foreground")} />
                  {o.label}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">{o.aiuto}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ODA: solo quando la bolla nasce da un ordine */}
      {origine === "oda" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
            Ordine di Acquisto *
          </Label>
          <Select value={poId} onValueChange={onPoIdChange} disabled={disabledPOSelect}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Seleziona l'ODA corrispondente al DDT ricevuto…" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {availablePOs.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nessun ODA disponibile. Scegli «Da una commessa» o «Solo la bolla».
                </div>
              ) : (
                availablePOs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="font-mono text-xs font-medium">{o.oda_number}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {o.suppliers?.name || "Fornitore ignoto"}
                        {o.orders?.order_code ? ` · ${o.orders.order_code}` : ""}
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedPO && (
            <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <Info className="h-3 w-3 shrink-0" />
              Stato ODA: <strong className="text-foreground">{selectedPO.status}</strong>
              {selectedPO.expected_delivery_date && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    consegna prevista {format(new Date(selectedPO.expected_delivery_date), "dd/MM/yyyy", { locale: it })}
                  </span>
                </>
              )}
              <span>·</span>
              <span>commessa e fornitore li prende dall'ordine</span>
            </div>
          )}
        </div>
      )}

      {/* Commessa: obbligatoria solo quando la bolla nasce da lì */}
      {origine === "commessa" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
            Commessa *
          </Label>
          <OrderSelectCombobox
            companyId={companyId ?? undefined}
            value={orderId ?? undefined}
            onChange={(id) => onOrderIdChange(id)}
            placeholder="Su quale cantiere va questa merce…"
          />
        </div>
      )}

      {/* Fornitore: a mano o proposto dalla lettura, tranne quando c'è l'ODA */}
      {origine !== "oda" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            Fornitore
          </Label>
          <SupplierSelect
            searchable
            value={supplierId}
            onValueChange={(v) => onSupplierIdChange(v)}
            placeholder="Chi ha consegnato (si può mettere dopo)"
            fallbackCompanyId={companyId ?? undefined}
          />
          {fornitoreLetto && (
            <p className="text-[11px] text-muted-foreground">
              {fornitoreAbbinatoPer
                ? `Riconosciuto dalla bolla per ${fornitoreAbbinatoPer}: ${fornitoreLetto}`
                : `Sulla bolla c'è scritto «${fornitoreLetto}», ma in rubrica non c'è un unico fornitore che corrisponde: scegli tu.`}
            </p>
          )}
        </div>
      )}

      {/* Numero DDT + data — grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            Numero DDT *
          </Label>
          <Input
            value={numero}
            onChange={(e) => onNumeroChange(e.target.value)}
            placeholder="es. DDT-2026-001"
            className="h-11 font-mono"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Data ricezione
          </Label>
          <Input
            type="date"
            value={data}
            onChange={(e) => onDataChange(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {/* Upload zone — DDT principale */}
      <div className="space-y-2">
        {!ddtFile ? (
          <DDTAttachmentUploader
            title="Carica DDT cartaceo"
            description="Fotografa il DDT ricevuto dal corriere o carica il PDF. È il documento ufficiale di riferimento."
            defaultKind="ddt"
            multiple={false}
            onFilesSelected={(files) => {
              const first = files[0];
              if (first) {
                onDdtFileChange({
                  file: first.file,
                  kind: "ddt",
                  id: crypto.randomUUID(),
                });
              }
            }}
          />
        ) : (
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5 text-primary" />
              DDT caricato (pronto per upload al salvataggio)
            </Label>
            <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ddtFile.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(ddtFile.file.size / 1024 / 1024).toFixed(1)} MB · {ddtFile.file.type}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDdtFileChange(null)}
                className="text-muted-foreground hover:text-destructive"
              >
                Rimuovi
              </Button>
            </div>
            {onLetturaAI && companyId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runAIExtract}
                disabled={isAIExtracting}
                className="w-full gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                {isAIExtracting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                <Sparkles className="h-3.5 w-3.5" />
                Leggi la bolla con l'AI
              </Button>
            )}

            {/* Che cosa ha letto: il numero delle righe si vede subito, non a
                salvataggio fatto. Prima non si vedeva mai, perché le righe
                non venivano nemmeno chieste al modello. */}
            {(righeLette.length > 0 || aiAvvisi.length > 0) && (
              <div className="rounded-md border border-violet-200 bg-violet-50/60 p-2.5 space-y-1.5">
                <p className="text-xs font-medium text-violet-900 flex items-center gap-1.5">
                  <ListTree className="h-3.5 w-3.5" />
                  {righeLette.length > 0
                    ? `${righeLette.length} ${righeLette.length === 1 ? "articolo letto" : "articoli letti"}`
                    : "Nessun articolo riconosciuto"}
                  {aiConfidenza != null && (
                    <Badge variant="secondary" className="ml-auto text-[10px] font-normal">
                      affidabilità {Math.round(aiConfidenza * 100)}%
                    </Badge>
                  )}
                </p>
                {importoTotale(righeLette) != null && (
                  <p className="text-[11px] text-violet-800">
                    Merce per {importoTotale(righeLette)!.toLocaleString("it-IT", {
                      style: "currency", currency: "EUR", useGrouping: true,
                    })}
                  </p>
                )}
                {aiAvvisi.length > 0 && (
                  <ul className="text-[11px] text-amber-800 space-y-0.5">
                    {aiAvvisi.map((a) => (
                      <li key={a} className="flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-violet-700">
                  Le righe si controllano e si correggono allo step «Verifica».
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Extra allegati (opzionale) */}
      <ExtraAllegatiField files={extraFiles} onChange={onExtraFilesChange} />
    </div>
  );
}

// ─── Extra allegati con tipologia ──────────────────────────────────────
function ExtraAllegatiField({
  files,
  onChange,
}: {
  files: LocalFile[];
  onChange: (f: LocalFile[]) => void;
}) {
  const [pickerKind, setPickerKind] = useState<DDTAttachmentKind>("bolla");
  return (
    <div className="space-y-2">
      <details className="rounded-md border bg-muted/10 group">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium flex items-center gap-2 select-none hover:bg-muted/30 transition-colors">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          Aggiungi altri allegati (opzionale)
          {files.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {files.length}
            </Badge>
          )}
          <ChevronRight className="h-3.5 w-3.5 ml-auto group-open:rotate-90 transition-transform" />
        </summary>
        <div className="p-3 space-y-3 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Tipologia:</Label>
            <Select
              value={pickerKind}
              onValueChange={(v) => setPickerKind(v as DDTAttachmentKind)}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bolla">Bolla di consegna</SelectItem>
                <SelectItem value="packing_list">Packing list</SelectItem>
                <SelectItem value="danni">Foto danni / non conformità</SelectItem>
                <SelectItem value="firma">Firma ricevente</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DDTAttachmentUploader
            compact
            defaultKind={pickerKind}
            multiple
            onFilesSelected={(added) => {
              onChange([
                ...files,
                ...added.map((a) => ({
                  file: a.file,
                  kind: a.kind,
                  id: crypto.randomUUID(),
                })),
              ]);
            }}
          />
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              {files.map((f) => (
                <div key={f.id} className="flex flex-col gap-1 rounded-md border p-2">
                  <p className="text-[10px] font-medium truncate">{f.file.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {(f.file.size / 1024 / 1024).toFixed(1)} MB · {f.kind}
                  </p>
                  <button
                    type="button"
                    onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                    className="text-[10px] text-rose-600 hover:underline text-left"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// ============================================================================
// STEP 2 — Consegna & corriere
// ============================================================================
interface ConsegnaStepProps {
  trasportoACuraDi: TrasportoACuraDi | null;
  onTrasportoACuraDiChange: (v: TrasportoACuraDi) => void;
  porto: "franco" | "assegnato" | null;
  onPortoChange: (v: "franco" | "assegnato") => void;
  corriere: string;
  onCorriereChange: (v: string) => void;
  targaMezzo: string;
  onTargaMezzoChange: (v: string) => void;
  autistaNome: string;
  onAutistaNomeChange: (v: string) => void;
  autistaTelefono: string;
  onAutistaTelefonoChange: (v: string) => void;
  oraArrivo: string;
  onOraArrivoChange: (v: string) => void;
  oraPartenza: string;
  onOraPartenzaChange: (v: string) => void;
}

function ConsegnaStep(props: ConsegnaStepProps) {
  // Con un ritiro non c'è nessun corriere: c'è il nostro furgone e il nostro
  // uomo. Chiedere «telefono dell'autista» a chi è andato lui a prendere la
  // merce è il modo di farsi lasciare il riquadro vuoto.
  const ritiro = props.trasportoACuraDi === "noi";
  return (
    <div className="space-y-5">
      {/* La scelta che decide che cosa viene chiesto sotto */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Chi ha portato la merce</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {TRASPORTI.map((t) => {
            const Icona = t.icona;
            const attiva = props.trasportoACuraDi === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => props.onTrasportoACuraDiChange(t.key)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors",
                  attiva ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Icona className={cn("h-3.5 w-3.5", attiva ? "text-primary" : "text-muted-foreground")} />
                  {t.label}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">{t.aiuto}</span>
              </button>
            );
          })}
        </div>
        {props.trasportoACuraDi === null && (
          <p className="text-[11px] text-muted-foreground">
            Si può lasciare in bianco: non si sa è meglio di un dato inventato.
          </p>
        )}
      </div>

      {/* Il porto: dice se nella fattura ci sarà anche una riga di trasporto */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Il trasporto chi lo paga</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { key: "franco" as const, label: "Compreso nel prezzo", aiuto: "Porto franco: in fattura non arriva." },
            { key: "assegnato" as const, label: "A nostro carico", aiuto: "Porto assegnato: in fattura c'è anche il trasporto." },
          ]).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => props.onPortoChange(o.key)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-colors",
                props.porto === o.key
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "hover:bg-muted/40",
              )}
            >
              <span className="text-xs font-medium">{o.label}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{o.aiuto}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Il corriere non esiste su un ritiro */}
        {!ritiro && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              {props.trasportoACuraDi === "terzi" ? "Corriere" : "Chi l'ha portata"}
            </Label>
            <Input
              value={props.corriere}
              onChange={(e) => props.onCorriereChange(e.target.value)}
              placeholder="es. GLS, DHL, SDA, oppure il nome del fornitore"
              className="h-11"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {ritiro ? "Targa del nostro mezzo" : "Targa mezzo"}
          </Label>
          <Input
            value={props.targaMezzo}
            onChange={(e) => props.onTargaMezzoChange(e.target.value.toUpperCase())}
            placeholder="es. AB123CD"
            className="h-11 font-mono uppercase"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            {ritiro ? "Chi è andato a ritirarla" : "Nome autista"}
          </Label>
          <Input
            value={props.autistaNome}
            onChange={(e) => props.onAutistaNomeChange(e.target.value)}
            placeholder="es. Mario Rossi"
            className="h-11"
          />
        </div>

        {/* A chi è andato lui a prendere la merce il telefono non si chiede */}
        {!ritiro && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              Telefono autista (per contatti futuri)
            </Label>
            <Input
              type="tel"
              value={props.autistaTelefono}
              onChange={(e) => props.onAutistaTelefonoChange(e.target.value)}
              placeholder="+39 123 456 7890"
              className="h-11"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Ora arrivo
          </Label>
          <Input
            type="time"
            value={props.oraArrivo}
            onChange={(e) => props.onOraArrivoChange(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Ora partenza
          </Label>
          <Input
            type="time"
            value={props.oraPartenza}
            onChange={(e) => props.onOraPartenzaChange(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3 — Verifica & conferma
// ============================================================================
interface VerificaStepProps {
  qty: string;
  onQtyChange: (v: string) => void;
  stato: DDTStato;
  onStatoChange: (v: DDTStato) => void;
  warehouseId: string | null;
  onWarehouseIdChange: (v: string | null) => void;
  ricevutoDaNome: string;
  onRicevutoDaNomeChange: (v: string) => void;
  hasDamages: boolean;
  onHasDamagesChange: (v: boolean) => void;
  nonConformita: string;
  onNonConformitaChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  selectedPO: { suppliers?: { name: string } | null } | null;
  righe: DDTRigaNuova[];
  onRigheChange: (r: DDTRigaNuova[]) => void;
  destinazione: "magazzino" | "cantiere";
  onDestinazioneChange: (v: "magazzino" | "cantiere") => void;
  commessaNota: boolean;
}

function VerificaStep(props: VerificaStepProps) {
  return (
    <div className="space-y-5">
      <RigheMerceField righe={props.righe} onChange={props.onRigheChange} />
      {/* Quantità + stato */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            Quantità ricevuta
          </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={props.qty}
            onChange={(e) => props.onQtyChange(e.target.value)}
            placeholder="0"
            className="h-11 text-right font-semibold"
          />
          <p className="text-[10px] text-muted-foreground">
            Totale (aggregato). Le righe sopra restano quelle della bolla.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Stato DDT</Label>
          <Select
            value={props.stato}
            onValueChange={(v) => props.onStatoChange(v as DDTStato)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atteso">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                  Atteso (pre-avviso)
                </span>
              </SelectItem>
              <SelectItem value="ricevuto">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Ricevuto completo
                </span>
              </SelectItem>
              <SelectItem value="parziale">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Parziale
                </span>
              </SelectItem>
              <SelectItem value="verificato">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-600" />
                  Verificato (controllato)
                </span>
              </SelectItem>
              <SelectItem value="non_conforme">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                  Non conforme
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Dove va la merce ──────────────────────────────────────────
            Due cose diverse: in magazzino entra in giacenza e ne uscirà con
            uno scarico su commessa; in cantiere scende dal camion e si posa,
            e in giacenza non deve entrare mai — altrimenti il magazzino
            risulta pieno di roba che è già murata. */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            Dove va questa merce
          </Label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => props.onDestinazioneChange("magazzino")}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-colors",
                props.destinazione === "magazzino"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <WarehouseIcon className="h-3.5 w-3.5" />
                In magazzino
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                Entra in giacenza. Andrà in cantiere con uno scarico.
              </span>
            </button>
            <button
              type="button"
              onClick={() => props.onDestinazioneChange("cantiere")}
              disabled={!props.commessaNota}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-colors disabled:opacity-40",
                props.destinazione === "cantiere"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <HardHat className="h-3.5 w-3.5" />
                Direttamente in cantiere
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {props.commessaNota
                  ? "Non passa dal magazzino: è già sul posto."
                  : "Serve prima una commessa: «in cantiere» senza dire quale non vuol dire niente."}
              </span>
            </button>
          </div>
        </div>

        {props.destinazione === "magazzino" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Magazzino destinazione
            </Label>
            <WarehouseSelect
              value={props.warehouseId}
              onChange={props.onWarehouseIdChange}
              placeholder="Default (dal fornitore o dall'ODA)"
            />
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            Ricevuto da (nome ricevente fisico)
          </Label>
          <Input
            value={props.ricevutoDaNome}
            onChange={(e) => props.onRicevutoDaNomeChange(e.target.value)}
            placeholder="es. Luca Bianchi (magazziniere)"
            className="h-11"
          />
        </div>
      </div>

      {/* Danni toggle */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className={cn(
              "h-4 w-4 shrink-0 mt-0.5",
              props.hasDamages ? "text-rose-500" : "text-muted-foreground"
            )} />
            <div>
              <p className="text-sm font-medium">Presenza di danni o non conformità</p>
              <p className="text-xs text-muted-foreground">
                Attiva se la merce presenta difformità rispetto all'ODA.
              </p>
            </div>
          </div>
          <Switch
            checked={props.hasDamages}
            onCheckedChange={props.onHasDamagesChange}
          />
        </div>

        {props.hasDamages && (
          <Textarea
            value={props.nonConformita}
            onChange={(e) => props.onNonConformitaChange(e.target.value)}
            rows={3}
            placeholder="Descrivi la non conformità: pezzi mancanti, articoli danneggiati, imballo rotto, errori di quantità…"
            className="text-sm"
          />
        )}
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Note aggiuntive (opzionale)</Label>
        <Textarea
          rows={2}
          value={props.note}
          onChange={(e) => props.onNoteChange(e.target.value)}
          placeholder="Eventuali osservazioni interne…"
        />
      </div>
    </div>
  );
}

// ─── Le righe della merce, correggibili ────────────────────────────────────
// Quello che l'AI ha letto si controlla PRIMA di salvare: una riga sbagliata
// qui diventa un costo sbagliato in commessa, e poi una fattura che non torna.
function RigheMerceField({
  righe,
  onChange,
}: {
  righe: DDTRigaNuova[];
  onChange: (r: DDTRigaNuova[]) => void;
}) {
  const cambia = (i: number, campo: keyof DDTRigaNuova, valore: string) => {
    const copia = [...righe];
    const numerico = campo === "quantita" || campo === "prezzo_unitario";
    copia[i] = {
      ...copia[i],
      [campo]: numerico ? (valore.trim() === "" ? null : Number(valore.replace(",", "."))) : valore,
      // Toccata a mano: l'importo del documento non vale più, si ricalcola.
      ...(numerico ? { importo: null } : {}),
      origine: "manuale" as const,
    };
    onChange(copia);
  };

  const aggiungi = () =>
    onChange([
      ...righe,
      {
        posizione: righe.length + 1,
        codice_articolo: null,
        descrizione: "",
        unita_misura: null,
        quantita: null,
        prezzo_unitario: null,
        importo: null,
        iva_percentuale: null,
        order_item_id: null,
        origine: "manuale",
        ai_originale: null,
        testo_grezzo: null,
        note: null,
      },
    ]);

  const totale = importoTotale(righe);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-sm font-medium">Merce sulla bolla</p>
        <Badge variant="secondary" className="text-[10px] font-normal">
          {righe.length} {righe.length === 1 ? "riga" : "righe"}
        </Badge>
        {totale != null && (
          <span className="ml-auto text-xs font-semibold tabular-nums">
            {totale.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true })}
          </span>
        )}
      </div>

      {righe.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground space-y-2">
          <p>
            Nessuna riga. Leggi la bolla con l'AI allo step «Documento», oppure
            scrivi le righe a mano: senza righe la bolla non si può confrontare
            con la fattura del fornitore.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={aggiungi} className="h-7 text-xs">
            Aggiungi una riga
          </Button>
        </div>
      ) : (
        <div className="divide-y">
          {righe.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 px-2 py-2 items-center">
              <Input
                value={r.codice_articolo ?? ""}
                onChange={(e) => cambia(i, "codice_articolo", e.target.value)}
                placeholder="codice"
                className="col-span-2 h-8 text-xs font-mono"
              />
              <Input
                value={r.descrizione}
                onChange={(e) => cambia(i, "descrizione", e.target.value)}
                placeholder="descrizione"
                className="col-span-5 h-8 text-xs"
              />
              <Input
                value={r.quantita ?? ""}
                onChange={(e) => cambia(i, "quantita", e.target.value)}
                placeholder="q.tà"
                inputMode="decimal"
                className="col-span-1 h-8 text-xs text-right"
              />
              <Input
                value={r.unita_misura ?? ""}
                onChange={(e) => cambia(i, "unita_misura", e.target.value)}
                placeholder="um"
                className="col-span-1 h-8 text-xs"
              />
              <Input
                value={r.prezzo_unitario ?? ""}
                onChange={(e) => cambia(i, "prezzo_unitario", e.target.value)}
                placeholder="€/um"
                inputMode="decimal"
                className="col-span-2 h-8 text-xs text-right"
              />
              <button
                type="button"
                onClick={() => onChange(righe.filter((_, j) => j !== i))}
                className="col-span-1 text-[10px] text-rose-600 hover:underline"
              >
                togli
              </button>
            </div>
          ))}
          <div className="px-2 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={aggiungi} className="h-7 text-xs">
              Aggiungi una riga
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
