/**
 * Categorie di cassa (catalogo `cassa_voci`, 14/11/2026): una sola fonte per il
 * movimento bancario, il popup di classificazione del Cash flow e la
 * Configurazione. Il catalogo dell'azienda è lo standard dell'Excel
 * (`cassa_catalogo_base`, 330 voci): dal 15/11/2026 ogni azienda lo ha già,
 * dalla nascita; `cassa_catalogo_prepara` resta come rete di sicurezza.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bankRpc } from "@/lib/finance/bankWorkspace";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import type { VoceCassa } from "@/lib/controlloGestione/vociCassa";

// Tabelle e funzioni non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type FlussoVoce = "entrata" | "uscita" | "entrambi" | "nessuno";
export type LivelloVoce = "area" | "categoria" | "voce" | "sottovoce";

export interface VoceCatalogo {
  id: string;
  codice: string;
  parent_id: string | null;
  livello: LivelloVoce;
  nome: string;
  descrizione: string | null;
  esempio: string | null;
  flusso: FlussoVoce;
  sezione: string;
  voce_cassa_in: VoceCassa | null;
  voce_cassa_out: VoceCassa | null;
  richiede_commessa: boolean;
  attiva: boolean;
  archiviata_il: string | null;
  ordine: number;
  origine: "catalogo" | "azienda";
}

/** Categoria di un movimento come la restituisce `cassa_voci_movimenti`. */
export interface VoceMovimento {
  id: string;
  codice: string;
  nome: string;
  categoria: string | null;
  /** manuale, regola, documento, controparte, proposta; «storico» = ricavata dal vecchio testo. */
  origine: string;
  confermata: boolean;
  il: string | null;
  /** Il movimento è ripartito su più voci: le quote salvate, la più grande prima. */
  quote?: QuotaVoce[] | null;
  /** La fattura collegata copre più voci: la ripartizione che propone. */
  proposta_quote?: QuotaVoce[] | null;
}

export interface QuotaVoce {
  id: string;
  nome: string;
  codice: string;
  /** Solo nelle proposte: una categoria intera va precisata prima di salvare. */
  livello?: LivelloVoce;
  cents: number;
}

export const ORIGINE_VOCE: Record<string, string> = {
  manuale: "Scelta da una persona",
  regola: "Da una regola",
  documento: "Dalla fattura collegata",
  controparte: "Dalla controparte",
  giroconto: "Giroconto tra i tuoi conti, da confermare",
  proposta: "Proposta, da confermare",
  storico: "Dalla vecchia categoria, da confermare",
};

export const SEZIONI: Record<string, string> = {
  operativa: "Gestione operativa",
  finanziaria: "Oneri e proventi finanziari",
  investimenti: "Investimenti",
  finanziamenti: "Finanziamenti",
  patrimoniale: "Cauzioni e depositi",
  trasferimenti: "Giroconti",
  senza_cassa: "Senza movimento di denaro",
  da_classificare: "Da classificare",
  da_configurare: "Da configurare",
};

export const chiaveCatalogo = (company: string | null | undefined) => ["cassa-voci", company] as const;

/** Il catalogo dell'azienda; se è vuoto lo crea dal catalogo base (una volta sola, idempotente). */
export function useCatalogoCassa(company: string | null | undefined) {
  return useQuery({
    queryKey: chiaveCatalogo(company),
    enabled: !!company,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VoceCatalogo[]> => {
      const leggi = async () => {
        const { data, error } = await db
          .from("cassa_voci")
          .select("id,codice,parent_id,livello,nome,descrizione,esempio,flusso,sezione,voce_cassa_in,voce_cassa_out,richiede_commessa,attiva,archiviata_il,ordine,origine")
          .eq("company_id", company)
          .order("ordine")
          .order("codice")
          .limit(5000);
        if (error) throw error;
        return (data ?? []) as VoceCatalogo[];
      };
      const voci = await leggi();
      if (voci.length) return voci;
      const { error } = await db.rpc("cassa_catalogo_prepara", { p_company: company });
      if (error) throw error;
      return leggi();
    },
  });
}

/** Una voce si può mettere su un movimento con quel segno? */
export function voceUsabile(v: VoceCatalogo, importo: number): boolean {
  if (v.livello !== "voce" && v.livello !== "sottovoce") return false;
  if (!v.attiva || v.archiviata_il || v.flusso === "nessuno") return false;
  if (importo >= 0 && v.flusso === "uscita") return false;
  if (importo < 0 && v.flusso === "entrata") return false;
  return true;
}

export interface GruppoVoci {
  categoria: VoceCatalogo;
  area: VoceCatalogo | null;
  voci: VoceCatalogo[];
}

/**
 * Le voci scelte per un movimento, raggruppate per categoria e cercate per
 * nome, codice, categoria o descrizione. Le sottovoci stanno sotto la loro voce.
 */
export function vociPerMovimento(catalogo: VoceCatalogo[], importo: number, cerca = ""): GruppoVoci[] {
  const perId = new Map(catalogo.map((v) => [v.id, v]));
  const q = cerca.trim().toLocaleLowerCase("it-IT");
  const gruppi = new Map<string, GruppoVoci>();
  for (const v of catalogo) {
    if (!voceUsabile(v, importo)) continue;
    const padre = v.parent_id ? perId.get(v.parent_id) : undefined;
    const categoria = v.livello === "sottovoce" && padre?.parent_id ? perId.get(padre.parent_id) : padre;
    if (!categoria) continue;
    const testo = `${v.codice} ${v.nome} ${categoria.nome} ${v.descrizione ?? ""} ${v.livello === "sottovoce" ? padre?.nome ?? "" : ""}`.toLocaleLowerCase("it-IT");
    if (q && !q.split(/\s+/).every((p) => testo.includes(p))) continue;
    const g = gruppi.get(categoria.id) ?? { categoria, area: categoria.parent_id ? perId.get(categoria.parent_id) ?? null : null, voci: [] };
    g.voci.push(v);
    gruppi.set(categoria.id, g);
  }
  return [...gruppi.values()].sort((a, b) => a.categoria.ordine - b.categoria.ordine || a.categoria.codice.localeCompare(b.categoria.codice));
}

/** Le categorie dei movimenti richiesti (confermate o proposte dal vecchio testo). */
export function useVociMovimenti(company: string | null | undefined, ids: string[]) {
  const chiave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["cassa-voci-movimenti", company, chiave],
    enabled: !!company && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, VoceMovimento>> => {
      const out: Record<string, VoceMovimento> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const parte = await bankRpc<Record<string, VoceMovimento>>("cassa_voci_movimenti", {
          p_company: company,
          p_ids: ids.slice(i, i + 200),
        });
        Object.assign(out, parte ?? {});
      }
      return out;
    },
  });
}

/** Dopo una classificazione: tesoreria, cash flow e categorie dei movimenti si rileggono. */
export function useAggiornaDopoCategoria() {
  const qc = useQueryClient();
  return () => {
    refreshFinancialQueries(qc);
    void qc.invalidateQueries({ queryKey: ["cassa-voci-movimenti"] });
    void qc.invalidateQueries({ queryKey: ["cassa-da-classificare"] });
    void qc.invalidateQueries({ queryKey: ["cg", "rendiconto-cassa"] });
    void qc.invalidateQueries({ queryKey: ["bank-movimento"] });
    void qc.invalidateQueries({ queryKey: ["bank-movimenti"] });
  };
}

/** Salva la categoria di un movimento; restituisce la nuova revisione. */
export async function salvaCategoriaMovimento(args: {
  company: string;
  tx: string;
  voce: string | null;
  revision: number;
  motivo?: string | null;
}): Promise<number> {
  return bankRpc<number>("bank_movimento_categoria", {
    p_company: args.company,
    p_tx: args.tx,
    p_voce: args.voce,
    p_revision: args.revision,
    p_motivo: args.motivo ?? null,
  });
}

/**
 * Ripartisce un movimento su più voci (somma = importo, in centesimi). Un
 * elenco vuoto toglie la ripartizione. Restituisce la nuova revisione.
 */
export async function salvaRipartizioneMovimento(args: {
  company: string;
  tx: string;
  quote: { voce: string; cents: number }[];
  revision: number;
  motivo?: string | null;
}): Promise<number> {
  return bankRpc<number>("bank_movimento_ripartizione", {
    p_company: args.company,
    p_tx: args.tx,
    p_quote: args.quote,
    p_revision: args.revision,
    p_motivo: args.motivo ?? null,
  });
}

/**
 * Una regola della Tesoreria da una scelta fatta nel popup di classificazione:
 * «quando compare questa controparte, nel verso scelto, è questa voce».
 * Priorità 10 come le regole fatte a mano; si cambia in Tesoreria → Impostazioni.
 */
export async function creaRegolaCassa(args: {
  company: string;
  testo: string;
  voce: { id: string; nome: string };
  verso: "entrata" | "uscita";
}): Promise<void> {
  const { error } = await db.from("bank_categorization_rules").insert({
    company_id: args.company,
    match_field: "any",
    match_type: "contains",
    match_value: args.testo.trim(),
    category: args.voce.nome,
    category_icon: "Tags",
    cassa_voce_id: args.voce.id,
    verso: args.verso,
    priority: 10,
    auto_apply: true,
    is_case_sensitive: false,
  });
  if (error) throw error;
}

/** «1.000,50» o «1000.5» → 100050 centesimi; null se non è un importo. */
export function centesimiDaTesto(testo: string): number | null {
  let t = testo.replace(/[€\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Configurazione di una voce (nuova se `id` è null). */
export function useSalvaVoceCassa(company: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dati }: { id: string | null; dati: Record<string, unknown> }) => {
      const { data, error } = await db.rpc("cassa_voce_salva", { p_company: company, p_id: id, p_dati: dati });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveCatalogo(company) });
      void qc.invalidateQueries({ queryKey: ["cg", "rendiconto-cassa"] });
    },
  });
}

/**
 * Le controparti dei movimenti a schermo, in una chiamata sola (18/11/2026).
 *
 * Il nome lo decide il server (`tesoreria_controparti`), con la stessa regola per tutti: il
 * documento abbinato, il candidato che il motore ha già trovato, o la natura del movimento. Così
 * tesoreria, prima nota, scadenzario e controllo di gestione dicono lo stesso nome, e la lettura
 * della causale resta solo per quello che nessuno sa.
 */
export interface ControparteMovimento {
  nome: string;
  certa: boolean;
  origine: string;
}

export function useContropartiMovimenti(company: string | null | undefined, ids: string[]) {
  const chiave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["tesoreria-controparti", company, chiave],
    enabled: !!company && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, ControparteMovimento>> => {
      const out: Record<string, ControparteMovimento> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const parte = await bankRpc<Record<string, ControparteMovimento>>("tesoreria_controparti", {
          p_company: company,
          p_movimenti: ids.slice(i, i + 200),
        });
        Object.assign(out, parte ?? {});
      }
      return out;
    },
  });
}
