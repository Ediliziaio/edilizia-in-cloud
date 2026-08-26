import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Package,
  Wrench,
  Truck,
  Ruler,
  Hash,
  MessageSquare,
  HelpCircle,
  Lightbulb,
  UserRound,
  Users,
  HardHat,
  Sparkles,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface OrderError {
  id: string;
  error_type: string;
  error_category: string;
  amount: number;
  description: string;
  error_date: string;
  created_at: string;
}

interface OrderErrorsProps {
  orderId: string;
}

const ERROR_TYPES = [
  { value: "merce", label: "Merce", icon: Package, description: "Errore ordinazione materiale", tone: "border-blue-100 bg-blue-50/70 text-blue-800" },
  { value: "fornitura", label: "Fornitura", icon: Truck, description: "Problema fornitore o materiale ricevuto", tone: "border-orange-100 bg-orange-50/70 text-orange-800" },
  { value: "logistica", label: "Logistica", icon: Truck, description: "Ritardo, trasporto o danno in consegna", tone: "border-cyan-100 bg-cyan-50/70 text-cyan-800" },
  { value: "manodopera", label: "Manodopera", icon: HardHat, description: "Errore lavorazione", tone: "border-purple-100 bg-purple-50/70 text-purple-800" },
  { value: "esecuzione", label: "Esecuzione", icon: Wrench, description: "Errore operativo in cantiere", tone: "border-red-100 bg-red-50/70 text-red-800" },
];

const ERROR_CATEGORIES = [
  { value: "fornitore", label: "Errore fornitore", icon: Truck, color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "misura", label: "Errore misura", icon: Ruler, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "quantita", label: "Errore quantità", icon: Hash, color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "lavorazione", label: "Errore lavorazione", icon: Wrench, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "comunicazione", label: "Errore comunicazione", icon: MessageSquare, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "difetto_prodotto", label: "Difetto prodotto", icon: Package, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "difetto_materiale", label: "Difetto materiale", icon: Package, color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "danno_materiale", label: "Danno materiale", icon: Package, color: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
  { value: "ritardo", label: "Ritardo", icon: Truck, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "altro", label: "Altro", icon: HelpCircle, color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
];

const TYPE_ALIASES: Record<string, string> = {
  merce: "merce",
  materiale: "merce",
  fornitura: "fornitura",
  fornitore: "fornitura",
  logistica: "logistica",
  trasporto: "logistica",
  manodopera: "manodopera",
  esecuzione: "esecuzione",
  lavorazione: "esecuzione",
};

const CATEGORY_ALIASES: Record<string, string> = {
  fornitore: "fornitore",
  errore_fornitore: "fornitore",
  misura: "misura",
  misure: "misura",
  errore_misura: "misura",
  errore_misure: "misura",
  quantita: "quantita",
  errore_quantita: "quantita",
  lavorazione: "lavorazione",
  errore_lavorazione: "lavorazione",
  comunicazione: "comunicazione",
  errore_comunicazione: "comunicazione",
  difetto_prodotto: "difetto_prodotto",
  prodotto_difettoso: "difetto_prodotto",
  difetto_materiale: "difetto_materiale",
  materiale_difettoso: "difetto_materiale",
  danno_materiale: "danno_materiale",
  danni_materiale: "danno_materiale",
  danni: "danno_materiale",
  ritardo: "ritardo",
  ritardi: "ritardo",
};

const CATEGORY_BY_TYPE: Record<string, string[]> = {
  merce: ["misura", "quantita", "difetto_materiale", "danno_materiale", "altro"],
  fornitura: ["fornitore", "difetto_prodotto", "difetto_materiale", "ritardo", "altro"],
  logistica: ["ritardo", "danno_materiale", "comunicazione", "altro"],
  manodopera: ["lavorazione", "misura", "danno_materiale", "altro"],
  esecuzione: ["lavorazione", "misura", "comunicazione", "danno_materiale", "altro"],
};

const DESCRIPTION_TEMPLATES: Record<string, string[]> = {
  fornitore: [
    "Materiale consegnato non conforme rispetto all'ordine.",
    "Fornitore da verificare per costo extra su commessa.",
  ],
  misura: [
    "Misura non coerente con rilievo iniziale, necessaria correzione.",
    "Errore misura rilevato prima/durante posa.",
  ],
  quantita: [
    "Quantità ordinata o consegnata non corretta.",
    "Materiale mancante rispetto al fabbisogno commessa.",
  ],
  lavorazione: [
    "Lavorazione da rifare o correggere in cantiere.",
    "Tempo/costo extra per errore operativo di esecuzione.",
  ],
  comunicazione: [
    "Passaggio informazioni non chiaro tra commerciale, ufficio e cantiere.",
    "Dato operativo comunicato in ritardo o incompleto.",
  ],
  difetto_prodotto: [
    "Prodotto difettoso da contestare al fornitore.",
    "Elemento ricevuto non utilizzabile senza sostituzione.",
  ],
  difetto_materiale: [
    "Materiale difettoso o non conforme alla posa.",
    "Materiale da sostituire con impatto economico sulla commessa.",
  ],
  danno_materiale: [
    "Materiale danneggiato in trasporto, deposito o cantiere.",
    "Danno materiale da documentare con foto/DDT.",
  ],
  ritardo: [
    "Ritardo fornitura/consegna con impatto su pianificazione lavori.",
    "Slittamento operativo causato da disponibilità materiale.",
  ],
  altro: [
    "Anomalia da classificare con verifica responsabile.",
  ],
};

type ActorOption = {
  id: string;
  name: string;
  role: "venditore" | "operaio" | "subappaltatore" | "fornitore";
};

const ROOT_CAUSES = [
  { value: "rilievo_misure", label: "Rilievo o misure errate", hint: "errore nato prima dell'ordine o in fase tecnica" },
  { value: "ordine_materiale", label: "Ordine materiale errato", hint: "articolo, quantità, variante o codice non corretti" },
  { value: "materiale_non_conforme", label: "Materiale non conforme", hint: "merce difettosa, diversa o incompleta" },
  { value: "ritardo_fornitura", label: "Ritardo fornitura/consegna", hint: "slittamento lavori per tempi esterni" },
  { value: "danno_trasporto", label: "Danno trasporto/deposito", hint: "danno prima della posa o in movimentazione" },
  { value: "errore_posa", label: "Errore posa/lavorazione", hint: "rifacimento o correzione in cantiere" },
  { value: "comunicazione", label: "Comunicazione incompleta", hint: "informazione persa tra commerciale, ufficio, cantiere" },
  { value: "pianificazione", label: "Pianificazione non corretta", hint: "squadra, data o sequenza lavori non coerente" },
  { value: "altro", label: "Altro da verificare", hint: "causa non ancora chiara" },
];

const PROCESS_ORIGINS = [
  { value: "commerciale", label: "Commerciale / venditore" },
  { value: "ufficio_tecnico", label: "Ufficio tecnico / rilievo" },
  { value: "fornitore", label: "Fornitore" },
  { value: "logistica", label: "Logistica / trasporto" },
  { value: "cantiere", label: "Cantiere / posa" },
  { value: "subappalto", label: "Subappalto" },
  { value: "cliente", label: "Cliente / variazione richiesta" },
  { value: "da_verificare", label: "Da verificare" },
];

const OWNER_ROLES = [
  { value: "fornitore", label: "Fornitore da verificare" },
  { value: "venditore", label: "Venditore/tecnico da verificare" },
  { value: "operaio", label: "Operaio/squadra da verificare" },
  { value: "subappaltatore", label: "Subappaltatore da verificare" },
  { value: "ufficio", label: "Ufficio interno da verificare" },
  { value: "da_assegnare", label: "Da assegnare dopo verifica" },
];

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/[ -]+/g, "_");
}

function normalizeType(value: string | null | undefined) {
  return TYPE_ALIASES[normalizeKey(value)] ?? "merce";
}

function normalizeCategory(value: string | null | undefined) {
  return CATEGORY_ALIASES[normalizeKey(value)] ?? "altro";
}

function parseAmount(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function getSeverityLabel(value: number) {
  if (value >= 1000) return { label: "Critica", color: "text-red-700 bg-red-50 border-red-200" };
  if (value >= 300) return { label: "Da presidiare", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (value > 0) return { label: "Minore", color: "text-slate-700 bg-slate-50 border-slate-200" };
  return { label: "Non calcolata", color: "text-slate-500 bg-slate-50 border-slate-200" };
}

function getRecommendedResponsibility(type: string, category: string) {
  if (["fornitura", "merce"].includes(type) || ["fornitore", "difetto_prodotto", "difetto_materiale", "ritardo"].includes(category)) {
    return "Fornitore";
  }
  if (type === "logistica" || category === "danno_materiale") return "Fornitore / Subappaltatore";
  if (["manodopera", "esecuzione"].includes(type) || category === "lavorazione") return "Operaio / Subappaltatore";
  if (["misura", "quantita", "comunicazione"].includes(category)) return "Venditore / tecnico interno";
  return "Da assegnare";
}

function getOptionLabel(options: { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function suggestAnomalyFromText(text: string) {
  const value = text.toLowerCase();
  if (/(rotto|rotta|dannegg|crep|scheggi|trasport|consegna)/.test(value)) {
    return {
      type: "logistica",
      category: "danno_materiale",
      rootCause: "danno_trasporto",
      origin: "logistica",
      owner: "fornitore",
      action: "Raccogli foto, verifica DDT e apri reclamo al fornitore/logistica.",
    };
  }
  if (/(ritard|non arriv|consegna in ritardo|slitt)/.test(value)) {
    return {
      type: "logistica",
      category: "ritardo",
      rootCause: "ritardo_fornitura",
      origin: "logistica",
      owner: "fornitore",
      action: "Verifica lead time promesso, sollecita fornitore e aggiorna pianificazione lavori.",
    };
  }
  if (/(misur|rilievo|quota|dimension)/.test(value)) {
    return {
      type: "merce",
      category: "misura",
      rootCause: "rilievo_misure",
      origin: "ufficio_tecnico",
      owner: "venditore",
      action: "Rivedi rilievo, tolleranze e approvazione misure prima del riordino.",
    };
  }
  if (/(quantit|manca|mancante|pezzi|ordine sbagliato|codice)/.test(value)) {
    return {
      type: "merce",
      category: "quantita",
      rootCause: "ordine_materiale",
      origin: "commerciale",
      owner: "venditore",
      action: "Controlla distinta materiali, codice articolo e quantità ordinate.",
    };
  }
  if (/(posa|posat|lavoraz|rifare|correggere|cantiere)/.test(value)) {
    return {
      type: "esecuzione",
      category: "lavorazione",
      rootCause: "errore_posa",
      origin: "cantiere",
      owner: "operaio",
      action: "Aggiorna checklist posa e assegna verifica tecnica sul rifacimento.",
    };
  }
  if (/(comunic|informaz|detto|mail|whatsapp|passaggio)/.test(value)) {
    return {
      type: "esecuzione",
      category: "comunicazione",
      rootCause: "comunicazione",
      origin: "commerciale",
      owner: "ufficio",
      action: "Ricostruisci il passaggio informazioni e definisci un punto unico di conferma.",
    };
  }
  return {
    type: "merce",
    category: "altro",
    rootCause: "altro",
    origin: "da_verificare",
    owner: "da_assegnare",
    action: "Completa la verifica e assegna un responsabile confermato.",
  };
}

export function OrderErrors({ orderId }: OrderErrorsProps) {
  const { user, effectiveCompany } = useAuth();
  
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorType, setErrorType] = useState("merce");
  const [errorCategory, setErrorCategory] = useState("altro");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [errorDate, setErrorDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [rootCause, setRootCause] = useState("altro");
  const [processOrigin, setProcessOrigin] = useState("da_verificare");
  const [ownerRole, setOwnerRole] = useState("da_assegnare");
  const [correctiveAction, setCorrectiveAction] = useState("");

  // Il registro errori vale come strumento aziendale, non di singola
  // commessa: il costo annuo dell'errore ripetuto e DOVE nasce di più.
  // L'ancora temporale sta nella queryFn (niente date nel render).
  const { data: registroAnnuale } = useQuery({
    queryKey: ["errori-azienda-12m", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const unAnnoFa = new Date();
      unAnnoFa.setFullYear(unAnnoFa.getFullYear() - 1);
      const { data, error } = await supabase
        .from("order_errors")
        .select("amount, process_origin")
        .eq("company_id", effectiveCompany!.id)
        .gte("error_date", unAnnoFa.toLocaleDateString("en-CA"))
        .limit(2000);
      if (error) throw error;
      const righe = data ?? [];
      const perOrigine = new Map<string, number>();
      let totale = 0;
      for (const r of righe) {
        const importo = Number(r.amount) || 0;
        totale += importo;
        const chiave = r.process_origin || "da_verificare";
        perOrigine.set(chiave, (perOrigine.get(chiave) ?? 0) + importo);
      }
      let top: { origine: string; costo: number } | null = null;
      for (const [origine, costo] of perOrigine) {
        if (!top || costo > top.costo) top = { origine, costo };
      }
      return { totale, conteggio: righe.length, top };
    },
  });

  const { data: errors = [] } = useQuery({
    queryKey: ["order-errors", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_errors")
        .select("*")
        .eq("order_id", orderId)
        .order("error_date", { ascending: false });
      if (error) throw error;
      return data as OrderError[];
    },
    enabled: !!orderId,
  });

  const { data: actors = [], isFetching: isFetchingActors } = useQuery({
    queryKey: ["order-error-context", orderId],
    queryFn: async (): Promise<ActorOption[]> => {
      const [salespeopleRes, employeesRes, teamsRes, itemsRes] = await Promise.all([
        supabase
          .from("order_salespeople")
          .select("salesperson_id, salesperson:salespeople(id, first_name, last_name)")
          .eq("order_id", orderId),
        supabase
          .from("order_employees")
          .select("employee_id, employee:employees(id, first_name, last_name)")
          .eq("order_id", orderId),
        supabase
          .from("order_external_teams")
          .select("external_team_id, external_team:external_teams(id, name)")
          .eq("order_id", orderId),
        supabase
          .from("order_items")
          .select("supplier_id, supplier:suppliers(id, name)")
          .eq("order_id", orderId),
      ]);

      const firstError = [salespeopleRes.error, employeesRes.error, teamsRes.error, itemsRes.error].find(Boolean);
      if (firstError) throw firstError;

      const map = new Map<string, ActorOption>();
      const add = (actor: ActorOption) => map.set(`${actor.role}:${actor.id}`, actor);

      (salespeopleRes.data ?? []).forEach((row: any) => {
        const person = row.salesperson;
        if (!person) return;
        add({
          id: row.salesperson_id,
          role: "venditore",
          name: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "Venditore senza nome",
        });
      });
      (employeesRes.data ?? []).forEach((row: any) => {
        const person = row.employee;
        if (!person) return;
        add({
          id: row.employee_id,
          role: "operaio",
          name: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "Operaio senza nome",
        });
      });
      (teamsRes.data ?? []).forEach((row: any) => {
        const team = row.external_team;
        if (!team) return;
        add({ id: row.external_team_id, role: "subappaltatore", name: team.name || "Subappaltatore senza nome" });
      });
      (itemsRes.data ?? []).forEach((row: any) => {
        const supplier = row.supplier;
        if (!supplier || !row.supplier_id) return;
        add({ id: row.supplier_id, role: "fornitore", name: supplier.name || "Fornitore senza nome" });
      });

      return [...map.values()];
    },
    enabled: !!orderId && dialogOpen,
    staleTime: 5 * 60 * 1000,
  });

  const addErrorMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id || !user?.id) {
        throw new Error("sessione_non_valida");
      }
      const legacyPayload = {
        order_id: orderId,
        company_id: effectiveCompany.id,
        error_type: errorType,
        error_category: errorCategory,
        amount: parseAmount(amount),
        description: buildStructuredDescription(),
        error_date: errorDate,
        created_by: user.id,
      };
      const richPayload = {
        ...legacyPayload,
        review_status: correctiveAction.trim() ? "in_verifica" : "aperta",
        detailed_cause: getOptionLabel(ROOT_CAUSES, rootCause),
        process_origin: getOptionLabel(PROCESS_ORIGINS, processOrigin),
        verify_role: getOptionLabel(OWNER_ROLES, ownerRole),
        corrective_action: correctiveAction.trim() || null,
        ai_cause_summary: getOptionLabel(ROOT_CAUSES, rootCause),
        ai_recommendation: correctiveAction.trim() || getRecommendedResponsibility(errorType, errorCategory),
      };
      const { error } = await (supabase.from("order_errors") as any).insert(richPayload);
      if (error && /schema cache|column|review_status|detailed_cause|process_origin/i.test(error.message || "")) {
        const fallback = await supabase.from("order_errors").insert(legacyPayload);
        if (fallback.error) throw fallback.error;
        return;
      }
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-errors", orderId] });
      queryClient.invalidateQueries({ queryKey: ["global-errors", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["marginalita-cantieri", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["marginalita-widget", effectiveCompany?.id] });
      toast.success("Errore registrato", { description: "L'errore è stato aggiunto alla commessa." });
      resetForm();
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile salvare l'errore." });
    },
  });

  const deleteErrorMutation = useMutation({
    mutationFn: async (errorId: string) => {
      const { error } = await supabase.from("order_errors").delete().eq("id", errorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-errors", orderId] });
      queryClient.invalidateQueries({ queryKey: ["global-errors", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["marginalita-cantieri", effectiveCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["marginalita-widget", effectiveCompany?.id] });
      toast.success("Errore rimosso", { description: "L'errore è stato eliminato." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile eliminare." });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setErrorType("merce");
    setErrorCategory("altro");
    setAmount("");
    setDescription("");
    setErrorDate(new Date().toLocaleDateString("en-CA"));
    setRootCause("altro");
    setProcessOrigin("da_verificare");
    setOwnerRole("da_assegnare");
    setCorrectiveAction("");
  };

  const handleSave = () => {
    const parsedAmount = parseAmount(amount);
    if (!description.trim()) {
      toast.error("Errore", { description: "Inserisci il motivo dell'errore." });
      return;
    }
    if (!amount || parsedAmount <= 0) {
      toast.error("Errore", { description: "Inserisci un importo valido." });
      return;
    }
    if (!effectiveCompany?.id || !user?.id) {
      toast.error("Sessione non valida", { description: "Ricarica la pagina e riprova." });
      return;
    }
    addErrorMutation.mutate();
  };

  const buildStructuredDescription = () => {
    const rows = [
      `Causa precisa: ${getOptionLabel(ROOT_CAUSES, rootCause)}`,
      `Origine processo: ${getOptionLabel(PROCESS_ORIGINS, processOrigin)}`,
      `Soggetto da verificare: ${getOptionLabel(OWNER_ROLES, ownerRole)}`,
      correctiveAction.trim() ? `Azione correttiva: ${correctiveAction.trim()}` : null,
      `Dettaglio: ${description.trim()}`,
    ].filter(Boolean);
    return rows.join("\n");
  };

  const applyAiSuggestion = () => {
    const suggestion = suggestAnomalyFromText(description);
    handleTypeChange(suggestion.type);
    handleCategoryChange(suggestion.category);
    setRootCause(suggestion.rootCause);
    setProcessOrigin(suggestion.origin);
    setOwnerRole(suggestion.owner);
    setCorrectiveAction(suggestion.action);
    toast.success("Suggerimento AI applicato", {
      description: "Controlla causa e soggetto da verificare prima di salvare.",
    });
  };

  const selectedType = ERROR_TYPES.find((t) => t.value === errorType) ?? ERROR_TYPES[0];
  const selectedCategory = ERROR_CATEGORIES.find((c) => c.value === errorCategory) ?? ERROR_CATEGORIES[ERROR_CATEGORIES.length - 1];
  const suggestedCategories = useMemo(
    () => (CATEGORY_BY_TYPE[errorType] ?? ERROR_CATEGORIES.map((item) => item.value))
      .map((value) => ERROR_CATEGORIES.find((item) => item.value === value))
      .filter(Boolean) as typeof ERROR_CATEGORIES,
    [errorType],
  );
  const parsedAmount = parseAmount(amount);
  const severity = getSeverityLabel(parsedAmount);
  const recommendedResponsibility = getRecommendedResponsibility(errorType, errorCategory);
  const suggestedActors = useMemo(() => {
    if (["fornitura", "merce"].includes(errorType) || ["fornitore", "difetto_prodotto", "difetto_materiale", "ritardo"].includes(errorCategory)) {
      return actors.filter((actor) => actor.role === "fornitore");
    }
    if (errorType === "logistica" || errorCategory === "danno_materiale") {
      return actors.filter((actor) => ["fornitore", "subappaltatore"].includes(actor.role));
    }
    if (["manodopera", "esecuzione"].includes(errorType) || errorCategory === "lavorazione") {
      return actors.filter((actor) => ["operaio", "subappaltatore"].includes(actor.role));
    }
    if (["misura", "quantita", "comunicazione"].includes(errorCategory)) {
      return actors.filter((actor) => ["venditore", "operaio"].includes(actor.role));
    }
    return actors;
  }, [actors, errorType, errorCategory]);

  const setTemplate = (template: string) => {
    setDescription((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed}\n${template}` : template;
    });
  };

  const handleTypeChange = (value: string) => {
    setErrorType(value);
    const allowed = CATEGORY_BY_TYPE[value] ?? [];
    if (allowed.length > 0 && !allowed.includes(errorCategory)) {
      setErrorCategory(allowed[0]);
    }
    if (value === "fornitura" || value === "merce") {
      setProcessOrigin("fornitore");
      setOwnerRole("fornitore");
      setRootCause(value === "fornitura" ? "materiale_non_conforme" : "ordine_materiale");
    } else if (value === "logistica") {
      setProcessOrigin("logistica");
      setOwnerRole("fornitore");
      setRootCause("ritardo_fornitura");
    } else if (value === "manodopera" || value === "esecuzione") {
      setProcessOrigin("cantiere");
      setOwnerRole("operaio");
      setRootCause("errore_posa");
    }
  };

  const handleCategoryChange = (value: string) => {
    setErrorCategory(value);
    if (value === "misura") {
      setRootCause("rilievo_misure");
      setProcessOrigin("ufficio_tecnico");
      setOwnerRole("venditore");
    } else if (value === "quantita") {
      setRootCause("ordine_materiale");
      setProcessOrigin("commerciale");
      setOwnerRole("venditore");
    } else if (value === "fornitore" || value === "difetto_prodotto" || value === "difetto_materiale") {
      setRootCause("materiale_non_conforme");
      setProcessOrigin("fornitore");
      setOwnerRole("fornitore");
    } else if (value === "ritardo") {
      setRootCause("ritardo_fornitura");
      setProcessOrigin("logistica");
      setOwnerRole("fornitore");
    } else if (value === "danno_materiale") {
      setRootCause("danno_trasporto");
      setProcessOrigin("logistica");
      setOwnerRole("fornitore");
    } else if (value === "lavorazione") {
      setRootCause("errore_posa");
      setProcessOrigin("cantiere");
      setOwnerRole("operaio");
    } else if (value === "comunicazione") {
      setRootCause("comunicazione");
      setProcessOrigin("commerciale");
      setOwnerRole("ufficio");
    }
  };

  const totalErrors = errors.reduce((sum, e) => sum + e.amount, 0);
  const totalFornitura = errors
    .filter((e) => ["merce", "fornitura", "logistica"].includes(normalizeType(e.error_type)))
    .reduce((sum, e) => sum + e.amount, 0);
  const totalEsecuzione = errors
    .filter((e) => ["manodopera", "esecuzione"].includes(normalizeType(e.error_type)))
    .reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown sorted by frequency
  const categoryBreakdown = ERROR_CATEGORIES
    .map(cat => {
      const catErrors = errors.filter(e => normalizeCategory(e.error_category) === cat.value);
      return { ...cat, count: catErrors.length, total: catErrors.reduce((s, e) => s + e.amount, 0) };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
          <span className="truncate">Errori / Perdite</span>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">Aggiungi</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {registroAnnuale && registroAnnuale.conteggio > 0 && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            In azienda, ultimi 12 mesi: <span className="font-semibold text-foreground">{registroAnnuale.conteggio} errori</span> per{" "}
            <span className="font-semibold text-destructive">{formatCurrency(registroAnnuale.totale)}</span>
            {registroAnnuale.top && registroAnnuale.top.costo > 0 && (
              <>
                {" "}— nascono soprattutto da{" "}
                <span className="font-medium text-foreground">
                  {PROCESS_ORIGINS.find((o) => o.value === registroAnnuale.top!.origine)?.label ?? registroAnnuale.top.origine}
                </span>{" "}
                ({formatCurrency(registroAnnuale.top.costo)})
              </>
            )}
            . Prima lo scopri, meno costa: lo stesso errore vale 0 € al ricontrollo del rilievo e il 67% del margine se lo segnala il cliente.
          </p>
        )}
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun errore registrato</p>
        ) : (
          <>
            {errors.map((err) => {
              const typeConfig = ERROR_TYPES.find(t => t.value === normalizeType(err.error_type));
              const catConfig = ERROR_CATEGORIES.find(c => c.value === normalizeCategory(err.error_category));
              const Icon = typeConfig?.icon || Package;
              return (
                <div key={err.id} className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                          {typeConfig?.label || err.error_type}
                        </span>
                        {catConfig && (
                          <Badge variant="outline" className={`text-xs ${catConfig.color}`}>
                            {catConfig.label}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(err.error_date)}</span>
                      </div>
                      <p className="text-sm mt-1 break-words">{err.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-destructive text-sm">
                      -{formatCurrency(err.amount)}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare questo errore?</AlertDialogTitle>
                          <AlertDialogDescription>L'errore verrà rimosso dalla commessa.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteErrorMutation.mutate(err.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}

            {/* Summary by type */}
            <div className="pt-2 border-t space-y-1">
              {totalFornitura > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fornitura / logistica</span>
                  <span className="text-destructive">{formatCurrency(totalFornitura)}</span>
                </div>
              )}
              {totalEsecuzione > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Esecuzione / manodopera</span>
                  <span className="text-destructive">{formatCurrency(totalEsecuzione)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Totale Perdite</span>
                <span className="text-destructive">-{formatCurrency(totalErrors)}</span>
              </div>
            </div>

            {/* Summary by category */}
            {categoryBreakdown.length > 0 && (
              <div className="pt-2 border-t space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Frequenza per categoria</p>
                {categoryBreakdown.map(cat => (
                  <div key={cat.value} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${cat.color}`}>
                        {cat.label}
                      </Badge>
                      <span className="text-muted-foreground">× {cat.count}</span>
                    </div>
                    <span className="text-destructive">{formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Add Error Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Registra anomalia operativa</DialogTitle>
            <DialogDescription>
              Chi registra non è la causa. Qui devi indicare dove nasce la perdita e chi va verificato.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo anomalia</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ERROR_TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = errorType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => handleTypeChange(t.value)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
                          active ? `${t.tone} shadow-sm ring-1 ring-orange-200` : "border-slate-200 bg-white hover:border-orange-200",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-current" : "text-orange-500")} />
                          <div>
                            <p className="text-sm font-semibold">{t.label}</p>
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Categoria / causa</Label>
                  <Select value={errorCategory} onValueChange={handleCategoryChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ERROR_CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <c.icon className="h-4 w-4" />
                            <span>{c.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedCategories.slice(0, 4).map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => handleCategoryChange(cat.value)}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px] transition-colors",
                          errorCategory === cat.value ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Importo perso *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                    <Input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-8"
                      placeholder="0,00"
                    />
                  </div>
                  <Badge variant="outline" className={cn("border text-xs", severity.color)}>
                    {severity.label}
                  </Badge>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Causa approfondita</p>
                    <p className="text-xs text-muted-foreground">Serve per evitare che il registratore venga confuso con il responsabile.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Causa precisa</Label>
                    <Select value={rootCause} onValueChange={setRootCause}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROOT_CAUSES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            <div>
                              <p>{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.hint}</p>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dove nasce</Label>
                    <Select value={processOrigin} onValueChange={setProcessOrigin}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROCESS_ORIGINS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Da verificare</Label>
                    <Select value={ownerRole} onValueChange={setOwnerRole}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OWNER_ROLES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label className="text-xs">Azione correttiva prevista</Label>
                  <Input
                    value={correctiveAction}
                    onChange={(e) => setCorrectiveAction(e.target.value)}
                    placeholder="Es. aprire reclamo, rifare rilievo, bloccare fornitore, correggere checklist..."
                    className="bg-white"
                    maxLength={180}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dettaglio operativo *</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Scrivi cosa è successo in pratica, quale materiale/lavorazione riguarda e perché genera costo extra..."
                  rows={4}
                  maxLength={500}
                />
                <div className="flex flex-wrap gap-1.5">
                  {(DESCRIPTION_TEMPLATES[errorCategory] ?? DESCRIPTION_TEMPLATES.altro).map((template) => (
                    <button
                      key={template}
                      type="button"
                      onClick={() => setTemplate(template)}
                      className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    >
                      {template}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-orange-200 bg-orange-50/70 text-xs text-orange-700 hover:bg-orange-50"
                  onClick={applyAiSuggestion}
                  disabled={!description.trim()}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Suggerisci causa con AI
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Data anomalia</Label>
                <Input
                  type="date"
                  value={errorDate}
                  onChange={(e) => setErrorDate(e.target.value)}
                />
              </div>
            </div>

            <aside className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-orange-500" />
                  Analisi automatica
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Sorgente</span>
                    <span className="font-medium text-slate-900">{selectedType.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Causa</span>
                    <span className="font-medium text-slate-900">{selectedCategory.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Da verificare</span>
                    <span className="font-medium text-orange-700">{recommendedResponsibility}</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-slate-600">
                    Registratore: <span className="font-medium">utente corrente</span>. Non viene contato come causa nelle statistiche.
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Target className="h-4 w-4 text-orange-500" />
                  Soggetti collegati
                </div>
                {isFetchingActors ? (
                  <p className="text-xs text-muted-foreground">Caricamento collegamenti...</p>
                ) : suggestedActors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nessun soggetto coerente collegato. Assegna venditori, operai, fornitori o subappaltatori alla commessa.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {suggestedActors.slice(0, 6).map((actor) => {
                      const Icon = actor.role === "venditore" ? UserRound : actor.role === "operaio" ? HardHat : actor.role === "subappaltatore" ? Users : Truck;
                      return (
                        <div key={`${actor.role}-${actor.id}`} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-slate-800">{actor.name}</p>
                            <p className="text-[10px] uppercase text-slate-500">{actor.role}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-orange-100 bg-orange-50/80 p-3 text-xs text-orange-800">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Suggerimento
                </div>
                La statistica globale userà questi collegamenti per capire chi genera più anomalie e quanto impattano sui margini.
              </div>
            </aside>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Annulla</Button>
            <Button onClick={handleSave} disabled={addErrorMutation.isPending}>
              {addErrorMutation.isPending ? "Salvataggio..." : "Salva Errore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
