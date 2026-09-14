/**
 * Le operazioni che riorganizzano il listino in un colpo solo, dentro il
 * database (funzioni listino_* delle migrazioni 20280916500000/…01):
 *  - una linea nuova sugli stessi modelli di una tipologia («Salamander 73»);
 *  - le linee della tipologia ai prodotti che non le hanno;
 *  - scostamenti e prezzo al mq delle linee di una tipologia;
 *  - la copia di una tipologia con linee, prodotti, varianti e griglie;
 *  - colori e varianti uguali in tutti i prodotti di una tipologia (…600000).
 *
 * Tutto o niente: se una riga non va, non resta un listino a metà. I messaggi
 * d'errore arrivano già in italiano dalle funzioni.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import type { AsseVariantiDati } from "@/lib/listino/organizzaListino";
import { invalidaListinoNelPreventivatore } from "@/lib/serramenti/cacheListino";

export interface NuovaLineaAsse {
  macrocategoriaId: string;
  nome: string;
  scostamentoPct: number;
  /** Solo se la tipologia non ha ancora linee: il nome di quella che ha adesso. */
  nomeBase?: string | null;
  /** La linea da cui prendere foto e descrizione del valore. */
  copiaDa?: string | null;
  immagineUrl?: string | null;
}

export interface EsitoNuovaLinea {
  linea: string;
  aggiunte: number;
  riattivate: number;
  gia_presenti: number;
  saltati: number;
}

export interface EsitoAllineaLinee {
  prodotti: number;
  linee: number;
}

export interface PrezziLineeTipologia {
  macrocategoriaId: string;
  linee: Array<{ nome: string; pct: number; attiva: boolean }>;
  prezzoVenditaMq?: number | null;
  prezzoAcquistoMq?: number | null;
}

export interface EsitoPrezziLinee {
  valori: number;
  prodotti_prezzo: number;
}

export interface CopiaTipologia {
  macrocategoriaId: string;
  nome: string;
  suffissoProdotti?: string | null;
  variazionePct?: number | null;
  conProdotti: boolean;
}

export interface EsitoCopiaTipologia {
  id: string;
  nome: string;
  prodotti: number;
  linee: number;
  schede: number;
}

export interface VariantiDellaTipologia {
  macrocategoriaId: string;
  assi: AsseVariantiDati[];
}

export interface EsitoVariantiTipologia {
  valori: number;
  aggiunti: number;
  assi: number;
}

type RispostaRpc = { data: unknown; error: { message?: string } | null };

async function chiama<T>(funzione: string, argomenti: Record<string, unknown>): Promise<T> {
  // (supabase as any): funzioni nuove, non ancora nei tipi generati
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any).rpc(funzione, argomenti)) as RispostaRpc;
  if (error) throw new Error(error.message || "Operazione non riuscita: riprova.");
  return data as T;
}

export function useOrganizzaListino() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const invalida = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
    void qc.invalidateQueries({ queryKey: ["listino-macrocategorie", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-categorie", companyId] });
    void qc.invalidateQueries({ queryKey: ["listino-schede-linea", companyId] });
    invalidaListinoNelPreventivatore(qc);
  };

  const aggiungiLinea = useMutation<EsitoNuovaLinea, Error, NuovaLineaAsse>({
    mutationFn: (p) =>
      chiama<EsitoNuovaLinea>("listino_aggiungi_linea", {
        p_macrocategoria_id: p.macrocategoriaId,
        p_nome: p.nome,
        p_scostamento_pct: p.scostamentoPct,
        p_nome_base: p.nomeBase ?? null,
        p_copia_da: p.copiaDa ?? null,
        p_immagine_url: p.immagineUrl ?? null,
      }),
    onSuccess: invalida,
  });

  const allineaLinee = useMutation<EsitoAllineaLinee, Error, string>({
    mutationFn: (macrocategoriaId) =>
      chiama<EsitoAllineaLinee>("listino_allinea_linee", { p_macrocategoria_id: macrocategoriaId }),
    onSuccess: invalida,
  });

  const prezziLinee = useMutation<EsitoPrezziLinee, Error, PrezziLineeTipologia>({
    mutationFn: (p) =>
      chiama<EsitoPrezziLinee>("listino_prezzi_linee", {
        p_macrocategoria_id: p.macrocategoriaId,
        p_linee: p.linee,
        p_prezzo_vendita_mq: p.prezzoVenditaMq ?? null,
        p_prezzo_acquisto_mq: p.prezzoAcquistoMq ?? null,
      }),
    onSuccess: invalida,
  });

  const copiaTipologia = useMutation<EsitoCopiaTipologia, Error, CopiaTipologia>({
    mutationFn: (p) =>
      chiama<EsitoCopiaTipologia>("listino_copia_tipologia", {
        p_macrocategoria_id: p.macrocategoriaId,
        p_nome: p.nome,
        p_suffisso_prodotti: p.suffissoProdotti ?? null,
        p_variazione_pct: p.variazionePct ?? 0,
        p_con_prodotti: p.conProdotti,
      }),
    onSuccess: invalida,
  });

  const variantiTipologia = useMutation<EsitoVariantiTipologia, Error, VariantiDellaTipologia>({
    mutationFn: (p) =>
      chiama<EsitoVariantiTipologia>("listino_varianti_tipologia", {
        p_macrocategoria_id: p.macrocategoriaId,
        p_assi: p.assi.map((a) => ({
          chiave: a.chiave,
          nome: a.nome,
          base: a.base,
          allinea_base: a.allineaBase,
          completa: a.completa,
          valori: a.valori,
        })),
      }),
    onSuccess: invalida,
  });

  return { aggiungiLinea, allineaLinee, prezziLinee, copiaTipologia, variantiTipologia };
}
