import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizzaTelefono } from "@/lib/sms-utils";
import { buildTaskStatusUpdate } from "@/lib/taskStatuses";

export type FishCallback = {
  id: string;
  fish_call_id: string;
  contact_id: string | null;
  title: string;
  notes: string | null;
  status: string;
  due_date: string | null;
};

export type FishCallbackTask = FishCallback & { updated_at: string };

export const fishCallbackOutcomes = [
  "Contattato",
  "Non risponde",
  "Occupato",
  "Numero errato",
] as const;

export type FishCallbackOutcome = (typeof fishCallbackOutcomes)[number];

export function phoneForFishCallback(notes: string | null) {
  const request = notes?.split("\n\nEsito richiamo (", 1)[0] ?? "";
  const numbers = Array.from(request.matchAll(/^Numero:[ \t]*([^\r\n]+)$/gim));
  if (numbers.length !== 1) return null;
  const { e164, valido } = normalizzaTelefono(numbers[0][1].trim().replace(/^00(?=\d)/, "+"));
  return valido && /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

export async function saveFishCallbackOutcome(
  companyId: string, callback: FishCallbackTask, outcome: FishCallbackOutcome, detail: string,
) {
  const date = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome",
  }).format(new Date());
  const comment = detail.trim();
  const entry = `Esito richiamo (${date}) — ${outcome}${comment ? `\n${comment}` : ""}`;
  const notes = [callback.notes, entry].filter(Boolean).join("\n\n");
  const { data, error } = await supabase.from("tasks")
    .update({ notes, ...(outcome === "Contattato" ? buildTaskStatusUpdate("completata") : {}) })
    .eq("company_id", companyId)
    .eq("id", callback.id)
    .eq("fish_call_id", callback.fish_call_id)
    .eq("updated_at", callback.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Non riesco a confermare il salvataggio. Controlla la scheda prima di riprovare.");
  if (!data) throw new Error("Il richiamo è cambiato o i permessi sono diversi. Controlla l’esito già registrato.");
}

export function useFishCallbacks(
  companyId: string | null | undefined,
  filters: { callId?: string; callbackId?: string; closedStatuses?: string[] },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["fish-callbacks", companyId, filters.callId, filters.callbackId, filters.closedStatuses],
    enabled: !!companyId && enabled,
    retry: false,
    refetchInterval: 20_000,
    queryFn: async (): Promise<FishCallbackTask[]> => {
      let query = supabase.from("tasks")
        .select("id,fish_call_id,contact_id,title,notes,status,due_date,updated_at")
        .eq("company_id", companyId!)
        .not("fish_call_id", "is", null);
      if (filters.callId) query = query.eq("fish_call_id", filters.callId);
      if (filters.callbackId) query = query.eq("id", filters.callbackId);
      if (filters.closedStatuses?.length) {
        const statuses = filters.closedStatuses.map((value) => JSON.stringify(value)).join(",");
        query = query.not("status", "in", `(${statuses})`).order("due_date", { ascending: true, nullsFirst: false });
      }
      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error("Richiami non disponibili. Riprova.");
      return (data || []) as FishCallbackTask[];
    },
  });
}
