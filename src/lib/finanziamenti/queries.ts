/**
 * React Query hooks per il modulo Finanziamenti.
 * Tutto passa per Supabase con RLS company-scoped.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type {
  Finanziaria,
  TabellaFinanziamento,
  RigaTabellaFinanziamento,
} from "./types";

const QK = {
  finanziarie: (companyId?: string) => ["finanziamenti", "finanziarie", companyId] as const,
  tabelle: (companyId?: string) => ["finanziamenti", "tabelle", companyId] as const,
  tabella: (id: string, companyId?: string) => ["finanziamenti", "tabella", id, companyId] as const,
  righe: (tabellaId: string, companyId?: string) =>
    ["finanziamenti", "righe", tabellaId, companyId] as const,
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function assertEmail(value: string | null | undefined): void {
  const cleaned = cleanText(value);
  if (cleaned && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new Error("Email pratiche non valida");
  }
}

function assertPartitaIva(value: string | null | undefined): void {
  const cleaned = cleanText(value);
  if (cleaned && !/^[A-Z]{0,2}[0-9A-Z]{8,14}$/i.test(cleaned)) {
    throw new Error("Partita IVA non valida");
  }
}

function assertPercent(value: number | null | undefined, label: string): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} deve essere un numero tra 0 e 100`);
  }
}

function assertDates(decorrenza?: string | null, scadenza?: string | null): void {
  if (decorrenza && scadenza && scadenza < decorrenza) {
    throw new Error("La data di scadenza non può essere precedente alla decorrenza");
  }
}

function assertRigheFinanziamento(
  righe: Array<
    Omit<
      RigaTabellaFinanziamento,
      "id" | "tabella_id" | "company_id" | "created_at"
    >
  >
): void {
  if (righe.length === 0) throw new Error("La tabella deve avere almeno una riga");

  const seen = new Set<string>();
  righe.forEach((r, index) => {
    const row = index + 1;
    const positive = [
      ["importo_erogato", r.importo_erogato],
      ["numero_rate", r.numero_rate],
      ["durata_mesi", r.durata_mesi],
      ["prima_rata_giorni", r.prima_rata_giorni],
      ["importo_rata", r.importo_rata],
      ["importo_totale_credito", r.importo_totale_credito],
      ["importo_totale_dovuto", r.importo_totale_dovuto],
    ] as const;
    for (const [field, value] of positive) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Riga ${row}: ${field} deve essere positivo`);
      }
    }

    const nonNegative = [
      ["spese_istruttoria", r.spese_istruttoria],
      ["spese_incasso_rata", r.spese_incasso_rata],
      ["interessi_cliente", r.interessi_cliente],
      ["provvigione_dealer", r.provvigione_dealer],
    ] as const;
    for (const [field, value] of nonNegative) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Riga ${row}: ${field} non può essere negativo`);
      }
    }

    if (r.icc != null && (!Number.isFinite(r.icc) || r.icc < 0)) {
      throw new Error(`Riga ${row}: icc non può essere negativo`);
    }
    assertPercent(r.tan, `Riga ${row}: TAN`);
    assertPercent(r.taeg, `Riga ${row}: TAEG`);
    if (r.importo_totale_credito < r.importo_erogato) {
      throw new Error(`Riga ${row}: il totale credito è inferiore all'importo erogato`);
    }
    if (r.importo_totale_dovuto < r.importo_erogato) {
      throw new Error(`Riga ${row}: il totale dovuto è inferiore all'importo erogato`);
    }

    const key = `${r.importo_erogato}|${r.numero_rate}`;
    if (seen.has(key)) {
      throw new Error(`Riga ${row}: importo e durata duplicati nella stessa tabella`);
    }
    seen.add(key);
  });
}

// ─── Finanziarie ────────────────────────────────────────────────────────────
export function useFinanziarie() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.finanziarie(companyId ?? undefined),
    enabled: !!companyId,
    queryFn: async (): Promise<Finanziaria[]> => {
      const { data, error } = await supabase
        .from("eic_finanziarie" as never)
        .select("*")
        .eq("company_id", companyId)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data as unknown as Finanziaria[]) ?? [];
    },
  });
}

export function useCreateFinanziaria() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      nome: string;
      ragione_sociale?: string;
      partita_iva?: string;
      logo_url?: string;
      email_pratiche?: string;
      telefono?: string;
      note?: string;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const nome = cleanText(input.nome);
      if (nome.length < 2) throw new Error("Nome finanziaria obbligatorio");
      assertEmail(input.email_pratiche);
      assertPartitaIva(input.partita_iva);

      const { data: existing, error: existingError } = await supabase
        .from("eic_finanziarie" as never)
        .select("id")
        .eq("company_id", companyId)
        .ilike("nome", nome)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        throw new Error("Esiste già una finanziaria con questo nome per l'azienda");
      }

      const { data, error } = await supabase
        .from("eic_finanziarie" as never)
        .insert({
          ...input,
          nome,
          ragione_sociale: cleanOptionalText(input.ragione_sociale),
          partita_iva: cleanOptionalText(input.partita_iva)?.toUpperCase() ?? null,
          email_pratiche: cleanOptionalText(input.email_pratiche),
          telefono: cleanOptionalText(input.telefono),
          note: cleanOptionalText(input.note),
          company_id: companyId,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Finanziaria;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.finanziarie(companyId ?? undefined) });
    },
  });
}

// ─── Tabelle ────────────────────────────────────────────────────────────────
export function useTabelle() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.tabelle(companyId ?? undefined),
    enabled: !!companyId,
    queryFn: async (): Promise<
      Array<TabellaFinanziamento & { finanziaria_nome: string | null }>
    > => {
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select(
          "*, finanziaria:eic_finanziarie(nome)"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as Array<TabellaFinanziamento & { finanziaria: { nome: string } | null }>) ?? []).map(
        (t) => ({
          ...t,
          finanziaria_nome: t.finanziaria?.nome ?? null,
        })
      );
    },
  });
}

export function useTabella(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.tabella(id ?? "", companyId ?? undefined),
    enabled: Boolean(id) && !!companyId,
    queryFn: async (): Promise<
      (TabellaFinanziamento & { finanziaria: Finanziaria | null }) | null
    > => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select("*, finanziaria:eic_finanziarie(*)")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as never;
    },
  });
}

export function useRighe(tabellaId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.righe(tabellaId ?? "", companyId ?? undefined),
    enabled: Boolean(tabellaId) && !!companyId,
    queryFn: async (): Promise<RigaTabellaFinanziamento[]> => {
      if (!tabellaId) return [];
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento_righe" as never)
        .select("*")
        .eq("tabella_id", tabellaId)
        .eq("company_id", companyId)
        .order("importo_erogato", { ascending: true })
        .order("numero_rate", { ascending: true });
      if (error) throw error;
      return (data as unknown as RigaTabellaFinanziamento[]) ?? [];
    },
  });
}

export function useCreateTabella() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      finanziaria_id: string;
      nome_prodotto: string;
      codice_condizione?: string | null;
      subtariffa_default?: string | null;
      tan_base?: number | null;
      pdf_url?: string | null;
      pdf_filename?: string | null;
      csv_url?: string | null;
      csv_filename?: string | null;
      data_decorrenza?: string | null;
      data_scadenza?: string | null;
      note?: string | null;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const nomeProdotto = cleanText(input.nome_prodotto);
      if (nomeProdotto.length < 2) throw new Error("Nome finanziamento obbligatorio");
      assertPercent(input.tan_base, "TAN base");
      assertDates(input.data_decorrenza, input.data_scadenza);

      const { data: finanziaria, error: errFinanziaria } = await supabase
        .from("eic_finanziarie" as never)
        .select("id")
        .eq("id", input.finanziaria_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (errFinanziaria) throw errFinanziaria;
      if (!finanziaria) {
        throw new Error("Finanziaria non trovata o non appartenente all'azienda");
      }

      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .insert({
          ...input,
          nome_prodotto: nomeProdotto,
          codice_condizione: cleanOptionalText(input.codice_condizione),
          subtariffa_default: cleanOptionalText(input.subtariffa_default),
          note: cleanOptionalText(input.note),
          company_id: companyId,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TabellaFinanziamento;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
    },
  });
}

export function useDeleteTabella() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data: usedInProjects, error: usageError } = await supabase
        .from("fv_progetti" as never)
        .select("id")
        .eq("company_id", companyId)
        .eq("finanziamento_tabella_id", id)
        .limit(1)
        .maybeSingle();
      if (usageError) throw usageError;
      if (usedInProjects) {
        throw new Error(
          "Questa tabella è già usata in progetti/preventivi. Disattivala per impedirne nuovi utilizzi senza perdere lo storico.",
        );
      }

      const { error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
    },
  });
}

export function useToggleTabellaAttiva() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .update({ attiva } as never)
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabella(vars.id, companyId ?? undefined) });
    },
  });
}

export function useInsertRigheBatch() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      tabella_id: string;
      righe: Array<
        Omit<
          RigaTabellaFinanziamento,
          "id" | "tabella_id" | "company_id" | "created_at"
        >
      >;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // Recupera company_id della tabella (per soddisfare RLS check sulle righe)
      const { data: tab, error: errTab } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select("company_id")
        .eq("id", input.tabella_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (errTab) throw errTab;
      if (!tab) throw new Error("Tabella non trovata");
      assertRigheFinanziamento(input.righe);

      const payload = input.righe.map((r) => ({
        ...r,
        tabella_id: input.tabella_id,
        company_id: companyId,
      }));

      // Inserimento a chunk da 500 per evitare timeout su tabelle grandi
      const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("eic_tabelle_finanziamento_righe" as never)
          .insert(slice as never);
        if (error) throw error;
      }
      return payload.length;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabella(vars.tabella_id, companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.righe(vars.tabella_id, companyId ?? undefined) });
    },
  });
}

/** Cancella tutte le righe di una tabella (per re-import). */
export function useDeleteRigheTabella() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (tabellaId: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("eic_tabelle_finanziamento_righe" as never)
        .delete()
        .eq("tabella_id", tabellaId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: (_d, tabellaId) => {
      qc.invalidateQueries({ queryKey: QK.righe(tabellaId, companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabella(tabellaId, companyId ?? undefined) });
      qc.invalidateQueries({ queryKey: QK.tabelle(companyId ?? undefined) });
    },
  });
}
