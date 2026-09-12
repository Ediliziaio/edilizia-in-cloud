/**
 * La libreria di piattaforma delle marche e delle serie di profilo, e l'import
 * di una serie dentro il listino dell'azienda.
 *
 * Importare una serie NON duplica le tipologie: aggiunge una linea all'asse
 * "Linea" di quelle che l'azienda ha già, e installa solo quelle che mancano.
 * È la differenza fra un listino con due serie e un listino con due copie dello
 * stesso listino.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export type FasciaSerie = "basic" | "medium" | "top";

export interface MarcaSerramenti {
  id: string;
  nome: string;
  slug: string;
  paese: string | null;
  logo_url: string | null;
  materiali: string[];
  descrizione: string | null;
  sort_order: number;
}

export interface SerieSerramenti {
  id: string;
  marca_id: string;
  nome: string;
  slug: string;
  materiale: string;
  profondita_mm: number | null;
  camere: number | null;
  guarnizioni: number | null;
  uw_min: number | null;
  fascia: FasciaSerie | null;
  differenza_pct: number;
  immagine_url: string | null;
  descrizione: string | null;
  tipologie_incluse: string[];
  sort_order: number;
}

export interface MarcaConSerie extends MarcaSerramenti {
  serie: SerieSerramenti[];
}

export const ETICHETTA_FASCIA: Record<FasciaSerie, string> = {
  basic: "Base",
  medium: "Media",
  top: "Alta",
};

export const ETICHETTA_MATERIALE: Record<string, string> = {
  pvc: "PVC",
  alluminio: "Alluminio",
  legno: "Legno",
  legno_alluminio: "Legno-alluminio",
  acciaio: "Acciaio",
};

/** Marche con le loro serie, già ordinate come vanno mostrate. */
export function useLibreriaSerramenti() {
  return useQuery({
    queryKey: ["serramenti-libreria"],
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<MarcaConSerie[]> => {
      // Le tabelle della libreria sono più recenti dei tipi generati: qui il
      // cast è l'unico modo per leggerle, come già altrove nel progetto.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [marche, serie] = await Promise.all([
        db
          .from("serramenti_marche")
          .select("*")
          .eq("is_active", true)
          .order("sort_order")
          .order("nome"),
        db
          .from("serramenti_serie")
          .select("*")
          .eq("is_active", true)
          .order("sort_order")
          .order("nome"),
      ]);
      if (marche.error) throw marche.error;
      if (serie.error) throw serie.error;

      const perMarca = new Map<string, SerieSerramenti[]>();
      for (const s of (serie.data ?? []) as SerieSerramenti[]) {
        const elenco = perMarca.get(s.marca_id);
        if (elenco) elenco.push(s);
        else perMarca.set(s.marca_id, [s]);
      }
      return ((marche.data ?? []) as MarcaSerramenti[]).map((m) => ({
        ...m,
        serie: perMarca.get(m.id) ?? [],
      }));
    },
  });
}

export interface EsitoImportSerie {
  serie: string;
  linea: string;
  differenza_pct: number;
  tipologie_create: number;
  tipologie_aggiornate: number;
}

export interface ParametriImportSerie {
  serieId: string;
  companyId: string;
  macrocategoriaId?: string | null;
  /** Se assenti, i prezzi già a listino restano come sono. */
  prezzoVenditaMq?: number | null;
  prezzoAcquistoMq?: number | null;
  /** Scostamento dalla linea base; se assente vale quello suggerito dalla serie. */
  differenzaPct?: number | null;
  /** false = aggiunge la linea solo alle tipologie già presenti. */
  installaMancanti?: boolean;
}

export function useImportaSerieSerramenti() {
  const qc = useQueryClient();

  return useMutation<EsitoImportSerie, Error, ParametriImportSerie>({
    mutationFn: async (p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("importa_serie_serramenti", {
        p_serie_id: p.serieId,
        p_company_id: p.companyId,
        p_macrocategoria_id: p.macrocategoriaId ?? null,
        p_prezzo_vendita_mq: p.prezzoVenditaMq ?? null,
        p_prezzo_acquisto_mq: p.prezzoAcquistoMq ?? null,
        p_differenza_pct: p.differenzaPct ?? null,
        p_installa_mancanti: p.installaMancanti ?? true,
      });
      if (error) throw error;
      return data as unknown as EsitoImportSerie;
    },
    onSuccess: (esito) => {
      void qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
      void qc.invalidateQueries({ queryKey: ["listino-families"] });
      const pezzi = [
        esito.tipologie_create > 0 ? `${esito.tipologie_create} tipologie nuove` : null,
        esito.tipologie_aggiornate > 0
          ? `${esito.tipologie_aggiornate} già a listino`
          : null,
      ].filter(Boolean);
      toast.success(`${esito.serie} aggiunta al listino`, {
        description: pezzi.length
          ? `${pezzi.join(", ")}. La serie è una linea da scegliere nel preventivo.`
          : "Nessuna tipologia da aggiornare.",
      });
    },
    onError: (e) => {
      toast.error("Non sono riuscito a importare la serie", { description: e.message });
    },
  });
}
