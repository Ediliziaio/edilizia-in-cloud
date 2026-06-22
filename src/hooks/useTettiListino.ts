/**
 * useListinoLavorazioni — CRUD del listino lavorazioni del verticale
 * Tetti (tabelle `tet_listino_capitoli` / `tet_listino_voci`).
 *
 * NB: le tabelle `tet_*` provengono dalla migrazione LOCALE
 * `20271001000000_rst_modulo_wave1.sql` e NON sono ancora applicate sul
 * remoto → non esistono nei tipi generati di Supabase. Usiamo quindi il cast
 * `supabase as any` (stesso pattern di `useResellerPlans.ts`) così build/eslint
 * passano senza rigenerare i tipi.
 *
 * Sorgenti di prefill costi:
 *   - Prodotti  → tabella `article_templates` (costo = `prezzo_acquisto_netto`
 *     con fallback `standard_cost`) → riempie `costo_materiali`.
 *   - Manodopera → tabella `tariffe_aziendali` (costo = `costo_interno` con
 *     fallback `prezzo_costo`) → riempie `costo_manodopera`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { buildSeedRows } from "@/lib/tetti/seedListino";
import { calcPrezzoVoce } from "@/lib/tetti/calcoli";
import type {
  TetListinoCapitolo,
  TetListinoVoce,
  TetUnitaMisura,
} from "@/types/tetti";
import type { AdottaPrezzarioInput } from "@/lib/prezzario/queries";

// Tipi tet_* non rigenerati: cast unico, riusato in tutto il file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// ─── Query keys ────────────────────────────────────────────────────────────
const K = {
  capitoli: (companyId: string | null) => ["tet-listino-capitoli", companyId] as const,
  voci: (companyId: string | null, capitoloId?: string | null) =>
    ["tet-listino-voci", companyId, capitoloId ?? "all"] as const,
  articoliSearch: (companyId: string | null, term: string) =>
    ["tet-prefill-articoli", companyId, term] as const,
  tariffeSearch: (companyId: string | null, term: string) =>
    ["tet-prefill-tariffe", companyId, term] as const,
  vociSearch: (companyId: string | null, term: string) =>
    ["tet-listino-voci-search", companyId, term] as const,
};

// ─── Payloads ──────────────────────────────────────────────────────────────
export interface CapitoloPayload {
  id?: string;
  nome: string;
  ordine?: number;
}

export interface VocePayload {
  id?: string;
  capitolo_id: string | null;
  codice?: string | null;
  descrizione: string;
  unita_misura: TetUnitaMisura;
  costo_materiali: number;
  costo_manodopera: number;
  ricarico_pct: number;
  articolo_id?: string | null;
  tariffa_id?: string | null;
  note?: string | null;
  ordine?: number;
}

// ─── Query: capitoli ──────────────────────────────────────────────────────
export function useListinoCapitoli() {
  const companyId = useEffectiveCompanyId();
  return useQuery<TetListinoCapitolo[]>({
    queryKey: K.capitoli(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("tet_listino_capitoli")
        .select("*")
        .eq("company_id", companyId!)
        .order("ordine", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TetListinoCapitolo[];
    },
  });
}

// ─── Query: voci (filtrabili per capitolo) ────────────────────────────────
export function useListinoVoci(capitoloId?: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery<TetListinoVoce[]>({
    queryKey: K.voci(companyId, capitoloId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = sb()
        .from("tet_listino_voci")
        .select("*")
        .eq("company_id", companyId!);
      if (capitoloId) q = q.eq("capitolo_id", capitoloId);
      const { data, error } = await q
        .order("ordine", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TetListinoVoce[];
    },
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────
export function useUpsertCapitolo() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CapitoloPayload): Promise<TetListinoCapitolo> => {
      if (!companyId) throw new Error("Company non disponibile");
      const row = {
        company_id: companyId,
        nome: payload.nome.trim(),
        ordine: payload.ordine ?? 0,
      };
      const q = payload.id
        ? sb()
            .from("tet_listino_capitoli")
            .update(row)
            .eq("id", payload.id)
            .eq("company_id", companyId)
            .select()
            .single()
        : sb().from("tet_listino_capitoli").insert(row).select().single();
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as TetListinoCapitolo;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.capitoli(companyId) });
    },
  });
}

export function useUpsertVoce() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: VocePayload): Promise<TetListinoVoce> => {
      if (!companyId) throw new Error("Company non disponibile");
      const prezzo_unitario = calcPrezzoVoce({
        costo_materiali: payload.costo_materiali,
        costo_manodopera: payload.costo_manodopera,
        ricarico_pct: payload.ricarico_pct,
      });
      const row = {
        company_id: companyId,
        capitolo_id: payload.capitolo_id,
        codice: payload.codice?.trim() || null,
        descrizione: payload.descrizione.trim(),
        unita_misura: payload.unita_misura,
        costo_materiali: payload.costo_materiali,
        costo_manodopera: payload.costo_manodopera,
        ricarico_pct: payload.ricarico_pct,
        prezzo_unitario,
        articolo_id: payload.articolo_id ?? null,
        tariffa_id: payload.tariffa_id ?? null,
        note: payload.note?.trim() || null,
        ordine: payload.ordine ?? 0,
      };
      const q = payload.id
        ? sb()
            .from("tet_listino_voci")
            .update(row)
            .eq("id", payload.id)
            .eq("company_id", companyId)
            .select()
            .single()
        : sb().from("tet_listino_voci").insert(row).select().single();
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as TetListinoVoce;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tet-listino-voci", companyId] });
    },
  });
}

export function useDeleteVoce() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { error } = await sb()
        .from("tet_listino_voci")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tet-listino-voci", companyId] });
    },
  });
}

export function useDeleteCapitolo() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("Company non disponibile");
      // Le voci hanno FK ON DELETE SET NULL: cancellando il capitolo restano
      // "orfane" (capitolo_id = null). Le rimuoviamo esplicitamente per non
      // lasciare voci scollegate nel listino.
      const { error: vErr } = await sb()
        .from("tet_listino_voci")
        .delete()
        .eq("capitolo_id", id)
        .eq("company_id", companyId);
      if (vErr) throw new Error(vErr.message);
      const { error } = await sb()
        .from("tet_listino_capitoli")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.capitoli(companyId) });
      void qc.invalidateQueries({ queryKey: ["tet-listino-voci", companyId] });
    },
  });
}

// ─── Import seed standard ───────────────────────────────────────────────────
export function useImportSeedListino() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ capitoli: number; voci: number }> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { capitoli, voci } = buildSeedRows(companyId);
      // 1) insert capitoli (gli id sono generati client-side da buildSeedRows
      //    così le voci possono già referenziarli).
      const { error: capErr } = await sb()
        .from("tet_listino_capitoli")
        .insert(capitoli);
      if (capErr) throw new Error(capErr.message);
      // 2) insert voci in bulk.
      const { error: vErr } = await sb().from("tet_listino_voci").insert(voci);
      if (vErr) throw new Error(vErr.message);
      return { capitoli: capitoli.length, voci: voci.length };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.capitoli(companyId) });
      void qc.invalidateQueries({ queryKey: ["tet-listino-voci", companyId] });
    },
  });
}

/**
 * Adozione di voci da un prezzario regionale ufficiale nel listino TETTI
 * (`tet_listino_voci`). Gemello tet-scoped di `useAdottaPrezzario` di
 * `@/lib/prezzario/queries` (che scrive sul listino Ristrutturazione): qui le
 * voci finiscono nel listino Tetti e si invalidano le query key `tet-listino-*`.
 */
export function useAdottaPrezzario() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdottaPrezzarioInput): Promise<{ inserite: number }> => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (input.voci.length === 0) return { inserite: 0 };
      // Nome fonte per la nota (una sola lettura, riusata su tutte le voci).
      const { data: fonteRow, error: fonteErr } = await sb()
        .from("prezzario_fonte")
        .select("nome")
        .eq("id", input.fonteId)
        .maybeSingle();
      if (fonteErr) throw new Error(fonteErr.message);
      const nomeFonte = (fonteRow?.nome as string | undefined) ?? "Prezzario";
      const rows = input.voci.map((v, idx) => {
        const prezzo = Number(v.prezzo) || 0;
        const incid = v.incidenza_manodopera_pct ?? 0;
        const costo_manodopera = Math.round(prezzo * incid * 100) / 100;
        const costo_materiali = Math.round((prezzo - costo_manodopera) * 100) / 100;
        const prezzo_unitario = Math.round(prezzo * (1 + input.ricaricoPct / 100) * 100) / 100;
        const note = v.codice ? `Fonte: ${nomeFonte} (cod. ${v.codice})` : `Fonte: ${nomeFonte}`;
        return {
          company_id: companyId,
          capitolo_id: input.capitoloId ?? null,
          codice: v.codice ?? null,
          descrizione: v.descrizione,
          unita_misura: v.unita_misura ?? "cad",
          costo_materiali,
          costo_manodopera,
          ricarico_pct: input.ricaricoPct,
          prezzo_unitario,
          note,
          fonte: nomeFonte,
          ordine: idx,
        };
      });
      const { error } = await sb().from("tet_listino_voci").insert(rows);
      if (error) throw new Error(error.message);
      return { inserite: rows.length };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tet-listino-voci", companyId] });
      void qc.invalidateQueries({ queryKey: ["tet-listino-capitoli", companyId] });
    },
  });
}

// ─── Prefill da listino prodotti / manodopera ───────────────────────────────

/** Risultato di ricerca prodotto (article_templates) per il picker prefill. */
export interface PrefillArticoloOption {
  id: string;
  name: string;
  sku: string | null;
  marca: string | null;
  unita: string | null;
  /** Costo da iniettare in `costo_materiali` (prezzo_acquisto_netto). */
  costo: number;
  /** Prezzo di vendita listino, mostrato come riferimento nel picker. */
  prezzo_vendita: number;
}

/** Risultato di ricerca manodopera (tariffe_aziendali) per il picker prefill. */
export interface PrefillTariffaOption {
  id: string;
  nome: string;
  tipo: string | null;
  unita: string | null;
  /** Costo da iniettare in `costo_manodopera` (costo_interno → prezzo_costo). */
  costo: number;
  /** Prezzo di vendita listino, mostrato come riferimento nel picker. */
  prezzo_vendita: number;
}

const UM_MAP: Record<string, TetUnitaMisura> = {
  pz: "cad",
  cad: "cad",
  mq: "mq",
  ml: "ml",
  mc: "corpo",
  kg: "kg",
  h: "h",
  gg: "h",
  a_corpo: "a corpo",
  corpo: "corpo",
};

/** Normalizza una UM sorgente (articoli/tariffe) verso `TetUnitaMisura`. */
export function mapUnitaMisura(raw: string | null | undefined): TetUnitaMisura {
  if (!raw) return "cad";
  return UM_MAP[raw.toLowerCase().trim()] ?? "cad";
}

/**
 * Ricerca prodotti dal listino aziendale (`article_templates`) per prefill di
 * `costo_materiali`. `term` typeahead (nome / sku / marca).
 */
export function usePrefillFromArticolo(term: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery<PrefillArticoloOption[]>({
    queryKey: K.articoliSearch(companyId, term),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = sb()
        .from("article_templates")
        .select(
          "id, name, sku, marca, unit_of_measure, prezzo_vendita, prezzo_acquisto_netto, unit_price, standard_cost",
        )
        .eq("company_id", companyId!);
      const t = term.trim();
      if (t) {
        q = q.or(`name.ilike.%${t}%,sku.ilike.%${t}%,marca.ilike.%${t}%`);
      }
      const { data, error } = await q.order("name").limit(40);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
        id: String(d.id),
        name: (d.name as string) ?? "Prodotto",
        sku: (d.sku as string | null) ?? null,
        marca: (d.marca as string | null) ?? null,
        unita: (d.unit_of_measure as string | null) ?? null,
        costo:
          (d.prezzo_acquisto_netto as number | null) ??
          (d.standard_cost as number | null) ??
          0,
        prezzo_vendita:
          (d.prezzo_vendita as number | null) ??
          (d.unit_price as number | null) ??
          0,
      }));
    },
  });
}

/**
 * Ricerca manodopera dal listino aziendale (`tariffe_aziendali`) per prefill di
 * `costo_manodopera`. `term` typeahead (nome).
 */
export function usePrefillFromTariffa(term: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery<PrefillTariffaOption[]>({
    queryKey: K.tariffeSearch(companyId, term),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = sb()
        .from("tariffe_aziendali")
        .select(
          "id, nome, tipo, unita, unita_fatturazione, prezzo_vendita, costo_interno, prezzo_costo",
        )
        .eq("company_id", companyId!);
      const t = term.trim();
      if (t) q = q.ilike("nome", `%${t}%`);
      const { data, error } = await q.order("nome").limit(40);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
        id: String(d.id),
        nome: (d.nome as string) ?? "Servizio",
        tipo: (d.tipo as string | null) ?? null,
        unita:
          (d.unita_fatturazione as string | null) ??
          (d.unita as string | null) ??
          null,
        costo:
          (d.costo_interno as number | null) ??
          (d.prezzo_costo as number | null) ??
          0,
        prezzo_vendita: (d.prezzo_vendita as number | null) ?? 0,
      }));
    },
  });
}

// ─── Ricerca voci di listino (per AddVocePicker del computo) ──────────────────

/** Voce di listino lavorazioni arricchita col nome del capitolo (per il picker). */
export interface ListinoVoceSearchOption {
  id: string;
  descrizione: string;
  codice: string | null;
  unita_misura: TetUnitaMisura;
  prezzo_unitario: number;
  costo_materiali: number;
  costo_manodopera: number;
  capitolo_nome: string | null;
  /** Prezzario regionale d'origine della voce (citazione base d'asta). NULL = voce libera. */
  fonte: string | null;
}

/**
 * Ricerca typeahead nel listino lavorazioni aziendale (`tet_listino_voci`) per
 * il picker del computo. Joina `tet_listino_capitoli` per esporre il nome del
 * capitolo (così la voce può essere pre-assegnata al capitolo giusto).
 */
export function useListinoVociSearch(term: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery<ListinoVoceSearchOption[]>({
    queryKey: K.vociSearch(companyId, term),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = sb()
        .from("tet_listino_voci")
        .select(
          "id, descrizione, codice, unita_misura, prezzo_unitario, costo_materiali, costo_manodopera, fonte, capitolo:tet_listino_capitoli(nome)",
        )
        .eq("company_id", companyId!);
      const t = term.trim();
      if (t) q = q.or(`descrizione.ilike.%${t}%,codice.ilike.%${t}%`);
      const { data, error } = await q.order("ordine").limit(40);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((d) => {
        const cap = d.capitolo as { nome?: string } | null;
        return {
          id: String(d.id),
          descrizione: (d.descrizione as string) ?? "Voce",
          codice: (d.codice as string | null) ?? null,
          unita_misura: ((d.unita_misura as string) ?? "cad") as TetUnitaMisura,
          prezzo_unitario: (d.prezzo_unitario as number | null) ?? 0,
          costo_materiali: (d.costo_materiali as number | null) ?? 0,
          costo_manodopera: (d.costo_manodopera as number | null) ?? 0,
          capitolo_nome: cap?.nome ?? null,
          fonte: (d.fonte as string | null) ?? null,
        };
      });
    },
  });
}
