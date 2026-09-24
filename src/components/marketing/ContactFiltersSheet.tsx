import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronLeft, ChevronsUpDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { STATUS_OPTIONS } from "@/types/opportunities";
import {
  OPERATORI_A_GIORNI,
  OPERATORI_SENZA_VALORE,
  regolaCompleta,
  soloRegoleComplete,
  type OperatoreFiltro,
} from "@/lib/marketingContacts";

// --- Types ---

export interface FilterRule {
  id: string;
  field: string;
  operator: OperatoreFiltro;
  value: string;
}

export interface FilterGroup {
  id: string;
  rules: FilterRule[];
}

export interface ContactFilters {
  groups: FilterGroup[];
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  groups: [],
};

/** Quante condizioni filtrano davvero: una regola senza valore non conta. */
export function countActiveContactFilters(f: ContactFilters): number {
  return f.groups.reduce((sum, g) => sum + g.rules.filter(regolaCompleta).length, 0);
}

// --- Field definitions ---

export interface PipelineWithStages {
  id: string;
  name: string;
  marketing_pipeline_stages: { id: string; name: string; position: number }[];
}

import type { CustomFieldDef } from "@/lib/contactUtils";
import { REGION_OPTIONS } from "@/lib/italianRegions";
export type { CustomFieldDef };

/**
 * text: si scrive, e si cerca «contiene». select: opzioni fisse. valori: i
 * valori presenti fra i contatti, chiesti al database con quanti ne hanno
 * ciascuno (tag, fonte, provincia). date: un giorno o un numero di giorni.
 */
interface FieldDef {
  key: string;
  label: string;
  group: string;
  type: "text" | "date" | "select" | "valori";
  operatori: OperatoreFiltro[];
  /** Come si legge l'operatore su questo campo, quando quello generico suona male. */
  etichette?: Partial<Record<OperatoreFiltro, string>>;
  options?: { value: string; label: string }[];
  elenco?: "tags" | "source" | "province";
  segnaposto?: string;
}

const OPERATOR_LABELS: Record<OperatoreFiltro, string> = {
  is: "è",
  is_not: "non è",
  contains: "contiene",
  not_contains: "non contiene",
  is_empty: "è vuoto",
  is_not_empty: "non è vuoto",
  before: "prima del",
  after: "dopo il",
  last_days: "negli ultimi … giorni",
  older_than_days: "più di … giorni fa",
};

const TESTO: OperatoreFiltro[] = ["contains", "not_contains", "is_empty", "is_not_empty"];
const SCELTA: OperatoreFiltro[] = ["is", "is_not", "is_empty", "is_not_empty"];
const DATA: OperatoreFiltro[] = ["last_days", "older_than_days", "is", "before", "after", "is_not"];
const ETICHETTE_DATA: Partial<Record<OperatoreFiltro, string>> = { is: "il giorno", is_not: "non il giorno" };
const ETICHETTE_OPPORTUNITA: Partial<Record<OperatoreFiltro, string>> = {
  is_empty: "nessuna opportunità",
  is_not_empty: "almeno un'opportunità",
};

const STANDARD_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome", group: "Contatto", type: "text", operatori: TESTO, segnaposto: "es. Mario Rossi" },
  { key: "email", label: "Email", group: "Contatto", type: "text", operatori: TESTO, segnaposto: "es. @gmail.com" },
  { key: "phone", label: "Telefono", group: "Contatto", type: "text", operatori: TESTO, segnaposto: "es. 333 123 4567" },
  { key: "company_name", label: "Azienda", group: "Contatto", type: "text", operatori: TESTO },
  {
    key: "source", label: "Fonte", group: "Contatto", type: "valori", elenco: "source",
    operatori: ["is", "is_not", "contains", "not_contains", "is_empty", "is_not_empty"],
  },
  { key: "city", label: "Città", group: "Contatto", type: "text", operatori: TESTO },
  { key: "province", label: "Provincia", group: "Contatto", type: "valori", elenco: "province", operatori: SCELTA },
  { key: "region", label: "Regione", group: "Contatto", type: "select", options: REGION_OPTIONS, operatori: SCELTA },
  { key: "created_at", label: "Data creazione", group: "Date", type: "date", operatori: DATA, etichette: ETICHETTE_DATA },
  {
    key: "last_activity_at", label: "Ultima attività", group: "Date", type: "date",
    operatori: [...DATA, "is_empty", "is_not_empty"],
    etichette: { ...ETICHETTE_DATA, is_empty: "nessuna attività", is_not_empty: "almeno un'attività" },
  },
  {
    key: "tags", label: "Tag", group: "Tag", type: "valori", elenco: "tags", operatori: SCELTA,
    etichette: { is: "ha il tag", is_not: "non ha il tag", is_empty: "nessun tag", is_not_empty: "almeno un tag" },
  },
];

const OPP_STATUSES: { value: string; label: string }[] = [...STATUS_OPTIONS];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function etichettaOperatore(campo: FieldDef | undefined, op: OperatoreFiltro): string {
  return campo?.etichette?.[op] ?? OPERATOR_LABELS[op];
}

// --- Valori presenti (tag, fonte, provincia) ---

interface VoceElenco {
  valore: string;
  etichetta: string;
  contatti: number;
}

/**
 * Sceglie un valore fra quelli presenti nei contatti. Il menu dei tag leggeva
 * l'anagrafica dei tag, dove quasi nessun tag vero è registrato: a Il Bagno
 * Group mostrava zero voci su 21 tag in uso.
 */
function ValoreDaElenco({
  companyId,
  elenco,
  valore,
  onChange,
}: {
  companyId: string | null | undefined;
  elenco: "tags" | "source" | "province";
  valore: string;
  onChange: (v: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const { data: voci = [], isLoading, isError } = useQuery({
    queryKey: ["marketing-valori-filtro", companyId, elenco],
    queryFn: async (): Promise<VoceElenco[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("marketing_valori_filtro_contatti", {
        p_company: companyId,
        p_campo: elenco,
      });
      if (error) throw error;
      return ((data ?? []) as VoceElenco[]).map((v) => ({ ...v, contatti: Number(v.contatti) || 0 }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
  const scelta = voci.find((v) => v.valore === valore);
  const mostrato = scelta?.etichetta ?? valore;

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={aperto}
          aria-label={mostrato ? `Valore: ${mostrato}` : "Scegli il valore"}
          className="h-8 w-full justify-between px-3 text-xs font-normal"
        >
          <span className={cn("truncate", !valore && "text-muted-foreground")}>
            {mostrato || "Scegli…"}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Dentro il pannello, non sopra la pagina: il pannello tiene il cursore
          e la rotella per sé, e un elenco aperto fuori non si poteva né
          scorrere né cercare (224 tag nel CRM della piattaforma). */}
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        onEscapeKeyDown={() => setAperto(false)}
        className="z-50 w-[--radix-popover-trigger-width] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none"
      >
        <Command>
          <CommandInput placeholder="Cerca…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {isLoading ? "Carico l'elenco…" : isError ? "Elenco non disponibile" : "Nessun valore"}
            </CommandEmpty>
            <CommandGroup>
              {voci.map((v) => (
                <CommandItem
                  key={v.valore}
                  value={v.etichetta}
                  onSelect={() => {
                    onChange(v.valore);
                    setAperto(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", v.valore === valore ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{v.etichetta}</span>
                  <span className="ml-2 tabular-nums text-muted-foreground">{v.contatti.toLocaleString("it-IT")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverPrimitive.Content>
    </Popover>
  );
}

// --- Props ---

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ContactFilters;
  onApply: (filters: ContactFilters) => void;
  companyId?: string | null;
  pipelines?: PipelineWithStages[];
  customFields?: CustomFieldDef[];
  /**
   * Quanti contatti restano con questi filtri (e con quelli già attivi nella
   * pagina: ricerca, qualità, «solo i miei»). Si vede sul bottone prima di
   * applicare.
   */
  contaContatti?: (filters: ContactFilters) => Promise<number>;
}

// --- Component ---

export function ContactFiltersSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  companyId,
  pipelines = [],
  customFields = [],
  contaContatti,
}: Props) {
  const [local, setLocal] = useState<ContactFilters>(filters);
  // pickingFor: null = rules view, "new_group" = picking for new OR group, "nested_<groupId>" = picking for AND in group, "change_<ruleId>" = changing field
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [conteggio, setConteggio] = useState<number | null>(null);
  const [contando, setContando] = useState(false);

  useEffect(() => {
    if (open) {
      setLocal(filters);
      setPickingFor(null);
      setFieldSearch("");
      setConteggio(null);
    }
  }, [open, filters]);

  const isPicking = pickingFor !== null;

  // Il conteggio riparte solo quando cambia una condizione che filtra
  // davvero, e non a ogni tasto: una regola ancora senza valore non conta.
  // La chiave porta campo, condizione e valore: è tutto ciò che serve a
  // contare, e l'effetto riparte da lì.
  const filtriApplicabili = useMemo((): ContactFilters => ({ groups: soloRegoleComplete(local.groups) }), [local]);
  const chiaveConteggio = useMemo(
    () => JSON.stringify(filtriApplicabili.groups.map((g) => g.rules.map((r) => [r.field, r.operator, r.value.trim()]))),
    [filtriApplicabili],
  );
  useEffect(() => {
    if (!open || !contaContatti) return;
    let annullato = false;
    const gruppi = (JSON.parse(chiaveConteggio) as [string, OperatoreFiltro, string][][]).map((regole, g) => ({
      id: `g${g}`,
      rules: regole.map(([field, operator, value], r) => ({ id: `g${g}r${r}`, field, operator, value })),
    }));
    const attesa = setTimeout(() => {
      setContando(true);
      contaContatti({ groups: gruppi })
        .then((n) => { if (!annullato) setConteggio(n); })
        .catch(() => { if (!annullato) setConteggio(null); })
        .finally(() => { if (!annullato) setContando(false); });
    }, 400);
    return () => {
      annullato = true;
      clearTimeout(attesa);
    };
  }, [open, chiaveConteggio, contaContatti]);

  // Build all available fields
  const allFields = useMemo((): FieldDef[] => {
    const fields: FieldDef[] = [...STANDARD_FIELDS];
    if (pipelines.length > 0) {
      fields.push({
        key: "opp_pipeline",
        label: "Pipeline",
        group: "Opportunità",
        type: "select",
        operatori: SCELTA,
        etichette: ETICHETTE_OPPORTUNITA,
        options: pipelines.map((p) => ({ value: p.id, label: p.name })),
      });
      const stageOptions = pipelines.flatMap((p) =>
        [...(p.marketing_pipeline_stages || [])]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ value: s.id, label: `${p.name} → ${s.name}` }))
      );
      if (stageOptions.length > 0) {
        fields.push({
          key: "opp_stage",
          label: "Fase pipeline",
          group: "Opportunità",
          type: "select",
          operatori: SCELTA,
          etichette: ETICHETTE_OPPORTUNITA,
          options: stageOptions,
        });
      }
    }
    fields.push({
      key: "opp_status",
      label: "Stato opportunità",
      group: "Opportunità",
      type: "select",
      operatori: SCELTA,
      etichette: ETICHETTE_OPPORTUNITA,
      options: OPP_STATUSES,
    });
    customFields.forEach((cf) => {
      const conOpzioni = !!cf.options && cf.options.length > 0;
      const fieldType: FieldDef["type"] = cf.field_type === "date" ? "date" : conOpzioni ? "select" : "text";
      // Un numero si confronta intero («4» non è «14»), un testo si cerca dentro.
      const operatori = fieldType === "text" && cf.field_type !== "number" ? TESTO : SCELTA;
      fields.push({
        key: `cf_${cf.id}`,
        label: cf.name,
        group: "Campi personalizzati",
        type: fieldType,
        operatori,
        etichette: fieldType === "date" ? ETICHETTE_DATA : undefined,
        options: conOpzioni ? cf.options!.map((o) => ({ value: o, label: o })) : undefined,
      });
    });
    return fields;
  }, [pipelines, customFields]);

  const getFieldDef = (key: string): FieldDef | undefined => allFields.find((f) => f.key === key);
  const primoOperatore = (key: string): OperatoreFiltro => getFieldDef(key)?.operatori[0] ?? "is";

  // --- Group/Rule CRUD ---
  const updateRule = (ruleId: string, patch: Partial<FilterRule>) => {
    setLocal((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => ({
        ...g,
        rules: g.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
      })),
    }));
  };

  const removeRule = (groupId: string, ruleId: string) => {
    setLocal((prev) => {
      const groups = prev.groups
        .map((g) => g.id === groupId ? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) } : g)
        .filter((g) => g.rules.length > 0);
      return { groups };
    });
  };

  const selectFieldForPicking = (fieldKey: string) => {
    if (!pickingFor) return;
    const operator = primoOperatore(fieldKey);

    if (pickingFor === "new_group") {
      const newGroup: FilterGroup = { id: genId(), rules: [{ id: genId(), field: fieldKey, operator, value: "" }] };
      setLocal((prev) => ({ groups: [...prev.groups, newGroup] }));
    } else if (pickingFor.startsWith("nested_")) {
      const groupId = pickingFor.replace("nested_", "");
      const newRule: FilterRule = { id: genId(), field: fieldKey, operator, value: "" };
      setLocal((prev) => ({
        groups: prev.groups.map((g) => g.id === groupId ? { ...g, rules: [...g.rules, newRule] } : g),
      }));
    } else if (pickingFor.startsWith("change_")) {
      // Cambiando campo, l'operatore di prima può non esistere più («negli
      // ultimi … giorni» su un nome): si riparte dal primo del campo nuovo.
      const ruleId = pickingFor.replace("change_", "");
      updateRule(ruleId, { field: fieldKey, operator, value: "" });
    }

    setPickingFor(null);
    setFieldSearch("");
  };

  // --- Field picker filtered ---
  const filteredFields = useMemo(() => {
    const q = fieldSearch.toLowerCase();
    const filtered = q ? allFields.filter((f) => f.label.toLowerCase().includes(q) || f.group.toLowerCase().includes(q)) : allFields;
    const grouped: Record<string, FieldDef[]> = {};
    filtered.forEach((f) => {
      if (!grouped[f.group]) grouped[f.group] = [];
      grouped[f.group].push(f);
    });
    return grouped;
  }, [allFields, fieldSearch]);

  const editorValore = (rule: FilterRule, fieldDef: FieldDef | undefined) => {
    if (OPERATORI_SENZA_VALORE.has(rule.operator)) return null;
    if (OPERATORI_A_GIORNI.has(rule.operator)) {
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            placeholder="30"
            value={rule.value}
            onChange={(e) => updateRule(rule.id, { value: e.target.value })}
            className="h-8 w-24 text-xs"
            aria-label="Numero di giorni"
          />
          <span className="text-xs text-muted-foreground">giorni</span>
        </div>
      );
    }
    if (fieldDef?.type === "date") {
      return <Input type="date" value={rule.value} onChange={(e) => updateRule(rule.id, { value: e.target.value })} className="h-8 text-xs" />;
    }
    if (fieldDef?.type === "valori" && fieldDef.elenco && (rule.operator === "is" || rule.operator === "is_not")) {
      return (
        <ValoreDaElenco
          companyId={companyId}
          elenco={fieldDef.elenco}
          valore={rule.value}
          onChange={(v) => updateRule(rule.id, { value: v })}
        />
      );
    }
    if (fieldDef?.type === "select" && fieldDef.options) {
      return (
        <Select value={rule.value} onValueChange={(v) => updateRule(rule.id, { value: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Scegli…" />
          </SelectTrigger>
          <SelectContent>
            {fieldDef.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        placeholder={fieldDef?.segnaposto ?? "Scrivi il valore…"}
        value={rule.value}
        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
        className="h-8 text-xs"
      />
    );
  };

  const etichettaApplica = conteggio === null
    ? "Applica"
    : `Mostra ${conteggio.toLocaleString("it-IT")} ${conteggio === 1 ? "contatto" : "contatti"}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w: il pannello di base si ferma a 384 px (max-w-sm), e «Ultima attività» veniva tagliata. */}
      <SheetContent
        side="right"
        className="w-full sm:w-[440px] sm:max-w-[440px] flex flex-col overflow-hidden p-0"
        onEscapeKeyDown={(e) => {
          // Esc nell'elenco dei valori chiude l'elenco, non il pannello: ogni
          // pacchetto Radix qui ha la sua copia della pila degli strati, e il
          // pannello non sa che sopra ce n'è un altro. L'elenco si chiude da
          // sé (onEscapeKeyDown in ValoreDaElenco).
          if (e.target instanceof Element && e.target.closest("[cmdk-root]")) e.preventDefault();
        }}
      >
        {isPicking ? (
          /* Field picker screen */
          <div className="flex flex-col h-full">
            <SheetDescription className="sr-only">Scegli il campo da filtrare</SheetDescription>
            <div className="px-6 pt-6 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => { setPickingFor(null); setFieldSearch(""); }}
                  className="p-1 hover:bg-muted rounded transition-colors"
                  aria-label="Torna ai filtri"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <SheetTitle className="text-sm font-semibold flex-1">Scegli campo</SheetTitle>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca campo..."
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {Object.entries(filteredFields).map(([group, fields]) => (
                <div key={group} className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 px-1">{group}</div>
                  {fields.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => selectFieldForPicking(f.key)}
                      className="flex items-center w-full px-2 py-2 text-sm rounded-md hover:bg-muted/60 transition-colors text-foreground"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ))}
              {Object.keys(filteredFields).length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">Nessun campo trovato</div>
              )}
            </div>
          </div>
        ) : (
          /* Rules list screen */
          <div className="flex flex-col h-full">
            <div className="px-6 pt-6 pb-3">
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="text-base">Filtri</SheetTitle>
                <SheetDescription className="text-xs">
                  Nello stesso riquadro valgono tutte le condizioni; fra riquadri diversi ne basta uno.
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {local.groups.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nessun filtro attivo. Clicca sotto per aggiungerne uno.
                </div>
              )}

              {local.groups.map((group, gIdx) => (
                <div key={group.id}>
                  {/* Fra riquadri: ne basta uno */}
                  {gIdx > 0 && (
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] font-semibold text-destructive uppercase tracking-wider">oppure</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}

                  {/* Group block */}
                  <div className="rounded-lg border bg-card">
                    {group.rules.map((rule, rIdx) => {
                      const fieldDef = getFieldDef(rule.field);
                      const operatori = fieldDef?.operatori ?? [rule.operator];
                      const incompleta = !regolaCompleta(rule);

                      return (
                        <div key={rule.id}>
                          {/* Nello stesso riquadro: tutte insieme */}
                          {rIdx > 0 && (
                            <div className="flex items-center gap-3 px-3">
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">e</span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}

                          <div className="p-3 space-y-2">
                            {/* Row 1: campo, condizione, cestino. Su schermo stretto la
                                condizione va a capo: se no «Ultima attività» si tagliava. */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                              <button
                                onClick={() => { setPickingFor(`change_${rule.id}`); setFieldSearch(""); }}
                                className="order-1 flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-foreground hover:text-primary transition-colors"
                                title="Cambia campo"
                              >
                                <span className="truncate">{fieldDef?.label || rule.field}</span>
                                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
                              </button>
                              <Select
                                value={rule.operator}
                                onValueChange={(v) => {
                                  const op = v as OperatoreFiltro;
                                  // Il valore di prima vale solo se l'operatore vuole lo stesso tipo di dato.
                                  const stessoTipo = OPERATORI_A_GIORNI.has(op) === OPERATORI_A_GIORNI.has(rule.operator);
                                  updateRule(rule.id, {
                                    operator: op,
                                    ...(OPERATORI_SENZA_VALORE.has(op) || !stessoTipo ? { value: "" } : {}),
                                  });
                                }}
                              >
                                <SelectTrigger className="order-3 h-7 w-full text-xs sm:order-2 sm:w-[170px]" aria-label="Condizione">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {operatori.map((op) => (
                                    <SelectItem key={op} value={op} className="text-xs">{etichettaOperatore(fieldDef, op)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <button
                                onClick={() => removeRule(group.id, rule.id)}
                                className="order-2 p-1 text-muted-foreground hover:text-destructive transition-colors sm:order-3"
                                aria-label="Togli condizione"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Row 2: value */}
                            {editorValore(rule, fieldDef)}

                            {incompleta && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                                Manca il valore: finché è vuota, questa condizione non filtra.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* + condizione nello stesso riquadro (e) */}
                    <div className="px-3 pb-2">
                      <button
                        onClick={() => { setPickingFor(`nested_${group.id}`); setFieldSearch(""); }}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors py-1"
                      >
                        <Plus className="h-3 w-3" />
                        Aggiungi condizione
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* + nuovo riquadro (oppure) */}
              <button
                onClick={() => { setPickingFor("new_group"); setFieldSearch(""); }}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors py-3 mt-1"
              >
                <Plus className="h-4 w-4" />
                {local.groups.length === 0 ? "Aggiungi filtro" : "Aggiungi alternativa (oppure)"}
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 p-4 border-t bg-background">
              <button
                onClick={() => {
                  setLocal(EMPTY_CONTACT_FILTERS);
                  onApply(EMPTY_CONTACT_FILTERS);
                  onOpenChange(false);
                }}
                className="text-xs text-destructive hover:text-destructive/80 transition-colors mr-auto"
              >
                Rimuovi tutti i filtri
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                aria-busy={contando}
                className={cn(contando && conteggio !== null && "opacity-70")}
                onClick={() => {
                  onApply(filtriApplicabili);
                  onOpenChange(false);
                }}
              >
                {etichettaApplica}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
