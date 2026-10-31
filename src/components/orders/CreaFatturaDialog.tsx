import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Receipt, Sparkles, Check, User, Package, Loader2, Info, Plus, Trash2, ListPlus, Eye, Scale, RotateCcw, AlertTriangle, Landmark,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateDocumento } from "@/hooks/useDocumentiFiscali";
import { useLinkFatturaOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import type { Installment } from "@/lib/orderUtils";
import { METODI_PAGAMENTO_SDI, type ClienteSnapshot, type RigaDocumento, type ScadenzaPagamento } from "@/types/fatturazione";
import { causaliConValoreBeni } from "@/lib/fatturazione/beniSignificativi";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DetrazioniFiscaliFields } from "@/components/orders/DetrazioniFiscaliFields";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import { type DetrazioneValue, EMPTY_DETRAZIONE } from "@/lib/fatturazione/detrazioniEdilizie";
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import { parseBonusLines, getPreset, causaleBonificoParlante } from "@/lib/orders/bonusFiscali";
import {
  CLAUSOLE_FATTURA,
  PROFILI_FATTURA,
  type ProfiloFattura,
  avvisiClausole,
  clausola,
  clausolePerProfilo,
  clausolePredefinite,
  componiFattura,
  profiloDaCliente,
  testoTrattenuta,
} from "@/lib/fatturazione/clausoleFattura";

/** I metodi che un'impresa edile usa davvero; gli altri restano nell'editor. */
const METODI_PROPOSTI = ["MP05", "MP12", "MP08", "MP02", "MP19", "MP23", "MP01"] as const;

/** Contanti: dal 2023 il limite è sotto i 5.000 € (art. 49 D.Lgs. 231/2007). */
const LIMITE_CONTANTI = 5000;

type Scadenza = "vista" | "30" | "60" | "90" | "rata" | "data";

const oggiIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const piuGiorni = (giorni: number) => {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dataIt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT");

// ── Types ────────────────────────────────────────────────────────

interface OrderItemRow {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  vat_rate: number | null;
  discount_percent: number | null;
  position: number | null;
}

interface CreaFatturaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode: string | null;
  orderDescription: string;
  /** Il valore concordato del contratto, IVA inclusa (come le rate). */
  totalAmount: number;
  vatRate: number;
  customerId: string | null;
  customerName: string;
  installments: Installment[];
}

// ── Helpers ──────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  deposit: "Acconto",
  balance: "Saldo",
  financing: "Finanziamento",
};

function fmt(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** «25.636,19», «25636.19» e «25636,19» sono lo stesso numero. */
function parseImporto(s: string): number {
  const t = s.trim().replace(/[€\s]/g, "");
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

const scriviImporto = (n: number) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(n);
const scriviPercentuale = (n: number) => String(round2(n)).replace(".", ",");

/** Riga da un articolo della commessa, eventualmente a una quota (SAL sugli
 *  articoli). Il prezzo resta quello di listino con lo sconto a parte: prima il
 *  prezzo era già scontato E lo sconto restava sulla riga, e l'editor, che
 *  ricalcola, lo applicava due volte. */
function buildRigaFromItem(item: OrderItemRow, defaultVat: number, quota = 100): RigaDocumento {
  const qty = item.quantity ?? 1;
  const discountPct = item.discount_percent ?? 0;
  const prezzo = round2((item.unit_price ?? 0) * quota / 100);

  let descrizione = item.name;
  if (item.description) descrizione += `\n${item.description}`;
  if (quota !== 100) descrizione += ` — quota del ${scriviPercentuale(quota)}%`;

  return {
    id: item.id, // id stabile dell'articolo
    numero_linea: 0, // rinumerato nella composizione finale
    descrizione,
    quantita: qty,
    unita_misura: "pz",
    prezzo_unitario: prezzo,
    ...(discountPct > 0 && { sconto_percentuale: discountPct }),
    imponibile: 0,
    aliquota_iva: String(item.vat_rate ?? defaultVat),
    imposta: 0,
    totale_riga: 0,
  };
}

/** Riga descrittiva LIBERA (aggiunta a mano): descrizione + qtà + prezzo + IVA.
 *  Serve per fatture che NON elencano gli articoli ma una prestazione/servizio. */
interface FreeLine {
  id: string;
  descrizione: string;
  quantita: number;
  prezzo: number;
  aliquota: number;
}

function freeLineToRiga(fl: FreeLine, defaultVat: number): RigaDocumento {
  return {
    id: fl.id,
    numero_linea: 0,
    descrizione: fl.descrizione.trim() || "Prestazione",
    quantita: fl.quantita > 0 ? fl.quantita : 1,
    unita_misura: "pz",
    prezzo_unitario: fl.prezzo || 0,
    imponibile: 0,
    aliquota_iva: String(Math.max(0, fl.aliquota ?? defaultVat)),
    imposta: 0,
    totale_riga: 0,
  };
}

/** Una riga sola «a corpo» per l'importo della rata, IVA inclusa: l'imponibile
 *  si ricava scorporando l'aliquota. */
function buildRigaImporto(descrizione: string, lordo: number, aliquota: number): RigaDocumento {
  const al = Math.max(0, aliquota);
  return {
    id: "importo-rata",
    numero_linea: 0,
    descrizione: descrizione.trim() || "Lavori come da contratto",
    quantita: 1,
    unita_misura: "a corpo",
    prezzo_unitario: round2(lordo / (1 + al / 100)),
    imponibile: 0,
    aliquota_iva: String(al),
    imposta: 0,
    totale_riga: 0,
  };
}

function descrizioneRata(inst: Installment, orderCode: string | null, orderDescription: string): string {
  const tipoRata = inst.label || LABEL_MAP[inst.type] || "Pagamento";
  const codeStr = orderCode ? ` n. ${orderCode}` : "";
  const descShort = orderDescription.length > 80 ? orderDescription.substring(0, 77) + "..." : orderDescription;
  return `${tipoRata} commessa${codeStr} — ${descShort}`;
}

// ── Component ────────────────────────────────────────────────────

/** «importo»: una riga per l'importo della rata (modificabile); «articoli»: gli
 *  articoli della commessa, tutti o in parte, a una quota. */
type InvoiceMode = "importo" | "articoli";

export function CreaFatturaDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
  orderDescription,
  totalAmount,
  vatRate,
  customerId,
  customerName,
  installments,
}: CreaFatturaDialogProps) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const defaultVat = vatRate > 0 ? vatRate : 22;
  const { data: aziendaFiscale } = useAnagraficaAzienda();

  // Il contratto IVA inclusa: la base delle percentuali. Senza valore, la somma delle rate.
  const contratto = totalAmount > 0 ? totalAmount : installments.reduce((s, i) => s + (i.amount || 0), 0);

  const [mode, setMode] = useState<InvoiceMode>("articoli");
  const [selectedInstId, setSelectedInstId] = useState<string | null>(null);
  // Importo della riga «a corpo»: parte dalla rata e si cambia (il SAL vero non
  // è quasi mai quello previsto in contratto).
  const [importo, setImporto] = useState<{ descrizione: string; lordo: string; aliquota: string }>({
    descrizione: "", lordo: "", aliquota: String(defaultVat),
  });
  // Mentre si scrive la percentuale, il testo resta quello digitato («35,» non diventa «35»).
  const [percScritta, setPercScritta] = useState<string | null>(null);
  const [quotaArticoli, setQuotaArticoli] = useState("100");
  // Articoli ESCLUSI dalla fattura (default: tutti inclusi). L'utente spunta via
  // ciò che non vuole in fattura → "solo alcuni articoli".
  const [excludedItemIds, setExcludedItemIds] = useState<Set<string>>(new Set());
  // Righe descrittive LIBERE aggiunte a mano (prestazioni/servizi senza articolo).
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [draft, setDraft] = useState<{ descrizione: string; quantita: string; prezzo: string; aliquota: string }>({
    descrizione: "", quantita: "1", prezzo: "", aliquota: "",
  });

  // Tipo di fattura e clausole. null = segui il suggerimento (anagrafica, aliquota).
  const [profiloScelto, setProfiloScelto] = useState<ProfiloFattura | null>(null);
  const [clausoleScelte, setClausoleScelte] = useState<string[] | null>(null);
  const [testiClausole, setTestiClausole] = useState<Record<string, string>>({});
  const [clausoleMie, setClausoleMie] = useState<Array<{ id: string; testo: string }>>([]);
  const [nuovaClausola, setNuovaClausola] = useState("");
  const [altreClausole, setAltreClausole] = useState(false);
  const [cig, setCig] = useState<string | null>(null);
  const [cup, setCup] = useState<string | null>(null);
  const [anteprima, setAnteprima] = useState(false);
  // Percentuali delle trattenute (testo, come si scrive).
  const [percentuali, setPercentuali] = useState<Record<string, string>>({});
  // Valore dei beni significativi in questa fattura (IVA 10%, L. 205/2017 art. 1 c. 19).
  const [valoreBeni, setValoreBeni] = useState("");
  // Pagamento: va nell'XML (DatiPagamento), non solo nel PDF.
  const [metodoScelto, setMetodoScelto] = useState<string | null>(null);
  const [scadenza, setScadenza] = useState<Scadenza>("30");
  const [dataLibera, setDataLibera] = useState("");

  const applicaRata = (inst: Installment | null | undefined) => {
    if (!inst) return;
    setImporto({
      descrizione: descrizioneRata(inst, orderCode, orderDescription),
      lordo: scriviImporto(inst.amount || 0),
      aliquota: String(defaultVat),
    });
    if (contratto > 0) setQuotaArticoli(scriviPercentuale(((inst.amount || 0) / contratto) * 100));
  };

  // Alla apertura: prima rata non pagata, fatturata per il suo importo.
  useEffect(() => {
    if (open) {
      const firstUnpaid = installments.find(i => !i.is_paid);
      if (firstUnpaid) {
        setSelectedInstId(firstUnpaid.id || `pos-${firstUnpaid.position}`);
        setMode("importo");
        applicaRata(firstUnpaid);
      } else {
        setSelectedInstId(null);
        setMode("articoli");
        setQuotaArticoli("100");
      }
      // reset composizione a ogni apertura
      setExcludedItemIds(new Set());
      setFreeLines([]);
      setDraft({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });
      setProfiloScelto(null);
      setClausoleScelte(null);
      setTestiClausole({});
      setClausoleMie([]);
      setNuovaClausola("");
      setAltreClausole(false);
      setCig(null);
      setCup(null);
      setPercentuali({});
      setValoreBeni("");
      setMetodoScelto(null);
      // Scadenza: quella della rata se è ancora da venire, se no 30 giorni.
      setScadenza(firstUnpaid?.expected_date && firstUnpaid.expected_date >= oggiIso() ? "rata" : "30");
      setDataLibera("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, installments]);

  // ── Fetch order items ────────────────────────────────────────
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["order-items-for-invoice", orderId],
    enabled: open && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, description, quantity, unit_price, vat_rate, discount_percent, position")
        .eq("order_id", orderId)
        .order("position");
      if (error) throw error;
      return (data || []) as OrderItemRow[];
    },
  });

  // ── Fetch matching anagrafica ────────────────────────────────
  const { data: matchedAnagrafica } = useQuery({
    queryKey: ["anagrafica-match", customerId, companyId],
    enabled: open && !!customerId && !!companyId,
    queryFn: async () => {
      const { data: byClienteId } = await (supabase as any)
        .from("anagrafiche_native")
        .select("*")
        .eq("company_id", companyId!)
        .eq("cliente_id", customerId!)
        .maybeSingle();
      if (byClienteId) return byClienteId;

      if (customerName) {
        const parts = customerName.trim().split(/\s+/);
        if (parts.length >= 2) {
          const { data: byName } = await (supabase as any)
            .from("anagrafiche_native")
            .select("*")
            .eq("company_id", companyId!)
            .or(`ragione_sociale.ilike.%${customerName}%,and(nome.ilike.%${parts[0]}%,cognome.ilike.%${parts[parts.length - 1]}%)`)
            .limit(1)
            .maybeSingle();
          if (byName) return byName;
        }
      }
      return null;
    },
  });

  // ── Derived data ─────────────────────────────────────────────
  const selectedInstallment = useMemo(() =>
    selectedInstId ? installments.find(i => (i.id || `pos-${i.position}`) === selectedInstId) : null,
    [installments, selectedInstId]
  );

  const quota = Math.min(100, Math.max(0, parseImporto(quotaArticoli)));
  const lordoImporto = parseImporto(importo.lordo);
  const aliquotaImporto = importo.aliquota.trim() ? Math.max(0, parseImporto(importo.aliquota)) : defaultVat;
  const percentualeImporto = contratto > 0 ? (lordoImporto / contratto) * 100 : 0;

  // Righe articolo INCLUSE (tutte tranne le escluse), con id stabile dell'articolo.
  const includedItemRighe = useMemo(
    () => orderItems.filter((it) => !excludedItemIds.has(it.id)).map((it) => buildRigaFromItem(it, defaultVat, quota)),
    [orderItems, excludedItemIds, defaultVat, quota],
  );

  const righeBase = useMemo(() => {
    const base = mode === "importo"
      ? (lordoImporto > 0 ? [buildRigaImporto(importo.descrizione, lordoImporto, aliquotaImporto)] : [])
      : includedItemRighe;
    return [...base, ...freeLines.map((fl) => freeLineToRiga(fl, defaultVat))];
  }, [mode, lordoImporto, importo.descrizione, aliquotaImporto, includedItemRighe, freeLines, defaultVat]);

  // ── Tipo di fattura e clausole ──────────────────────────────
  const profiloSuggerito = profiloDaCliente(
    matchedAnagrafica?.tipo_cliente,
    matchedAnagrafica?.ragione_sociale || customerName,
  );
  const profilo = profiloScelto ?? profiloSuggerito;
  const clausoleCatalogo = clausoleScelte ?? clausolePredefinite(profilo, defaultVat);
  const clausoleAttive = [...clausoleCatalogo, ...clausoleMie.map((c) => c.id)];
  const testoClausola = (id: string) => {
    if (clausola(id)?.effetto === "trattenuta") {
      const t = composta.trattenute.find((x) => x.id === id);
      return t ? testoTrattenuta(t) : "";
    }
    return testiClausole[id] ?? clausoleMie.find((c) => c.id === id)?.testo ?? clausola(id)?.testo ?? "";
  };

  const scegliProfilo = (p: ProfiloFattura) => {
    setProfiloScelto(p);
    setClausoleScelte(null); // le clausole tipiche del nuovo tipo
  };
  const toggleClausola = (id: string) => {
    const attuali = clausoleCatalogo;
    setClausoleScelte(attuali.includes(id) ? attuali.filter((x) => x !== id) : [...attuali, id]);
  };
  const aggiungiClausolaMia = () => {
    const testo = nuovaClausola.trim();
    if (!testo) return;
    setClausoleMie((prev) => [...prev, { id: `mia:${crypto.randomUUID()}`, testo }]);
    setNuovaClausola("");
  };

  const composta = useMemo(
    () => componiFattura(righeBase, clausoleAttive, {
      formaGiuridica: aziendaFiscale?.forma_giuridica,
      percentuali: Object.fromEntries(
        Object.entries(percentuali).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, parseImporto(v)]),
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [righeBase, clausoleAttive.join("|"), aziendaFiscale?.forma_giuridica, JSON.stringify(percentuali)],
  );
  const previewRighe = composta.righe;
  const totali = composta.totali;
  const avvisi = avvisiClausole(clausoleAttive);

  const addFreeLine = () => {
    const descrizione = draft.descrizione.trim();
    if (!descrizione) { toast.error("Scrivi una descrizione per la riga"); return; }
    setFreeLines((prev) => [...prev, {
      id: crypto.randomUUID(),
      descrizione,
      quantita: Math.max(1, parseImporto(draft.quantita) || 1),
      prezzo: Math.max(0, parseImporto(draft.prezzo)),
      aliquota: draft.aliquota.trim() ? Math.max(0, parseImporto(draft.aliquota)) : defaultVat,
    }]);
    setDraft({ descrizione: "", quantita: "1", prezzo: "", aliquota: "" });
  };
  const removeFreeLine = (id: string) => setFreeLines((prev) => prev.filter((f) => f.id !== id));
  const toggleItem = (id: string) => setExcludedItemIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // ── Create mutation ──────────────────────────────────────────
  const createMutation = useCreateDocumento();
  const linkMutation = useLinkFatturaOrdine();

  // Detrazioni fiscali edilizie + causale/note editabile (richiesta utente:
  // "permetti anche la modifica" + clausole detrazioni per l'edilizia).
  const [detrazione, setDetrazione] = useState<DetrazioneValue>(EMPTY_DETRAZIONE);

  // Commessa ripartita su più bonus: la fattura riguarda UNA pratica, quindi
  // una sola clausola. Qui la si sceglie invece di riscriverla a mano.
  const { bonusMultipli } = useBonusFiscaliFlags();
  const { data: bonusLines = [] } = useQuery({
    queryKey: ["order-bonus-lines", orderId],
    enabled: open && bonusMultipli && !!orderId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_bonus_lines")
        .select("*")
        .eq("order_id", orderId)
        .order("position");
      if (error) throw error;
      return parseBonusLines(data);
    },
  });
  const [noteOverride, setNoteOverride] = useState<string | null>(null);
  const autoNote = useMemo(() => {
    // Con una riga sola la rata e la commessa sono già nella descrizione: qui
    // basta il riferimento, senza ripetere.
    const rif = `Rif. commessa ${orderCode || ""}`.trim();
    if (mode === "importo") return rif;
    const rataLabel = selectedInstallment
      ? `${selectedInstallment.label || LABEL_MAP[selectedInstallment.type] || "Pagamento"} — `
      : "";
    return `${rataLabel}${rif} — ${orderDescription}`.trim();
  }, [mode, selectedInstallment, orderCode, orderDescription]);
  // Reset a dialog chiusa.
  useEffect(() => {
    if (!open) {
      setDetrazione(EMPTY_DETRAZIONE);
      setNoteOverride(null);
      setAnteprima(false);
    }
  }, [open]);

  // ── Il documento come uscirà (anteprima e creazione) ─────────
  const clienteSnapshot: ClienteSnapshot | undefined = matchedAnagrafica
    ? {
        ragione_sociale: matchedAnagrafica.ragione_sociale || customerName,
        nome: matchedAnagrafica.nome || undefined,
        cognome: matchedAnagrafica.cognome || undefined,
        partita_iva: matchedAnagrafica.partita_iva || undefined,
        codice_fiscale: matchedAnagrafica.codice_fiscale || undefined,
        codice_sdi: matchedAnagrafica.codice_sdi || undefined,
        pec: matchedAnagrafica.pec || undefined,
        indirizzo_via: matchedAnagrafica.indirizzo_via || undefined,
        indirizzo_cap: matchedAnagrafica.indirizzo_cap || undefined,
        indirizzo_comune: matchedAnagrafica.indirizzo_comune || undefined,
        indirizzo_provincia: matchedAnagrafica.indirizzo_provincia || undefined,
        indirizzo_nazione: matchedAnagrafica.indirizzo_nazione || "IT",
        tipo_cliente: matchedAnagrafica.tipo_cliente || "B2B",
        cig: matchedAnagrafica.cig || undefined,
        cup: matchedAnagrafica.cup || undefined,
      }
    : undefined;

  const cigFinale = (cig ?? matchedAnagrafica?.cig ?? "").trim();
  const cupFinale = (cup ?? matchedAnagrafica?.cup ?? "").trim();
  const clientePA = clienteSnapshot?.tipo_cliente === "PA";
  const mostraCigCup = profilo === "pa" || clientePA || !!cigFinale || !!cupFinale;

  const baseNote = (noteOverride ?? autoNote).trim();
  const extraNote: string[] = [];
  if (detrazione.active && detrazione.manodoperaEvidenzia && detrazione.manodoperaImporto.trim()) {
    extraNote.push(`Di cui costo manodopera: € ${detrazione.manodoperaImporto.trim()}`);
  }
  const noteDoc = [baseNote, ...extraNote].filter(Boolean).join(" — ");

  // Causale (XML) = clausola delle detrazioni + clausole scelte, nell'ordine del catalogo.
  const ordine = (id: string) => {
    const i = CLAUSOLE_FATTURA.findIndex((c) => c.id === id);
    return i < 0 ? CLAUSOLE_FATTURA.length : i;
  };
  const valoreBeniNum = Math.max(0, parseImporto(valoreBeni));
  const iva10 = clausoleAttive.includes("iva_10_recupero");
  const causaleBase = [
    ...(detrazione.active && detrazione.clausola.trim() ? [detrazione.clausola.trim()] : []),
    ...[...clausoleAttive].sort((a, b) => ordine(a) - ordine(b)).map((id) => testoClausola(id).trim()).filter(Boolean),
  ];
  // IVA 10% con beni significativi: il loro valore va scritto in fattura (art. 1 c. 19 L. 205/2017).
  const causaleArr = iva10 && valoreBeniNum > 0 ? causaliConValoreBeni(causaleBase, valoreBeniNum) : causaleBase;
  // I beni significativi hanno il 10% solo fino al valore del resto della prestazione.
  const imponibileDieci = previewRighe.filter((r) => r.aliquota_iva === "10" && !r.natura_iva).reduce((t, r) => t + r.imponibile, 0);
  const beniOltreLimite = iva10 && valoreBeniNum > 0 && valoreBeniNum > imponibileDieci - valoreBeniNum;

  // ── Pagamento ────────────────────────────────────────────────
  const metodo = metodoScelto
    ?? matchedAnagrafica?.metodo_pagamento_default
    // Colonna di anagrafica_azienda che il tipo non dichiara (come in EditorPagamentoSection).
    ?? (aziendaFiscale as { metodo_pagamento_default?: string | null } | null | undefined)?.metodo_pagamento_default
    ?? "MP05";
  const bonifico = metodo === "MP05";
  const iban = (aziendaFiscale?.iban_principale ?? "").replace(/\s+/g, "").toUpperCase();
  const dataRata = selectedInstallment?.expected_date?.slice(0, 10) || "";
  const dataScadenza =
    scadenza === "vista" ? oggiIso()
    : scadenza === "rata" ? (dataRata || piuGiorni(30))
    : scadenza === "data" ? (dataLibera || piuGiorni(30))
    : piuGiorni(Number(scadenza));
  const scadenzePagamento: ScadenzaPagamento[] = [{
    numero_rata: 1,
    data_scadenza: dataScadenza,
    importo: totali.totale_da_pagare,
    metodo_pagamento: metodo as ScadenzaPagamento["metodo_pagamento"],
    pagato: false,
  }];
  const avvisiPagamento: string[] = [];
  if (bonifico && !iban) avvisiPagamento.push("Manca l'IBAN dell'azienda: senza, il cliente non sa dove pagare.");
  if (metodo === "MP01" && totali.totale_da_pagare >= LIMITE_CONTANTI) {
    avvisiPagamento.push("In contanti si può pagare solo sotto i 5.000 € (art. 49 D.Lgs. 231/2007): scegli un altro metodo.");
  }
  if (detrazione.active && !bonifico) {
    avvisiPagamento.push("Con la detrazione fiscale il cliente deve pagare con bonifico parlante, altrimenti perde il bonus.");
  }
  if (profilo === "pa" && !bonifico && metodo !== "MP23") {
    avvisiPagamento.push("Gli enti pubblici pagano con bonifico sul conto dedicato (o PagoPA).");
  }

  const datiDocumento = {
    tipo: clientePA ? ("fattura_pa" as const) : ("fattura" as const),
    ...(clienteSnapshot && {
      cliente_snapshot: { ...clienteSnapshot, ...(cigFinale && { cig: cigFinale }), ...(cupFinale && { cup: cupFinale }) },
    }),
    ...(matchedAnagrafica?.id && { anagrafica_id: matchedAnagrafica.id }),
    righe: previewRighe,
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale,
    imponibile_totale: totali.imponibile_totale,
    iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento,
    totale_da_pagare: totali.totale_da_pagare,
    ...composta.effetti,
    ...(composta.effetti.ritenuta_acconto && { ritenuta_importo: totali.ritenuta_importo }),
    ordine_id: orderId,
    note_documento: noteDoc,
    ...(causaleArr.length > 0 && { causale: causaleArr }),
    ...(cigFinale && { cig: cigFinale }),
    ...(cupFinale && { cup: cupFinale }),
    data_scadenza: dataScadenza,
    scadenze_pagamento: scadenzePagamento,
    metodo_pagamento_codice: metodo,
    ...(bonifico && iban && {
      iban_pagamento: iban,
      ...(aziendaFiscale?.bic_swift && { bic_pagamento: aziendaFiscale.bic_swift.trim() }),
      ...(aziendaFiscale?.nome_banca && { nome_banca: aziendaFiscale.nome_banca.trim() }),
      intestatario_conto: (aziendaFiscale?.intestatario_conto || aziendaFiscale?.ragione_sociale || "").trim(),
    }),
  };

  const documentoAnteprima = {
    ...datiDocumento,
    numero: "Bozza",
    data_emissione: new Date().toISOString().slice(0, 10),
    cliente_snapshot: datiDocumento.cliente_snapshot ?? {
      ragione_sociale: customerName,
      tipo_cliente: profilo === "pa" ? "PA" : profilo === "impresa" ? "B2B" : "B2C",
    },
  } as unknown as EditorState;

  const handleCreaFattura = () => {
    // Blocca la creazione di una fattura senza righe (non emettibile).
    if (previewRighe.length === 0) {
      toast.error("Nessuna riga da fatturare", {
        description: mode === "importo"
          ? "Scrivi l'importo da fatturare o aggiungi una riga."
          : "Includi almeno un articolo o aggiungi una riga descrittiva.",
      });
      return;
    }

    createMutation.mutate(datiDocumento, {
      onSuccess: async (doc) => {
        // La rata scelta resta legata alla fattura (25/09/2026): pagata
        // l'una, pagata l'altra (collega_rata_fattura e i trigger allinea_*).
        // Prima l'id della rata si buttava dopo aver costruito la fattura.
        const rataId = selectedInstallment?.id;
        if (rataId) {
          const { error: rataErr } = await supabase.rpc("collega_rata_fattura" as never, {
            p_rata_id: rataId,
            p_documento_id: doc.id,
          } as never);
          if (rataErr) {
            toast.warning("Fattura creata, ma non collegata alla rata", { description: rataErr.message });
          }
        }
        // Crea il collegamento documento↔commessa in modo atomico prima di
        // navigare. Se il link fallisce non lasciamo la fattura "orfana"
        // senza avvisare l'utente (stesso pattern di CreaDDTDialog).
        if (companyId) {
          try {
            await linkMutation.mutateAsync({
              fatturaId: doc.id,
              ordineId: orderId,
              importoAssociato: totali.totale_documento,
              companyId,
            });
          } catch (err) {
            toast.error("Fattura creata ma collegamento commessa fallito", {
              description:
                err instanceof Error ? err.message : "Apri il documento e riprova dal dettaglio.",
            });
            onOpenChange(false);
            navigate(`/azienda/documenti/${doc.id}?ordine_link=${orderId}`);
            return;
          }
        }
        onOpenChange(false);
        navigate(`/azienda/documenti/${doc.id}?ordine_link=${orderId}`);
      },
    });
  };

  const clausoleDelTipo = clausolePerProfilo(profilo);
  const clausoleAltre = CLAUSOLE_FATTURA.filter((c) => !c.profili.includes(profilo));
  const altreAttive = clausoleAltre.filter((c) => clausoleCatalogo.includes(c.id)).length;
  const sectionTitle = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";

  const rigaClausola = (id: string, titolo: string, aiuto?: string, rimuovibile = false) => {
    const attiva = clausoleAttive.includes(id);
    const testo = testoClausola(id);
    const c = clausola(id);
    return (
      <div key={id} className={`px-3 py-2 space-y-1.5 ${attiva ? "" : "opacity-70"}`}>
        <div className="flex items-start gap-2">
          {rimuovibile ? (
            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          ) : (
            <Checkbox id={`cl-${id}`} checked={attiva} onCheckedChange={() => toggleClausola(id)} className="mt-0.5" />
          )}
          <label htmlFor={`cl-${id}`} className="flex-1 min-w-0 cursor-pointer">
            <span className="text-xs font-medium">{titolo}</span>
            {c?.effetto && (
              <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                {c.effetto === "ritenuta_condominio" ? "cambia il netto da pagare" : c.effetto === "trattenuta" ? "cambia l'importo" : "cambia l'IVA"}
              </span>
            )}
            {aiuto && <span className="block text-[11px] text-muted-foreground leading-snug">{aiuto}</span>}
          </label>
          {rimuovibile && (
            <button
              type="button"
              onClick={() => setClausoleMie((prev) => prev.filter((x) => x.id !== id))}
              className="text-muted-foreground hover:text-red-600"
              title="Togli la clausola"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {attiva && c?.effetto === "trattenuta" && (
          <div className="ml-6 space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Percentuale
              <Input
                value={percentuali[id] ?? String(c.percentuale ?? "").replace(".", ",")}
                onChange={(e) => setPercentuali((prev) => ({ ...prev, [id]: e.target.value }))}
                inputMode="decimal"
                className="h-6 w-16 text-[11px] text-right tabular-nums px-1.5"
              />
              %
            </label>
            {testo && <p className="text-[11px] leading-snug rounded bg-muted/40 px-2 py-1.5">{testo}</p>}
          </div>
        )}
        {attiva && id === "iva_10_recupero" && (
          <div className="ml-6 space-y-1">
            <label className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              Valore dei beni significativi in questa fattura (infissi, sanitari, caldaie, climatizzatori…)
              <Input
                value={valoreBeni}
                onChange={(e) => setValoreBeni(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-6 w-28 text-[11px] text-right tabular-nums px-1.5"
              />
              €
            </label>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Obbligatorio indicarlo se ce ne sono (art. 1, c. 19, L. 205/2017): la frase va in fattura da sola.
            </p>
            {beniOltreLimite && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                I beni superano il resto della prestazione: la parte in più va al 22% (DM 29/12/1999).
                Dividila nell'editor con «Beni significativi».
              </p>
            )}
          </div>
        )}
        {attiva && (c ? c.testo !== "" && c.effetto !== "trattenuta" : true) && (
          <Textarea
            value={testo}
            onChange={(e) => setTestiClausole((prev) => ({ ...prev, [id]: e.target.value }))}
            rows={2}
            className="text-xs ml-6 w-[calc(100%-1.5rem)]"
            maxLength={600}
          />
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Crea fattura da commessa {orderCode}
          </DialogTitle>
          <DialogDescription>
            Scegli la rata e <strong>quanto fatturare</strong> (l'importo si cambia), il <strong>tipo di cliente</strong> con
            le sue clausole, e guarda l'anteprima prima di creare la bozza.
          </DialogDescription>
        </DialogHeader>

        {/* ── Cliente e tipo di fattura ───────────────────── */}
        <div className="rounded-lg bg-muted/50 border p-3 space-y-3">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{customerName}</p>
              {matchedAnagrafica ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Check className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-700 dark:text-green-400">
                    Anagrafica trovata
                    {matchedAnagrafica.partita_iva && ` · P.IVA ${matchedAnagrafica.partita_iva}`}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-amber-600">
                  Anagrafica non trovata — potrai selezionarla nell'editor
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Tipo di fattura</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PROFILI_FATTURA.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => scegliProfilo(p.id)}
                  title={p.aiuto}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    profilo === p.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted/40 border-border text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {PROFILI_FATTURA.find((p) => p.id === profilo)?.aiuto}
              {profiloScelto === null && matchedAnagrafica && " Proposto dall'anagrafica."}
            </p>
          </div>
        </div>

        {/* ── Rata di riferimento ─────────────────────────── */}
        {installments.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className={sectionTitle}>Rata di riferimento</p>
              <div className="flex flex-wrap gap-2">
                {installments.map((inst) => {
                  const key = inst.id || `pos-${inst.position}`;
                  const isSelected = selectedInstId === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (isSelected) { setSelectedInstId(null); return; }
                        setSelectedInstId(key);
                        applicaRata(inst);
                        setMode("importo");
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : inst.is_paid
                          ? "bg-muted/40 text-muted-foreground border-muted"
                          : "bg-background hover:bg-muted/30 border-border"
                      }`}
                    >
                      {inst.label || LABEL_MAP[inst.type] || "Pagamento"}
                      <span className="tabular-nums">{fmt(inst.amount || 0)}</span>
                      {inst.is_paid && (
                        <Check className={`h-3 w-3 ml-0.5 ${isSelected ? "" : "text-green-600"}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedInstallment?.is_paid && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Questa rata risulta già pagata.
                </p>
              )}
            </div>
          </>
        )}

        <Separator />

        {/* ── Cosa fatturi ─────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`${sectionTitle} flex items-center gap-1.5`}>
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Cosa fatturi ({previewRighe.length} {previewRighe.length === 1 ? "riga" : "righe"})
            </p>
            <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setMode("importo")}
                className={`text-xs px-2.5 py-1 rounded ${mode === "importo" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
              >
                <Receipt className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                Un importo
              </button>
              <button
                type="button"
                onClick={() => setMode("articoli")}
                disabled={orderItems.length === 0}
                className={`text-xs px-2.5 py-1 rounded disabled:opacity-40 ${mode === "articoli" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
              >
                <Package className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                Gli articoli
              </button>
            </div>
          </div>

          {itemsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Una riga a corpo: l'importo della rata, che si cambia in € o in %. */}
              {mode === "importo" && (
                <div className="rounded-lg border p-3 space-y-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="fatt-imp-desc" className="text-[11px] text-muted-foreground">Descrizione della riga</Label>
                    <Input
                      id="fatt-imp-desc"
                      value={importo.descrizione}
                      onChange={(e) => setImporto((s) => ({ ...s, descrizione: e.target.value }))}
                      placeholder="Es. SAL n. 2 — lavori eseguiti al 15/11"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1">
                      <Label htmlFor="fatt-imp-lordo" className="text-[11px] text-muted-foreground">Importo IVA inclusa</Label>
                      <Input
                        id="fatt-imp-lordo"
                        value={importo.lordo}
                        onChange={(e) => setImporto((s) => ({ ...s, lordo: e.target.value }))}
                        inputMode="decimal"
                        className="h-8 text-xs text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fatt-imp-perc" className="text-[11px] text-muted-foreground">% del contratto</Label>
                      <Input
                        id="fatt-imp-perc"
                        value={percScritta ?? (contratto > 0 ? scriviPercentuale(percentualeImporto) : "")}
                        onChange={(e) => {
                          setPercScritta(e.target.value);
                          const p = parseImporto(e.target.value);
                          setImporto((s) => ({ ...s, lordo: scriviImporto((contratto * p) / 100) }));
                        }}
                        onBlur={() => setPercScritta(null)}
                        disabled={contratto <= 0}
                        inputMode="decimal"
                        className="h-8 text-xs text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fatt-imp-iva" className="text-[11px] text-muted-foreground">IVA %</Label>
                      <Input
                        id="fatt-imp-iva"
                        value={importo.aliquota}
                        onChange={(e) => setImporto((s) => ({ ...s, aliquota: e.target.value }))}
                        inputMode="decimal"
                        className="h-8 text-xs text-right tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Contratto {fmt(contratto)}
                      {selectedInstallment && (
                        <> · rata prevista {fmt(selectedInstallment.amount || 0)}
                          {contratto > 0 && ` (${scriviPercentuale(((selectedInstallment.amount || 0) / contratto) * 100)}%)`}</>
                      )}
                    </span>
                    {selectedInstallment && round2(lordoImporto) !== round2(selectedInstallment.amount || 0) && (
                      <button
                        type="button"
                        onClick={() => applicaRata(selectedInstallment)}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" /> Torna all'importo della rata
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Articoli della commessa: spunta cosa mettere in fattura e a che quota. */}
              {mode === "articoli" && orderItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-muted/60">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Package className="h-3 w-3" /> Articoli · {includedItemRighe.length}/{orderItems.length} in fattura
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Per fatturare un SAL sugli articoli: ogni articolo al X%">
                        Quota
                        <Input
                          value={quotaArticoli}
                          onChange={(e) => setQuotaArticoli(e.target.value)}
                          inputMode="decimal"
                          className="h-6 w-14 text-[11px] text-right tabular-nums px-1.5"
                        />
                        %
                      </label>
                      <button type="button" className="text-[10px] font-medium text-primary hover:underline" onClick={() => setExcludedItemIds(new Set())}>Tutti</button>
                      <button type="button" className="text-[10px] font-medium text-muted-foreground hover:underline" onClick={() => setExcludedItemIds(new Set(orderItems.map((i) => i.id)))}>Nessuno</button>
                    </div>
                  </div>
                  <div className="divide-y max-h-56 overflow-auto">
                    {orderItems.map((item) => {
                      const riga = composta.righe.find((r) => r.id === item.id)
                        ?? componiFattura([buildRigaFromItem(item, defaultVat, quota)], clausoleAttive).righe[0];
                      const included = !excludedItemIds.has(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`grid grid-cols-[22px_1fr_44px_84px_40px_84px] gap-1 px-3 py-2 text-xs items-start cursor-pointer transition-colors hover:bg-muted/30 ${included ? "" : "opacity-45"}`}
                        >
                          <Checkbox checked={included} onCheckedChange={() => toggleItem(item.id)} className="mt-0.5" />
                          <span className="leading-tight line-clamp-2">{riga.descrizione}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.quantita}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{fmt(riga.prezzo_unitario)}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.aliquota_iva}%</span>
                          <span className="text-right tabular-nums font-medium">{fmt(riga.totale_riga)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Trattenute a garanzia: righe in negativo, calcolate dalle clausole */}
              {previewRighe.some((r) => r.id.startsWith("trattenuta-")) && (
                <div className="rounded-lg border border-dashed divide-y">
                  {previewRighe.filter((r) => r.id.startsWith("trattenuta-")).map((r) => (
                    <div key={r.id} className="grid grid-cols-[1fr_40px_84px] gap-1 px-3 py-2 text-xs items-center">
                      <span className="leading-tight">{r.descrizione}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{r.natura_iva ? "0" : r.aliquota_iva}%</span>
                      <span className="text-right tabular-nums font-medium text-red-600 dark:text-red-400">{fmt(r.totale_riga)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Righe descrittive LIBERE (prestazioni/servizi senza articolo) */}
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListPlus className="h-3 w-3" /> Righe in più (prestazioni, servizi, extra)
                </div>
                {freeLines.length > 0 && (
                  <div className="divide-y">
                    {freeLines.map((fl) => {
                      const riga = composta.righe.find((r) => r.id === fl.id);
                      if (!riga) return null;
                      return (
                        <div key={fl.id} className="grid grid-cols-[1fr_44px_84px_40px_84px_26px] gap-1 px-3 py-2 text-xs items-center">
                          <span className="leading-tight line-clamp-2">{riga.descrizione}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.quantita}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{fmt(riga.prezzo_unitario)}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{riga.aliquota_iva}%</span>
                          <span className="text-right tabular-nums font-medium">{fmt(riga.totale_riga)}</span>
                          <button type="button" onClick={() => removeFreeLine(fl.id)} className="justify-self-end text-muted-foreground hover:text-red-600" title="Rimuovi riga">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] sm:grid-cols-[1fr_52px_80px_52px_auto] gap-1.5 border-t bg-background p-2 items-center">
                  <Input
                    value={draft.descrizione}
                    onChange={(e) => setDraft((d) => ({ ...d, descrizione: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFreeLine(); } }}
                    placeholder="Descrizione (es. Opere extra, Sopralluogo…)"
                    className="h-8 text-xs col-span-4 sm:col-span-1"
                  />
                  <Input value={draft.quantita} onChange={(e) => setDraft((d) => ({ ...d, quantita: e.target.value }))} inputMode="decimal" placeholder="Qtà" className="h-8 text-xs text-right" title="Quantità" />
                  <Input value={draft.prezzo} onChange={(e) => setDraft((d) => ({ ...d, prezzo: e.target.value }))} inputMode="decimal" placeholder="Prezzo" className="h-8 text-xs text-right" title="Prezzo unitario (netto IVA)" />
                  <Input value={draft.aliquota} onChange={(e) => setDraft((d) => ({ ...d, aliquota: e.target.value }))} inputMode="decimal" placeholder={`${defaultVat}`} className="h-8 text-xs text-right" title="Aliquota IVA %" />
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={addFreeLine}>
                    <Plus className="h-3.5 w-3.5" /> Aggiungi
                  </Button>
                </div>
              </div>

              {/* Avviso fattura vuota */}
              {previewRighe.length === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    {mode === "importo"
                      ? "Scrivi l'importo da fatturare o aggiungi una riga."
                      : "Nessuna riga selezionata: includi almeno un articolo o aggiungi una riga."}
                  </span>
                </div>
              )}

              {/* Totali, con gli effetti delle clausole */}
              {previewRighe.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-0.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Imponibile</span>
                    <span className="tabular-nums">{fmt(totali.imponibile_totale)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{previewRighe.some((r) => r.natura_iva?.startsWith("N6")) ? "IVA (inversione contabile)" : "IVA"}</span>
                    <span className="tabular-nums">{fmt(totali.iva_totale)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-dashed">
                    <span>Totale fattura</span>
                    <span className="tabular-nums text-primary">{fmt(totali.totale_documento)}</span>
                  </div>
                  {composta.effetti.esigibilita_iva === "S" && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>IVA versata dall'ente (split payment)</span>
                      <span className="tabular-nums">−{fmt(totali.iva_totale)}</span>
                    </div>
                  )}
                  {totali.ritenuta_importo > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Ritenuta del 4% (condominio)</span>
                      <span className="tabular-nums">−{fmt(totali.ritenuta_importo)}</span>
                    </div>
                  )}
                  {round2(totali.totale_da_pagare) !== round2(totali.totale_documento) && (
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Il cliente ti paga</span>
                      <span className="tabular-nums">{fmt(totali.totale_da_pagare)}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Clausole ─────────────────────────────────────── */}
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={`${sectionTitle} flex items-center gap-1.5`}>
              <Scale className="h-3.5 w-3.5" /> Clausole in fattura ({causaleArr.length})
            </p>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">Vanno nell'XML e nel PDF; il testo si cambia.</span>
          </div>

          <div className="rounded-lg border divide-y">
            {clausoleDelTipo.map((c) => rigaClausola(c.id, c.titolo, c.aiuto))}
            {clausoleMie.map((c) => rigaClausola(c.id, "Clausola aggiunta da te", undefined, true))}
            <div className="flex gap-1.5 p-2">
              <Input
                value={nuovaClausola}
                onChange={(e) => setNuovaClausola(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiClausolaMia(); } }}
                placeholder="Scrivi una clausola tua (es. Penale per ritardo, Collaudo entro…)"
                className="h-8 text-xs"
              />
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1 shrink-0" onClick={aggiungiClausolaMia}>
                <Plus className="h-3.5 w-3.5" /> Aggiungi
              </Button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAltreClausole((v) => !v)}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            {altreClausole ? "Nascondi" : "Mostra"} le clausole degli altri tipi ({clausoleAltre.length}
            {altreAttive > 0 && `, ${altreAttive} spuntate`})
          </button>
          {altreClausole && (
            <div className="rounded-lg border divide-y">
              {clausoleAltre.map((c) => rigaClausola(c.id, c.titolo, c.aiuto))}
            </div>
          )}

          {avvisi.map((a) => (
            <p key={a} className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {a}
            </p>
          ))}

          {mostraCigCup && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="fatt-cig" className="text-[11px] text-muted-foreground">CIG</Label>
                  <Input id="fatt-cig" value={cig ?? matchedAnagrafica?.cig ?? ""} onChange={(e) => setCig(e.target.value.toUpperCase())} maxLength={15} className="h-8 text-xs font-mono" placeholder="Codice identificativo gara" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fatt-cup" className="text-[11px] text-muted-foreground">CUP</Label>
                  <Input id="fatt-cup" value={cup ?? matchedAnagrafica?.cup ?? ""} onChange={(e) => setCup(e.target.value.toUpperCase())} maxLength={15} className="h-8 text-xs font-mono" placeholder="Codice unico di progetto" />
                </div>
              </div>
              {profilo === "pa" && !cigFinale && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Per un appalto pubblico il CIG in fattura è obbligatorio: senza, l'ente non può pagarla.
                </p>
              )}
              {profilo === "pa" && matchedAnagrafica && !clientePA && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  In anagrafica il cliente non è segnato come Pubblica Amministrazione: la fattura partirà come
                  fattura tra privati. Correggi l'anagrafica (tipo cliente e codice univoco ufficio di 6 caratteri).
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Pagamento: va nell'XML (DatiPagamento) e nel PDF ── */}
        <Separator />
        <div className="space-y-2">
          <p className={`${sectionTitle} flex items-center gap-1.5`}>
            <Landmark className="h-3.5 w-3.5" /> Pagamento
          </p>
          <div className="rounded-lg border p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Come</Label>
                <Select value={metodo} onValueChange={setMetodoScelto}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...new Set<string>([...METODI_PROPOSTI, metodo])].map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {METODI_PAGAMENTO_SDI[m as keyof typeof METODI_PAGAMENTO_SDI] ?? m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Entro</Label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["vista", "Vista fattura"],
                    ["30", "30 giorni"],
                    ["60", "60 giorni"],
                    ["90", "90 giorni"],
                    ...(dataRata ? [["rata", `Data della rata · ${dataIt(dataRata)}`]] : []),
                    ["data", "Altra data"],
                  ] as Array<[Scadenza, string]>).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setScadenza(k)}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                        scadenza === k ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted/40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  {scadenza === "data" && (
                    <Input
                      type="date"
                      value={dataLibera}
                      onChange={(e) => setDataLibera(e.target.value)}
                      className="h-7 w-36 text-[11px]"
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">
                {fmt(totali.totale_da_pagare)} entro il {dataIt(dataScadenza)}
                {bonifico && iban && <> · IBAN <span className="font-mono text-foreground">{iban.replace(/(.{4})/g, "$1 ").trim()}</span></>}
              </span>
              {bonifico && !iban && (
                <Link to="/azienda/impostazioni/fatturazione" className="font-medium text-primary hover:underline">
                  Aggiungi l'IBAN nelle impostazioni
                </Link>
              )}
            </div>
            {avvisiPagamento.map((a) => (
              <p key={a} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {a}
              </p>
            ))}
          </div>
        </div>

        {/* Causale editabile + detrazioni fiscali edilizie */}
        <Separator />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fattura-note" className={sectionTitle}>
              Note in fattura
            </Label>
            <Textarea
              id="fattura-note"
              value={noteOverride ?? autoNote}
              onChange={(e) => setNoteOverride(e.target.value)}
              rows={2}
              className="text-xs"
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              Righe, importi e clausole si possono ancora cambiare nell'editor che si apre dopo la creazione.
            </p>
          </div>
          {bonusLines.length > 0 && (
            <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2">
              <p className="text-xs font-semibold">A quale pratica si riferisce questa fattura?</p>
              <p className="text-[11px] text-muted-foreground">
                La commessa è divisa su {bonusLines.length} agevolazioni: scegline una e la clausola
                si compila da sola.
              </p>
              <div className="flex flex-wrap gap-2">
                {bonusLines.map((l) => {
                  const preset = getPreset(l.presetId);
                  const attiva = detrazione.active && detrazione.presetId === l.presetId;
                  return (
                    <Button
                      key={l.position}
                      type="button"
                      size="sm"
                      variant={attiva ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() =>
                        setDetrazione({
                          ...detrazione,
                          active: true,
                          presetId: l.presetId,
                          clausola: l.causale?.trim() || preset?.clausola || causaleBonificoParlante(l),
                          manodoperaEvidenzia:
                            detrazione.manodoperaEvidenzia || !!preset?.manodoperaConsigliata,
                        })
                      }
                    >
                      {l.label || preset?.label || "Agevolazione"} · {fmt(l.imponibile)}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          {(profilo === "privato" || profilo === "condominio" || detrazione.active || bonusLines.length > 0) && (
            <DetrazioniFiscaliFields value={detrazione} onChange={setDetrazione} />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setAnteprima(true)}
            disabled={previewRighe.length === 0}
            className="gap-1.5"
          >
            <Eye className="h-4 w-4" /> Anteprima
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleCreaFattura}
              disabled={createMutation.isPending || previewRighe.length === 0}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Receipt className="h-4 w-4 mr-1.5" />
              )}
              {createMutation.isPending
                ? "Creazione in corso..."
                : `Crea fattura · ${fmt(totali.totale_documento)}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Come esce: lo stesso foglio del PDF. */}
      <Dialog open={anteprima} onOpenChange={setAnteprima}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-medium">Anteprima — come la riceverà il cliente</DialogTitle>
            <DialogDescription className="text-xs">
              La bozza non è ancora creata: numero e data li assegna l'emissione.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/30 p-4 sm:p-6 flex justify-center">
            <PreviewFattura
              documento={documentoAnteprima}
              azienda={aziendaFiscale ?? null}
              logoAziendale={effectiveCompany?.logo_url}
              scale={0.85}
            />
          </div>
          <DialogFooter className="px-4 py-3 border-t shrink-0">
            <Button variant="outline" onClick={() => setAnteprima(false)}>Torna a modificare</Button>
            <Button
              onClick={() => { setAnteprima(false); handleCreaFattura(); }}
              disabled={createMutation.isPending}
            >
              <Receipt className="h-4 w-4 mr-1.5" /> Crea fattura · {fmt(totali.totale_documento)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
