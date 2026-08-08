import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusItem } from "./StatusItem";
import { OrderProgressTracker, type OrderStatus } from "@/components/orders/OrderProgressTracker";
import { cn } from "@/lib/utils";

/** Modelli di pipeline per tipo di lavoro. Applicarne uno sostituisce la LISTA
 *  LOCALE (anteprima inclusa): gli stati con lo stesso nome — e la fase
 *  Assistenza — riusano gli UUID esistenti, quindi storico e ordini collegati
 *  restano intatti. Nulla tocca il DB finché non si preme "Salva"; la RPC
 *  save_order_statuses blocca comunque l'eliminazione di stati con ordini. */
const PIPELINE_PRESETS: {
  key: string;
  label: string;
  hint: string;
  statuses: { name: string; icon: string; color: string }[];
}[] = [
  {
    key: "serramenti",
    label: "Serramenti / Infissi",
    hint: "Flusso prodotto: produzione → consegna → posa",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Rilievo Tecnico", icon: "ClipboardCheck", color: "#D97706" },
      { name: "In Produzione", icon: "Package", color: "#7C3AED" },
      { name: "Produzione Finita", icon: "PackageCheck", color: "#0891B2" },
      { name: "Merce in Magazzino", icon: "Truck", color: "#4F46E5" },
      { name: "Posa Programmata", icon: "CalendarClock", color: "#DB2777" },
      { name: "Posa Completata", icon: "CheckCircle2", color: "#16A34A" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
  {
    key: "fotovoltaico",
    label: "Fotovoltaico",
    hint: "Sopralluogo → pratiche → installazione → allaccio",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Sopralluogo Tecnico", icon: "ClipboardCheck", color: "#D97706" },
      { name: "Pratiche e Autorizzazioni", icon: "FileText", color: "#7C3AED" },
      { name: "Materiale Ordinato", icon: "Package", color: "#0891B2" },
      { name: "Installazione", icon: "HardHat", color: "#DB2777" },
      { name: "Allaccio e Collaudo", icon: "Zap", color: "#F59E0B" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
  {
    key: "ristrutturazioni",
    label: "Ristrutturazioni",
    hint: "Pipeline corta: l'avanzamento vero vive nelle lavorazioni di cantiere",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Cantiere in Corso", icon: "HardHat", color: "#D97706" },
      { name: "SAL Intermedi", icon: "Banknote", color: "#7C3AED" },
      { name: "Fine Lavori", icon: "CheckCircle2", color: "#0891B2" },
      { name: "Collaudo e Consegna", icon: "ShieldCheck", color: "#16A34A" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
  {
    key: "impianti",
    label: "Impianti",
    hint: "Elettrico / idraulico / clima",
    statuses: [
      { name: "Contratto Firmato", icon: "FileSignature", color: "#2563EB" },
      { name: "Acconto Pagato", icon: "Euro", color: "#16A34A" },
      { name: "Sopralluogo", icon: "ClipboardCheck", color: "#D97706" },
      { name: "Installazione", icon: "Hammer", color: "#7C3AED" },
      { name: "Collaudo e Certificazione", icon: "ShieldCheck", color: "#0891B2" },
      { name: "Assistenza", icon: "Wrench", color: "#64748B" },
    ],
  },
];

export function OrderStatusConfig() {
  const { effectiveCompany } = useAuth();
  const company = effectiveCompany;
  const queryClient = useQueryClient();
  
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: queryData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["order-statuses-config", company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("*")
        .eq("company_id", company!.id)
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (queryData && !hasChanges) {
      setStatuses(queryData);
    }
  }, [queryData, hasChanges]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStatuses((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return items;

        const newItems = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          position: index,
        }));

        setHasChanges(true);
        return newItems;
      });
    }
  }

  // Update a single status
  const handleUpdateStatus = useCallback((id: string, updates: Partial<OrderStatus>) => {
    setStatuses((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
    setHasChanges(true);
  }, []);

  // Delete a status — blocca eliminazione fase Assistenza
  const handleDeleteStatus = useCallback((id: string) => {
    let deleted = false;
    setStatuses((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.is_support_phase) {
        toast.error("La fase Assistenza non può essere eliminata: viene usata automaticamente quando apri un ticket.");
        return prev;
      }
      const filtered = prev.filter((s) => s.id !== id);
      deleted = filtered.length !== prev.length;
      return filtered.map((s, index) => ({ ...s, position: index }));
    });
    if (deleted) setHasChanges(true);
  }, []);

  // Applica un modello di pipeline: sostituisce la lista locale riusando gli
  // UUID degli stati omonimi (e della fase Assistenza) → niente perdita di
  // storico. Diventa effettivo solo con "Salva".
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const applyPreset = useCallback((presetKey: string) => {
    const preset = PIPELINE_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setStatuses((prev) => {
      const byName = new Map(prev.map((s) => [s.name.trim().toLowerCase(), s]));
      const support = prev.find((s) => s.is_support_phase);
      return preset.statuses.map((p, index) => {
        const key = p.name.trim().toLowerCase();
        const isSupport = key === "assistenza";
        const existing = (isSupport && support) || byName.get(key);
        return {
          ...(existing ?? {}),
          id: existing?.id ?? `temp-${Date.now()}-${index}`,
          name: p.name,
          icon: p.icon,
          color: p.color,
          position: index,
          is_support_phase: isSupport || existing?.is_support_phase === true,
        } as OrderStatus;
      });
    });
    setSelectedPreset(presetKey);
    setHasChanges(true);
    toast.info(`Modello "${preset.label}" caricato: controlla l'anteprima e premi Salva.`);
  }, []);

  // Add a new status
  const handleAddStatus = useCallback(() => {
    const newStatus: OrderStatus = {
      id: `temp-${Date.now()}`,
      name: "Nuovo Stato",
      icon: "Circle",
      color: "#2563EB",
      position: statuses.length,
    };
    setStatuses((prev) => [...prev, newStatus]);
    setHasChanges(true);
  }, [statuses.length]);

  // Save all changes — usa RPC atomica save_order_statuses (non distruttiva,
  // preserva UUID, storico ordini e current_status_id degli ordini esistenti)
  async function handleSave() {
    if (!company?.id) {
      toast.error("Azienda non selezionata: impossibile salvare gli stati ordine.");
      return;
    }

    const normalizedNames = statuses.map((s) => s.name.trim().toLowerCase());
    if (normalizedNames.some((name) => !name)) {
      toast.error("Ogni stato deve avere un nome.");
      return;
    }
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      toast.error("Hai inserito due stati con lo stesso nome.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = statuses.map((s, index) => ({
        // Mantieni UUID solo se è un ID reale (non "temp-*")
        id: s.id && !s.id.startsWith("temp-") ? s.id : undefined,
        name: s.name,
        icon: s.icon,
        color: s.color,
        position: index,
        is_support_phase: s.is_support_phase === true,
      }));

      const { data, error } = await supabase.rpc("save_order_statuses", {
        p_company_id: company.id,
        p_statuses: payload,
      });

      if (error) throw error;

      if (data) {
        setStatuses(data as OrderStatus[]);
      }

      await queryClient.invalidateQueries({ queryKey: ["order-statuses-config", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["orders", "statuses", company.id] });
      // OrdersList/CreateOrder/Calendar usano la chiave storica "order-statuses":
      // senza questa riga vedevano le fasi vecchie fino a 10 minuti.
      await queryClient.invalidateQueries({ queryKey: ["order-statuses", company.id] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setHasChanges(false);
      toast.success("Salvato: gli stati ordine sono stati aggiornati");
    } catch (error: unknown) {
      const rawMsg = error instanceof Error ? error.message : "Impossibile salvare le modifiche";
      let errorMsg = rawMsg;

      // Traduzioni errori dalla RPC
      if (rawMsg.includes("status_in_use")) {
        // Estrai nome stato + numero ordini dal messaggio
        const match = rawMsg.match(/lo stato "([^"]+)" è associato a (\d+) ordine/);
        if (match) {
          errorMsg = `Impossibile eliminare lo stato "${match[1]}": è associato a ${match[2]} ordine/i. Sposta prima gli ordini su un altro stato.`;
        } else {
          errorMsg = "Impossibile eliminare uno stato associato a ordini esistenti.";
        }
      } else if (rawMsg.includes("support_phase_required")) {
        errorMsg = "La fase Assistenza non può essere rimossa: viene usata automaticamente quando apri un ticket.";
      } else if (rawMsg.includes("forbidden")) {
        errorMsg = "Non hai i permessi per modificare gli stati ordine.";
      } else if (rawMsg.includes("almeno 2 stati")) {
        errorMsg = "Sono richiesti almeno 2 stati ordine.";
      }

      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Stati ordine non disponibili</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Non riesco a caricare la configurazione degli stati ordine. Verifica la connessione o riprova.
          </p>
          <p className="text-xs">{error instanceof Error ? error.message : "Errore sconosciuto"}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const canDeleteStatus = statuses.length > 2;
  const previewStatusId = statuses.length > 1 ? statuses[Math.floor(statuses.length / 2)]?.id : statuses[0]?.id;

  return (
    <div className="space-y-6">
      {/* Modelli di pipeline per tipo di lavoro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Modelli di pipeline</CardTitle>
          <CardDescription>
            Parti dal flusso giusto per il tuo tipo di lavoro. Gli stati con lo stesso
            nome (e la fase Assistenza) vengono mantenuti con il loro storico; le
            modifiche diventano effettive solo con &ldquo;Salva&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PIPELINE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  selectedPreset === p.key
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selectedPreset && (
            <p className="text-xs text-muted-foreground">
              {PIPELINE_PRESETS.find((p) => p.key === selectedPreset)?.hint}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle>Anteprima Progress Tracker</CardTitle>
          <CardDescription>
            Così apparirà ai clienti quando visualizzeranno lo stato del loro ordine
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <OrderProgressTracker
            statuses={statuses}
            currentStatusId={previewStatusId || null}
          />
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Configurazione Stati</CardTitle>
            <CardDescription>
              Trascina per riordinare, clicca per modificare
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddStatus}
            >
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi Stato
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={statuses.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {statuses.map((status) => (
                  <StatusItem
                    key={status.id}
                    status={status}
                    onUpdate={handleUpdateStatus}
                    onDelete={handleDeleteStatus}
                    canDelete={canDeleteStatus}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {statuses.length < 2 && (
            <p className="text-sm text-destructive mt-4">
              Sono richiesti almeno 2 stati ordine
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
