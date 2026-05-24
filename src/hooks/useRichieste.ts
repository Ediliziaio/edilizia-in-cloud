import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import type { HrProfilo, HrRichiesta, RichiestaStato, RichiestaTipo } from "@/types/hr";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type RichiestaWithProfilo = HrRichiesta & {
  profilo?: { id: string; nome: string; cognome: string; colore_avatar: string; reparto: string | null; mansione: string | null };
};

type BalanceProfilo = Pick<HrProfilo, "id" | "ferie_residue" | "permessi_residui_ore" | "rol_residuo_ore" | "ore_giornaliere">;
type OverlapRow = Pick<HrRichiesta, "id" | "tipo" | "stato" | "data_inizio" | "data_fine">;
type RichiestaWorkflowRow = Pick<
  HrRichiesta,
  "id" | "profilo_id" | "tipo" | "data_inizio" | "data_fine" | "ore_richieste" | "stato"
>;
type HrGiornataRow = Pick<
  Tables<"hr_giornate">,
  "id" | "data" | "ore_lavorate" | "prima_entrata" | "ultima_uscita" | "note" | "source"
>;
type HrGiornataInsert = TablesInsert<"hr_giornate">;
type HrGiornataUpdate = TablesUpdate<"hr_giornate">;
type HrProfiloUpdate = TablesUpdate<"hr_profili">;
type HrRichiestaInsert = TablesInsert<"hr_richieste">;
type HrRichiestaUpdate = TablesUpdate<"hr_richieste">;
type RpcError = { code?: string; message?: string; details?: string; hint?: string };
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
};

const BLOCKING_ABSENCE_TYPES = new Set<RichiestaTipo>([
  "ferie",
  "permesso",
  "malattia",
  "rol",
  "infortunio",
  "maternita",
  "paternita",
  "lutto",
  "smart_working",
  "trasferta",
]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore sconosciuto";
}

function isMissingRpcError(error: RpcError | null) {
  if (!error) return false;
  const message = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return message.includes("pgrst202")
    || message.includes("could not find the function")
    || message.includes("function public.hr_update_richiesta_stato");
}

async function updateRichiestaStatoRpc({
  id,
  stato,
  noteRisposta,
}: {
  id: string;
  stato: RichiestaStato;
  noteRisposta?: string;
}) {
  const { error } = await (supabase as unknown as RpcClient).rpc("hr_update_richiesta_stato", {
    p_richiesta_id: id,
    p_stato: stato,
    p_note_risposta: noteRisposta ?? null,
  });

  if (!error) return true;
  if (isMissingRpcError(error)) return false;
  throw new Error(error.message || "Aggiornamento richiesta HR non riuscito");
}

async function logHrActivityBestEffort({
  companyId,
  userId,
  richiesta,
  stato,
  wasApproved,
  willBeApproved,
}: {
  companyId: string;
  userId: string | null;
  richiesta: RichiestaWorkflowRow;
  stato: RichiestaStato;
  wasApproved: boolean;
  willBeApproved: boolean;
}) {
  if (!userId) return;

  const metadata: Json = {
    profilo_id: richiesta.profilo_id,
    tipo: richiesta.tipo,
    data_inizio: richiesta.data_inizio,
    data_fine: richiesta.data_fine,
    ore_richieste: richiesta.ore_richieste,
    fallback_client: true,
  };

  try {
    await (supabase as unknown as RpcClient).rpc("log_activity", {
      p_company_id: companyId,
      p_category: "modification",
      p_event_type: "hr.request.status_changed",
      p_actor_user_id: userId,
      p_target_table: "hr_richieste",
      p_target_id: richiesta.id,
      p_target_label: richiesta.id,
      p_description: `Richiesta HR ${richiesta.tipo} impostata a ${stato}`,
      p_changes: {
        stato: { before: richiesta.stato, after: stato },
        approved_transition: willBeApproved && !wasApproved,
        restore_transition: wasApproved && !willBeApproved,
      },
      p_before_snapshot: richiesta as unknown as Json,
      p_after_snapshot: { ...richiesta, stato } as unknown as Json,
      p_importance: stato === "approvata" ? "high" : "normal",
      p_metadata: metadata,
      p_source_function: "client:fallback_useUpdateRichiestaStato",
      p_trace_id: null,
    });
  } catch {
    // L'audit è best-effort nel fallback client: il workflow principale non deve bloccarsi.
  }
}

function inclusiveDays(start: string, end: string) {
  const startTime = new Date(`${start}T12:00:00`).getTime();
  const endTime = new Date(`${end}T12:00:00`).getTime();
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}

function eachIsoDate(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);

  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function requestedHours(data: Partial<HrRichiesta>, profilo: BalanceProfilo) {
  if (data.ore_richieste != null) return data.ore_richieste;
  return inclusiveDays(data.data_inizio!, data.data_fine!) * Number(profilo.ore_giornaliere || 8);
}

function assertBalanceAvailable(data: Partial<HrRichiesta>, profilo: BalanceProfilo) {
  const tipo = data.tipo ?? "ferie";

  if (tipo === "ferie") {
    const requested = inclusiveDays(data.data_inizio!, data.data_fine!);
    const available = Number(profilo.ferie_residue ?? 0);
    if (requested > available) {
      throw new Error(`Ferie residue insufficienti: richiesta ${requested} gg, disponibili ${available} gg`);
    }
  }

  if (tipo === "permesso") {
    const requested = requestedHours(data, profilo);
    const available = Number(profilo.permessi_residui_ore ?? 0);
    if (requested > available) {
      throw new Error(`Permessi insufficienti: richiesta ${requested}h, disponibili ${available}h`);
    }
  }

  if (tipo === "rol") {
    const requested = requestedHours(data, profilo);
    const available = Number(profilo.rol_residuo_ore ?? 0);
    if (requested > available) {
      throw new Error(`ROL insufficienti: richiesta ${requested}h, disponibili ${available}h`);
    }
  }
}

function getBalanceDelta(data: Pick<HrRichiesta, "tipo" | "data_inizio" | "data_fine" | "ore_richieste">, profilo: BalanceProfilo) {
  if (data.tipo === "ferie") {
    return { ferie: inclusiveDays(data.data_inizio, data.data_fine), permessi: 0, rol: 0 };
  }

  if (data.tipo === "permesso") {
    return { ferie: 0, permessi: requestedHours(data, profilo), rol: 0 };
  }

  if (data.tipo === "rol") {
    return { ferie: 0, permessi: 0, rol: requestedHours(data, profilo) };
  }

  return { ferie: 0, permessi: 0, rol: 0 };
}

function getGiornataStato(tipo: RichiestaTipo) {
  const supported: Partial<Record<RichiestaTipo, string>> = {
    ferie: "ferie",
    permesso: "permesso",
    rol: "permesso",
    malattia: "malattia",
    smart_working: "smart_working",
    trasferta: "trasferta",
    infortunio: "assente",
    maternita: "assente",
    paternita: "assente",
    lutto: "assente",
  };

  return supported[tipo] ?? null;
}

function richiestaNote(data: Pick<HrRichiesta, "id" | "tipo" | "ore_richieste">) {
  const hours = data.ore_richieste ? ` · ${data.ore_richieste}h` : "";
  return `Richiesta ${data.tipo} approvata${hours} · ${data.id}`;
}

async function updateProfileBalances(
  companyId: string,
  profilo: BalanceProfilo,
  richiesta: Pick<HrRichiesta, "tipo" | "data_inizio" | "data_fine" | "ore_richieste">,
  direction: "consume" | "restore",
) {
  const delta = getBalanceDelta(richiesta, profilo);
  if (!delta.ferie && !delta.permessi && !delta.rol) return;

  const sign = direction === "consume" ? -1 : 1;
  const payload: HrProfiloUpdate = {
    ferie_residue: Number(profilo.ferie_residue ?? 0) + sign * delta.ferie,
    permessi_residui_ore: Number(profilo.permessi_residui_ore ?? 0) + sign * delta.permessi,
    rol_residuo_ore: Number(profilo.rol_residuo_ore ?? 0) + sign * delta.rol,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("hr_profili")
    .update(payload)
    .eq("id", profilo.id)
    .eq("company_id", companyId);

  if (error) throw error;
}

async function syncApprovedRequestToGiornate(companyId: string, richiesta: RichiestaWorkflowRow, profilo: BalanceProfilo) {
  const stato = getGiornataStato(richiesta.tipo);
  if (!stato) return;

  const dates = eachIsoDate(richiesta.data_inizio, richiesta.data_fine);
  if (dates.length === 0) return;

  const source = "hr_richiesta";
  const dailyHours = Number(profilo.ore_giornaliere || 8);
  let remainingPermissionHours = richiesta.tipo === "permesso" || richiesta.tipo === "rol"
    ? requestedHours(richiesta, profilo)
    : 0;

  const { data: existingRows, error: existingError } = await supabase
    .from("hr_giornate")
    .select("id, data, ore_lavorate, prima_entrata, ultima_uscita, note, source")
    .eq("company_id", companyId)
    .eq("profilo_id", richiesta.profilo_id)
    .in("data", dates);

  if (existingError) throw existingError;

  const giornataRows = (existingRows ?? []) as HrGiornataRow[];
  const existingByDate = new Map(giornataRows.map((row) => [row.data, row]));
  const toInsert: HrGiornataInsert[] = dates
    .filter((date) => !existingByDate.has(date))
    .map((date) => {
      const requestedToday = remainingPermissionHours > 0 ? Math.min(dailyHours, remainingPermissionHours) : dailyHours;
      if (remainingPermissionHours > 0) remainingPermissionHours = Math.max(0, remainingPermissionHours - requestedToday);

      return {
        company_id: companyId,
        profilo_id: richiesta.profilo_id,
        data: date,
        stato,
        ore_previste: dailyHours,
        ore_lavorate: stato === "permesso" ? Math.max(0, dailyHours - requestedToday) : 0,
        ore_pausa: 0,
        note: richiestaNote(richiesta),
        bloccata: true,
        source,
        updated_at: new Date().toISOString(),
      };
    });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("hr_giornate").insert(toInsert);
    if (error) throw error;
  }

  const existingUpdates = giornataRows.map((row) => {
    const hasWorkedHours = Number(row.ore_lavorate ?? 0) > 0 || row.prima_entrata || row.ultima_uscita;
    const nextNote = String(row.note ?? "").includes(richiesta.id)
      ? row.note
      : [row.note, richiestaNote(richiesta)].filter(Boolean).join("\n");
    const payload: HrGiornataUpdate = {
      stato,
      note: nextNote,
      bloccata: true,
      anomalia: hasWorkedHours ? true : undefined,
      anomalia_motivo: hasWorkedHours ? "Timbrature presenti su giornata con richiesta HR approvata" : undefined,
      source: row.source ?? source,
      updated_at: new Date().toISOString(),
    };

    return supabase
      .from("hr_giornate")
      .update(payload)
      .eq("id", row.id)
      .eq("company_id", companyId);
  });

  const updateResults = await Promise.all(existingUpdates);
  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) throw updateError;
}

async function clearRequestGeneratedGiornate(companyId: string, richiesta: RichiestaWorkflowRow) {
  const source = "hr_richiesta";
  const { data, error } = await supabase
    .from("hr_giornate")
    .select("id, ore_lavorate, prima_entrata, ultima_uscita")
    .eq("company_id", companyId)
    .eq("profilo_id", richiesta.profilo_id)
    .eq("source", source)
    .ilike("note", `%${richiesta.id}%`);

  if (error) throw error;

  const generatedOnlyIds = ((data ?? []) as Pick<HrGiornataRow, "id" | "ore_lavorate" | "prima_entrata" | "ultima_uscita">[])
    .filter((row) => Number(row.ore_lavorate ?? 0) === 0 && !row.prima_entrata && !row.ultima_uscita)
    .map((row) => row.id);

  if (generatedOnlyIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("hr_giornate")
    .delete()
    .eq("company_id", companyId)
    .in("id", generatedOnlyIds);

  if (deleteError) throw deleteError;
}

async function assertNoOverlappingRequest({
  companyId,
  profiloId,
  tipo,
  dataInizio,
  dataFine,
  stati,
  excludeId,
}: {
  companyId: string;
  profiloId: string;
  tipo: RichiestaTipo;
  dataInizio: string;
  dataFine: string;
  stati: RichiestaStato[];
  excludeId?: string;
}) {
  if (!BLOCKING_ABSENCE_TYPES.has(tipo)) return;

  let query = supabase
    .from("hr_richieste")
    .select("id, tipo, stato, data_inizio, data_fine")
    .eq("company_id", companyId)
    .eq("profilo_id", profiloId)
    .in("stato", stati)
    .lte("data_inizio", dataFine)
    .gte("data_fine", dataInizio);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw error;

  const overlap = ((data ?? []) as OverlapRow[]).find((row) => BLOCKING_ABSENCE_TYPES.has(row.tipo));
  if (overlap) {
    throw new Error("Esiste gia una richiesta assenza sovrapposta per questo dipendente");
  }
}

export function useRichieste(filters?: { stato?: RichiestaStato; meseAnno?: string }) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-richieste", companyId, filters],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("hr_richieste")
        .select("*, profilo:hr_profili!hr_richieste_profilo_id_fkey(id, nome, cognome, colore_avatar, reparto, mansione)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });

      if (filters?.stato) {
        q = q.eq("stato", filters.stato);
      }
      if (filters?.meseAnno) {
        const [y, m] = filters.meseAnno.split("-");
        const start = `${y}-${m}-01`;
        const endDate = new Date(Number(y), Number(m), 0);
        const end = `${y}-${m}-${String(endDate.getDate()).padStart(2, "0")}`;
        q = q.gte("data_inizio", start).lte("data_inizio", end);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as RichiestaWithProfilo[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateRichiesta() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<HrRichiesta>) => {
      if (!companyId) throw new Error("companyId required");
      if (!data.profilo_id) throw new Error("Profilo HR obbligatorio");
      if (!data.data_inizio || !data.data_fine) throw new Error("Periodo richiesta obbligatorio");
      if (data.data_fine < data.data_inizio) {
        throw new Error("La data fine non può essere precedente alla data inizio");
      }
      if (data.ore_richieste != null && (!Number.isFinite(data.ore_richieste) || data.ore_richieste <= 0)) {
        throw new Error("Le ore richieste devono essere maggiori di zero");
      }

      const tipo = data.tipo ?? "ferie";

      const { data: profilo, error: profiloError } = await supabase
        .from("hr_profili")
        .select("id, ferie_residue, permessi_residui_ore, rol_residuo_ore, ore_giornaliere")
        .eq("company_id", companyId)
        .eq("id", data.profilo_id)
        .maybeSingle();

      if (profiloError) throw profiloError;
      if (!profilo) throw new Error("Profilo HR non valido per questa azienda");

      assertBalanceAvailable({ ...data, tipo }, profilo as BalanceProfilo);
      await assertNoOverlappingRequest({
        companyId,
        profiloId: data.profilo_id!,
        tipo,
        dataInizio: data.data_inizio!,
        dataFine: data.data_fine!,
        stati: ["in_attesa", "approvata"],
      });

      const payload: HrRichiestaInsert = {
        company_id: companyId,
        profilo_id: data.profilo_id!,
        tipo,
        data_inizio: data.data_inizio!,
        data_fine: data.data_fine!,
        ore_richieste: data.ore_richieste ?? null,
        motivo: data.motivo ?? null,
        stato: "in_attesa",
      };

      const { error } = await supabase.from("hr_richieste").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-richieste"] });
      toast.success("Richiesta creata con successo");
    },
    onError: (error: unknown) => toast.error("Errore: " + getErrorMessage(error)),
  });
}

export function useUpdateRichiestaStato() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stato, note_risposta }: { id: string; stato: RichiestaStato; note_risposta?: string }) => {
      if (!companyId) throw new Error("companyId required");

      const rpcHandled = await updateRichiestaStatoRpc({ id, stato, noteRisposta: note_risposta });
      if (rpcHandled) return;

      const { data: richiesta, error: richiestaError } = await supabase
        .from("hr_richieste")
        .select("id, profilo_id, tipo, data_inizio, data_fine, ore_richieste, stato")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (richiestaError) throw richiestaError;
      if (!richiesta) throw new Error("Richiesta non trovata");
      if (!richiesta.profilo_id) throw new Error("Richiesta non collegata a un profilo HR");

      const workflowRichiesta = richiesta as RichiestaWorkflowRow;
      const wasApproved = workflowRichiesta.stato === "approvata";
      const willBeApproved = stato === "approvata";

      const { data: profilo, error: profiloError } = await supabase
        .from("hr_profili")
        .select("id, ferie_residue, permessi_residui_ore, rol_residuo_ore, ore_giornaliere")
        .eq("company_id", companyId)
        .eq("id", workflowRichiesta.profilo_id)
        .maybeSingle();

      if (profiloError) throw profiloError;
      if (!profilo) throw new Error("Profilo HR non valido per questa azienda");
      const balanceProfilo = profilo as BalanceProfilo;

      if (willBeApproved && !wasApproved) {
        assertBalanceAvailable(workflowRichiesta as Partial<HrRichiesta>, balanceProfilo);
        await assertNoOverlappingRequest({
          companyId,
          profiloId: workflowRichiesta.profilo_id,
          tipo: workflowRichiesta.tipo,
          dataInizio: workflowRichiesta.data_inizio,
          dataFine: workflowRichiesta.data_fine,
          stati: ["approvata"],
          excludeId: id,
        });

        await updateProfileBalances(companyId, balanceProfilo, workflowRichiesta, "consume");
        await syncApprovedRequestToGiornate(companyId, workflowRichiesta, balanceProfilo);
      }

      if (wasApproved && !willBeApproved) {
        await updateProfileBalances(companyId, balanceProfilo, workflowRichiesta, "restore");
        await clearRequestGeneratedGiornate(companyId, workflowRichiesta);
      }

      const payload: HrRichiestaUpdate = {
        stato,
        note_risposta: note_risposta ?? null,
        updated_at: new Date().toISOString(),
      };

      if (willBeApproved && !wasApproved) {
        payload.approvata_il = new Date().toISOString();
        payload.approvata_da = user?.id ?? null;
      }

      if (!willBeApproved) {
        payload.approvata_il = null;
        payload.approvata_da = null;
      }

      const { error } = await supabase
        .from("hr_richieste")
        .update(payload)
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;

      await logHrActivityBestEffort({
        companyId,
        userId: user?.id ?? null,
        richiesta: workflowRichiesta,
        stato,
        wasApproved,
        willBeApproved,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-richieste"] });
      qc.invalidateQueries({ queryKey: ["hr-giornate"] });
      qc.invalidateQueries({ queryKey: ["hr-profili-all"] });
      toast.success("Stato richiesta aggiornato");
    },
    onError: (error: unknown) => toast.error("Errore: " + getErrorMessage(error)),
  });
}
