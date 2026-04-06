import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { DashboardWidget } from "@/components/admin/dashboard/DashboardWidgetLayout";

const LOCAL_STORAGE_KEY = "adminDashboardLayout";
const DEBOUNCE_MS = 1500;

interface UseWidgetLayoutPersistenceReturn {
  layout: DashboardWidget[] | null;
  isLoading: boolean;
  isSaving: boolean;
  saveLayout: (layout: DashboardWidget[]) => void;
  saveNow: (layout: DashboardWidget[]) => void;
  resetLayout: () => Promise<void>;
}

export function useWidgetLayoutPersistence(
  userId: string | undefined,
  defaultLayout: DashboardWidget[]
): UseWidgetLayoutPersistenceReturn {
  const [layout, setLayout] = useState<DashboardWidget[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carica layout al mount
  useEffect(() => {
    if (!userId) {
      // Fallback a localStorage
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as DashboardWidget[];
          setLayout(parsed);
        }
      } catch {
        // localStorage non disponibile
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    supabase
      .from("admin_dashboard_preferences")
      .select("widget_layout, widget_visibility")
      .eq("admin_user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Errore caricamento preferenze dashboard:", error.message);
          // Fallback localStorage
          try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved) as DashboardWidget[];
              setLayout(parsed);
              setIsLoading(false);
              return;
            }
          } catch {
            // ignore
          }
          setIsLoading(false);
          return;
        }

        if (data && Array.isArray(data.widget_layout) && data.widget_layout.length > 0) {
          setLayout(data.widget_layout as DashboardWidget[]);
        } else {
          // Fallback localStorage
          try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved) as DashboardWidget[];
              setLayout(parsed);
              setIsLoading(false);
              return;
            }
          } catch {
            // ignore
          }
        }
        setIsLoading(false);
      });
  }, [userId]);

  const persistToDb = useCallback(
    async (newLayout: DashboardWidget[]): Promise<void> => {
      if (!userId) return;
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from("admin_dashboard_preferences")
          .upsert(
            {
              admin_user_id: userId,
              widget_layout: newLayout as unknown as Record<string, unknown>[],
              widget_visibility: {},
            },
            { onConflict: "admin_user_id" }
          );
        if (error) throw new Error(error.message);
        toast({
          title: "Layout dashboard salvato con successo",
          duration: 3000,
        });
        // Aggiorna localStorage come cache
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newLayout));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Errore sconosciuto";
        console.error("Errore salvataggio layout:", msg);
        toast({
          title: "Errore nel salvataggio del layout. Riprova.",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [userId]
  );

  const saveLayout = useCallback(
    (newLayout: DashboardWidget[]): void => {
      setLayout(newLayout);
      // Salva sempre su localStorage (sincrono)
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newLayout));
      } catch {
        // ignore
      }
      // Debounce salvataggio su DB
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        persistToDb(newLayout);
      }, DEBOUNCE_MS);
    },
    [persistToDb]
  );

  const saveNow = useCallback(
    (newLayout: DashboardWidget[]): void => {
      // Cancella il debounce pendente e salva subito su DB
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newLayout));
      } catch {
        // ignore
      }
      persistToDb(newLayout);
    },
    [persistToDb]
  );

  const resetLayout = useCallback(async (): Promise<void> => {
    setLayout(defaultLayout);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (!userId) return;
    try {
      const { error } = await supabase
        .from("admin_dashboard_preferences")
        .delete()
        .eq("admin_user_id", userId);
      if (error) {
        console.error("Errore reset layout:", error.message);
      }
    } catch (err) {
      console.error("Errore reset layout:", err);
    }
  }, [userId, defaultLayout]);

  // Cleanup debounce al unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return { layout, isLoading, isSaving, saveLayout, saveNow, resetLayout };
}
