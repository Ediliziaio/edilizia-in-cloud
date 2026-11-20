import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/personale/readAllPages";
import type { RiferimentoPsc } from "../../supabase/functions/_shared/posPsc";

export type StatoAvvioPsc = "da_valutare" | "previsto" | "non_previsto";
export type RuoloDittaSicurezza = "da_valutare" | "esecutrice" | "autonomo" | "fornitura";
export type StatoConsegnaPos = "richiesto" | "ricevuto" | "integrazione" | "congruo" | "inoltrato" | "positivo" | "negativo";
export type AzionePosEsterno = Exclude<StatoConsegnaPos, "richiesto" | "ricevuto"> | "ricevi" | "comunica_psc" | "ricezione_cse";

export interface AvvioSicurezza {
  stato: StatoAvvioPsc;
  motivazione: string | null;
  psc: RiferimentoPsc | null;
  versione: string;
  updated_at: string;
}
export interface ConsegnaPosEsterno {
  id: string;
  company_id: string;
  order_id: string;
  subappaltatore_id: string;
  nome_commessa: string;
  stato: StatoConsegnaPos;
  corrente: boolean;
  revisione: string | null;
  file_path: string | null;
  file_name: string | null;
  ricevuto_il: string | null;
  inoltrato_il: string | null;
  cse_ricevuto_il: string | null;
  esito_il: string | null;
  psc_comunicato: RiferimentoPsc | null;
  psc_comunicato_il: string | null;
  psc_alla_ricezione?: RiferimentoPsc | null;
  versione_avvio: string | null;
  pos_affidataria_id: string | null;
  pos_affidataria_revisione: number | null;
  nota: string | null;
  updated_at: string;
  da_riesaminare?: boolean;
}

export const RUOLI_DITTA: Record<RuoloDittaSicurezza, string> = {
  da_valutare: "Ruolo da valutare",
  esecutrice: "Impresa esecutrice",
  autonomo: "Lavoratore autonomo",
  fornitura: "Sola fornitura",
};

export const STATI_POS_ESTERNO: Record<StatoConsegnaPos, string> = {
  richiesto: "In attesa del POS",
  ricevuto: "Ricevuto · da verificare",
  integrazione: "Integrazione richiesta",
  congruo: "Congruenza verificata",
  inoltrato: "Inoltrato al CSE",
  positivo: "Esito CSE positivo",
  negativo: "Esito CSE negativo",
};

async function esegui<T>(nome: string, argomenti: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, argomenti as never);
  if (error) throw new Error(error.message);
  return data as unknown as T;
}

const chiavi = ["avvio-sicurezza"] as const;
export function useAvvioSicurezza(companyId: string, orderId: string, abilitato = true) {
  return useQuery({
    queryKey: [...chiavi, "psc", companyId, orderId],
    enabled: abilitato && !!companyId && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sicurezza_avvio_commessa" as never)
        .select("stato,motivazione,psc,versione,updated_at").eq("company_id", companyId).eq("order_id", orderId).maybeSingle();
      if (error) throw error;
      return data as unknown as AvvioSicurezza | null;
    },
  });
}

export function useRuoliSicurezza(companyId: string, orderId: string) {
  return useQuery({
    queryKey: [...chiavi, "ruoli", companyId, orderId],
    enabled: !!companyId && !!orderId,
    queryFn: async () => {
      const rows = await readAllPages((from, to) => supabase.from("sicurezza_ruoli_commessa" as never)
        .select("subappaltatore_id,ruolo").eq("company_id", companyId).eq("order_id", orderId).order("id").range(from, to)) as unknown as
        { subappaltatore_id: string; ruolo: RuoloDittaSicurezza }[];
      return Object.fromEntries(rows.map((r) => [r.subappaltatore_id, r.ruolo]));
    },
  });
}

export function useSalvaAvvioSicurezza(companyId: string, orderId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ attesa, stato, motivazione, psc }: { attesa: string | null; stato: StatoAvvioPsc; motivazione: string; psc: RiferimentoPsc | null }) =>
      esegui<AvvioSicurezza>("sicurezza_salva_avvio_pos", { _company: companyId, _ordine: orderId, _atteso: attesa, _stato: stato, _motivazione: motivazione, _psc: psc }),
    onSuccess: (d) => cache.setQueryData([...chiavi, "psc", companyId, orderId], d),
    onError: () => void cache.invalidateQueries({ queryKey: [...chiavi, "psc", companyId, orderId] }),
  });
}

export function useSalvaRuoloSicurezza(companyId: string, orderId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, ruolo }: { subId: string; ruolo: RuoloDittaSicurezza }) =>
      esegui<void>("sicurezza_salva_ruolo_pos", { _company: companyId, _ordine: orderId, _sub: subId, _ruolo: ruolo }),
    onSuccess: () => cache.invalidateQueries({ queryKey: chiavi }),
  });
}

export function useConsegnePosEsterno({ companyId, orderId, userId }: { companyId: string; orderId?: string; userId?: string }) {
  return useQuery({
    queryKey: [...chiavi, "consegne", companyId, orderId, userId],
    enabled: !!companyId && !!(orderId || userId),
    queryFn: async () => {
      let q = supabase.from("sicurezza_consegne_pos" as never).select("*").eq("company_id", companyId);
      if (orderId) q = q.eq("order_id", orderId);
      const [consegne, riesami] = await Promise.all([
        readAllPages((from, to) => q.order("updated_at", { ascending: false }).order("id").range(from, to)),
        userId ? esegui<string[]>("sicurezza_pos_riesami_portale", { _company: companyId }) : [],
      ]);
      const ids = new Set(riesami);
      return (consegne as unknown as ConsegnaPosEsterno[]).map((c) => ({ ...c, da_riesaminare: ids.has(c.id) }));
    },
  });
}

function useRileggiConsegne() {
  const cache = useQueryClient();
  return () => Promise.all([
    cache.invalidateQueries({ queryKey: [...chiavi, "consegne"] }),
    cache.invalidateQueries({ queryKey: ["fascicolo-cantiere"] }),
    cache.invalidateQueries({ queryKey: ["sicurezza-documenti"] }),
  ]);
}

export function useRichiestaPosEsterno(companyId: string, orderId: string, subId: string) {
  const rileggi = useRileggiConsegne();
  return useMutation({
    mutationFn: ({ fonte, ricevuto }: { fonte?: string; ricevuto?: string }) =>
      esegui<ConsegnaPosEsterno>("sicurezza_richiesta_pos", { _company: companyId, _ordine: orderId, _sub: subId, _fonte: fonte ?? null, _ricevuto: ricevuto || null }),
    onSuccess: rileggi,
  });
}

export function useAvanzaPosEsterno() {
  const rileggi = useRileggiConsegne();
  return useMutation({
    mutationFn: ({ consegna, azione, data, nota, file }: {
      consegna: ConsegnaPosEsterno; azione: AzionePosEsterno; data?: string; nota?: string;
      file?: { path: string; nome: string; revisione: string };
    }) => esegui<ConsegnaPosEsterno>("sicurezza_avanza_pos_esterno", {
      _id: consegna.id, _atteso: consegna.updated_at, _azione: azione, _data: data || null, _nota: nota || null,
      _path: file?.path ?? null, _nome: file?.nome ?? null, _revisione: file?.revisione ?? null,
    }),
    onSuccess: rileggi,
    onError: () => void rileggi(),
  });
}

export async function caricaPosEsterno(consegna: ConsegnaPosEsterno, file: File) {
  if (!file.size || file.size > 15 * 1024 * 1024 || (file.type && file.type !== "application/pdf") ||
      (await file.slice(0, 5).text()) !== "%PDF-") throw new Error("Scegli un PDF fino a 15 MB.");
  const path = `${consegna.company_id}/${consegna.id}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from("fascicoli-cantiere").upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
