/**
 * I collegamenti da verificare (`acquisti_collegamenti`) con un nome leggibile per ogni documento,
 * e il cambio di stato (`acquisti_collegamento_cambia_stato`, che controlla permessi e transizioni).
 * Legge chi vede costi o acquisti (regola della tabella).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/formatters";
import type { RigaCollegamento, StatoCollegamento } from "@/lib/acquisti/verificaCollegamenti";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COLONNE =
  "id, company_id, da_tipo, da_id, da_riga, a_tipo, a_id, a_riga, regola, esito, stato, prove, percorso, importo, con_ai, autore_tipo, created_at, updated_at";
/** Il popup lavora a pagine di questa misura: oltre, si filtra. */
export const LIMITE_RIGHE = 300;

export const chiaveVerifica = (companyId: string, fatturaId?: string | null) => ["verifica-collegamenti", companyId, fatturaId ?? null] as const;

/** Nomi dei documenti: per i tipi che il popup sa raccontare; gli altri si mostrano col tipo. */
async function nomi(righe: RigaCollegamento[]): Promise<Record<string, string>> {
  const ids = (tipo: string) => [...new Set(righe.flatMap((r) => [r.da_tipo === tipo ? r.da_id : null, r.a_tipo === tipo ? r.a_id : null]).filter(Boolean))] as string[];
  const out: Record<string, string> = {};
  const fatture = ids("fattura_ricevuta");
  const bolle = ids("ddt");
  const commesse = ids("commessa");
  const ordini = ids("ordine");
  const [f, d, c, o] = await Promise.all([
    fatture.length ? db.from("fatture_ricevute").select("id, numero_fattura, data_fattura, cedente_ragione_sociale").in("id", fatture) : { data: [] },
    bolle.length ? db.from("ddt_ricezione").select("id, numero_ddt, data_ricezione").in("id", bolle) : { data: [] },
    commesse.length ? db.from("orders").select("id, order_code, description").in("id", commesse) : { data: [] },
    ordini.length ? db.from("purchase_orders").select("id, oda_number, issue_date").in("id", ordini) : { data: [] },
  ]);
  for (const x of f.data ?? [])
    out[x.id] = `Fattura ${x.numero_fattura ?? "—"}${x.data_fattura ? ` del ${formatDateShort(x.data_fattura)}` : ""}${x.cedente_ragione_sociale ? ` · ${x.cedente_ragione_sociale}` : ""}`;
  for (const x of d.data ?? []) out[x.id] = `Bolla ${x.numero_ddt ?? "—"}${x.data_ricezione ? ` del ${formatDateShort(x.data_ricezione)}` : ""}`;
  for (const x of o.data ?? []) out[x.id] = `Ordine ${x.oda_number ?? "—"}${x.issue_date ? ` del ${formatDateShort(x.issue_date)}` : ""}`;
  for (const x of c.data ?? []) out[x.id] = `Commessa ${x.order_code ?? ""}${x.description ? ` · ${String(x.description).slice(0, 60)}` : ""}`.trim();
  return out;
}

export function useVerificaCollegamenti(companyId: string | undefined, fatturaId?: string | null) {
  return useQuery({
    queryKey: chiaveVerifica(companyId ?? "", fatturaId),
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      let q = db.from("acquisti_collegamenti").select(COLONNE).eq("company_id", companyId).order("updated_at", { ascending: false }).limit(LIMITE_RIGHE);
      if (fatturaId) q = q.or(`and(da_tipo.eq.fattura_ricevuta,da_id.eq.${fatturaId}),and(a_tipo.eq.fattura_ricevuta,a_id.eq.${fatturaId})`);
      const { data, error } = await q;
      if (error) throw error;
      const righe = (data ?? []) as RigaCollegamento[];
      return { righe, nomi: await nomi(righe), troncato: righe.length >= LIMITE_RIGHE };
    },
  });
}

export function useCambiaStatoCollegamenti(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    /** Uno o più collegamenti allo stesso stato. Si fermano al primo errore e dicono quanti sono passati. */
    mutationFn: async ({ ids, stato, motivo }: { ids: string[]; stato: StatoCollegamento; motivo?: string | null }) => {
      let fatti = 0;
      for (const id of ids) {
        const { error } = await db.rpc("acquisti_collegamento_cambia_stato", { p_id: id, p_stato: stato, p_motivo: motivo ?? null });
        if (error) throw Object.assign(new Error(error.message), { fatti });
        fatti++;
      }
      return fatti;
    },
    onSuccess: (fatti, { stato }) => {
      const parola: Partial<Record<StatoCollegamento, [string, string]>> = {
        collegato: ["confermato", "confermati"],
        rifiutato: ["rifiutato", "rifiutati"],
        annullato: ["annullato", "annullati"],
        verificato: ["segnato verificato", "segnati verificati"],
        proposto: ["riproposto", "riproposti"],
      };
      const [uno, tanti] = parola[stato] ?? ["aggiornato", "aggiornati"];
      toast.success(fatti === 1 ? `Collegamento ${uno}` : `${fatti} collegamenti ${tanti}`);
    },
    onError: (e: Error & { fatti?: number }) =>
      toast.error("Non salvato", { description: `${e.fatti ? `${e.fatti} fatti, poi: ` : ""}${e.message}` }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["verifica-collegamenti", companyId ?? ""] });
      void qc.invalidateQueries({ queryKey: ["ultimo-collegamento", companyId ?? ""] });
      void qc.invalidateQueries({ queryKey: ["fattura-collegamenti"] });
    },
  });
}
