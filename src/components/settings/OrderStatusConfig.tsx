import React, { useState, useEffect, useCallback } from "react";
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
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusItem } from "./StatusItem";
import { OrderProgressTracker, type OrderStatus } from "@/components/orders/OrderProgressTracker";

export function OrderStatusConfig() {
  const { company } = useAuth();
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch statuses
  useEffect(() => {
    async function fetchStatuses() {
      if (!company?.id) return;

      const { data, error } = await supabase
        .from("order_statuses")
        .select("*")
        .eq("company_id", company.id)
        .order("position");

      if (!error && data) {
        setStatuses(data as OrderStatus[]);
      }
      setIsLoading(false);
    }

    fetchStatuses();
  }, [company?.id]);

  // Handle drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStatuses((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);

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

  // Delete a status
  const handleDeleteStatus = useCallback((id: string) => {
    setStatuses((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, index) => ({ ...s, position: index }));
    });
    setHasChanges(true);
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

  // Save all changes
  async function handleSave() {
    if (!company?.id) return;

    setIsSaving(true);
    try {
      // Delete all existing statuses for the company
      const { error: deleteError } = await supabase
        .from("order_statuses")
        .delete()
        .eq("company_id", company.id);

      if (deleteError) throw deleteError;

      // Insert all statuses with correct positions
      const statusesToInsert = statuses.map((s, index) => ({
        company_id: company.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        position: index,
        is_default: index === 0,
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from("order_statuses")
        .insert(statusesToInsert)
        .select();

      if (insertError) throw insertError;

      // Update local state with new IDs
      if (insertedData) {
        setStatuses(insertedData as OrderStatus[]);
      }

      setHasChanges(false);
      toast({
        title: "Salvato",
        description: "Gli stati ordine sono stati aggiornati",
      });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Impossibile salvare le modifiche",
        variant: "destructive",
      });
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
