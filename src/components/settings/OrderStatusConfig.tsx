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
