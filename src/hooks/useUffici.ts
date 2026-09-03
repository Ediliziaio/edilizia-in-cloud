/**
 * Uffici aziendali (Amministrazione, Tecnico, Commerciale, Cantiere…).
 *
 * Servono al flusso di lavoro commessa: un passo può andare a una persona
 * oppure a un ufficio. Assegnare all'ufficio è ciò che rende il flusso stabile
 * nel tempo — le persone vanno in ferie e cambiano azienda, l'ufficio no.
 *
 * L'attività di un ufficio nasce in carico al responsabile (se c'è), ma la
 * vedono e la possono prendere tutti i membri: le policy `Membri ufficio …` su
 * `tasks` esistono apposta.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Ufficio {
  id: string;
  nome: string;
  descrizione: string | null;
  responsabile_id: string | null;
  colore: string | null;
  sort_order: number;
  attivo: boolean;
  /** Id dei profili che ne fanno parte. */
  membri: string[];
}

interface UfficioRow {
  id: string;
  nome: string;
  descrizione: string | null;
  responsabile_id: string | null;
  colore: string | null;
  sort_order: number;
  attivo: boolean;
}

export const ufficiKey = (companyId?: string | null) => ["company-uffici", companyId] as const;

export function useUffici(companyId?: string | null) {
  return useQuery({
    queryKey: ufficiKey(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<Ufficio[]> => {
      // Due query invece dell'embed: l'embed annidato su tabelle con RLS fa
      // pagare il planning a ogni riga (lezione della Formazione).
      const [uffRes, memRes] = await Promise.all([
        supabase
          .from("company_uffici")
          .select("id, nome, descrizione, responsabile_id, colore, sort_order, attivo")
          .eq("company_id", companyId!)
          .order("sort_order", { ascending: true }),
        supabase
          .from("ufficio_membri")
          .select("ufficio_id, profile_id")
          .eq("company_id", companyId!),
      ]);
      if (uffRes.error) throw uffRes.error;
      if (memRes.error) throw memRes.error;

      const membriPerUfficio = new Map<string, string[]>();
      ((memRes.data ?? []) as unknown as Array<{ ufficio_id: string; profile_id: string }>)
        .forEach((m) => {
          const lista = membriPerUfficio.get(m.ufficio_id) ?? [];
          lista.push(m.profile_id);
          membriPerUfficio.set(m.ufficio_id, lista);
        });

      return ((uffRes.data ?? []) as unknown as UfficioRow[]).map((u) => ({
        ...u,
        membri: membriPerUfficio.get(u.id) ?? [],
      }));
    },
  });
}

/** Solo gli uffici attivi: quelli disattivati non vanno più proposti nei flussi. */
export function useUfficiAttivi(companyId?: string | null) {
  const q = useUffici(companyId);
  return { ...q, data: (q.data ?? []).filter((u) => u.attivo) };
}

interface SalvaUfficioInput {
  id?: string;
  nome: string;
  descrizione?: string | null;
  responsabile_id?: string | null;
  colore?: string | null;
  attivo?: boolean;
  membri: string[];
}

export function useSalvaUfficio(companyId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvaUfficioInput) => {
      if (!companyId) throw new Error("Azienda non determinata");

      const dati = {
        company_id: companyId,
        nome: input.nome.trim(),
        descrizione: input.descrizione?.trim() || null,
        responsabile_id: input.responsabile_id || null,
        colore: input.colore || null,
        attivo: input.attivo ?? true,
      };

      let ufficioId = input.id;
      if (ufficioId) {
        const { error } = await supabase
          .from("company_uffici")
          .update(dati as never)
          .eq("id", ufficioId)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("company_uffici")
          .insert(dati as never)
          .select("id")
          .single();
        if (error) throw error;
        ufficioId = (data as unknown as { id: string }).id;
      }

      // Membri: replace secco della lista dell'ufficio. È una lista corta e
      // l'alternativa (diff) non vale la complessità.
      const { error: delErr } = await supabase
        .from("ufficio_membri")
        .delete()
        .eq("ufficio_id", ufficioId!);
      if (delErr) throw delErr;

      // Il responsabile è per forza dentro l'ufficio: altrimenti riceverebbe in
      // carico attività di un reparto di cui non fa parte, e non le vedrebbe.
      const membri = Array.from(new Set([
        ...input.membri,
        ...(dati.responsabile_id ? [dati.responsabile_id] : []),
      ]));

      if (membri.length > 0) {
        const { error: insErr } = await supabase
          .from("ufficio_membri")
          .insert(membri.map((profile_id) => ({
            ufficio_id: ufficioId!,
            profile_id,
            company_id: companyId,
          })) as never);
        if (insErr) throw insErr;
      }

      return ufficioId!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ufficiKey(companyId) });
      toast.success("Ufficio salvato.");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "riprova";
      toast.error(
        msg.includes("company_uffici_company_id_nome_key")
          ? "Esiste già un ufficio con questo nome."
          : "Non riesco a salvare l'ufficio: " + msg,
      );
    },
  });
}

export function useEliminaUfficio(companyId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ufficioId: string) => {
      // I passi di flusso e le attività che puntavano qui non si rompono: le FK
      // sono ON DELETE SET NULL, tornano semplicemente senza ufficio.
      const { error } = await supabase
        .from("company_uffici")
        .delete()
        .eq("id", ufficioId)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ufficiKey(companyId) });
      toast.success("Ufficio eliminato.");
    },
    onError: (e: unknown) =>
      toast.error("Non riesco a eliminare: " + (e instanceof Error ? e.message : "riprova")),
  });
}
