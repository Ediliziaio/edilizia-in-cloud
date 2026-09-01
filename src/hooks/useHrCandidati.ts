/**
 * Banca dati candidati (Personale & HR → tab "Candidati").
 *
 * L'elenco vive diviso per ruolo: chi cerca un posatore fra sei mesi riapre
 * qui e ritrova CV, colloqui fatti e valutazione. Il test attitudinale è un
 * modulo a parte (hr_talent_candidates): da qui ci si aggancia soltanto.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";

export type CandidatoStato = "nuovo" | "in_valutazione" | "colloquio" | "offerta" | "assunto" | "scartato" | "archiviato";
export type CandidatoFonte = "manuale" | "campagna" | "test_attitudinale" | "segnalazione" | "sito" | "altro";
export type ColloquioTipo = "telefonico" | "conoscitivo" | "tecnico" | "in_cantiere" | "finale" | "altro";
export type ColloquioEsito = "positivo" | "negativo" | "da_decidere";

export interface HrCandidato {
  id: string;
  company_id: string;
  nome: string;
  cognome: string;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  ruolo: string;
  stato: CandidatoStato;
  fonte: CandidatoFonte;
  valutazione: number | null;
  cv_path: string | null;
  cv_nome: string | null;
  note: string | null;
  talent_candidate_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrColloquio {
  id: string;
  candidato_id: string;
  data_colloquio: string;
  tipo: ColloquioTipo;
  esito: ColloquioEsito | null;
  note: string | null;
  created_at: string;
}

export const STATI_CANDIDATO: Record<CandidatoStato, { label: string; classe: string }> = {
  nuovo: { label: "Nuovo", classe: "bg-blue-100 text-blue-700" },
  in_valutazione: { label: "In valutazione", classe: "bg-indigo-100 text-indigo-700" },
  colloquio: { label: "Colloquio", classe: "bg-amber-100 text-amber-700" },
  offerta: { label: "Offerta fatta", classe: "bg-purple-100 text-purple-700" },
  assunto: { label: "Assunto", classe: "bg-emerald-100 text-emerald-700" },
  scartato: { label: "Non idoneo", classe: "bg-slate-100 text-slate-500" },
  archiviato: { label: "In archivio", classe: "bg-slate-100 text-slate-600" },
};

export const FONTI_CANDIDATO: Record<CandidatoFonte, string> = {
  manuale: "Inserito a mano",
  campagna: "Campagna di ricerca",
  test_attitudinale: "Test attitudinale",
  segnalazione: "Segnalazione",
  sito: "Sito / annuncio",
  altro: "Altro",
};

export const TIPI_COLLOQUIO: Record<ColloquioTipo, string> = {
  telefonico: "Telefonico",
  conoscitivo: "Conoscitivo",
  tecnico: "Tecnico",
  in_cantiere: "Prova in cantiere",
  finale: "Finale",
  altro: "Altro",
};

export const ESITI_COLLOQUIO: Record<ColloquioEsito, { label: string; classe: string }> = {
  positivo: { label: "Positivo", classe: "text-emerald-600" },
  negativo: { label: "Negativo", classe: "text-red-600" },
  da_decidere: { label: "Da decidere", classe: "text-amber-600" },
};

// hr_candidati non è (ancora) nei tipi generati: builder senza tipizzazione
// generata, come fa TabSelezioni per le tabelle talent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const chiavi = {
  lista: (companyId: string | null) => ["hr-candidati", companyId] as const,
  colloqui: (candidatoId: string | null) => ["hr-candidati-colloqui", candidatoId] as const,
};

export function useHrCandidati() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.lista(companyId),
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<HrCandidato[]> => {
      const { data, error } = await db
        .from("hr_candidati")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HrCandidato[];
    },
  });
}

export function useUpsertCandidato() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidato: Partial<HrCandidato> & { nome: string }) => {
      const { id, created_at: _ca, updated_at: _ua, company_id: _c, ...rest } = candidato as Record<string, unknown> & { id?: string };
      const user = (await supabase.auth.getUser()).data.user;
      if (id) {
        const { data, error } = await db.from("hr_candidati").update(rest).eq("id", id).select().single();
        if (error) throw error;
        return data as HrCandidato;
      }
      const { data, error } = await db
        .from("hr_candidati")
        .insert({ ...rest, company_id: companyId, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as HrCandidato;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-candidati"] }),
    onError: (e) => toast.error("Candidato non salvato", { description: e instanceof Error ? e.message : undefined }),
  });
}

export function useDeleteCandidato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("hr_candidati").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-candidati"] });
      toast.success("Candidato eliminato");
    },
    onError: (e) => toast.error("Eliminazione non riuscita", { description: e instanceof Error ? e.message : undefined }),
  });
}

export function useColloquiCandidato(candidatoId: string | null) {
  return useQuery({
    queryKey: chiavi.colloqui(candidatoId),
    enabled: !!candidatoId,
    queryFn: async (): Promise<HrColloquio[]> => {
      const { data, error } = await db
        .from("hr_candidati_colloqui")
        .select("*")
        .eq("candidato_id", candidatoId)
        .order("data_colloquio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HrColloquio[];
    },
  });
}

export function useAddColloquio(candidatoId: string) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (colloquio: { data_colloquio: string; tipo: ColloquioTipo; esito: ColloquioEsito | null; note: string | null }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await db.from("hr_candidati_colloqui").insert({
        ...colloquio,
        candidato_id: candidatoId,
        company_id: companyId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.colloqui(candidatoId) });
      toast.success("Colloquio registrato");
    },
    onError: (e) => toast.error("Colloquio non salvato", { description: e instanceof Error ? e.message : undefined }),
  });
}

export function useDeleteColloquio(candidatoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("hr_candidati_colloqui").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiavi.colloqui(candidatoId) }),
    onError: (e) => toast.error("Eliminazione non riuscita", { description: e instanceof Error ? e.message : undefined }),
  });
}
