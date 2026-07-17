import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CHECKLIST_ITEMS,
  createInitialRisposte,
  isChecklistCompleta,
  type ChecklistRisposta,
} from "@/lib/campo/checklist-items";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { isOnline } from "@/lib/campo/network-status";

export type Turno = "mattina" | "pomeriggio" | "notte";
const CHECKLIST_REQUEST_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export interface ChecklistSicurezzaRecord {
  id?: string;
  company_id: string;
  order_id?: string | null;
  operaio_id: string;
  data: string;
  turno: Turno;
  risposte: ChecklistRisposta[];
  note?: string | null;
  foto_urls?: string[];
  completata: boolean;
  firmata: boolean;
  posizione_gps?: { lat: number; lng: number; accuracy: number } | null;
}

interface UseChecklistState {
  loading: boolean;
  record: ChecklistSicurezzaRecord | null;
  risposte: ChecklistRisposta[];
  note: string;
  saving: boolean;
  error: string | null;
}

interface UseChecklistActions {
  toggleItem: (itemId: string) => void;
  setItemFoto: (itemId: string, fotoUrl: string) => void;
  setNote: (note: string) => void;
  conferma: (
    orderId?: string | null,
    gps?: { lat: number; lng: number; accuracy: number } | null,
  ) => Promise<boolean>;
  reset: () => void;
}

export function useChecklistSicurezza(turno: Turno = "mattina"): UseChecklistState & UseChecklistActions {
  const { user, profile } = useAuth();
  const { enqueue } = useOfflineSync();
  const today = format(new Date(), "yyyy-MM-dd");

  const [state, setState] = useState<UseChecklistState>({
    loading: true,
    record: null,
    risposte: createInitialRisposte(),
    note: "",
    saving: false,
    error: null,
  });

  // Fetch record del giorno se esiste
  useEffect(() => {
    if (!user?.id) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;

    void (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("checklist_sicurezza" as never)
            .select("id, company_id, order_id, operaio_id, data, turno, risposte, note, foto_urls, completata, firmata, posizione_gps")
            .eq("operaio_id", user.id)
            .eq("data", today)
            .eq("turno", turno)
            .maybeSingle(),
          CHECKLIST_REQUEST_TIMEOUT_MS,
          "Caricamento checklist troppo lento",
        );

        if (cancelled) return;

        if (error && error.code !== "PGRST116") {
          console.error("[useChecklistSicurezza] fetch error", error);
          setState((s) => ({ ...s, loading: false, error: "Impossibile caricare la checklist" }));
          return;
        }

        if (data) {
          const record = data as unknown as ChecklistSicurezzaRecord;
          setState({
            loading: false,
            record,
            risposte: record.risposte ?? createInitialRisposte(),
            note: record.note ?? "",
            saving: false,
            error: null,
          });
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[useChecklistSicurezza] errore", err);
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Errore di rete",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, today, turno]);

  const toggleItem = useCallback((itemId: string) => {
    setState((s) => ({
      ...s,
      risposte: s.risposte.map((r) =>
        r.itemId === itemId
          ? { ...r, checked: !r.checked, timestamp: new Date().toISOString() }
          : r,
      ),
    }));
  }, []);

  const setItemFoto = useCallback((itemId: string, fotoUrl: string) => {
    setState((s) => ({
      ...s,
      risposte: s.risposte.map((r) =>
        r.itemId === itemId ? { ...r, fotoUrl, timestamp: new Date().toISOString() } : r,
      ),
    }));
  }, []);

  const setNote = useCallback((note: string) => {
    setState((s) => ({ ...s, note }));
  }, []);

  const conferma = useCallback(
    async (
      orderId?: string | null,
      gps?: { lat: number; lng: number; accuracy: number } | null,
    ): Promise<boolean> => {
      if (!user?.id || !profile?.company_id) {
        setState((s) => ({ ...s, error: "Profilo non disponibile" }));
        return false;
      }

      const completata = isChecklistCompleta(state.risposte);
      if (!completata) {
        setState((s) => ({
          ...s,
          error: "Spunta tutti gli elementi critici prima di confermare",
        }));
        return false;
      }

      setState((s) => ({ ...s, saving: true, error: null }));

      const payload: ChecklistSicurezzaRecord = {
        company_id: profile.company_id,
        order_id: orderId ?? null,
        operaio_id: user.id,
        data: today,
        turno,
        risposte: state.risposte,
        note: state.note || null,
        foto_urls: state.risposte
          .map((r) => r.fotoUrl)
          .filter((u): u is string => Boolean(u)),
        completata: true,
        firmata: true,
        posizione_gps: gps ?? null,
      };

      try {
        if (isOnline()) {
          const { error } = await supabase
            .from("checklist_sicurezza" as never)
            .upsert(payload as never, {
              onConflict: "company_id,operaio_id,data,turno",
            });
          // Se siamo ONLINE ed è il server a rifiutare (RLS, vincolo, payload)
          // non è un problema di rete: accodare significa solo ritentare 5
          // volte, fallire e morire in silenzio in IndexedDB — mentre l'utente
          // ha già letto "Checklist confermata". Su un adempimento di
          // sicurezza è inaccettabile: qui l'errore va detto.
          if (error) {
            setState((s) => ({ ...s, saving: false, error: error.message }));
            return false;
          }
        } else {
          await enqueue("checklist", payload);
        }
        setState((s) => ({ ...s, saving: false }));
        return true;
      } catch (err) {
        console.error("[useChecklistSicurezza] conferma error", err);
        // Idem: la coda è per l'OFFLINE. Se siamo online l'eccezione è reale.
        if (isOnline()) {
          setState((s) => ({
            ...s,
            saving: false,
            error: err instanceof Error ? err.message : "Impossibile salvare la checklist",
          }));
          return false;
        }
        try {
          await enqueue("checklist", payload);
          setState((s) => ({ ...s, saving: false }));
          return true;
        } catch {
          setState((s) => ({
            ...s,
            saving: false,
            error: "Impossibile salvare la checklist, riprova tra qualche secondo",
          }));
          return false;
        }
      }
    },
    [user?.id, profile?.company_id, state.risposte, state.note, today, turno, enqueue],
  );

  const reset = useCallback(() => {
    setState({
      loading: false,
      record: null,
      risposte: createInitialRisposte(),
      note: "",
      saving: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    toggleItem,
    setItemFoto,
    setNote,
    conferma,
    reset,
  };
}

export { CHECKLIST_ITEMS };
