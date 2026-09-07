import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/utils/logger";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { geocodeBestEffort } from "@/lib/geo/geocodeBestEffort";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarIcon, Plus, Trash2, AlertTriangle, ClipboardList, HardHat, MapPin, Package, FileText } from "lucide-react";
import { useOrderDraft } from "@/hooks/useOrderDraft";
import { ConflittoModifica, isConflittoModifica } from "@/lib/concorrenza";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import { type BonusLine, parseBonusLines, serializeBonusLines } from "@/lib/orders/bonusFiscali";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { usePermissions } from "@/hooks/usePermissions";
import {
  type OrderCustomer as Customer,
  type OrderItemData,
  type Installment,
  mapDbItemToOrderItem,
  createDefaultInstallments,
  buildInstallmentsFromLegacy,
  prefillExpectedDates,
} from "@/lib/orderUtils";

interface OrderData {
  /** Serve a capire se una bozza locale è più vecchia del record. */
  updated_at: string | null;
  /** Contatore che il trigger versione_riga incrementa a ogni UPDATE. */
  version: number | null;
  id: string;
  customer_id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_2_amount: number;
  financing_amount: number;
  payment_type: string;
  balance_amount: number;
  expected_date: string | null;
  internal_notes: string | null;
  vat_rate: number;
  warehouse_arrival_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  // ── Modulo Appaltatori ─────────────────────────────────────────
  order_type: "cliente" | "appaltatore_lavoro" | null;
  work_address: string | null;
  work_description: string | null;
  materials_location: string | null;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  deposit_expected_date: string | null;
  deposit_2_paid: boolean;
  deposit_2_paid_date: string | null;
  deposit_2_expected_date: string | null;
  balance_paid: boolean;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
  financing_paid: boolean | null;
  financing_paid_date: string | null;
  financing_expected_date: string | null;
  financing_cost: number | null;
  has_building_bonus: boolean;
  destination_warehouse_id?: string | null;
  assigned_to: string | null;
}

// Default STABILI (riferimento costante a livello di modulo). Con il default
// inline `= []`, react-query restituisce un NUOVO array ad ogni render finché la
// query è in caricamento → la dipendenza dell'useEffect [order, dbInstallments]
// cambia ad ogni render → setInstallments → re-render → loop infinito
// (React #185 "Maximum update depth exceeded") sulla pagina di modifica commessa.
const EMPTY_DB_INSTALLMENTS: (Installment & { id: string })[] = [];
const EMPTY_ORDER_ITEMS: OrderItemData[] = [];
const EMPTY_BONUS_LINES: BonusLine[] = [];

function EditOrderInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const { onlyAssigned } = usePermissions();

  const [customerId, setCustomerId] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [internalNotes, setInternalNotes] = useState("");

  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState<Date | undefined>();
  const [workStartDate, setWorkStartDate] = useState<Date | undefined>();
  const [workEndDate, setWorkEndDate] = useState<Date | undefined>();

  // ── Modulo Appaltatori (visibili solo se order_type='appaltatore_lavoro') ──
  const [workAddress, setWorkAddress] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [materialsLocation, setMaterialsLocation] = useState("");
  const [orderTypeState, setOrderTypeState] = useState<"cliente" | "appaltatore_lavoro">("cliente");

  // Financial state
  const [paymentType, setPaymentType] = useState<PaymentType>('standard');
  const [totalAmount, setTotalAmount] = useState("");
  const [vatRate, setVatRate] = useState("22");
  const [financingCost, setFinancingCost] = useState("");
  const [hasBuildingBonus, setHasBuildingBonus] = useState(false);
  // Ripartizione su più agevolazioni (opt-in azienda).
  const [bonusLines, setBonusLines] = useState<BonusLine[]>([]);

  // Dynamic installments
  const [installments, setInstallments] = useState<Installment[]>(
    createDefaultInstallments('standard', 2)
  );
  const [numInstallments, setNumInstallments] = useState(2);

  // Order items state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  // Clienti appena creati dal dialog inline: tenuti in stato locale e fusi nella
  // lista, così il nuovo cliente è subito selezionabile anche se il refetch della
  // cache è ancora in volo (stesso fix di CreateOrder).
  const [extraCustomers, setExtraCustomers] = useState<CompanyCustomer[]>([]);

  const [salespersonId, setSalespersonId] = useState("");
  const [salespersonData, setSalespersonData] = useState<{
    commission_type: string;
    commission_value: number;
    compensation_mode?: string | null;
  } | null>(null);

  const [assignedTo, setAssignedTo] = useState("");
  // Magazzino di competenza: dove arriva la merce e quindi chi la gestisce.
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string | null>(null);

  const { loadDraft, saveDraft, clearDraft, draftRestored, setDraftRestored, dateToIso, isoToDate } = useOrderDraft(effectiveCompany?.id, id);
  const [dataLoaded, setDataLoaded] = useState(false);
  const { bonusMultipli: bonusMultipliEnabled } = useBonusFiscaliFlags();

  // Calculate balance
  const total = parseDecimalIT(totalAmount);
  const vat = parseDecimalIT(vatRate) || 22;
  const fCostForBalance = paymentType === "financing" ? (parseDecimalIT(financingCost)) : 0;
  const totalWithVat = total * (1 + vat / 100);
  const nonBalanceSum = installments
    .filter(i => i.type !== 'balance')
    .reduce((sum, i) => sum + i.amount, 0);
  const balance = Math.max(0, totalWithVat - nonBalanceSum - fCostForBalance);

  // Payment type change handler
  const handlePaymentTypeChange = (type: PaymentType) => {
    setPaymentType(type);
    const defaultNum = type === 'financing' ? 3 : 2;
    setNumInstallments(defaultNum);
    setInstallments(createDefaultInstallments(type, defaultNum));
  };

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

  // Stati commessa dell'azienda: servono alla rata che scade "quando la
  // commessa arriva a…" (in nuova commessa la scelta c'era già).
  const { data: statiCommessa = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name")
        .eq("company_id", effectiveCompany!.id)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Fetch order data
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id!)
        .eq("company_id", effectiveCompany.id)
        .single();
      if (error) throw error;
      // `version` non è ancora nei tipi generati: il cast passa da unknown.
      return data as unknown as OrderData;
    },
    enabled: !!id && !!user && !!effectiveCompany?.id,
  });

  // Fetch order installments
  const { data: dbInstallments = EMPTY_DB_INSTALLMENTS } = useQuery({
    queryKey: ["order-installments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select("*")
        .eq("order_id", id!)
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as (Installment & { id: string })[];
    },
    enabled: !!id && !!user,
  });

  // Fetch righe bonus (ripartizione tra agevolazioni)
  const { data: dbBonusLines = EMPTY_BONUS_LINES } = useQuery({
    queryKey: ["order-bonus-lines", id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_bonus_lines")
        .select("*")
        .eq("order_id", id!)
        .order("position");
      if (error) throw error;
      return parseBonusLines(data);
    },
    enabled: !!id && !!user,
  });

  // Fetch order items
  const { data: existingItems = EMPTY_ORDER_ITEMS } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id!)
        .order("position");
      if (error) throw error;
      return data as OrderItemData[];
    },
    enabled: !!id && !!user,
  });

  // Fetch existing salesperson
  const { data: existingSalesperson } = useQuery({
    queryKey: ["order-salesperson", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, salesperson_id, commission_type, commission_value,
          salesperson:salespeople(first_name, last_name, commission_type, commission_value, compensation_mode)
        `)
        .eq("order_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  useEffect(() => {
    if (existingSalesperson) {
      setSalespersonId(existingSalesperson.salesperson_id);
      setSalespersonData({
        commission_type: existingSalesperson.commission_type,
        commission_value: existingSalesperson.commission_value,
        compensation_mode: existingSalesperson.salesperson?.compensation_mode || null,
      });
    }
  }, [existingSalesperson]);

  // Versione della commessa che l'utente ha davanti. Serve a non sovrascrivere
  // il lavoro di un collega che ha salvato mentre questa pagina era aperta.
  // Si aggiorna quando il modulo si riempie dai dati del server e dopo ogni
  // salvataggio andato a buon fine.
  const versioneCaricataRef = useRef<number | null>(null);

  // Populate form when order data is loaded
  useEffect(() => {
    if (!order) return;
    if (versioneCaricataRef.current === null) {
      versioneCaricataRef.current = order.version ?? null;
    }

    // Try to restore draft — solo se è più recente dell'ultima modifica del
    // record, altrimenti è la fotografia di una vecchia apertura di pagina.
    const draft = loadDraft(order.updated_at);
    if (draft) {
      setCustomerId(draft.customerId || order.customer_id);
      setOrderCode(draft.orderCode || "");
      setDescription(draft.description || "");
      setInternalNotes(draft.internalNotes || "");
      setSalespersonId(draft.salespersonId || "");
      setSalespersonData(draft.salespersonData || null);
      setExpectedDate(isoToDate(draft.expectedDate));
      setWarehouseArrivalDate(isoToDate(draft.warehouseArrivalDate));
      setWorkStartDate(isoToDate(draft.workStartDate));
      setWorkEndDate(isoToDate(draft.workEndDate));
      setPaymentType(draft.paymentType || "standard");
      setTotalAmount(draft.totalAmount || "");
      setVatRate(draft.vatRate || "22");
      setFinancingCost(draft.financingCost || "");
      setHasBuildingBonus(draft.hasBuildingBonus || false);
      if (draft.bonusLines?.length) setBonusLines(draft.bonusLines);
      if (draft.installments?.length) {
        setInstallments(draft.installments);
        setNumInstallments(draft.installments.length);
      }
      if (draft.orderItems?.length) setOrderItems(draft.orderItems);
      // Campi non sempre presenti nella bozza → ripristina da bozza o dal record DB,
      // altrimenti al salvataggio verrebbero azzerati (assegnazione persa, tipo→cliente).
      setAssignedTo(draft.assignedTo || order.assigned_to || "");
      setOrderTypeState(order.order_type === "appaltatore_lavoro" ? "appaltatore_lavoro" : "cliente");
      setWorkAddress(order.work_address || "");
      setWorkDescription(order.work_description || "");
      setMaterialsLocation(order.materials_location || "");
      setDraftRestored(true);
      setDataLoaded(true);
      return;
    }

    // No draft — load from DB
    setCustomerId(order.customer_id);
    setOrderCode(order.order_code || "");
    setDescription(order.description);
    // Formato IT anche in ingresso: `String(1.234)` rimetterebbe nel campo
    // una stringa ambigua, riletta come 1234 al primo blur (fix 2026-07-25).
    setTotalAmount(formatDecimalIT(order.total_amount));
    setPaymentType((order.payment_type as PaymentType) || 'standard');
    setInternalNotes(order.internal_notes || "");
    setVatRate((order.vat_rate || 22).toString());
    if (order.expected_date) setExpectedDate(new Date(order.expected_date));
    if (order.warehouse_arrival_date) setWarehouseArrivalDate(new Date(order.warehouse_arrival_date));
    if (order.work_start_date) setWorkStartDate(new Date(order.work_start_date));
    if (order.work_end_date) setWorkEndDate(new Date(order.work_end_date));
    setFinancingCost(order.financing_cost > 0 ? formatDecimalIT(order.financing_cost) : "");
    setHasBuildingBonus(order.has_building_bonus || false);
    // Ripartizione bonus già salvata sulla commessa.
    if (dbBonusLines.length > 0) setBonusLines(dbBonusLines);
    setAssignedTo(order.assigned_to || "");
    setDestinationWarehouseId(order.destination_warehouse_id ?? null);
    // Modulo Appaltatori
    setOrderTypeState(order.order_type === "appaltatore_lavoro" ? "appaltatore_lavoro" : "cliente");
    setWorkAddress(order.work_address || "");
    setWorkDescription(order.work_description || "");
    setMaterialsLocation(order.materials_location || "");

    // Load installments from DB table, or build from legacy
    if (dbInstallments.length > 0) {
      setInstallments(dbInstallments.map(i => ({
        id: i.id,
        position: i.position,
        label: i.label,
        type: i.type as Installment['type'],
        amount: i.amount,
        is_paid: i.is_paid,
        paid_date: i.paid_date,
        expected_date: i.expected_date,
        // Senza questi tre l'evento scelto non si rivedeva riaprendo la
        // commessa, e il salvataggio successivo lo riportava a "data precisa".
        trigger_evento: i.trigger_evento,
        trigger_status_id: i.trigger_status_id,
        trigger_numero: i.trigger_numero,
        giorni_preavviso: i.giorni_preavviso,
      })));
      setNumInstallments(dbInstallments.length);
    } else {
      const legacyInstallments = buildInstallmentsFromLegacy(order);
      setInstallments(legacyInstallments);
      setNumInstallments(legacyInstallments.length);
    }

    setDataLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, dbInstallments, dbBonusLines]);

  // Populate order items
  useEffect(() => {
    if (existingItems.length > 0 && !draftRestored) {
      setOrderItems(existingItems.map(mapDbItemToOrderItem));
    }
  }, [existingItems, draftRestored]);

  // Auto-heal: in alcune aperture lo state perde il cliente (race load/draft
  // già nota — il guard sull'auto-save sotto ne è la cicatrice) e l'utente si
  // ritrovava "Seleziona un cliente" su una commessa che il cliente CE L'HA:
  // submit bloccata finché non lo risceglieva a mano. Se la commessa ha un
  // customer_id e lo state è vuoto, riagganciamo quello — mai un cliente
  // diverso da quello già salvato, quindi nessun rischio di scrittura errata.
  useEffect(() => {
    if (dataLoaded && customerId === "" && order?.customer_id) {
      setCustomerId(order.customer_id);
    }
  }, [dataLoaded, customerId, order?.customer_id]);

  // Auto-save draft — solo DOPO la prima modifica dell'utente.
  // Il primo giro dopo il caricamento non è una modifica: è la pagina che si
  // popola dal database. Salvarlo creava una bozza a ogni apertura, che poi
  // vinceva sul database alla riapertura successiva.
  // La fotografia dei dati come sono arrivati dal database: finché il modulo
  // combacia con quella, non c'è nulla di non salvato da conservare.
  const impronteIniziale = useRef<string | null>(null);
  // Finché nessuno ha toccato tastiera o mouse, quello che cambia non è una
  // modifica: è il modulo che si popola (query che tornano, numeri che si
  // formattano). La fotografia si aggiorna, e si congela al primo tocco vero.
  const utenteHaToccato = useRef(false);
  useEffect(() => {
    const segna = () => { utenteHaToccato.current = true; };
    window.addEventListener("pointerdown", segna, true);
    window.addEventListener("keydown", segna, true);
    return () => {
      window.removeEventListener("pointerdown", segna, true);
      window.removeEventListener("keydown", segna, true);
    };
  }, []);
  useEffect(() => {
    if (!dataLoaded) return;
    if (customerId === "" && order?.customer_id) return;
    const bozza = {
      customerId, orderCode, description, internalNotes, statusId: "",
      assignedTo,
      salespersonId, salespersonData,
      expectedDate: dateToIso(expectedDate),
      warehouseArrivalDate: dateToIso(warehouseArrivalDate),
      workStartDate: dateToIso(workStartDate),
      workEndDate: dateToIso(workEndDate),
      paymentType, totalAmount, vatRate,
      financingCost,
      hasBuildingBonus,
      bonusLines,
      orderItems,
      installments,
    };
    const impronta = JSON.stringify(bozza);
    // Prima che l'utente tocchi qualcosa la fotografia si riallinea a ogni giro:
    // così l'assestamento del modulo non viene scambiato per una modifica.
    if (!utenteHaToccato.current || impronteIniziale.current === null) {
      impronteIniziale.current = impronta;
      return;
    }
    // Nessuna differenza rispetto al database: niente bozza. Così aprire la
    // pagina e uscire non lascia dietro una fotografia che poi vince sui dati veri.
    if (impronta === impronteIniziale.current) return;
    saveDraft(bozza);
  }, [customerId, orderCode, description, internalNotes, salespersonId, salespersonData,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, vatRate,
      installments, financingCost,
      hasBuildingBonus, bonusLines,
      orderItems, dataLoaded, saveDraft, dateToIso, order?.customer_id]);

  const handleClearDraft = useCallback(() => {
    clearDraft();
    if (order) {
      setCustomerId(order.customer_id);
      setOrderCode(order.order_code || "");
      setDescription(order.description);
      setTotalAmount(formatDecimalIT(order.total_amount));
      setPaymentType((order.payment_type as PaymentType) || 'standard');
      setInternalNotes(order.internal_notes || "");
      setVatRate((order.vat_rate || 22).toString());
      setExpectedDate(order.expected_date ? new Date(order.expected_date) : undefined);
      setWarehouseArrivalDate(order.warehouse_arrival_date ? new Date(order.warehouse_arrival_date) : undefined);
      setWorkStartDate(order.work_start_date ? new Date(order.work_start_date) : undefined);
      setWorkEndDate(order.work_end_date ? new Date(order.work_end_date) : undefined);
      setFinancingCost(order.financing_cost > 0 ? formatDecimalIT(order.financing_cost) : "");
      setHasBuildingBonus(order.has_building_bonus || false);
      setBonusLines(dbBonusLines);
      // Restore installments from DB or legacy
      if (dbInstallments.length > 0) {
        setInstallments(dbInstallments.map(i => ({
          id: i.id, position: i.position, label: i.label,
          type: i.type as Installment['type'], amount: i.amount,
          is_paid: i.is_paid, paid_date: i.paid_date, expected_date: i.expected_date,
        })));
        setNumInstallments(dbInstallments.length);
      } else {
        const legacyInstallments = buildInstallmentsFromLegacy(order);
        setInstallments(legacyInstallments);
        setNumInstallments(legacyInstallments.length);
      }
    }
    if (existingItems.length > 0) {
      setOrderItems(existingItems.map(mapDbItemToOrderItem));
    }
  }, [clearDraft, order, existingItems, dbInstallments, dbBonusLines]);

  const { data: customers = [], isLoading: isLoadingCustomers } = useCompanyCustomers(effectiveCompany?.id);

  // Fetch the order's customer directly
  const { data: orderCustomer } = useQuery({
    queryKey: ["order-customer", order?.customer_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", order!.customer_id)
        .eq("company_id", effectiveCompany!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
    enabled: !!order?.customer_id && !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const allCustomers = (() => {
    const seen = new Set(customers.map((c) => c.id));
    const head: CompanyCustomer[] = [];
    // Il cliente attuale della commessa + i clienti appena creati vanno in testa,
    // così sono sempre selezionabili anche se non ancora nella lista dalla RPC.
    if (orderCustomer && !seen.has(orderCustomer.id)) { head.push(orderCustomer); seen.add(orderCustomer.id); }
    for (const c of extraCustomers) {
      if (!seen.has(c.id)) { head.push(c); seen.add(c.id); }
    }
    return head.length > 0 ? [...head, ...customers] : customers;
  })();

  // Update order mutation
  const updateOrderMutation = useMutation({
    // customerId via argomento, NON dallo state: setCustomerId nel submit è
    // async e la closure leggerebbe il valore vecchio (rischio customer_id
    // vuoto scritto a DB quando scatta l'auto-heal della race cliente).
    mutationFn: async (args?: { customerId?: string }) => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const installmentsForSave = installments.map(i =>
        i.type === 'balance' ? { ...i, amount: balance } : i
      );

      // Un solo giro sul database invece di una ventina di scritture in fila.
      // `commessa_salva` fa tutto dentro una transazione sola: testata, rate,
      // righe bonus, voci, giacenza di magazzino con i movimenti relativi e
      // venditore. Prima, se la rete cadeva a metà sequenza, la commessa
      // restava salvata a metà: le rate cancellate e non reinserite, il
      // magazzino scaricato per voci mai scritte.
      //
      // Le colonne piatte (deposit_amount, balance_amount, …) NON si passano:
      // la funzione le ricava dalle rate e rifiuta chi prova a scriverle a
      // mano. Erano la fonte del disallineamento fra le rate e i totali che
      // il cruscotto legge da quelle colonne.
      const campi: Record<string, unknown> = {
        customer_id: args?.customerId || customerId,
        order_code: orderCode.trim() || null,
        description,
        total_amount: total,
        payment_type: paymentType,
        expected_date: expectedDate ? format(expectedDate, "yyyy-MM-dd") : null,
        internal_notes: internalNotes || null,
        vat_rate: vat,
        warehouse_arrival_date: warehouseArrivalDate ? format(warehouseArrivalDate, "yyyy-MM-dd") : null,
        work_start_date: workStartDate ? format(workStartDate, "yyyy-MM-dd") : null,
        work_end_date: workEndDate ? format(workEndDate, "yyyy-MM-dd") : null,
        financing_cost: parseDecimalIT(financingCost),
        has_building_bonus: hasBuildingBonus,
        destination_warehouse_id: destinationWarehouseId || null,
        assigned_to: assignedTo || null,
      };
      // Modulo Appaltatori — persistiamo solo se l'ordine è già di tipo
      // appaltatore_lavoro: per ordini cliente standard manteniamo i campi
      // a NULL (no-op silenzioso anche se l'utente li avesse riempiti).
      if (orderTypeState === "appaltatore_lavoro") {
        campi.work_address = workAddress.trim() || null;
        campi.work_description = workDescription.trim() || null;
        campi.materials_location = materialsLocation.trim() || null;
      }

      const rate = installmentsForSave.map((i, idx) => ({
        position: i.position ?? idx,
        label: i.label,
        type: i.type,
        amount: i.amount,
        is_paid: i.is_paid,
        paid_date: i.paid_date || null,
        expected_date: i.expected_date || null,
        // Evento del cantiere a cui la rata è agganciata: senza questi tre
        // campi il delete+insert perderebbe la scelta a ogni salvataggio.
        trigger_evento: i.trigger_evento || 'data_fissa',
        trigger_status_id: i.trigger_status_id || null,
        trigger_numero: i.trigger_numero ?? null,
        giorni_preavviso: i.giorni_preavviso ?? 7,
      }));

      // Con la funzione bonus spenta la card non si vede: mandare un elenco,
      // anche vuoto, cancellerebbe righe che l'utente non ha avuto modo di
      // guardare. `null` dice alla funzione di non toccarle. Spegnere il bonus
      // edilizio, invece, le azzera davvero: quella è una scelta esplicita.
      const righeBonus = !bonusMultipliEnabled
        ? null
        : hasBuildingBonus ? serializeBonusLines(bonusLines) : [];

      // Solo gli id che esistono davvero su questa commessa: la funzione
      // rifiuta una voce il cui id non le appartiene, e nel modulo può esserci
      // l'id di una riga che nel frattempo è stata cancellata altrove.
      const idEsistenti = new Set(existingItems.map(i => i.id));
      const voci = orderItems.map((item) => ({
        id: item.id && idEsistenti.has(item.id) ? item.id : null,
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        status: item.status,
        supplier_id: item.supplier_id || null,
        purchase_price: item.purchase_price || 0,
        vat_rate: item.vat_rate ?? 22,
        stock_item_id: item.stock_item_id || null,
        standard_cost: item.standard_cost ?? 0,
        article_template_id: item.article_template_id || null,
        product_code: item.product_code || null,
        categoria: item.categoria || null,
        is_paid: item.is_paid || false,
        paid_date: item.paid_date || null,
        payment_method: item.payment_method || null,
        deposit_amount: item.deposit_amount || 0,
        deposit_paid: item.deposit_paid || false,
        deposit_paid_date: item.deposit_paid_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
        balance_amount: item.balance_amount || 0,
        balance_paid: item.balance_paid || false,
        balance_paid_date: item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
      }));

      // La provvigione la calcola il server, con un trigger su
      // order_salespeople: passarla da qui verrebbe comunque sovrascritta.
      // Oggetto vuoto = nessun venditore, la funzione stacca quello esistente.
      const venditore = salespersonId && salespersonData
        ? {
            salesperson_id: salespersonId,
            commission_type: salespersonData.commission_type,
            commission_value: salespersonData.commission_value,
          }
        : {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("commessa_salva", {
        p_commessa: id!,
        p_campi: campi,
        p_rate: rate,
        p_bonus: righeBonus,
        p_voci: voci,
        p_venditore: venditore,
        // Guardia sulla modifica concorrente: se un collega ha salvato mentre
        // questa pagina era aperta la versione non combacia, e la funzione si
        // ferma invece di sovrascrivere il suo lavoro.
        p_versione: versioneCaricataRef.current,
      }) as { error: { code?: string; message?: string } | null };

      if (error) {
        // 40001 è il conflitto di versione: lo diciamo con il messaggio che la
        // pagina sa già mostrare, non con l'errore grezzo di Postgres.
        if (error.code === "40001") throw new ConflittoModifica("commessa");
        // La funzione rifiuta con messaggi in italiano che servono a chi salva
        // («campo non scrivibile da qui», «una delle voci non appartiene a
        // questa commessa»). Vanno incartati in un Error: il gestore mostra il
        // messaggio solo se lo è, e l'oggetto grezzo di PostgREST non lo è —
        // finirebbero tutti dietro un generico «si è verificato un errore».
        throw new Error(
          (error.message ?? "Errore durante il salvataggio della commessa")
            .replace(/^commessa_salva:\s*/, ""),
        );
      }
      // La versione va riletta, non incrementata di uno: un solo salvataggio
      // ne consuma parecchie, perche' i trigger che riallineano i totali dalle
      // rate e dalle voci aggiornano a loro volta la riga della commessa.
      // Misurato su una commessa vera: da 1 a 8 con un salvataggio senza
      // modifiche. Se la pagina resta aperta, il salvataggio successivo deve
      // partire da questa, altrimenti si autoaccusa di conflitto.
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: riletta } = await (supabase as any)
          .from("orders")
          .select("version")
          .eq("id", id!)
          .maybeSingle();
        versioneCaricataRef.current = (riletta as { version?: number | null } | null)?.version ?? null;
      }

      // Geocoding automatico cantiere (best-effort, in background):
      // aggiorna work_lat/lng senza bloccare né far fallire il salvataggio.
      if (orderTypeState === "appaltatore_lavoro" && workAddress.trim()) {
        void geocodeBestEffort([workAddress]).then((coords) => {
          if (!coords) return;
          return supabase
            .from("orders")
            .update({ work_lat: coords.lat, work_lng: coords.lng } as never)
            .eq("id", id!)
            .eq("company_id", effectiveCompany.id);
        }).catch(() => { /* geocoding best-effort: non bloccante */ });
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      queryClient.invalidateQueries({ queryKey: ["order-salesperson", id] });
      queryClient.invalidateQueries({ queryKey: ["order-installments", id] });
      queryClient.invalidateQueries({ queryKey: ["order-bonus-lines", id] });
      queryClient.invalidateQueries({ queryKey: ["margin"] });
      queryClient.invalidateQueries({ queryKey: ["break-even"] });
      queryClient.invalidateQueries({ queryKey: ["cruscotto"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success("Commessa aggiornata", { description: "La commessa è stata aggiornata con successo." });
      navigate(`/azienda/ordini/${id}`);
    },
    onError: (error) => {
      if (isConflittoModifica(error)) {
        // Non è un errore tecnico: è una persona che ha salvato prima di te.
        // La bozza locale resta, così quello che hai scritto non si perde.
        toast.error("Qualcun altro ha salvato questa commessa", {
          description: error.message,
          duration: 10000,
          action: { label: "Ricarica", onClick: () => window.location.reload() },
        });
        logger.warn("Conflitto di modifica sulla commessa", { id });
        return;
      }
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Si è verificato un errore durante l'aggiornamento della commessa.",
      });
      logger.error("Update order error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Anti doppio-submit: il submit via Invio non passa dal bottone (disabled),
    // quindi senza questa guardia la mutation può partire due volte.
    if (updateOrderMutation.isPending) return;

    // Se lo state ha perso il cliente ma la commessa ne ha già uno salvato,
    // usiamo quello (vedi auto-heal sopra): bloccare qui costringeva l'utente
    // a riselezionare un cliente che non è mai cambiato.
    const effectiveCustomerId = customerId || order?.customer_id || "";
    if (!effectiveCustomerId) {
      toast.error("Campo obbligatorio", { description: "Seleziona un cliente." });
      return;
    }
    if (!customerId) setCustomerId(effectiveCustomerId);
    if (!description.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci una descrizione del lavoro." });
      return;
    }
    // Per i lavori per appaltatore (sola manodopera) l'importo può essere 0
    // perché spesso il compenso è gestito a SAL/contratto separato.
    if (orderTypeState !== "appaltatore_lavoro" && total <= 0) {
      toast.error("Importo non valido", { description: "L'importo totale deve essere maggiore di zero." });
      return;
    }
    if (vat < 0 || vat > 100) {
      toast.error("IVA non valida", { description: "L'IVA deve essere un valore tra 0 e 100." });
      return;
    }
    if ((parseDecimalIT(financingCost)) < 0) {
      toast.error("Costo finanziaria non valido", { description: "Il costo finanziaria non può essere negativo." });
      return;
    }
    if (workStartDate && workEndDate && workEndDate < workStartDate) {
      toast.error("Date lavori non valide", {
        description: "La data di fine lavori non può precedere quella di inizio.",
      });
      return;
    }
    if (orderItems.length > 0) {
      const invalidItems = orderItems.filter(
        (item) => !item.name.trim() || item.quantity < 1 || (item.purchase_price !== undefined && item.purchase_price < 0)
      );
      if (invalidItems.length > 0) {
        toast.error("Articoli non validi", { description: "Verifica che tutti gli articoli abbiano un nome, quantità ≥ 1 e prezzo d'acquisto non negativo." });
        return;
      }
    }

    updateOrderMutation.mutate({ customerId: effectiveCustomerId });
  };

  const handleCustomerCreated = (newCustomerId: string, customerName?: string, customer?: CompanyCustomer) => {
    const record: CompanyCustomer = customer
      ? { id: customer.id, first_name: customer.first_name, last_name: customer.last_name, email: customer.email ?? null }
      : { id: newCustomerId, first_name: customerName ?? "Nuovo cliente", last_name: null, email: null };
    setExtraCustomers((prev) => (prev.some((c) => c.id === record.id) ? prev : [...prev, record]));
    setCustomerId(newCustomerId);
  };

  if (orderLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Caricamento commessa...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Commessa non trovata</p>
        <Button className="mt-4" onClick={() => navigate("/azienda/ordini")}>
          Torna alle commesse
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <QuotePageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Modifica Commessa"
        subtitle="Aggiorna i dettagli della commessa"
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
      {draftRestored && (
        <Alert className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-900 font-medium">
              Bozza recuperata — le modifiche non salvate sono state ripristinate.
            </span>
            <Button type="button" variant="outline" size="sm" className="ml-4 shrink-0 border-amber-300 hover:bg-amber-100" onClick={handleClearDraft}>
              <Trash2 className="h-3 w-3 mr-1" />
              Ripristina originale
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Form */}
          <QuoteCard title="Dettagli Commessa" icon={<ClipboardList className="h-4 w-4" />}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderCode">Codice Commessa</Label>
                <Input id="orderCode" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="es. ORD-2026-001" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer">Cliente *</Label>
                <div className="flex gap-2">
                  <Select
                    value={customerId && allCustomers.some(c => c.id === customerId) ? customerId : "__none__"}
                    onValueChange={(value) => setCustomerId(value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={isLoadingCustomers ? "Caricamento..." : "Seleziona un cliente"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>Seleziona un cliente</SelectItem>
                      {allCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.first_name} {customer.last_name} ({customer.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowCreateCustomer(true)} title="Nuovo cliente">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione Lavoro *</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrivi il lavoro da eseguire..." rows={4} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Note Interne</Label>
                <Textarea id="notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Note visibili solo all'azienda..." rows={3} />
              </div>

              <SalespersonSelect
                value={salespersonId}
                onChange={(sid, salesperson) => {
                  setSalespersonId(sid);
                  setSalespersonData(salesperson ? {
                    commission_type: salesperson.commission_type,
                    commission_value: salesperson.commission_value,
                    compensation_mode: salesperson.compensation_mode || null,
                  } : null);
                }}
              />

              <AssignedToSelect value={assignedTo} onChange={setAssignedTo} disabled={onlyAssigned} />

              {/* Magazzino di competenza: chi gestisce quel magazzino vede la
                  commessa. Alla creazione c'era già, in modifica mancava. */}
              <div className="space-y-2">
                <Label>Magazzino Destinazione Materiali</Label>
                <WarehouseSelect
                  value={destinationWarehouseId}
                  onChange={setDestinationWarehouseId}
                  nullable
                  placeholder="Magazzino predefinito"
                />
              </div>
            </div>
          </QuoteCard>

          <FinancialSummary
            dateCommessa={{
              warehouse_arrival_date: warehouseArrivalDate ? warehouseArrivalDate.toLocaleDateString("en-CA") : null,
              work_start_date: workStartDate ? workStartDate.toLocaleDateString("en-CA") : null,
              work_end_date: workEndDate ? workEndDate.toLocaleDateString("en-CA") : null,
              expected_date: expectedDate ? expectedDate.toLocaleDateString("en-CA") : null,
            }}
            statiCommessa={statiCommessa}
            totalAmount={totalAmount}
            vatRate={vatRate}
            paymentType={paymentType}
            installments={installments}
            onInstallmentsChange={setInstallments}
            numInstallments={numInstallments}
            onNumInstallmentsChange={handleNumInstallmentsChange}
            onTotalAmountChange={setTotalAmount}
            onVatRateChange={setVatRate}
            onPaymentTypeChange={handlePaymentTypeChange}
            balance={balance}
            hasBuildingBonus={hasBuildingBonus}
            onHasBuildingBonusChange={setHasBuildingBonus}
            bonusMultipliEnabled={bonusMultipliEnabled}
            bonusLines={bonusLines}
            onBonusLinesChange={setBonusLines}
            datiCausale={{
              pivaImpresa: effectiveCompany?.vat_number ?? null,
              cfBeneficiario: null,
            }}
            financingCost={financingCost}
            onFinancingCostChange={setFinancingCost}
          />
        </div>

        {/* Customer Dates Card */}
        <QuoteCard
          title="Tempistiche per il Cliente"
          icon={<CalendarIcon className="h-4 w-4" />}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Data Prevista</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !expectedDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {expectedDate ? format(expectedDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={expectedDate} onSelect={setExpectedDate} autoFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Arrivo Merce in Magazzino</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !warehouseArrivalDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {warehouseArrivalDate ? format(warehouseArrivalDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={warehouseArrivalDate} onSelect={setWarehouseArrivalDate} autoFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Inizio Lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !workStartDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {workStartDate ? format(workStartDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={workStartDate} onSelect={setWorkStartDate} autoFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Fine Lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !workEndDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {workEndDate ? format(workEndDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={workEndDate} onSelect={setWorkEndDate} autoFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
          </div>
        </QuoteCard>

        {/* ── Modulo Appaltatori — campi specifici per lavoro manodopera ── */}
        {orderTypeState === "appaltatore_lavoro" && (
          <QuoteCard
            title="Lavoro per appaltatore"
            icon={<HardHat className="h-4 w-4" />}
            subtitle="Sola manodopera — dettagli operativi del cantiere."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workAddress" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Indirizzo cantiere
                </Label>
                <Input
                  id="workAddress"
                  value={workAddress}
                  onChange={(e) => setWorkAddress(e.target.value)}
                  placeholder="Via del cantiere, 5 — 20100 Milano"
                  maxLength={250}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workDescription" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Cosa va fatto (briefing operativo)
                </Label>
                <Textarea
                  id="workDescription"
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  placeholder="Smontaggio infissi, posa, sigillature, ripristino imbotti..."
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="materialsLocation" className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Posizione materiali
                </Label>
                <Input
                  id="materialsLocation"
                  value={materialsLocation}
                  onChange={(e) => setMaterialsLocation(e.target.value)}
                  placeholder="Magazzino appaltatore / cantiere stesso / deposito X"
                  maxLength={200}
                />
              </div>
            </div>
          </QuoteCard>
        )}

        {/* Order Items */}
        <OrderItemsList
          items={orderItems}
          onItemsChange={setOrderItems}
          editable={true}
          showStatusControls={false}
        />

        {/* Order Attachments */}
        <OrderAttachments orderId={id!} editable={true} />

        {/* Actions */}
        <div className="flex justify-end gap-3 sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <Button type="button" variant="outline" onClick={() => navigate(`/azienda/ordini/${id}`)}>
            Annulla
          </Button>
          <QuotePrimaryButton type="submit" disabled={updateOrderMutation.isPending}>
            {updateOrderMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
          </QuotePrimaryButton>
        </div>
      </form>

      <CreateCustomerDialog
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
}

export default function EditOrder() {
  return (
    <ErrorBoundary title="Errore nella modifica commessa">
      <EditOrderInner />
    </ErrorBoundary>
  );
}
