import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrProfilo, HrRichiesta, RichiestaStato, RichiestaTipo } from "@/types/hr";
import type { TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { workingDates } from "@/lib/personale/calendarioLavorativo";
import { readAllPages } from "@/lib/personale/readAllPages";

export type RichiestaWithProfilo = HrRichiesta & {
  profilo?: { id: string; nome: string; cognome: string; colore_avatar: string; reparto: string | null; mansione: string | null };
};

type BalanceProfilo = Pick<HrProfilo, "id" | "ferie_residue" | "permessi_residui_ore" | "rol_residuo_ore" | "ore_giornaliere">;
type OverlapRow = Pick<HrRichiesta, "id" | "tipo" | "stato" | "data_inizio" | "data_fine">;
type HrRichiestaInsert = TablesInsert<"hr_richieste">;
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

function inclusiveDays(start: string, end: string) {
  const startTime = new Date(`${start}T12:00:00`).getTime();
  const endTime = new Date(`${end}T12:00:00`).getTime();
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}

function requestedHours(data: Partial<HrRichiesta>, profilo: BalanceProfilo, workDays?: number) {
  if (data.ore_richieste != null) return data.ore_richieste;
  return (workDays ?? inclusiveDays(data.data_inizio!, data.data_fine!)) * Number(profilo.ore_giornaliere || 8);
}

export function assertBalanceAvailable(data: Partial<HrRichiesta>, profilo: BalanceProfilo, workDays?: number) {
  const tipo = data.tipo ?? "ferie";

  if (tipo === "ferie") {
    const requested = workDays ?? inclusiveDays(data.data_inizio!, data.data_fine!);
    const available = Number(profilo.ferie_residue ?? 0);
    if (requested > available) {
      throw new Error(`Ferie residue insufficienti: richiesta ${requested} gg, disponibili ${available} gg`);
    }
  }

  if (tipo === "permesso") {
    const requested = requestedHours(data, profilo, workDays);
    const available = Number(profilo.permessi_residui_ore ?? 0);
    if (requested > available) {
      throw new Error(`Permessi insufficienti: richiesta ${requested}h, disponibili ${available}h`);
    }
  }

  if (tipo === "rol") {
    const requested = requestedHours(data, profilo, workDays);
    const available = Number(profilo.rol_residuo_ore ?? 0);
    if (requested > available) {
      throw new Error(`ROL insufficienti: richiesta ${requested}h, disponibili ${available}h`);
    }
  }
}

export async function assertNoOverlappingRequest({
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
    queryFn: async ({ signal }) => {
      const data = await readAllPages((from, to) => {
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
        q = q.gte("data_fine", start).lte("data_inizio", end);
      }

      return q.order("id").range(from, to).abortSignal(signal);
      });
      const righe = (data || []) as unknown as RichiestaWithProfilo[];

      // Richieste nate senza profilo HR collegato (solo con l'utente: succede con quelle
      // create da fuori la scheda Personale): il nome si cerca dal profilo HR di quell'utente
      // o, in mancanza, dalla sua anagrafica. Così la riga non resta senza nome.
      type ProfiloRichiesta = { id: string; nome: string; cognome: string; colore_avatar: string; reparto: string | null; mansione: string | null };
      const utenteDi = (r: RichiestaWithProfilo) => (r as unknown as { user_id?: string | null }).user_id ?? null;
      const senzaProfilo = righe.filter((r) => !r.profilo && utenteDi(r));
      if (senzaProfilo.length > 0) {
        const userIds = Array.from(new Set(senzaProfilo.map((r) => utenteDi(r) as string)));
        const nomi = new Map<string, ProfiloRichiesta>();
        const { data: hr } = await supabase
          .from("hr_profili")
          .select("id, user_id, nome, cognome, colore_avatar, reparto, mansione")
          .eq("company_id", companyId!)
          .in("user_id", userIds);
        for (const p of (hr ?? []) as Array<{ id: string; user_id: string | null; nome: string; cognome: string; colore_avatar: string; reparto: string | null; mansione: string | null }>) {
          if (p.user_id) nomi.set(p.user_id, { id: p.id, nome: p.nome, cognome: p.cognome, colore_avatar: p.colore_avatar, reparto: p.reparto, mansione: p.mansione });
        }
        const mancanti = userIds.filter((id) => !nomi.has(id));
        if (mancanti.length > 0) {
          const { data: anag } = await supabase.from("profiles").select("id, first_name, last_name").in("id", mancanti);
          for (const p of (anag ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
            nomi.set(p.id, { id: "", nome: p.first_name ?? "", cognome: p.last_name ?? "", colore_avatar: "", reparto: null, mansione: null });
          }
        }
        for (const r of senzaProfilo) {
          const trovato = nomi.get(utenteDi(r) as string);
          if (trovato) r.profilo = trovato as unknown as RichiestaWithProfilo["profilo"];
        }
      }
      return righe;
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
        .select("id, ferie_residue, permessi_residui_ore, rol_residuo_ore, ore_giornaliere, giorni_lavorativi")
        .eq("company_id", companyId)
        .eq("id", data.profilo_id)
        .maybeSingle();

      if (profiloError) throw profiloError;
      if (!profilo) throw new Error("Profilo HR non valido per questa azienda");

      let workDays: number | undefined;
      if (["ferie","permesso","rol"].includes(tipo)) {
        const { data: holidays, error: calendarError } = await supabase.from("hr_festivita")
          .select("data,descrizione,ricorrente").eq("company_id", companyId);
        if (calendarError) throw calendarError;
        workDays = workingDates(data.data_inizio, data.data_fine, profilo.giorni_lavorativi || [], holidays || []).length;
        if (!workDays) throw new Error("Nessun giorno lavorativo nel periodo selezionato");
        if (!profilo.ore_giornaliere || profilo.ore_giornaliere <= 0) throw new Error("Ore giornaliere da configurare");
        if (data.ore_richieste != null && data.ore_richieste > workDays * profilo.ore_giornaliere) throw new Error("Le ore richieste superano quelle previste nel periodo");
      }
      assertBalanceAvailable({ ...data, tipo }, profilo as BalanceProfilo, workDays);
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
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stato, note_risposta }: { id: string; stato: RichiestaStato; note_risposta?: string }) => {
      if (!companyId) throw new Error("companyId required");

      const rpcHandled = await updateRichiestaStatoRpc({ id, stato, noteRisposta: note_risposta });
      if (rpcHandled) return;

      throw new Error("Servizio atomico richieste non disponibile: nessun saldo modificato. Contatta l’amministratore.");
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
