import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { analisiCostiSchema, analisiVuota, risorsaVuota, type AnalisiCosti, type RisorsaCosto } from "@/lib/preventivi/analisiCosti";
import { unitaCompatibili } from "@/lib/prezzario/confronto";

type Ambito = { companyId: string; tipo: "computo" | "preventivo"; id: string };
type Riga = { company_id: string; tipo: string; documento_id: string; revisione: string; versione: number; dati: Json; fotografia: Json | null };
type Schema = Omit<Database, "public"> & {
  public: Database["public"] & { Tables: Database["public"]["Tables"] & {
    preventivo_analisi_costi: { Row: Riga; Insert: Partial<Riga>; Update: Partial<Riga>; Relationships: [] };
  } };
};
const db = supabase as unknown as SupabaseClient<Schema>;

export async function leggiAnalisiCostiPreventivo(ambito: Ambito) {
  const { data, error } = await db.from("preventivo_analisi_costi").select("versione,dati")
    .eq("company_id", ambito.companyId).eq("tipo", ambito.tipo).eq("documento_id", ambito.id).eq("revisione", "").maybeSingle();
  if (error) throw new Error("Analisi costi non disponibile. Riapri il preventivo per riprovare.");
  return data ? { analisi: analisiCostiSchema.parse(data.dati), versione: data.versione } : null;
}

function chiave(ambito?: Ambito) {
  return ["preventivo-analisi-costi", ambito?.companyId, ambito?.tipo, ambito?.id] as const;
}

export async function salvaAnalisiCostiPreventivo(ambito: Ambito, valore: AnalisiCosti, versione: number) {
  const dati = analisiCostiSchema.parse(valore) as unknown as Json;
  const tabella = db.from("preventivo_analisi_costi");
  const risultato = versione === 0
    ? await tabella.insert({ company_id: ambito.companyId, tipo: ambito.tipo, documento_id: ambito.id, dati })
        .select("versione").single()
    : await tabella.update({ dati, versione: versione + 1 }).eq("company_id", ambito.companyId).eq("tipo", ambito.tipo)
        .eq("documento_id", ambito.id).eq("revisione", "").eq("versione", versione).select("versione").maybeSingle();
  if (risultato.error?.code === "23505" || (!risultato.error && !risultato.data)) {
    throw new Error("L’analisi è cambiata nel frattempo. Riapri il preventivo per confrontare i dati salvati.");
  }
  if (risultato.error) throw new Error("Analisi non salvata. Verifica l’accesso o riprova.");
  return risultato.data!.versione;
}

export function useAnalisiCostiPreventivo(ambito?: Ambito, mostraRevisioni = false) {
  const client = useQueryClient();
  const key = chiave(ambito);
  const query = useQuery({
    queryKey: key,
    enabled: !!ambito,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      if (!ambito) throw new Error("Salva prima il preventivo.");
      return await leggiAnalisiCostiPreventivo(ambito) ?? { analisi: analisiVuota(), versione: 0 };
    },
  });
  const archivio = useQuery({
    queryKey: [...key, "revisioni"],
    enabled: !!ambito && mostraRevisioni,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      if (!ambito) return [];
      const { data, error } = await db.from("preventivo_analisi_costi").select("revisione,dati,fotografia")
        .eq("company_id", ambito.companyId).eq("tipo", ambito.tipo).eq("documento_id", ambito.id)
        .neq("revisione", "").order("revisione", { ascending: false });
      if (error) throw new Error("Archivio delle analisi non disponibile.");
      return (data ?? []).map(r => ({
        id: r.revisione, nome: r.revisione.split("|")[0], analisi: analisiCostiSchema.parse(r.dati), fotografia: r.fotografia,
      }));
    },
  });
  return {
    analisi: query.data?.analisi ?? analisiVuota(),
    versione: query.data?.versione,
    attesa: !!ambito && query.isPending,
    errore: query.error?.message,
    revisioni: archivio.data ?? [],
    erroreRevisioni: archivio.error?.message,
    aggiorna: query.refetch,
    salva: async (valore: AnalisiCosti, versioneAttesa = query.data?.versione) => {
      if (!ambito || !query.data || versioneAttesa === undefined) throw new Error("Attendi l’apertura del preventivo salvato.");
      if (versioneAttesa !== query.data.versione) throw new Error("Ricalcola il confronto sui costi aggiornati.");
      const versione = await salvaAnalisiCostiPreventivo(ambito, valore, versioneAttesa);
      client.setQueryData(key, { analisi: valore, versione });
    },
  };
}

export async function risorseDaTariffaAnalisi(companyId: string, riferimento: ({ id: string } | { codice: string }) & { unita?: string }): Promise<RisorsaCosto[]> {
  const ricerca = supabase.from("tariffe_aziendali").select("id,nome,prezzo_costo,costo_interno,costo_default,unita,attiva,attivo")
    .eq("company_id", companyId);
  const { data, error } = await ("id" in riferimento ? ricerca.eq("id", riferimento.id) : ricerca.eq("codice", riferimento.codice)).maybeSingle();
  if (error || !data) throw new Error("La tariffa aziendale di questa lavorazione non è disponibile.");
  if (riferimento.unita && (data.attiva === false || data.attivo === false || !unitaCompatibili(data.unita, riferimento.unita))) {
    throw new Error("La tariffa è disattivata o non usa l’unità della lavorazione.");
  }
  const { data: analisi, error: erroreAnalisi } = await supabase.from("analisi_prezzo").select("id,spese_generali_pct")
    .eq("company_id", companyId).eq("tariffa_id", data.id).maybeSingle();
  if (erroreAnalisi) throw new Error("Impossibile leggere l’analisi della tariffa.");
  if (analisi) {
    const { data: componenti, error: erroreComponenti } = await supabase.from("analisi_prezzo_componenti")
      .select("tipo,descrizione,quantita,prezzo_unitario,unita").eq("company_id", companyId).eq("analisi_id", analisi.id).order("sort_order");
    if (erroreComponenti) throw new Error("Impossibile leggere i componenti del listino.");
    if (componenti?.length) {
      const copia = componenti.map(c => ({
        ...risorsaVuota(c.tipo === "materiale" || c.tipo === "manodopera" || c.tipo === "nolo" ? c.tipo : "altro"),
        nome: c.descrizione, unita: c.unita ?? "", prezzo: c.prezzo_unitario == null ? "" : String(c.prezzo_unitario),
        quantita: c.quantita == null ? "" : String(c.quantita), base: "unitaria" as RisorsaCosto["base"], fonte: data.nome,
      }));
      if (Number(analisi.spese_generali_pct) > 0) copia.push({
        ...risorsaVuota("spese"), nome: "Spese generali", prezzo: String(analisi.spese_generali_pct), base: "percentuale", fonte: data.nome,
      });
      return copia;
    }
  }
  const costo = [data.costo_interno, data.prezzo_costo, data.costo_default].find(n => n != null && Number(n) > 0);
  if (costo == null) throw new Error("La tariffa è priva di un costo utilizzabile.");
  return [{ ...risorsaVuota("altro"), nome: data.nome, prezzo: String(costo), base: "unitaria", fonte: "Listino aziendale" }];
}
