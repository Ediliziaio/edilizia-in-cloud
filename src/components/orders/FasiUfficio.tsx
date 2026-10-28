/**
 * Cantiere → «Ufficio»: le fasi d'ufficio della commessa in ordine — contratto, misure, ordini,
 * pratiche, detrazioni, SAL e fatture, consegna — ognuna con chi la fa, la scadenza e lo stato.
 * Sono attività vere (tasks con activity_scope «ufficio»): ognuno le ritrova nelle sue Attività.
 * Una fase può aspettare un'altra attività o una fase del cantiere; quando quella si chiude
 * si sblocca da sola (trigger nel database) e avvisa chi la deve fare.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { campoWorkDay } from "@/lib/campo/workDay";

// Colonne nuove (activity_scope, attende_fase_id) non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FaseUfficio {
  id: string;
  title: string;
  status: "da_fare" | "in_corso" | "in_attesa" | "completata" | string;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  ufficio_id: string | null;
  sort_order: number | null;
  bloccata_da_task_id: string | null;
  attende_fase_id: string | null;
}

export const chiaveFasiUfficio = (orderId: string) =>
  ["commessa-fasi-ufficio", orderId] as const;

/** In ritardo: non completata e scadenza passata. */
export function inRitardo(
  f: Pick<FaseUfficio, "status" | "due_date">,
  oggi = campoWorkDay(),
): boolean {
  return (
    f.status !== "completata" &&
    f.status !== "in_attesa" &&
    !!f.due_date &&
    f.due_date < oggi
  );
}

export { OfficeWorkspace as FasiUfficio } from "./OfficeWorkspace";

/** Panoramica: una riga sola — quante fasi d'ufficio sono fatte, la prossima e chi la fa. */
export function RiepilogoFasiUfficio({
  orderId,
  onOpen,
}: {
  orderId: string;
  onOpen: () => void;
}) {
  const { effectiveCompany } = useAuth();
  const q = useQuery({
    queryKey: [...chiaveFasiUfficio(orderId), "riepilogo"],
    enabled: !!orderId && !!effectiveCompany?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("tasks")
        .select("id, title, status, due_date, sort_order")
        .eq("company_id", effectiveCompany?.id)
        .eq("order_id", orderId)
        .eq("activity_scope", "ufficio")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<
        Pick<FaseUfficio, "id" | "title" | "status" | "due_date" | "sort_order">
      >;
    },
  });
  const righe = q.data ?? [];
  if (q.isError || righe.length === 0) return null;
  const fatte = righe.filter((r) => r.status === "completata").length;
  const prossima =
    righe.find((r) => r.status !== "completata" && r.status !== "in_attesa") ??
    righe.find((r) => r.status !== "completata");
  const ritardo = righe.filter((r) => inRitardo(r)).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left hover:bg-muted/40"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          Ufficio · {fatte} di {righe.length} fasi fatte
          {ritardo > 0 ? ` · ${ritardo} in ritardo` : ""}
        </span>
        {prossima && (
          <span className="block truncate text-xs text-muted-foreground">
            Prossima: {prossima.title}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-primary underline">Apri</span>
    </button>
  );
}
