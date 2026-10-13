import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Loader2, GripVertical, Trash2, ChevronUp, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUTO_STATUS_OPTIONS } from "@/types/opportunities";
import { usePermissions } from "@/hooks/usePermissions";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
import { queryKeys } from "@/lib/queryKeys";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  name: string;
  position: number;
  auto_status: string | null;
  // SO6: Sales OS fields
  win_probability: number | null;
  stalled_threshold_days: number | null;
}

type StageUpdatePayload = {
  name: string;
  position: number;
  auto_status: string | null;
  win_probability: number | null;
  stalled_threshold_days: number | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasDuplicateStageNames(stages: Stage[]) {
  const seen = new Set<string>();
  for (const stage of stages) {
    const name = normalizeName(stage.name).toLowerCase();
    if (!name) continue;
    if (seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}

function normalizeNumber(value: string, min: number, max?: number) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(Math.max(parsed, min), max ?? parsed);
}

/** Gli id di una fase: la descrizione dell'esito, e dove rimettere il focus dopo «Aggiungi» o una freccia. */
const idsFase = (id: string) => ({
  nome: `fase-nome-${id}`,
  aiutoEsito: `fase-esito-aiuto-${id}`,
  su: `fase-su-${id}`,
  giu: `fase-giu-${id}`,
});

/** Il pallino dell'esito: a colpo d'occhio si vede quali fasi chiudono la trattativa. */
const PALLINO_ESITO: Record<string, string> = {
  none: "border border-muted-foreground/50",
  open: "bg-blue-500",
  won: "bg-green-600",
  lost: "bg-red-500",
  abandoned: "bg-slate-400",
};

function PallinoEsito({ valore }: { valore: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle", PALLINO_ESITO[valore] ?? PALLINO_ESITO.none)}
    />
  );
}

// Campi numerici stretti: senza le freccette del browser, che coprirebbero «%» e «gg».
const SENZA_FRECCETTE =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const SPIEGAZIONE_FERMA = "Dopo quanti giorni nella fase una trattativa risulta ferma.";
const SPIEGAZIONE_PROBABILITA =
  "«Prob. vittoria %» si salva, ma oggi non entra nelle statistiche: il valore «ponderato» di Opportunità usa la probabilità di ogni singola opportunità.";

function SortableStage({ stage, indice, totale, modificabile, evidenziata, onUpdate, onDelete, canDelete, onAutoStatusChange, onSalesOSChange, onSposta }: {
  stage: Stage;
  indice: number;
  totale: number;
  /** Senza permesso di modifica maniglia, frecce e cestino non ci sono: i campi restano da leggere. */
  modificabile: boolean;
  evidenziata: boolean;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  onAutoStatusChange: (id: string, status: string | null) => void;
  onSalesOSChange: (id: string, field: 'win_probability' | 'stalled_threshold_days', value: number | null) => void;
  onSposta: (id: string, direzione: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const numero = indice + 1;
  const nome = normalizeName(stage.name);
  const quale = nome ? `«${nome}»` : `la fase ${numero}`;
  const valoreEsito = stage.auto_status || "none";
  const esito = AUTO_STATUS_OPTIONS.find((o) => o.value === valoreEsito);
  const ids = idsFase(stage.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // Fino a lg due righe (comandi, nome e cestino; sotto esito e numeri), da lg una riga sola allineata alle colonne.
        "grid scroll-my-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 px-1.5 py-1 transition-colors duration-700 lg:flex",
        evidenziata && "bg-primary/5",
        isDragging && "relative z-10 rounded-md bg-background shadow-md ring-1 ring-border",
      )}
    >
      {modificabile && (
        <div className="col-start-1 row-start-1 flex shrink-0 items-center">
          {/* Sul telefono si riordina con le frecce: il trascinamento lì si confonde con lo scorrimento della pagina. */}
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Trascina la fase ${numero} per cambiare l'ordine`}
            title="Trascina per cambiare l'ordine"
            className="hidden h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing md:inline-flex"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Button
            id={ids.su}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Sposta ${quale} più in alto`}
            disabled={indice === 0}
            onClick={() => onSposta(stage.id, -1)}
            className="h-8 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
          >
            <ChevronUp />
          </Button>
          <Button
            id={ids.giu}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Sposta ${quale} più in basso`}
            disabled={indice === totale - 1}
            onClick={() => onSposta(stage.id, 1)}
            className="h-8 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
          >
            <ChevronDown />
          </Button>
        </div>
      )}
      <Input
        id={ids.nome}
        value={stage.name}
        onChange={(e) => onUpdate(stage.id, e.target.value)}
        aria-label={`Nome della fase ${numero}`}
        className="col-start-2 row-start-1 h-8 min-w-0 px-2 text-sm max-md:h-11 lg:flex-1"
        maxLength={100}
      />
      <div className="col-span-3 row-start-2 flex min-w-0 items-center gap-1.5 md:col-span-2 md:col-start-2 lg:flex-none">
        <Select
          value={valoreEsito}
          onValueChange={(v) => onAutoStatusChange(stage.id, v === "none" ? null : v)}
        >
          <SelectTrigger
            aria-label={`Esito della fase ${numero}`}
            aria-describedby={ids.aiutoEsito}
            title={esito?.hint}
            className="h-8 min-w-0 flex-1 px-2 text-xs max-md:h-11 lg:w-[8.5rem] lg:flex-none"
          >
            {/* Figli propri: shadcn copierebbe nel campo chiuso tutto il testo della voce, spiegazione compresa.
                Così il campo mostra solo il nome dell'esito e la spiegazione resta nel menu, sotto ogni voce. */}
            <SelectValue>
              <PallinoEsito valore={valoreEsito} />
              <span className="text-muted-foreground lg:hidden">Esito: </span>
              <span className={cn(valoreEsito === "none" && "text-muted-foreground")}>{esito?.label ?? valoreEsito}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-72">
            {AUTO_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} textValue={opt.label} className="items-start">
                <span className="block font-medium"><PallinoEsito valore={opt.value} />{opt.label}</span>
                <span className="mt-0.5 block whitespace-normal text-xs text-muted-foreground">{opt.hint}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span id={ids.aiutoEsito} className="sr-only">{esito?.hint}</span>
        <div className="relative w-16 shrink-0">
          <Input
            type="number"
            inputMode="numeric"
            aria-label={`Prob. vittoria % della fase ${numero}`}
            title="Probabilità di vittoria della fase"
            placeholder="—"
            value={stage.win_probability ?? ""}
            onChange={(e) => onSalesOSChange(stage.id, "win_probability", normalizeNumber(e.target.value, 0, 100))}
            className={cn("h-8 pl-2 pr-6 text-right text-xs tabular-nums max-md:h-11 md:text-xs", SENZA_FRECCETTE)}
            min={0}
            max={100}
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">%</span>
        </div>
        <div className="relative w-[4.5rem] shrink-0">
          <Input
            type="number"
            inputMode="numeric"
            aria-label={`Ferma da (giorni) della fase ${numero}`}
            title={SPIEGAZIONE_FERMA}
            placeholder="—"
            value={stage.stalled_threshold_days ?? ""}
            onChange={(e) =>
              onSalesOSChange(
                stage.id,
                "stalled_threshold_days",
                normalizeNumber(e.target.value, 1)
              )
            }
            className={cn("h-8 pl-2 pr-7 text-right text-xs tabular-nums max-md:h-11 md:text-xs", SENZA_FRECCETTE)}
            min={1}
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">gg</span>
        </div>
      </div>
      {modificabile && (canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={nome ? `Elimina la fase «${nome}»` : `Elimina la fase ${numero}`}
          onClick={() => onDelete(stage.id)}
          className="col-start-3 row-start-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive max-md:h-11 max-md:w-11"
        >
          <Trash2 />
        </Button>
      ) : (
        // Con una fase sola il cestino non c'è: lo spazio resta, per non spostare le colonne.
        <span aria-hidden="true" className="hidden w-8 shrink-0 lg:block" />
      ))}
    </div>
  );
}

export function PipelineStagesConfig({ pipelineId, pipelineName }: { pipelineId: string; pipelineName: string }) {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && permissions.canEditSettingsCustomization;
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const chiaveFasi = ["pipeline_stages", pipelineId, companyId] as const;
  const [guidaAperta, setGuidaAperta] = useState(false);
  const idGuida = `guida-fasi-${pipelineId}`;

  const { data: queryData, isLoading, isError, error, refetch } = useQuery({
    queryKey: chiaveFasi,
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name, position, auto_status, win_probability, stalled_threshold_days")
        .eq("pipeline_id", pipelineId)
        .eq("company_id", companyId)
        .order("position");
      if (error) throw error;
      return data as Stage[];
    },
    enabled: !!pipelineId && !!companyId,
  });

  // Le fasi come sono nel database; la bozza (`null` = nessuna modifica) le sostituisce finché non si salva. Così, se un
  // salvataggio riesce a metà, basta rileggere il database: la bozza resta, e «salvate» è sempre com'è davvero.
  const salvate: Stage[] = queryData ?? [];
  const [bozza, setBozza] = useState<Stage[] | null>(null);
  const stages = bozza ?? salvate;
  const hasChanges = bozza !== null;
  useSettingsDraftGuard(hasChanges || isSaving);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** Applica una modifica alla bozza (partendo dalle fasi salvate se ancora non ce n'è una). */
  const modifica = (cambia: (fasi: Stage[]) => Stage[]) => setBozza((corrente) => cambia(corrente ?? salvate));

  // Dopo «Aggiungi» o una freccia: dove torna il focus (il nome della fase nuova, la freccia appena premuta),
  // quale riga si illumina un attimo, e cosa sente chi usa il lettore di schermo.
  const daRaggiungere = useRef<{ id: string; controllo: "nome" | "su" | "giu" } | null>(null);
  const [evidenziata, setEvidenziata] = useState<string | null>(null);
  const [annuncio, setAnnuncio] = useState("");
  const contatoreNuove = useRef(0);

  // Si guarda dopo ogni cambio dell'elenco: è lì che la fase nuova o spostata è già al suo posto.
  useEffect(() => {
    const destinazione = daRaggiungere.current;
    if (!destinazione) return;
    daRaggiungere.current = null;
    const ids = idsFase(destinazione.id);
    if (destinazione.controllo === "nome") {
      // La fase nuova va in fondo: la si porta a metà schermo e il nome è già selezionato, si scrive subito.
      const campo = document.getElementById(ids.nome) as HTMLInputElement | null;
      if (!campo) return;
      campo.scrollIntoView?.({ block: "center", behavior: "smooth" });
      campo.focus({ preventScroll: true });
      campo.select();
      return;
    }
    // La freccia premuta, oppure l'altra se la fase è arrivata in cima o in fondo: si può continuare a premere.
    const [preferita, altra] = destinazione.controllo === "su" ? [ids.su, ids.giu] : [ids.giu, ids.su];
    const bottone = [document.getElementById(preferita), document.getElementById(altra)]
      .find((el): el is HTMLElement => !!el && !el.matches(":disabled"));
    bottone?.focus();
  }, [stages]);

  useEffect(() => {
    if (!evidenziata) return;
    const timer = window.setTimeout(() => setEvidenziata(null), 1200);
    return () => window.clearTimeout(timer);
  }, [evidenziata]);

  function handleDragEnd(event: DragEndEvent) {
    if (!puoModificare || isSaving) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      modifica((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return items;
        return arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, position: idx }));
      });
    }
  }

  /** Le frecce: una posizione su o giù, nella bozza come il trascinamento. */
  const handleSposta = (id: string, direzione: -1 | 1) => {
    if (!puoModificare || isSaving) return;
    const da = stages.findIndex((s) => s.id === id);
    const a = da + direzione;
    if (da < 0 || a < 0 || a >= stages.length) return;
    modifica((items) => {
      const i = items.findIndex((s) => s.id === id);
      const j = i + direzione;
      if (i < 0 || j < 0 || j >= items.length) return items;
      return arrayMove(items, i, j).map((item, idx) => ({ ...item, position: idx }));
    });
    const nome = normalizeName(stages[da].name);
    setAnnuncio(`${nome ? `«${nome}»` : "Fase senza nome"}: posizione ${a + 1} di ${stages.length}.`);
    setEvidenziata(id);
    daRaggiungere.current = { id, controllo: direzione < 0 ? "su" : "giu" };
  };

  const handleUpdate = (id: string, name: string) => modifica((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));

  const handleAutoStatusChange = (id: string, auto_status: string | null) =>
    modifica((prev) => prev.map((s) => (s.id === id ? { ...s, auto_status } : s)));

  const handleSalesOSChange = (id: string, field: 'win_probability' | 'stalled_threshold_days', value: number | null) =>
    modifica((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  const handleDelete = async (id: string) => {
    if (!puoModificare || isSaving) return;
    if (!companyId) {
      toast.error("Azienda non disponibile. Ricarica la pagina e riprova.");
      return;
    }

    if (!id.startsWith("temp-")) {
      const { count, error } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", id)
          .eq("company_id", companyId);

      if (error) { toast.error("Impossibile verificare le opportunità collegate. Riprova."); return; }
      if (count && count > 0) {
        toast.error(`Impossibile rimuovere: ${count} opportunità collegate a questa fase. Spostale prima.`);
        return;
      }
    }

    modifica((prev) => prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, position: idx })));
  };

  const handleAdd = () => {
    if (!puoModificare || isSaving) return;
    const id = `temp-${Date.now()}-${++contatoreNuove.current}`;
    modifica((prev) => {
      // «Nuova fase», poi «Nuova fase 2»…: due fasi con lo stesso nome non si potrebbero salvare.
      const nomi = new Set(prev.map((s) => normalizeName(s.name).toLowerCase()));
      let name = "Nuova fase";
      for (let n = 2; nomi.has(name.toLowerCase()); n++) name = `Nuova fase ${n}`;
      return [...prev, {
        id,
        name,
        position: prev.length,
        auto_status: null,
        win_probability: null,
        stalled_threshold_days: 14,
      }];
    });
    setEvidenziata(id);
    daRaggiungere.current = { id, controllo: "nome" };
  };

  async function handleSave() {
    if (!companyId || !puoModificare || isSaving || isError) return;
    setIsSaving(true);
    // Quante scritture sono già andate a buon fine: se una successiva fallisce, il database è cambiato a metà.
    let scritte = 0;
    try {
      const normalizedStages = stages
        .map((stage, idx) => ({ ...stage, name: normalizeName(stage.name), position: idx }))
        .filter((stage) => stage.name);

      if (normalizedStages.length === 0) {
        toast.error("Aggiungi almeno una fase valida prima di salvare.");
        setIsSaving(false);
        return;
      }

      if (hasDuplicateStageNames(normalizedStages)) {
        toast.error("Le fasi non possono avere nomi duplicati.");
        setIsSaving(false);
        return;
      }

      const original = salvate;
      const originalIds = new Set(original.map((s) => s.id));
      const currentIds = new Set(normalizedStages.map((s) => s.id));

      const toDelete = original.filter((s) => !currentIds.has(s.id));

      for (const stage of toDelete) {
        const { count, error } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", stage.id)
          .eq("company_id", companyId);

        if (error) throw error;
        if (count && count > 0) {
          toast.error(`Impossibile eliminare la fase "${stage.name}": ${count} opportunità collegate.`);
          setIsSaving(false);
          return;
        }
      }

      for (const stage of toDelete) {
        const { error } = await supabase.from("marketing_pipeline_stages").delete().eq("id", stage.id).eq("company_id", companyId!).select("id").single();
        if (error) throw error;
        scritte++;
      }

      for (const stage of normalizedStages) {
        if (originalIds.has(stage.id)) {
          const { error } = await supabase
            .from("marketing_pipeline_stages")
            .update({
              name: stage.name,
              position: stage.position,
              auto_status: stage.auto_status,
              win_probability: stage.win_probability,
              stalled_threshold_days: stage.stalled_threshold_days,
            } satisfies StageUpdatePayload)
            .eq("id", stage.id)
            .eq("company_id", companyId).select("id").single();
          if (error) throw error;
          scritte++;
        }
      }

      const toInsert = normalizedStages
        .filter((s) => s.id.startsWith("temp-"))
        .map((s) => ({
          pipeline_id: pipelineId,
          company_id: companyId,
          name: s.name,
          position: s.position,
          auto_status: s.auto_status,
          win_probability: s.win_probability,
          stalled_threshold_days: s.stalled_threshold_days,
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("marketing_pipeline_stages").insert(toInsert);
        if (error) throw error;
        scritte++;
      }

      // Si rilegge prima di togliere la bozza: le fasi nuove hanno il loro id vero e non c'è un momento con l'elenco vecchio.
      await queryClient.refetchQueries({ queryKey: chiaveFasi });
      setBozza(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
      // Anche il Kanban mantiene le fasi in cache: deve rileggere subito nomi,
      // ordine e nuove colonne quando si torna alle opportunità.
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: ["bulk-opp-stages", pipelineId] });
      toast.success("Fasi salvate");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
      if (scritte > 0) {
        // Il salvataggio è fatto di più scritture una dopo l'altra: se una fallisce, quelle prima sono già nel database.
        // Si rilegge l'elenco (la bozza resta com'è) così «Salva le fasi» riparte da come sono le fasi adesso.
        toast.warning("Una parte delle modifiche era già stata salvata. Ho riletto le fasi: controlla e premi «Salva le fasi» di nuovo.");
        void queryClient.refetchQueries({ queryKey: chiaveFasi });
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list(companyId) });
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fasi non disponibili</CardTitle>
          <CardDescription>{getErrorMessage(error)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => refetch()} className="max-md:h-11">
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl">
      {/* I pulsanti vanno sotto il titolo quando la scheda è stretta (telefono, tablet con la barra laterale), non lo schiacciano. */}
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1 basis-64 space-y-1.5">
          <CardTitle>Fasi di «{pipelineName}»</CardTitle>
          <CardDescription>La prima fase è dove entrano i nuovi contatti dei moduli.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sul telefono si legge «Guida», così i due pulsanti stanno su una riga; il nome per intero resta nell'etichetta. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Guida alle colonne"
            aria-expanded={guidaAperta}
            aria-controls={idGuida}
            onClick={() => setGuidaAperta((aperta) => !aperta)}
            className="text-muted-foreground max-md:h-11"
          >
            <Info />
            <span>Guida<span className="max-sm:hidden"> alle colonne</span></span>
          </Button>
          {puoModificare && (
            <Button disabled={isSaving} variant="outline" size="sm" onClick={handleAdd} className="max-md:h-11">
              <Plus /> Aggiungi una fase
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!puoModificare && (
          <AvvisoSolaLettura>
            Sola lettura: per modificare le fasi serve il permesso «Modifica» su Personalizzazione.
          </AvvisoSolaLettura>
        )}
        {/* Le spiegazioni stanno qui, una volta sola, e non sotto ogni fase. */}
        <div id={idGuida} hidden={!guidaAperta} className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <dl className="grid gap-x-3 gap-y-2 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
            <dt className="font-medium text-foreground">Esito</dt>
            <dd>
              <p>Lo stato che prende la trattativa quando arriva nella fase.</p>
              <ul className="mt-1 space-y-0.5">
                {AUTO_STATUS_OPTIONS.map((opt) => (
                  <li key={opt.value}>
                    <PallinoEsito valore={opt.value} />
                    <span className="font-medium text-foreground">{opt.label}</span>: {opt.hint}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Per far partire un&apos;automazione su una fase basta il cambio di fase: le regole scattano già lì.</p>
            </dd>
            <dt className="font-medium text-foreground">Prob. %</dt>
            <dd>{SPIEGAZIONE_PROBABILITA}</dd>
            <dt className="font-medium text-foreground">Ferma (gg)</dt>
            <dd>{SPIEGAZIONE_FERMA}</dd>
          </dl>
        </div>
        <div className="rounded-lg border">
          {stages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessuna fase. Aggiungi la prima fase della pipeline.</p>
          ) : (
            <>
              {/* Intestazione delle colonne, solo dove la fase sta su una riga: stesse larghezze delle righe. */}
              <div aria-hidden="true" className="hidden items-center gap-1.5 rounded-t-lg border-b bg-muted/40 px-1.5 py-1 text-xs font-medium text-muted-foreground lg:flex">
                {puoModificare && <span className="w-20 shrink-0" />}
                <span className="flex-1 px-2">Fase</span>
                <span className="w-[8.5rem] shrink-0 px-2" title="Lo stato che prende la trattativa quando arriva nella fase">Esito</span>
                <span className="w-16 shrink-0 pr-2 text-right" title="Probabilità di vittoria della fase">Prob. %</span>
                <span className="w-[4.5rem] shrink-0 pr-2 text-right" title={SPIEGAZIONE_FERMA}>Ferma (gg)</span>
                {puoModificare && <span className="w-8 shrink-0" />}
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {/* Senza permesso, o mentre si salva, il fieldset spegne campi, menu, frecce e cestino in un colpo solo. */}
                  <fieldset disabled={!puoModificare || isSaving} className="m-0 min-w-0 divide-y border-0 p-0">
                    {stages.map((stage, indice) => (
                      <SortableStage
                        key={stage.id}
                        stage={stage}
                        indice={indice}
                        totale={stages.length}
                        modificabile={puoModificare}
                        evidenziata={evidenziata === stage.id}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        canDelete={stages.length > 1}
                        onAutoStatusChange={handleAutoStatusChange}
                        onSalesOSChange={handleSalesOSChange}
                        onSposta={handleSposta}
                      />
                    ))}
                  </fieldset>
                </SortableContext>
              </DndContext>
            </>
          )}
          {/* Anche in fondo: la fase nuova compare qui, dove si sta già guardando. */}
          {puoModificare && (
            <div className={cn("p-1", stages.length > 0 && "border-t")}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={handleAdd}
                className="h-8 w-full justify-start text-muted-foreground max-md:h-11"
              >
                <Plus /> Aggiungi fase
              </Button>
            </div>
          )}
        </div>
        <p role="status" className="sr-only">{annuncio}</p>
        {/* La barra del salvataggio resta in vista: con una decina di fasi il pulsante in cima usciva dallo schermo. */}
        {puoModificare && (hasChanges || isSaving) && (
          <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-card px-6 py-3">
            <span role="status" className="text-sm text-muted-foreground">Modifiche non salvate</span>
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving} className="max-md:h-11">
              {isSaving && <Loader2 className="animate-spin" />} Salva le fasi
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
