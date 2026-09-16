import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { logger } from "@/utils/logger";
import { friendlyPostgresError } from "@/lib/postgresErrors";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuotePrefill } from "@/hooks/useQuotePrefill";
import { ImportFromQuotePicker } from "@/components/orders/ImportFromQuotePicker";
import { ContractImportDialog } from "@/components/orders/ContractImportDialog";
import { contractImponibile, contractToInstallments, deriveIvaPct, type ContractExtract } from "@/lib/orders/contractExtract";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, AlertTriangle, ClipboardList, CheckCircle2, Sparkles } from "lucide-react";
import { useOrderDraft } from "@/hooks/useOrderDraft";
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import { type BonusLine, serializeBonusLines } from "@/lib/orders/bonusFiscali";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVertical } from "@/hooks/useVertical";
import { applyPlaybookToOrder } from "@/lib/orderPlaybook";
import { useCompanyCustomers, type CompanyCustomer } from "@/hooks/useCompanyCustomers";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  QuotePageHeader,
  QuoteCard,
  QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";
import { cn } from "@/lib/utils";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { OrderItemsList, OrderItem } from "@/components/orders/OrderItemsList";
import { FinancialSummary, PaymentType } from "@/components/orders/FinancialSummary";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { PendingFilesUpload, type PendingFile } from "@/components/orders/PendingFilesUpload";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { cartellaDelFileInCoda, percorsoDocumento } from "@/lib/commesse/documentiCommessa";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useTrack, ANALYTICS_EVENTS } from "@/hooks/useTrack";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { usePermissions } from "@/hooks/usePermissions";
import {
  type OrderStatus,
  type Installment,
  createDefaultInstallments,
  installmentsToLegacyColumns,
  prefillExpectedDates,
} from "@/lib/orderUtils";
import { orderSchema, orderDefaultValues, type OrderFormValues } from "@/lib/orderSchema";
import { primoErroreForm } from "@/lib/form/primoErroreForm";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { SedeSelect } from "@/components/sedi/SedeSelect";

function CreateOrderInner() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { vertical } = useVertical();
  const queryClient = useQueryClient();
  const { onlyAssigned } = usePermissions();
  const { canCreateOrder, isScopriPlan, currentPlan, remainingOrders } = useSubscriptionLimits();
  const track = useTrack();

  // ── Prefill da preventivo (?quote_id): additivo, attivo solo se presente ──
  const [searchParams] = useSearchParams();
  // Preventivo da importare: parte da ?quote_id ma è scegliibile anche in pagina
  // tramite il selettore ImportFromQuotePicker.
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(
    searchParams.get("quote_id"),
  );
  const { data: quotePrefill } = useQuotePrefill(selectedQuoteId);
  const appliedQuoteRef = useRef<string | null>(null);

  // Dati iniziali per il dialog "Nuovo cliente" quando si arriva da un preventivo
  // (il preventivo ha un unico campo "cliente" → split in nome/cognome).
  const quoteCustomerInitial = (() => {
    const c = quotePrefill?.client;
    if (!c || !c.name.trim()) return undefined;
    return {
      fullName: c.name.trim(),
      email: c.email || undefined,
      phone: c.phone || undefined,
      address: c.address || undefined,
      fiscalCode: c.fiscalCode || c.vatNumber || undefined,
    };
  })();

  // ── react-hook-form ──────────────────────────────────────────
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: orderDefaultValues,
  });

  const { control, watch, setValue, getValues, reset, handleSubmit: rhfHandleSubmit, formState: { errors } } = form;

  // Watch fields needed for computed values & effects — single call to avoid 13 subscriptions
  const {
    customer_id: customerId,
    payment_type: _paymentTypeRaw,
    total_amount: totalAmount,
    vat_rate: vatRate,
    financing_cost: financingCost,
    has_building_bonus: hasBuildingBonus,
    salesperson_id: salespersonId,
    salesperson_data: salespersonData,
    status_id: statusId,
    expected_date: expectedDate,
    warehouse_arrival_date: warehouseArrivalDate,
    work_start_date: workStartDate,
    work_end_date: workEndDate,
    order_code: orderCode,
    description,
    internal_notes: internalNotes,
    assigned_to: assignedTo,
    destination_warehouse_id: destinationWarehouseId,
    sede_id: sedeId,
  } = watch();
  const paymentType = _paymentTypeRaw as PaymentType;

  // ── Non-form state (arrays / UI) ────────────────────────────
  const [installments, setInstallments] = useState<Installment[]>(
    createDefaultInstallments('standard', 2)
  );
  const [numInstallments, setNumInstallments] = useState(2);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  // Ripartizione della commessa su più bonus edilizi (pratiche distinte).
  const [bonusLines, setBonusLines] = useState<BonusLine[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const { cartelle: cartelleDocumenti } = useCartelleDocumenti();
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  // ?action=import-contratto (dal flusso "Importa documento intelligente" di
  // Silvio): la pagina apre già col dialog contratto spalancato — un contratto
  // firmato diventa commessa, non preventivo.
  const [showContractImport, setShowContractImport] = useState(
    () => searchParams.get("action") === "import-contratto",
  );
  const [aiCustomerInitial, setAiCustomerInitial] = useState<
    { fullName?: string; email?: string; phone?: string; address?: string; fiscalCode?: string } | undefined
  >(undefined);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Auto-assign for staff with onlyAssigned
  useEffect(() => {
    if (onlyAssigned && user?.id) {
      setValue("assigned_to", user.id);
    }
  }, [onlyAssigned, user?.id, setValue]);

  // Calculate balance (deduct financing_cost for financing payment type)
  const total = parseDecimalIT(totalAmount);
  const vat = (parseDecimalIT(vatRate) || 22);
  const fCostForBalance = paymentType === 'financing' ? (parseDecimalIT(financingCost || "")) : 0;
  const totalWithVat = total * (1 + vat / 100);
  const nonBalanceSum = installments
    .filter(i => i.type !== 'balance')
    .reduce((sum, i) => sum + i.amount, 0);
  const balance = Math.max(0, totalWithVat - nonBalanceSum - fCostForBalance);
  const overAllocatedPayments = nonBalanceSum + fCostForBalance > totalWithVat + 0.01;
  const invalidOrderItems = orderItems.filter(
    (item) =>
      !item.name.trim() ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      (item.purchase_price !== undefined && (!Number.isFinite(item.purchase_price) || item.purchase_price < 0)) ||
      (item.vat_rate !== undefined && (!Number.isFinite(item.vat_rate) || item.vat_rate < 0 || item.vat_rate > 100))
  );
  const completionChecks = [
    { label: "Cliente selezionato", done: !!customerId },
    { label: "Descrizione lavoro", done: !!description?.trim() && description.trim().length >= 3 },
    { label: "Importo valido", done: total > 0 && !overAllocatedPayments },
    { label: "Stato iniziale", done: !!statusId },
    { label: "Righe ordine coerenti", done: invalidOrderItems.length === 0 },
  ];

  // Payment type change handler
  const handlePaymentTypeChange = (type: PaymentType) => {
    setValue("payment_type", type);
    const defaultNum = type === 'financing' ? 3 : 2;
    setNumInstallments(defaultNum);
    setInstallments(createDefaultInstallments(type, defaultNum));
  };

  // Number of installments change handler
  const handleNumInstallmentsChange = (num: number) => {
    setNumInstallments(num);
    const newInstallments = createDefaultInstallments(paymentType, num);
    const existingDeposits = installments.filter(i => i.type === 'deposit');
    const existingFinancing = installments.find(i => i.type === 'financing');
    const existingBalance = installments.find(i => i.type === 'balance');
    
    newInstallments.forEach((inst, idx) => {
      if (inst.type === 'deposit' && existingDeposits[idx]) {
        newInstallments[idx] = { ...inst, amount: existingDeposits[idx].amount, is_paid: existingDeposits[idx].is_paid, paid_date: existingDeposits[idx].paid_date, expected_date: existingDeposits[idx].expected_date };
      } else if (inst.type === 'financing' && existingFinancing) {
        newInstallments[idx] = { ...inst, amount: existingFinancing.amount, is_paid: existingFinancing.is_paid, paid_date: existingFinancing.paid_date, expected_date: existingFinancing.expected_date };
      } else if (inst.type === 'balance' && existingBalance) {
        newInstallments[idx] = { ...inst, is_paid: existingBalance.is_paid, paid_date: existingBalance.paid_date, expected_date: existingBalance.expected_date };
      }
    });
    // Date previste suggerite a 30/60/90gg per le rate nuove (modificabili)
    setInstallments(prefillExpectedDates(newInstallments));
  };

  // ── Draft auto-save ─────────────────────────────────────────
  const { loadDraft, saveDraft, clearDraft, draftRestored, setDraftRestored, dateToIso, isoToDate } = useOrderDraft(effectiveCompany?.id);
  const { bonusMultipli: bonusMultipliEnabled } = useBonusFiscaliFlags();
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (!draft) return;
    reset({
      customer_id: draft.customerId || "",
      order_code: draft.orderCode || "",
      description: draft.description || "",
      internal_notes: draft.internalNotes || "",
      status_id: draft.statusId || "",
      salesperson_id: draft.salespersonId || "",
      salesperson_data: draft.salespersonData || null,
      assigned_to: draft.assignedTo || "",
      destination_warehouse_id: draft.destinationWarehouseId || null,
      sede_id: draft.sedeId ?? null,
      expected_date: isoToDate(draft.expectedDate),
      warehouse_arrival_date: isoToDate(draft.warehouseArrivalDate),
      work_start_date: isoToDate(draft.workStartDate),
      work_end_date: isoToDate(draft.workEndDate),
      payment_type: draft.paymentType || "standard",
      total_amount: draft.totalAmount || "",
      vat_rate: draft.vatRate || "22",
      financing_cost: draft.financingCost || "",
      has_building_bonus: draft.hasBuildingBonus || false,
    });
    if (draft.installments?.length) {
      setInstallments(draft.installments);
      setNumInstallments(draft.installments.length);
    }
    if (draft.orderItems?.length) setOrderItems(draft.orderItems);
    if (draft.bonusLines?.length) setBonusLines(draft.bonusLines);
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompany?.id]);

  // Prefill da preventivo: applicato una volta quando i dati sono pronti.
  // Gira dopo il draft-restore (fetch async) → ha la precedenza voluta
  // (chi arriva da un preventivo vuole quei dati). Se non c'è ?quote_id,
  // quotePrefill è undefined e questo effetto è un no-op.
  useEffect(() => {
    if (!quotePrefill || !selectedQuoteId) return;
    if (appliedQuoteRef.current === selectedQuoteId) return; // una volta per preventivo scelto
    appliedQuoteRef.current = selectedQuoteId;
    if (quotePrefill.description) setValue("description", quotePrefill.description);
    if (quotePrefill.orderItems.length > 0) setOrderItems(quotePrefill.orderItems);
    // Fasi di pagamento del preventivo → rate della commessa (già compilate).
    if (quotePrefill.installments.length > 0) setInstallments(prefillExpectedDates(quotePrefill.installments));
    // Preventivo con finanziamento → commessa in modalità finanziamento (il "Costo
    // Finanziaria"/commissione lo conferma l'utente: dipende dalla tabella finanziaria).
    if (quotePrefill.hasFinancing) setValue("payment_type", "financing");
    // Ripartizione bonus decisa in preventivo → arriva già divisa in commessa.
    if (quotePrefill.bonusLines.length > 0) {
      setBonusLines(quotePrefill.bonusLines);
      setValue("has_building_bonus", true);
    }
    // Contatto del preventivo → apri il dialog "Nuovo cliente" già precompilato (una volta).
    if (quotePrefill.client.name.trim()) setShowCreateCustomer(true);
  }, [quotePrefill, selectedQuoteId, setValue]);

  // Import da preventivo via selettore: se ci sono già righe, chiede conferma
  // (la sostituzione è esplicita e voluta dall'utente).
  const handleImportQuote = (qid: string) => {
    if (
      orderItems.length > 0 &&
      !window.confirm("Sostituire le righe attuali con quelle del preventivo selezionato?")
    ) {
      return;
    }
    setSelectedQuoteId(qid);
  };

  // Famiglie del listino prodotti con prezzo al mq: servono all'import
  // contratto per prezzare le voci dalle DIMENSIONI (L×H → mq × €/mq del
  // listino, vendita e acquisto) invece di lasciarle a zero.
  const { data: famiglieMq = [] } = useQuery({
    queryKey: ["families-mq-import", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("article_families")
        .select("id, nome, codice, modalita_prezzo_base, prezzo_base_vendita, prezzo_base_acquisto, vat_rate, supplier_id")
        .eq("company_id", effectiveCompany!.id)
        .eq("attivo", true)
        .is("deleted_at", null)
        .eq("modalita_prezzo_base", "mq");
      return data ?? [];
    },
  });

  /** Da "Confort PF2A 1270x2520 T05 Cassonetto" a famiglia+prezzi del listino:
   *  PF* = portafinestra, F* = finestra (i codici modello del fornitore), le
   *  dimensioni in mm danno i mq, il listino al mq da' vendita e costo. */
  const mappaVoceSuListino = (descrizione: string) => {
    // Dimensioni in mm, cm o metri: "1270x2520", "127x252", "1,27x2,52".
    const dims = descrizione.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*[xX×]\s*(\d{1,4}(?:[.,]\d{1,2})?)/);
    if (!dims) return null;
    const inMm = (raw: string) => {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) return 0;
      if (n < 10) return Math.round(n * 1000); // metri
      if (n < 400) return Math.round(n * 10);  // centimetri
      return Math.round(n);                    // millimetri
    };
    const larghezza_mm = inMm(dims[1]);
    const altezza_mm = inMm(dims[2]);
    if (!larghezza_mm || !altezza_mm) return null;
    const isPortafinestra = /\bPF\w*\b|porta\s*finestra/i.test(descrizione);
    const isFinestra = isPortafinestra || /\bF\d?\w?\b|finestr/i.test(descrizione);
    if (!isFinestra) return null;
    const fam = famiglieMq.find((f) =>
      isPortafinestra ? /portafinestra/i.test(f.nome) : (/finestra/i.test(f.nome) && !/portafinestra/i.test(f.nome)),
    );
    if (!fam) return null;
    const mq = Math.round((larghezza_mm / 1000) * (altezza_mm / 1000) * 10000) / 10000;
    const vendita = fam.prezzo_base_vendita ? Math.round(mq * Number(fam.prezzo_base_vendita) * 100) / 100 : null;
    const acquisto = fam.prezzo_base_acquisto ? Math.round(mq * Number(fam.prezzo_base_acquisto) * 100) / 100 : null;
    return { fam, larghezza_mm, altezza_mm, mq, vendita, acquisto };
  };

  // AI: applica i dati estratti dal contratto / copia commissione alla commessa.
  const applyContractExtract = (ex: ContractExtract, sourceFile?: File | null) => {
    // Il contratto firmato va nei Documenti della commessa: entra nei file in
    // coda (non visibile al cliente) e viene caricato alla creazione.
    if (sourceFile) {
      setPendingFiles((prev) =>
        prev.some((p) => p.file.name === sourceFile.name && p.file.size === sourceFile.size)
          ? prev
          : [...prev, { file: sourceFile, visibleToCustomer: false }],
      );
    }
    if (ex.descrizione_lavori) {
      // Il contratto descrive i lavori con un paragrafo intero ("chiavi in
      // mano" incluso): come TITOLO della commessa diventava un h1 di sette
      // righe. Titolo asciutto (taglio all'ultima virgola entro ~100 char),
      // testo integrale conservato nelle note interne.
      const full = ex.descrizione_lavori.trim();
      let titolo = full;
      if (full.length > 110) {
        const cutComma = full.lastIndexOf(",", 100);
        const cutSpace = full.lastIndexOf(" ", 100);
        const cut = cutComma >= 40 ? cutComma : (cutSpace >= 40 ? cutSpace : 100);
        titolo = full.slice(0, cut).replace(/[\s,;:]+$/, "");
      }
      setValue("description", titolo);
      if (titolo !== full) {
        const nota = `Descrizione completa dal contratto:\n${full}`;
        setValue("internal_notes", internalNotes?.trim() ? `${internalNotes}\n\n${nota}` : nota);
      }
    }
    const imp = contractImponibile(ex);
    // Formato IT: l'imponibile arriva dall'estrazione AI del contratto e
    // `String(1.234)` produrrebbe una stringa riletta poi come 1234.
    if (imp != null) setValue("total_amount", formatDecimalIT(imp));
    // Aliquota: dichiarata dal documento, o DEDOTTA dai totali (ivato/imponibile
    // → agganciata a 4/5/10/22). L'aritmetica del modello qui aveva già mentito.
    const ivaEffettiva = deriveIvaPct(ex);
    if (ivaEffettiva != null) setValue("vat_rate", String(ivaEffettiva));
    if (ex.voci.length > 0) {
      // Le righe "Totale infissi / Totale accessori" sono subtotali del
      // contratto, non merce: come articoli confondevano e doppiavano.
      const vociVere = ex.voci.filter((v) => !/^\s*(sub)?total[ei]?\b/i.test(v.descrizione ?? ""));
      const itemsMerce = vociVere.map((v, idx) => {
        const match = mappaVoceSuListino(v.descrizione ?? "");
        return {
          name: v.descrizione,
          quantity: v.quantita || 1,
          status: "da_ordinare",
          position: idx,
          // Prezzi dal LISTINO al mq quando la voce ha dimensioni e famiglia
          // riconosciute; altrimenti quello letto dal contratto.
          unit_price: match?.vendita ?? v.prezzo_unitario_eur,
          purchase_price: match?.acquisto ?? undefined,
          // Sconto globale del documento (es. sconto rivenditore 15%) → per riga.
          discount_percent: ex.sconto_globale_pct ?? undefined,
          vat_rate: match?.fam.vat_rate != null ? Number(match.fam.vat_rate) : (ex.iva_pct ?? undefined),
          // Fornitore dalla famiglia del listino: senza, il pannello "Ordina
          // ai fornitori" non vede l'articolo e l'OdA non parte.
          supplier_id: match?.fam.supplier_id ?? undefined,
          family_id: match?.fam.id ?? null,
          axis_selections: null,
          misure_preventivo: match
            ? { larghezza_mm: match.larghezza_mm, altezza_mm: match.altezza_mm, mq: match.mq }
            : null,
          measure_status: null,
        };
      });
      // Imballaggio/trasporto/oneri: voci a sé, senza sconto (nel documento
      // sono calcolati DOPO lo sconto merce).
      const itemsAltriCosti = ex.altri_costi.map((a, i) => ({
        name: a.descrizione,
        quantity: 1,
        status: "da_ordinare",
        position: itemsMerce.length + i,
        unit_price: a.importo_eur,
        vat_rate: ex.iva_pct ?? undefined,
        family_id: null,
        axis_selections: null,
        misure_preventivo: null,
        measure_status: null,
      }));
      setOrderItems([...itemsMerce, ...itemsAltriCosti]);
    }
    const insts = contractToInstallments(ex, imp ?? 0);
    if (insts.length > 0) setInstallments(prefillExpectedDates(insts));
    if ((ex.modalita_pagamento ?? "").toLowerCase().includes("finanz")) setValue("payment_type", "financing");
    if (ex.cliente.nome_completo.trim()) {
      // Match sull'anagrafica PRIMA di proporre "nuovo cliente" (audit
      // 2026-09, punto 4): se il cliente esiste già — nome uguale, anche
      // invertito ("Mandelli Riccardo") — lo si aggancia e basta. Il dialog
      // di creazione apre solo quando davvero non c'è.
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      const cercato = norm(ex.cliente.nome_completo);
      const cercatoInvertito = cercato.split(" ").reverse().join(" ");
      const trovati = customers.filter((c) => {
        const nome = norm(`${c.first_name ?? ""} ${c.last_name ?? ""}`);
        return nome && (nome === cercato || nome === cercatoInvertito);
      });
      if (trovati.length === 1) {
        setValue("customer_id", trovati[0].id);
        toast.success(`Cliente agganciato all'anagrafica esistente: ${trovati[0].first_name ?? ""} ${trovati[0].last_name ?? ""}`.trim());
      } else {
        setAiCustomerInitial({
          fullName: ex.cliente.nome_completo,
          email: ex.cliente.email ?? undefined,
          phone: ex.cliente.telefono ?? undefined,
          address: ex.cliente.indirizzo ?? undefined,
          fiscalCode: ex.cliente.codice_fiscale ?? ex.cliente.partita_iva ?? undefined,
        });
        setShowCreateCustomer(true);
      }
    }
  };

  // Auto-save draft on every change — debounced 800ms to avoid firing on every keystroke
  useEffect(() => {
    if (createdOrderId) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft({
        customerId: customerId || "",
        orderCode: orderCode || "",
        description: description || "",
        internalNotes: internalNotes || "",
        statusId: statusId || "",
        salespersonId: salespersonId || "",
        salespersonData: (salespersonData as { commission_type: string; commission_value: number; compensation_mode?: string | null } | null) || null,
        assignedTo: assignedTo || "",
        destinationWarehouseId: destinationWarehouseId || null,
        sedeId: sedeId ?? null,
        expectedDate: dateToIso(expectedDate),
        warehouseArrivalDate: dateToIso(warehouseArrivalDate),
        workStartDate: dateToIso(workStartDate),
        workEndDate: dateToIso(workEndDate),
        paymentType: paymentType,
        totalAmount: totalAmount || "",
        vatRate: vatRate || "22",
        financingCost: financingCost || "",
        hasBuildingBonus: hasBuildingBonus || false,
        bonusLines,
        orderItems,
        installments,
      });
    }, 800);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [customerId, orderCode, description, internalNotes, statusId, salespersonId, salespersonData,
      assignedTo, destinationWarehouseId, sedeId,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, vatRate,
      installments, financingCost,
      hasBuildingBonus, bonusLines,
      orderItems, createdOrderId, saveDraft, dateToIso]);

  const handleClearDraft = useCallback(() => {
    clearDraft();
    reset(orderDefaultValues);
    setInstallments(createDefaultInstallments('standard', 2));
    setNumInstallments(2);
    setOrderItems([]);
    setCantiereAddress("");
    cantiereTouchedRef.current = false;
    lastCantiereCustomerRef.current = null;
  }, [clearDraft, reset]);

  const { data: customers = [] } = useCompanyCustomers(effectiveCompany?.id);

  // ── Cliente passato nell'indirizzo (?customer_id) ─────────────────────────
  // "Nuova commessa" dalla scheda cliente passava già l'identificativo e questa
  // pagina lo ignorava: si ripartiva dal picker vuoto e si sceglieva a mano il
  // cliente da cui si era appena usciti. Lo agganciamo, ma solo se esiste
  // davvero nell'anagrafica dell'azienda: un id inventato nell'URL non deve
  // selezionare niente.
  const customerIdDaUrl = searchParams.get("customer_id");
  const customerDaUrlApplicatoRef = useRef(false);
  useEffect(() => {
    if (!customerIdDaUrl || customerDaUrlApplicatoRef.current) return;
    if (customers.length === 0) return; // anagrafica non ancora caricata
    const trovato = customers.find((c) => c.id === customerIdDaUrl);
    customerDaUrlApplicatoRef.current = true;
    if (!trovato) return;
    // Non sovrascrive una scelta già fatta (es. bozza ripresa).
    if (getValues("customer_id")) return;
    setValue("customer_id", trovato.id, { shouldValidate: true });
  }, [customerIdDaUrl, customers, getValues, setValue]);

  // Clienti appena creati dal dialog inline. La query `useCompanyCustomers` viene
  // invalidata/rifetchata dopo la creazione; se quel refetch dovesse per qualsiasi
  // race non contenere ancora il nuovo cliente, lo perderemmo dal picker (bug reale:
  // "l'ho creato ma non lo vedo, e non voglio ricaricare"). Teniamo qui i nuovi
  // clienti in stato locale e li FONDIAMO nella lista renderizzata → il cliente
  // selezionato è SEMPRE visibile e selezionabile, a prescindere dalla cache.
  const [extraCustomers, setExtraCustomers] = useState<CompanyCustomer[]>([]);
  const customerOptions = useMemo(() => {
    const byId = new Map<string, CompanyCustomer>();
    for (const c of customers) byId.set(c.id, c);
    for (const c of extraCustomers) if (!byId.has(c.id)) byId.set(c.id, c);
    return Array.from(byId.values()).sort((a, b) => {
      const al = (a.last_name ?? "").toLowerCase(), bl = (b.last_name ?? "").toLowerCase();
      if (al !== bl) return al < bl ? -1 : 1;
      const af = (a.first_name ?? "").toLowerCase(), bf = (b.first_name ?? "").toLowerCase();
      return af < bf ? -1 : af > bf ? 1 : 0;
    });
  }, [customers, extraCustomers]);

  // ── Indirizzo cantiere (luogo dei lavori) precompilato dal cliente ──────────
  // Quando si seleziona un cliente, precompiliamo l'indirizzo del cantiere dalla
  // sua scheda: `site_address` (indirizzo cantiere) con fallback all'indirizzo di
  // fatturazione. Resta editabile (se il cantiere è altrove il commerciale lo
  // corregge). Alla creazione viene scritto su orders.indirizzo_lavori/work_address
  // con un UPDATE follow-up (la RPC atomica non ha queste colonne in whitelist).
  const { data: selectedCustomerAddr } = useQuery({
    queryKey: ["order-customer-address", customerId, effectiveCompany?.id],
    enabled: !!customerId && !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("address, city, postal_code, province, site_address, site_city, site_postal_code, site_province, site_lat, site_lng")
        .eq("id", customerId)
        .maybeSingle();
      if (error) return null;
      return data as {
        address: string | null; city: string | null; postal_code: string | null; province: string | null;
        site_address: string | null; site_city: string | null; site_postal_code: string | null; site_province: string | null;
        site_lat: number | null; site_lng: number | null;
      } | null;
    },
  });
  const suggestedCantiere = useMemo(() => {
    const a = selectedCustomerAddr;
    if (!a) return "";
    const line = (street: string | null, cap: string | null, city: string | null, prov: string | null) =>
      [street, [cap, city].map((x) => (x ?? "").trim()).filter(Boolean).join(" "), prov]
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join(", ");
    const site = line(a.site_address, a.site_postal_code, a.site_city, a.site_province);
    return site || line(a.address, a.postal_code, a.city, a.province);
  }, [selectedCustomerAddr]);
  const [cantiereAddress, setCantiereAddress] = useState("");
  const cantiereTouchedRef = useRef(false);
  const lastCantiereCustomerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!customerId) return;
    // Cambio cliente → riparte l'auto-compilazione (azzera il "toccato a mano").
    if (lastCantiereCustomerRef.current !== customerId) {
      cantiereTouchedRef.current = false;
      lastCantiereCustomerRef.current = customerId;
    }
    if (!cantiereTouchedRef.current && suggestedCantiere) {
      setCantiereAddress(suggestedCantiere);
    }
  }, [customerId, suggestedCantiere]);

  // ── Codice Commessa progressivo ────────────────────────────────────────────
  // Suggerimento auto-generato lato DB (prossimo_numero_commessa: {prefix}-{NNNN}
  // per azienda). Il campo resta editabile: se il commerciale scrive un codice
  // vince il manuale; se lo lascia vuoto, parte il progressivo.
  const { data: suggestedOrderCode } = useQuery({
    queryKey: ["prossimo-numero-commessa", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && !createdOrderId,
    staleTime: 0,
    queryFn: async (): Promise<string | null> => {
      if (!effectiveCompany?.id) return null;
      const { data, error } = await supabase.rpc(
        "prossimo_numero_commessa" as never,
        { p_company_id: effectiveCompany.id } as never,
      );
      if (error) return null;
      return (data as string | null) ?? null;
    },
  });

  // Pre-compila UNA volta il codice quando è una commessa nuova e il campo è vuoto.
  // La RPC è asincrona → risolve DOPO l'eventuale ripristino bozza (sincrono al
  // mount): così rispetta un codice già presente (bozza o digitato) e non lo tocca.
  const orderCodePrefilledRef = useRef(false);
  useEffect(() => {
    if (orderCodePrefilledRef.current || createdOrderId || !suggestedOrderCode) return;
    if ((getValues("order_code") || "").trim() !== "") {
      orderCodePrefilledRef.current = true;
      return;
    }
    orderCodePrefilledRef.current = true;
    setValue("order_code", suggestedOrderCode, { shouldDirty: false });
  }, [suggestedOrderCode, createdOrderId, getValues, setValue]);

  // Fetch order statuses for the company
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];

      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color, position, is_default")
        .eq("company_id", effectiveCompany.id)
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Set default status when statuses are loaded
  useEffect(() => {
    if (statuses.length > 0 && !statusId) {
      setValue("status_id", statuses.find((status) => status.is_default)?.id ?? statuses[0].id);
    }
  }, [statuses, statusId, setValue]);

  // 2026-05-26 (audit fix P0): timezone bug.
  // PRIMA: `d.toISOString().split("T")[0]` convertiva una Date locale in UTC.
  // Utente italiano (CET/CEST) che selezionava "30 ottobre" alle 23:30 →
  // toISOString → "2026-10-29T22:00:00Z" → DB salvava expected_date="2026-10-29".
  // La data si "spostava indietro di un giorno" per scelte fatte a fine giornata.
  // ORA: format(d, "yyyy-MM-dd") da date-fns usa fuso orario locale.
  const toDateStr = (d: Date | undefined): string | null =>
    d ? format(d, "yyyy-MM-dd") : null;

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Company not found");

      const values = getValues();
      const totalVal = parseDecimalIT(values.total_amount);
      const vatValue = (parseDecimalIT(values.vat_rate) || 22);
      const fCost = parseDecimalIT(values.financing_cost || "");

      // Compute legacy columns from installments for backward compat
      const installmentsForSave = installments.map(i =>
        i.type === 'balance' ? { ...i, amount: balance } : i
      );
      const legacy = installmentsToLegacyColumns(installmentsForSave);

      const orderData = {
        company_id: effectiveCompany.id,
        customer_id: values.customer_id,
        order_code: (values.order_code || "").trim() || null,
        description: values.description,
        total_amount: totalVal,
        ...legacy,
        payment_type: values.payment_type,
        balance_amount: balance,
        expected_date: toDateStr(values.expected_date),
        internal_notes: values.internal_notes || null,
        current_status_id: values.status_id,
        vat_rate: vatValue,
        warehouse_arrival_date: toDateStr(values.warehouse_arrival_date),
        work_start_date: toDateStr(values.work_start_date),
        work_end_date: toDateStr(values.work_end_date),
        financing_cost: fCost,
        has_building_bonus: values.has_building_bonus,
        assigned_to: values.assigned_to || null,
        destination_warehouse_id: values.destination_warehouse_id || null,
        sede_id: values.sede_id || null,
      };

      const itemsPayload = orderItems.map((item, index) => ({
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        status: item.status,
        position: index,
        supplier_id: item.supplier_id || null,
        purchase_price: item.purchase_price || 0,
        vat_rate: item.vat_rate ?? 22,
        stock_item_id: item.stock_item_id || null,
        unit_price: item.unit_price ?? 0,
        discount_percent: item.discount_percent ?? 0,
        standard_cost: item.standard_cost ?? 0,
        product_code: item.product_code || null,
        is_paid: item.is_paid || false,
        paid_date: item.paid_date || null,
        payment_method: item.payment_method || null,
        deposit_amount: item.deposit_amount || 0,
        deposit_paid: item.deposit_paid || false,
        deposit_paid_date: item.deposit_paid_date || null,
        balance_amount: item.balance_amount || 0,
        balance_paid: item.balance_paid || false,
        balance_paid_date: item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
        // ── spina misure (prodotti su misura): porta famiglia/assi/misura iniziale dal preventivo ──
        family_id: item.family_id || null,
        axis_selections: item.axis_selections ?? null,
        misure_preventivo: item.misure_preventivo ?? null,
        measure_status: item.measure_status || null,
      }));

      const salespersonPayload = (values.salesperson_id && values.salesperson_data)
        ? {
            salesperson_id: values.salesperson_id,
            commission_type: values.salesperson_data.commission_type,
            commission_value: values.salesperson_data.commission_value,
            compensation_mode: values.salesperson_data.compensation_mode || null,
          }
        : null;

      // Installments payload for the new table.
      // Gli ultimi quattro campi mancavano: la pagina di creazione mostra il
      // selettore dell'evento di cantiere (per questo riceve `statiCommessa`),
      // ma la rata arrivava al database come "data fissa" senza stato agganciato.
      // La scelta si perdeva in silenzio, e ricompariva solo se qualcuno
      // riapriva la commessa e la risalvava. `create_order_atomic` questi campi
      // li legge da sempre.
      const installmentsPayload = installmentsForSave.map(i => ({
        position: i.position,
        label: i.label,
        type: i.type,
        amount: i.amount,
        is_paid: i.is_paid,
        paid_date: i.paid_date || null,
        expected_date: i.expected_date || null,
        trigger_evento: i.trigger_evento || 'data_fissa',
        trigger_status_id: i.trigger_status_id || null,
        trigger_numero: i.trigger_numero ?? null,
        giorni_preavviso: i.giorni_preavviso ?? 7,
      }));

      const createOrderAtomic = supabase.rpc.bind(supabase) as unknown as (
        fn: "create_order_atomic",
        args: Record<string, unknown>
      ) => Promise<{ data: { order_id: string } | null; error: { message: string } | null }>;
      const { data, error } = await createOrderAtomic("create_order_atomic", {
        p_order_data: orderData,
        p_items: itemsPayload,
        p_salesperson: salespersonPayload,
        p_user_id: user!.id,
        p_installments: installmentsPayload,
      });

      if (error) throw error;
      const result = data as unknown as { id: string; success: boolean };
      if (!result || !result.id) {
        throw new Error("Risposta inattesa dalla funzione atomica");
      }

      // Collega il preventivo di origine alla commessa (se creata da un preventivo via
      // ?quote_id / "Importa da preventivo") → la commessa mostrerà il "Preventivo collegato".
      if (selectedQuoteId) {
        const { error: linkErr } = await supabase
          .from("orders")
          .update({ quote_id: selectedQuoteId, quote_number: quotePrefill?.quoteNumber ?? null })
          .eq("id", result.id);
        if (linkErr) console.error("[CreateOrder] collegamento preventivo non riuscito:", linkErr.message);

        // Il blocca prezzo versato sul preventivo segue la commessa: senza
        // questo aggancio resterebbe orfano sul preventivo e nessuno si
        // ricorderebbe di restituirlo.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: bpErr } = await (supabase as any)
          .from("blocca_prezzo")
          .update({ order_id: result.id, customer_id: values.customer_id || null })
          .eq("quote_id", selectedQuoteId)
          .is("order_id", null);
        if (bpErr) console.warn("[CreateOrder] aggancio blocca prezzo alla commessa fallito:", bpErr.message);
      }

      // v8.6.42 — sede_id non è nel RPC create_order_atomic, viene
      // settato con un UPDATE follow-up (best-effort, non blocca l'ordine).
      // La colonna orders.sede_id è FK opzionale (vedi migration create_sedi_system).
      // Stesso trattamento per il magazzino di competenza: il selettore in
      // pagina esisteva da sempre ma la RPC non lo gestisce, e fino a questa
      // migration la colonna non c'era proprio — quello che l'utente sceglieva
      // si perdeva in silenzio.
      const fuoriRpc: Record<string, unknown> = {};
      if (values.sede_id) fuoriRpc.sede_id = values.sede_id;
      if (values.destination_warehouse_id) {
        fuoriRpc.destination_warehouse_id = values.destination_warehouse_id;
      }
      if (Object.keys(fuoriRpc).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: sedeErr } = await (supabase as any)
          .from("orders")
          .update(fuoriRpc)
          .eq("id", result.id);
        if (sedeErr) {
          console.warn("[CreateOrder] update sede/magazzino fallito (ordine creato comunque):", sedeErr.message);
        }
      }

      // Ripartizione bonus → order_bonus_lines (tabella a sé, non in whitelist
      // della RPC atomica). Best-effort: la commessa è già creata, un errore qui
      // non deve farla sparire — ma lo diciamo, perché senza righe le causali
      // dei bonifici parlanti non esistono.
      if (values.has_building_bonus && bonusMultipliEnabled && bonusLines.length > 0 && result.id) {
        const payload = serializeBonusLines(bonusLines).map((r) => ({
          ...r,
          order_id: result.id,
          company_id: effectiveCompany.id,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: bonusErr } = await (supabase as any).from("order_bonus_lines").insert(payload);
        if (bonusErr) {
          console.warn("[CreateOrder] salvataggio ripartizione bonus fallito:", bonusErr.message);
          toast.error("Ripartizione bonus non salvata", {
            description: "La commessa è stata creata: riapri la scheda e reinserisci la divisione tra agevolazioni.",
          });
        }
      }

      // Indirizzo cantiere → orders.indirizzo_lavori + work_address (best-effort,
      // non blocca l'ordine). La RPC atomica non ha queste colonne in whitelist.
      const cantiere = cantiereAddress.trim();
      if (cantiere && result.id) {
        const patch: Record<string, unknown> = { indirizzo_lavori: cantiere, work_address: cantiere };
        if (selectedCustomerAddr?.site_lat != null && selectedCustomerAddr?.site_lng != null) {
          patch.work_lat = selectedCustomerAddr.site_lat;
          patch.work_lng = selectedCustomerAddr.site_lng;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: cantErr } = await (supabase as any).from("orders").update(patch).eq("id", result.id);
        if (cantErr) console.warn("[CreateOrder] update indirizzo cantiere fallito (ordine creato comunque):", cantErr.message);
      }

      return result;
    },
    onSuccess: async (order) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["margin"] });
      queryClient.invalidateQueries({ queryKey: ["break-even"] });
      queryClient.invalidateQueries({ queryKey: ["cruscotto"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      setCreatedOrderId(order.id);

      // Playbook automatico: se l'azienda ha attivato l'interruttore, crea le
      // attività standard della commessa. Wrap in try/catch: non deve MAI
      // rompere la creazione (idempotente lato helper).
      try {
        if (effectiveCompany?.id) {
          const { data: comp } = await supabase
            .from("companies").select("playbook_auto_apply").eq("id", effectiveCompany.id).maybeSingle();
          if ((comp as { playbook_auto_apply?: boolean } | null)?.playbook_auto_apply) {
            await applyPlaybookToOrder({ companyId: effectiveCompany.id, orderId: order.id, vertical, baseDate: new Date(), assignedTo: getValues("assigned_to") || null });
          }
        }
      } catch { /* non bloccare la creazione della commessa */ }

      // v8.6.89 — analytics
      // 2026-05-26 (audit fix P0): `values` non è in scope qui (era una const
      // della mutationFn). Inoltre le chiavi erano in italiano (importo_totale,
      // cliente_id) mentre il form schema usa nomi inglesi (total_amount,
      // customer_id). Risultato: ReferenceError silenzioso interrompeva
      // onSuccess → niente navigate, niente upload allegati, niente toast.
      // FIX: leggo i values direttamente dal form via getValues(), e wrap
      // in try/catch così un fail analytics non rompe il flow utente.
      try {
        const formValues = getValues();
        track(ANALYTICS_EVENTS.ORDER_CREATED, {
          order_id: order.id,
          order_value: parseDecimalIT(formValues.total_amount),
          has_customer: !!formValues.customer_id,
          plan_slug: currentPlan?.slug,
        });
      } catch (analyticsErr) {
        // Non-blocking: i log analytics non devono fermare il salvataggio
        logger.warn("[CreateOrder] analytics track failed", analyticsErr);
      }

      // Upload pending files
      if (pendingFiles.length > 0) {
        let uploaded = 0;
        for (const pf of pendingFiles) {
          const filePath = percorsoDocumento(order.id, pf.file.name);
          try {
            const { error: uploadError } = await supabase.storage
              .from("order-attachments")
              .upload(filePath, pf.file, { contentType: pf.file.type || undefined });
            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase
              .from("order_attachments")
              .insert({
                order_id: order.id,
                file_name: pf.file.name,
                file_url: filePath,
                file_type: pf.file.type || "application/octet-stream",
                file_size: pf.file.size,
                uploaded_by: user!.id,
                visible_to_customer: pf.visibleToCustomer,
                folder_id: cartellaDelFileInCoda(pf, cartelleDocumenti),
              } as never);
            if (dbError) {
              await supabase.storage.from("order-attachments").remove([filePath]);
              throw dbError;
            }
            uploaded++;
          } catch (err) {
            logger.error("File upload error:", err);
            toast.error("Errore caricamento", { description: `Errore nel caricare "${pf.file.name}".` });
          }
        }
        setPendingFiles([]);
        queryClient.invalidateQueries({ queryKey: ["order-attachments", order.id] });
        toast.success("Commessa creata", { description: `Commessa creata con ${uploaded} document${uploaded > 1 ? 'i' : 'o'}.` });
      } else {
        toast.success("Commessa creata", { description: "La commessa è stata creata con successo." });
      }

      // Auto-navigate to the new order detail
      navigate(`/azienda/ordini/${order.id}`);
    },
    onError: (error) => {
      // 2026-05-27 (audit fix P1): mapping errori postgres → messaggi
      // italiani user-friendly. Prima l'utente edile vedeva stringhe come
      // "duplicate key value violates unique constraint orders_order_code_key"
      // senza capire cosa fare.
      const { title, description } = friendlyPostgresError(error, {
        operation: "creazione commessa",
      });
      toast.error(title, { description });
      logger.error("Create order error:", error);
    },
  });

  const onSubmit = (values: OrderFormValues) => {
    // Enter sul form bypassa il disabled del bottone submit: guardia esplicita
    if (createOrderMutation.isPending) return;
    const totalVal = parseDecimalIT(values.total_amount);
    if (totalVal <= 0) {
      toast.error("Importo non valido", { description: "L'importo totale deve essere maggiore di zero." });
      return;
    }

    if (invalidOrderItems.length > 0) {
      toast.error("Articoli non validi", { description: "Verifica nome, quantità, costo d'acquisto e IVA di tutte le righe." });
      return;
    }

    if (overAllocatedPayments) {
      toast.error("Scadenze non coerenti", { description: "Acconti, finanziamento e costi finanziaria superano il totale IVA inclusa." });
      return;
    }

    // Warning: expected dates in the past
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    installments.forEach(inst => {
      if (inst.expected_date && new Date(inst.expected_date) < now) {
        toast.info("Attenzione", { description: `La data prevista di "${inst.label}" è nel passato.` });
      }
    });

    createOrderMutation.mutate();
  };

  // Gli errori vanno presi dall'argomento che passa react-hook-form, non dalla
  // variabile `errors` del render: al primo clic quella è ancora vuota (si
  // riempie al render dopo) e "Crea Commessa" non faceva niente senza dire
  // perché. E un errore su un campo annidato — i dati del venditore — non ha
  // un `.message` in cima: restava muto a ogni clic. primoErroreForm scende
  // nell'albero e, se proprio non trova un testo, dice almeno quale campo.
  const onFormError = (formErrors: object) => {
    const primo = primoErroreForm(formErrors);
    if (!primo) return;
    toast.error("Commessa non salvata", { description: `${primo.campo}: ${primo.messaggio}` });
  };

  const handleCustomerCreated = (newCustomerId: string, _customerName?: string, customer?: CompanyCustomer) => {
    // Fonde il cliente appena creato nella lista locale (garantisce visibilità
    // immediata anche se il refetch della cache è ancora in volo o stale).
    if (customer) {
      setExtraCustomers((prev) => (prev.some((c) => c.id === customer.id) ? prev : [...prev, customer]));
    } else {
      setExtraCustomers((prev) =>
        prev.some((c) => c.id === newCustomerId)
          ? prev
          : [...prev, { id: newCustomerId, first_name: _customerName ?? "Nuovo cliente", last_name: null, email: null }],
      );
    }
    setValue("customer_id", newCustomerId, { shouldValidate: true });
  };

  // ── Date picker helper ──────────────────────────────────────
  const DatePickerField = ({ name, label: fieldLabel }: { name: "expected_date" | "warehouse_arrival_date" | "work_start_date" | "work_end_date"; label: string }) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="space-y-2">
          <Label>{fieldLabel}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40",
                  !field.value && "text-slate-400"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                {field.value ? format(field.value, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={field.value} onSelect={field.onChange} autoFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}
    />
  );

  // v8.6.84 — Wall di blocco creazione ordini esteso a TUTTI i piani limitati
  // (non solo Scopri). Esempio: render-only / render-serramenti con max_orders=3.
  if (!canCreateOrder) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        {isScopriPlan ? (
          <UpgradeScopriWall type="max_orders" inline />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center space-y-4">
            <div className="text-4xl">🏗️</div>
            <div>
              <h3 className="font-semibold text-base text-gray-900 mb-1">
                Hai raggiunto il limite di commesse attive
              </h3>
              <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Il piano <strong>{currentPlan?.name ?? "corrente"}</strong> include un massimo
                di <strong>{currentPlan?.max_orders ?? 3} commesse attive</strong> contemporaneamente.
                Completa o archivia una commessa esistente per crearne di nuove,
                oppure passa a un piano superiore.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button
                onClick={() => navigate("/azienda/impostazioni/abbonamento")}
                className="gap-2 bg-[#E8521A] hover:bg-[#d44714] text-white"
              >
                <Sparkles className="h-4 w-4" />
                Gestisci abbonamento
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/azienda/ordini")}
              >
                Vai alle commesse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {remainingOrders <= 0
                ? "0 commesse rimanenti su questo piano"
                : `${remainingOrders} commesse rimanenti`}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <QuotePageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Nuova Commessa"
        subtitle="Crea una nuova commessa per un cliente"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Indietro
          </Button>
        }
      />

      {/* Draft restored banner */}
      {draftRestored && !createdOrderId && (
        <Alert className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-900 font-medium">
              Bozza recuperata — i dati precedenti sono stati ripristinati.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-4 shrink-0 border-amber-300 hover:bg-amber-100"
              onClick={handleClearDraft}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Cancella bozza
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-slate-200 bg-white">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <AlertDescription>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-900">Checklist ordine</p>
              <p className="text-xs text-slate-500">Controlli minimi prima del salvataggio.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {completionChecks.map((check) => (
                <span
                  key={check.label}
                  className={cn(
                    "rounded-full border px-2 py-1 text-xs font-medium",
                    check.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {check.done ? "OK" : "Da fare"} · {check.label}
                </span>
              ))}
            </div>
          </div>
        </AlertDescription>
      </Alert>

      <form onSubmit={rhfHandleSubmit(onSubmit, onFormError)} className="space-y-6">
        {/* ── Importa da preventivo: precompila righe, prezzi e spina misure ── */}
        <div className="flex flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-orange-900/40 dark:bg-orange-950/20">
          <p className="text-sm text-muted-foreground">
            {selectedQuoteId
              ? "Preventivo importato: rivedi righe e misure qui sotto."
              : "Hai un preventivo? Importalo. Oppure carica il contratto / copia commissione: l'AI compila la commessa."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ImportFromQuotePicker
              onSelect={handleImportQuote}
              disabled={createOrderMutation.isPending}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-orange-300"
              onClick={() => setShowContractImport(true)}
              disabled={createOrderMutation.isPending}
            >
              <Sparkles className="h-4 w-4 text-orange-600" />
              Carica contratto (AI)
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Form */}
          <QuoteCard title="Dettagli Commessa" icon={<ClipboardList className="h-4 w-4" />}>
            <div className="space-y-4">
              {/* Order Code */}
              <Controller
                control={control}
                name="order_code"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="orderCode">Codice Commessa</Label>
                    <Input
                      id="orderCode"
                      {...field}
                      placeholder={suggestedOrderCode || "es. O-0001"}
                      maxLength={50}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Precompilato col prossimo progressivo{suggestedOrderCode ? ` (${suggestedOrderCode})` : ""}. Modificalo o scrivi il tuo codice.
                    </p>
                  </div>
                )}
              />

              {/* Customer with inline creation */}
              <div className="space-y-2">
                <Label htmlFor="customer">Cliente *</Label>
                <div className="flex gap-2">
                  <Controller
                    control={control}
                    name="customer_id"
                    render={({ field }) => (
                      <Select value={field.value || "__none__"} onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Seleziona un cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" disabled>Seleziona un cliente</SelectItem>
                          {customerOptions.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.first_name} {customer.last_name}{customer.email ? ` (${customer.email})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowCreateCustomer(true)}
                    title="Nuovo cliente"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {errors.customer_id && (
                  <p className="text-sm text-destructive">{errors.customer_id.message}</p>
                )}
              </div>

              {/* Indirizzo cantiere (luogo dei lavori) — precompilato dal cliente */}
              <div className="space-y-2">
                <Label htmlFor="cantiere-address">Indirizzo cantiere / luogo dei lavori</Label>
                <Textarea
                  id="cantiere-address"
                  value={cantiereAddress}
                  onChange={(e) => { cantiereTouchedRef.current = true; setCantiereAddress(e.target.value); }}
                  placeholder="Via del cantiere, CAP Città (PR)"
                  rows={2}
                  maxLength={300}
                />
                <p className="text-[11px] text-muted-foreground">
                  {customerId
                    ? "Precompilato dall'indirizzo cantiere del cliente (o fatturazione). Modificalo se i lavori sono altrove."
                    : "Seleziona un cliente per precompilarlo, oppure scrivilo a mano."}
                </p>
              </div>

              {/* Description */}
              <Controller
                control={control}
                name="description"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrizione Lavoro *</Label>
                    <Textarea
                      id="description"
                      {...field}
                      placeholder="Descrivi il lavoro da eseguire..."
                      rows={4}
                      maxLength={1000}
                    />
                    {errors.description && (
                      <p className="text-sm text-destructive">{errors.description.message}</p>
                    )}
                  </div>
                )}
              />

              {/* Status */}
              <Controller
                control={control}
                name="status_id"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Stato Iniziale</Label>
                    <Select value={field.value || "__none__"} onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>Seleziona stato</SelectItem>
                        {statuses.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            {status.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />

              {/* Internal Notes */}
              <Controller
                control={control}
                name="internal_notes"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="notes">Note Interne</Label>
                    <Textarea
                      id="notes"
                      {...field}
                      placeholder="Note visibili solo all'azienda..."
                      rows={3}
                      maxLength={1000}
                    />
                  </div>
                )}
              />

              {/* Salesperson Select */}
              <SalespersonSelect
                value={salespersonId || ""}
                onChange={(id, salesperson) => {
                  setValue("salesperson_id", id);
                  setValue("salesperson_data", salesperson ? {
                    commission_type: salesperson.commission_type,
                    commission_value: salesperson.commission_value,
                    compensation_mode: salesperson.compensation_mode || null,
                  } : null);
                }}
              />

              {/* Assigned To Select */}
              <AssignedToSelect
                value={assignedTo || ""}
                onChange={(val) => setValue("assigned_to", val)}
                disabled={onlyAssigned}
              />

              {/* Magazzino destinazione materiali */}
              <div className="space-y-2">
                <Label>Magazzino Destinazione Materiali</Label>
                <WarehouseSelect
                  value={destinationWarehouseId}
                  onChange={(id) => setValue("destination_warehouse_id", id)}
                  nullable
                  placeholder="Magazzino predefinito"
                />
              </div>

              {/* v8.6.42 — Sede operativa (showroom/magazzino/ufficio) per
                  analytics disaggregati su cruscotto e marginalità. */}
              <SedeSelect
                label="Sede operativa"
                placeholder="Sede operativa (opzionale)"
                value={sedeId}
                onChange={(id) => setValue("sede_id", id)}
                className="space-y-2"
              />
            </div>
          </QuoteCard>

          <FinancialSummary
            dateCommessa={{
              created_at: new Date().toISOString(),
              warehouse_arrival_date: toDateStr(watch("warehouse_arrival_date")),
              work_start_date: toDateStr(watch("work_start_date")),
              work_end_date: toDateStr(watch("work_end_date")),
              expected_date: toDateStr(watch("expected_date")),
            }}
            statiCommessa={statuses}
            totalAmount={totalAmount || ""}
            vatRate={vatRate || "22"}
            paymentType={paymentType}
            installments={installments}
            onInstallmentsChange={setInstallments}
            numInstallments={numInstallments}
            onNumInstallmentsChange={handleNumInstallmentsChange}
            onTotalAmountChange={(val) => setValue("total_amount", val)}
            onVatRateChange={(val) => setValue("vat_rate", val)}
            onPaymentTypeChange={handlePaymentTypeChange}
            balance={balance}
            hasBuildingBonus={hasBuildingBonus}
            onHasBuildingBonusChange={(val) => setValue("has_building_bonus", val)}
            bonusMultipliEnabled={bonusMultipliEnabled}
            bonusLines={bonusLines}
            onBonusLinesChange={setBonusLines}
            datiCausale={{ pivaImpresa: effectiveCompany?.vat_number ?? null }}
            financingCost={financingCost || ""}
            onFinancingCostChange={(val) => setValue("financing_cost", val)}
          />
        </div>

        {/* Customer Dates Card */}
        <QuoteCard
          title="Tempistiche per il Cliente"
          icon={<CalendarIcon className="h-4 w-4" />}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DatePickerField name="expected_date" label="Data Prevista" />
            <DatePickerField name="warehouse_arrival_date" label="Arrivo Merce in Magazzino" />
            <DatePickerField name="work_start_date" label="Inizio Lavori" />
            <DatePickerField name="work_end_date" label="Fine Lavori" />
          </div>
        </QuoteCard>

        {/* Order Items */}
        <OrderItemsList
          items={orderItems}
          onItemsChange={setOrderItems}
          editable={!createdOrderId}
          showStatusControls={false}
        />

        {/* Order Attachments */}
        {createdOrderId ? (
          <OrderAttachments orderId={createdOrderId} editable={true} />
        ) : (
          <PendingFilesUpload files={pendingFiles} onFilesChange={setPendingFiles} />
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {createdOrderId ? (
            <QuotePrimaryButton onClick={() => navigate(`/azienda/ordini/${createdOrderId}`)}>
              Vai alla Commessa
            </QuotePrimaryButton>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/azienda/ordini")}
              >
                Annulla
              </Button>
              <QuotePrimaryButton type="submit" disabled={createOrderMutation.isPending}>
                {createOrderMutation.isPending ? "Creazione..." : "Crea Commessa"}
              </QuotePrimaryButton>
            </>
          )}
        </div>
      </form>

      {/* Create Customer Dialog */}
      {/* Montaggio condizionale: il dialog nasce SOLO all'apertura (quando i dati
          del preventivo sono già caricati) → niente remount che cancella l'input. */}
      {showCreateCustomer && (
        <CreateCustomerDialog
          key={aiCustomerInitial ? "ai-contract" : (selectedQuoteId ?? "new")}
          open
          onOpenChange={setShowCreateCustomer}
          onCustomerCreated={handleCustomerCreated}
          initialValues={aiCustomerInitial ?? quoteCustomerInitial}
          defaultCreatePortalAccount={(aiCustomerInitial ?? quoteCustomerInitial) ? false : undefined}
        />
      )}

      {showContractImport && (
        <ContractImportDialog
          open
          onOpenChange={setShowContractImport}
          companyId={effectiveCompany?.id ?? null}
          onApply={applyContractExtract}
          initialAnalysisId={searchParams.get("analysis_id")}
        />
      )}
    </div>
  );
}

export default function CreateOrder() {
  return (
    <ErrorBoundary title="Errore nella creazione commessa">
      <CreateOrderInner />
    </ErrorBoundary>
  );
}
