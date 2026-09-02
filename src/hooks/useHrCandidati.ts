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
  /** Fase corrente della pipeline di selezione (null = da smistare). */
  fase_id: string | null;
  /** Profilo HR creato all'assunzione (evita di crearlo due volte). */
  hr_profilo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FaseSelezione {
  id: string;
  company_id: string;
  nome: string;
  posizione: number;
  colore: string | null;
}

export interface HrColloquio {
  id: string;
  candidato_id: string;
  data_colloquio: string;
  ora_colloquio: string | null;
  tipo: ColloquioTipo;
  esito: ColloquioEsito | null;
  note: string | null;
  /** Appuntamento sul calendario aziendale (per i colloqui futuri). */
  appointment_id: string | null;
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

export function useAddColloquio(candidato: Pick<HrCandidato, "id" | "nome" | "cognome" | "ruolo">) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (colloquio: { data_colloquio: string; ora_colloquio: string | null; tipo: ColloquioTipo; esito: ColloquioEsito | null; note: string | null }) => {
      const user = (await supabase.auth.getUser()).data.user;
      // Un colloquio FUTURO finisce sul calendario aziendale: fissarlo qui e
      // doverlo riscrivere di là era il modo migliore per dimenticarlo.
      let appointmentId: string | null = null;
      const oggi = new Date().toLocaleDateString("en-CA");
      if (colloquio.data_colloquio >= oggi && user) {
        const { data: apt, error: aptErr } = await db
          .from("appointments")
          .insert({
            company_id: companyId,
            title: `Colloquio: ${candidato.nome} ${candidato.cognome} (${candidato.ruolo})`,
            description: [TIPI_COLLOQUIO[colloquio.tipo], colloquio.note].filter(Boolean).join(" — ") || null,
            appointment_date: colloquio.data_colloquio,
            appointment_time: colloquio.ora_colloquio,
            appointment_type: "riunione",
            status: "confermato",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (aptErr) {
          // Il colloquio si registra comunque: il calendario è un di più.
          toast.warning("Colloquio salvato ma non messo in calendario", { description: aptErr.message });
        } else {
          appointmentId = (apt as { id: string }).id;
        }
      }
      const { error } = await db.from("hr_candidati_colloqui").insert({
        ...colloquio,
        candidato_id: candidato.id,
        company_id: companyId,
        created_by: user?.id,
        appointment_id: appointmentId,
      });
      if (error) {
        if (appointmentId) await db.from("appointments").delete().eq("id", appointmentId);
        throw error;
      }
      return { inCalendario: !!appointmentId };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: chiavi.colloqui(candidato.id) });
      if (r.inCalendario) qc.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(r.inCalendario ? "Colloquio registrato e messo in calendario" : "Colloquio registrato");
    },
    onError: (e) => toast.error("Colloquio non salvato", { description: e instanceof Error ? e.message : undefined }),
  });
}

export function useDeleteColloquio(candidatoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, appointmentId }: { id: string; appointmentId: string | null }) => {
      const { error } = await db.from("hr_candidati_colloqui").delete().eq("id", id);
      if (error) throw error;
      // L'appuntamento era il riflesso del colloquio: senza colloquio è un fantasma.
      if (appointmentId) await db.from("appointments").delete().eq("id", appointmentId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.colloqui(candidatoId) });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) => toast.error("Eliminazione non riuscita", { description: e instanceof Error ? e.message : undefined }),
  });
}

/**
 * Candidato assunto → profilo HR precompilato (nome, contatti, mansione =
 * ruolo cercato, assunzione oggi). Il link su hr_profilo_id impedisce di
 * crearlo due volte; il resto della scheda dipendente si completa
 * nell'Organigramma con calma.
 */
export function useAssumiCandidato() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidato: HrCandidato) => {
      if (candidato.hr_profilo_id) return candidato.hr_profilo_id;
      const { data: profilo, error } = await db
        .from("hr_profili")
        .insert({
          company_id: companyId,
          nome: candidato.nome,
          cognome: candidato.cognome,
          email: candidato.email,
          telefono: candidato.telefono,
          mansione: candidato.ruolo,
          data_assunzione: new Date().toLocaleDateString("en-CA"),
          // Stessi default del flusso ufficiale (useCreateHrProfilo):
          tipo_contratto: "indeterminato",
          orario_tipo: "standard",
          ore_settimanali: 40,
          ore_giornaliere: 8,
          attivo: true,
          ccnl: "Edilizia",
          nazionalita: "Italiana",
          colore_avatar: "#0EA5E9",
          pausa_pranzo_minuti: 60,
          ferie_anno_giorni: 26,
          ferie_residue: 26,
          permessi_anno_ore: 32,
          permessi_residui_ore: 32,
          rol_anno_ore: 0,
          rol_residuo_ore: 0,
          note_interne: [candidato.note, "Creato dalla selezione candidati."].filter(Boolean).join("\n"),
        })
        .select("id")
        .single();
      if (error) throw error;
      const profiloId = (profilo as { id: string }).id;
      const { error: linkErr } = await db
        .from("hr_candidati")
        .update({ stato: "assunto", hr_profilo_id: profiloId })
        .eq("id", candidato.id);
      if (linkErr) throw linkErr;
      return profiloId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-candidati"] });
      qc.invalidateQueries({ queryKey: ["hr-organigramma"] });
      qc.invalidateQueries({ queryKey: ["hr-profili-all"] });
      toast.success("Profilo dipendente creato", { description: "Completa contratto e dettagli dall'Organigramma." });
    },
    onError: (e) => toast.error("Profilo non creato", { description: e instanceof Error ? e.message : undefined }),
  });
}

// ── Pipeline di selezione (fasi per azienda) ────────────────────────────────

/** Pipeline di partenza per l'edilizia: poi ognuno la piega alla sua. */
const FASI_DEFAULT: Array<{ nome: string; colore: string }> = [
  { nome: "Candidatura ricevuta", colore: "#3B82F6" },
  { nome: "Screening CV", colore: "#6366F1" },
  { nome: "Primo colloquio", colore: "#F59E0B" },
  { nome: "Secondo colloquio", colore: "#F97316" },
  { nome: "Prova in cantiere", colore: "#0D9488" },
  { nome: "Offerta", colore: "#8B5CF6" },
];

/**
 * Fasi dell'azienda. Al primo uso (zero fasi) semina la pipeline default e
 * SMISTA i candidati esistenti in base al vecchio stato — così chi aveva già
 * caricato candidati se li ritrova al posto giusto, non in "da smistare".
 */
export function useFasiSelezione() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["hr-selezione-fasi", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FaseSelezione[]> => {
      const carica = async () => {
        const { data, error } = await db
          .from("hr_selezione_fasi")
          .select("*")
          .eq("company_id", companyId)
          .order("posizione");
        if (error) throw error;
        return (data ?? []) as FaseSelezione[];
      };
      let fasi = await carica();
      if (fasi.length === 0) {
        const { error: seedErr } = await db
          .from("hr_selezione_fasi")
          .upsert(
            FASI_DEFAULT.map((f, i) => ({ company_id: companyId, nome: f.nome, colore: f.colore, posizione: i })),
            { onConflict: "company_id,nome", ignoreDuplicates: true },
          );
        if (seedErr) throw seedErr;
        fasi = await carica();
        // Backfill una tantum: gli stati legacy diventano fasi.
        const perNome = new Map(fasi.map((f) => [f.nome, f.id]));
        const mappa: Array<[string, string]> = [
          ["nuovo", "Candidatura ricevuta"],
          ["in_valutazione", "Screening CV"],
          ["colloquio", "Primo colloquio"],
          ["offerta", "Offerta"],
        ];
        for (const [stato, nomeFase] of mappa) {
          const faseId = perNome.get(nomeFase);
          if (!faseId) continue;
          await db.from("hr_candidati").update({ fase_id: faseId }).eq("company_id", companyId).eq("stato", stato).is("fase_id", null);
        }
        // I candidati sono spesso GIÀ in cache quando il seed gira: senza
        // invalidazione lo smistamento si vedrebbe solo al prossimo reload.
        qc.invalidateQueries({ queryKey: ["hr-candidati"] });
      }
      return fasi;
    },
  });
}

export function useUpsertFase() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fase: Partial<FaseSelezione> & { nome: string }) => {
      const { id, company_id: _c, ...rest } = fase as Record<string, unknown> & { id?: string };
      if (id) {
        const { error } = await db.from("hr_selezione_fasi").update(rest).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await db.from("hr_selezione_fasi").insert({ ...rest, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-selezione-fasi"] }),
    onError: (e) => toast.error("Fase non salvata", { description: e instanceof Error ? e.message : undefined }),
  });
}

/** Elimina la fase: i candidati dentro tornano "da smistare" (FK set null). */
export function useDeleteFase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("hr_selezione_fasi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-selezione-fasi"] });
      qc.invalidateQueries({ queryKey: ["hr-candidati"] });
    },
    onError: (e) => toast.error("Fase non eliminata", { description: e instanceof Error ? e.message : undefined }),
  });
}

/** Scambia la posizione di due fasi (riordino con le frecce). */
export function useScambiaFasi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b }: { a: FaseSelezione; b: FaseSelezione }) => {
      const r1 = await db.from("hr_selezione_fasi").update({ posizione: b.posizione }).eq("id", a.id);
      if (r1.error) throw r1.error;
      const r2 = await db.from("hr_selezione_fasi").update({ posizione: a.posizione }).eq("id", b.id);
      if (r2.error) throw r2.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-selezione-fasi"] }),
    onError: (e) => toast.error("Riordino non riuscito", { description: e instanceof Error ? e.message : undefined }),
  });
}

// ── Moduli di candidatura pubblici (per il sito dell'impresa) ───────────────

export type StatoCampoModulo = "obbligatorio" | "facoltativo" | "nascosto";

export interface CandidaturaForm {
  id: string;
  company_id: string;
  token: string;
  titolo: string;
  descrizione: string | null;
  ruoli: string[];
  /** Config campi: {campo: obbligatorio|facoltativo|nascosto}. Vuoto = default. */
  campi: Record<string, StatoCampoModulo>;
  /** Aspetto: colori testata/bottone e visibilità del nome azienda. */
  stile: { testata?: string; bottone?: string; mostra_azienda?: boolean } | null;
  attivo: boolean;
  total_views: number;
  total_submissions: number;
  created_at: string;
}

export function useCandidaturaForms() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["hr-candidatura-forms", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CandidaturaForm[]> => {
      const { data, error } = await db
        .from("hr_candidatura_forms")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CandidaturaForm[];
    },
  });
}

export function useUpsertCandidaturaForm() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: Partial<CandidaturaForm> & { titolo: string }) => {
      const { id, company_id: _c, token: _t, total_views: _v, total_submissions: _s, created_at: _d, ...rest } = form as Record<string, unknown> & { id?: string };
      if (id) {
        // campi e stile sono jsonb costruiti dal chiamante sopra la SUA copia:
        // due modifiche ravvicinate (es. colore testata poi bottone) partono
        // entrambe dalla cache e la seconda cancella la prima. Merge su dati
        // freschi letti ADESSO, non su quelli di quando è nato il click.
        if (rest.campi || rest.stile) {
          const { data: cur } = await db.from("hr_candidatura_forms").select("campi, stile").eq("id", id).maybeSingle();
          if (rest.campi) rest.campi = { ...(cur?.campi ?? {}), ...(rest.campi as Record<string, unknown>) };
          if (rest.stile) rest.stile = { ...(cur?.stile ?? {}), ...(rest.stile as Record<string, unknown>) };
        }
        const { error } = await db.from("hr_candidatura_forms").update(rest).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await db.from("hr_candidatura_forms").insert({ ...rest, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-candidatura-forms"] }),
    onError: (e) => toast.error("Modulo non salvato", { description: e instanceof Error ? e.message : undefined }),
  });
}

export function useDeleteCandidaturaForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("hr_candidatura_forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-candidatura-forms"] }),
    onError: (e) => toast.error("Modulo non eliminato", { description: e instanceof Error ? e.message : undefined }),
  });
}

/** Sposta un candidato di fase (drag nel kanban o select nella scheda). */
export function useSpostaFase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ candidatoId, faseId }: { candidatoId: string; faseId: string | null }) => {
      const { error } = await db.from("hr_candidati").update({ fase_id: faseId }).eq("id", candidatoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-candidati"] }),
    onError: (e) => toast.error("Spostamento non riuscito", { description: e instanceof Error ? e.message : undefined }),
  });
}
