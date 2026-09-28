/**
 * Le automazioni del bot operativo (bot_routine): il titolare le crea e le
 * gestisce dalla scheda «Automazioni» del WhatsApp hub. CRUD su React Query.
 * La tabella è nuova e non ancora nei tipi generati → accesso con cast.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BotRoutineTipo = "report_mattino" | "todo_operaio" | "avviso" | "promemoria_appuntamento";

export interface BotRoutineDestinatari {
  utenti?: string[];
  ruoli?: string[];
}

export interface BotRoutineRegole {
  fattura_scaduta?: boolean;
  preventivo_fermo?: boolean;
  sotto_scorta?: boolean;
  preventivo_giorni?: number;
  anticipo_min?: number;
}

export interface BotRoutine {
  id: string;
  company_id: string;
  wa_number_id: string;
  tipo: BotRoutineTipo;
  attiva: boolean;
  ora: string | null;
  giorni: number[] | null;
  destinatari: BotRoutineDestinatari | null;
  regole: BotRoutineRegole | null;
  template_nome: string | null;
  creata_il?: string | null;
  aggiornata_il?: string | null;
}

export interface BotRoutineInput {
  id?: string;
  tipo: BotRoutineTipo;
  wa_number_id: string;
  attiva?: boolean;
  ora?: string | null;
  giorni?: number[] | null;
  destinatari?: BotRoutineDestinatari | null;
  regole?: BotRoutineRegole | null;
  template_nome?: string | null;
}

// La tabella è nuova e non ancora nei tipi generati.
const tabella = () => supabase.from("bot_routine" as never);

export const botRoutineKeys = {
  byCompany: (companyId: string | null | undefined) => ["bot-routine", companyId] as const,
};

export function useBotRoutine(companyId: string | null | undefined) {
  return useQuery({
    queryKey: botRoutineKeys.byCompany(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<BotRoutine[]> => {
      const { data, error } = await tabella()
        .select("id, company_id, wa_number_id, tipo, attiva, ora, giorni, destinatari, regole, template_nome, creata_il, aggiornata_il")
        .eq("company_id" as never, companyId as never)
        .order("tipo" as never);
      if (error) throw error;
      return (data ?? []) as unknown as BotRoutine[];
    },
  });
}

function messaggioErrore(e: { code?: string; message?: string } | null): Error {
  if (e?.code === "42501") return new Error("Non hai il permesso di modificare le automazioni");
  return new Error(e?.message ?? "Operazione non riuscita");
}

/** Crea o aggiorna un'automazione. */
export function useSalvaBotRoutine(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BotRoutineInput) => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      if (input.id) {
        const patch: Record<string, unknown> = {};
        for (const k of ["attiva", "ora", "giorni", "destinatari", "regole", "template_nome", "wa_number_id"] as const) {
          if (input[k] !== undefined) patch[k] = input[k];
        }
        const { error } = await tabella().update(patch as never).eq("id" as never, input.id as never);
        if (error) throw messaggioErrore(error);
        return;
      }
      const { error } = await tabella().insert({
        company_id: companyId,
        wa_number_id: input.wa_number_id,
        tipo: input.tipo,
        attiva: input.attiva ?? true,
        ora: input.ora ?? null,
        giorni: input.giorni ?? null,
        destinatari: input.destinatari ?? {},
        regole: input.regole ?? {},
        template_nome: input.template_nome ?? null,
      } as never);
      if (error) throw messaggioErrore(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: botRoutineKeys.byCompany(companyId) }),
  });
}

/** Accende/spegne un'automazione. */
export function useToggleBotRoutine(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      const { error } = await tabella().update({ attiva } as never).eq("id" as never, id as never);
      if (error) throw messaggioErrore(error);
    },
    onMutate: async ({ id, attiva }) => {
      const prima = qc.getQueryData<BotRoutine[]>(botRoutineKeys.byCompany(companyId));
      if (prima) {
        qc.setQueryData(botRoutineKeys.byCompany(companyId), prima.map((r) => (r.id === id ? { ...r, attiva } : r)));
      }
      return { prima };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prima) qc.setQueryData(botRoutineKeys.byCompany(companyId), ctx.prima);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: botRoutineKeys.byCompany(companyId) }),
  });
}

/** Elimina un'automazione. */
export function useEliminaBotRoutine(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabella().delete().eq("id" as never, id as never);
      if (error) throw messaggioErrore(error);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: botRoutineKeys.byCompany(companyId) }),
  });
}
