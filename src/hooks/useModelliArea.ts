/**
 * Modelli di area del listino: i dati per la Libreria listino del super admin
 * e per «+ Area → Da un modello» nel listino dell'azienda.
 *
 * Le operazioni vere stanno nel database (listino_modello_crea, _aggiorna,
 * _installa, listino_modelli_disponibili): tutto o niente, messaggi d'errore
 * già in italiano. La tabella listino_modelli_area la legge solo il super admin.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { costruisciListino, type CategoriaListino, type MacroListino } from "@/lib/listino/lineeListino";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import type { EsitoInstallazione, ModelloArea, ModelloDisponibile, RiepilogoModello } from "@/lib/listino/modelliArea";
import { invalidaListinoNelPreventivatore } from "@/lib/serramenti/cacheListino";
import type { FamilyWithAxes } from "@/types/articleFamily";

const CHIAVE_MODELLI = ["listino-modelli-area"] as const;
const CHIAVE_DISPONIBILI = ["listino-modelli-disponibili"] as const;

const COLONNE_MODELLO =
  "id, nome, descrizione, area, immagine_url, pubblicato, con_prezzi_vendita, origine_company_id, origine_nome, riepilogo, fotografato_il, updated_at";

export interface InstallazioneModello {
  modello_id: string;
  company_id: string;
  azienda: string;
  installato_il: string;
}

export interface ModelloConInstallazioni extends ModelloArea {
  installazioni: InstallazioneModello[];
}

/** Tutti i modelli, con dove sono stati installati (super admin). */
export function useModelliArea() {
  return useQuery({
    queryKey: CHIAVE_MODELLI,
    queryFn: async (): Promise<ModelloConInstallazioni[]> => {
      const [modelli, installazioni] = await Promise.all([
        supabase
          .from("listino_modelli_area" as never)
          .select(COLONNE_MODELLO)
          .order("area", { ascending: true })
          .order("nome", { ascending: true }),
        supabase
          .from("listino_modelli_installazioni" as never)
          .select("modello_id, company_id, installato_il, companies(name)")
          .order("installato_il", { ascending: false }),
      ]);
      if (modelli.error) throw modelli.error;
      if (installazioni.error) throw installazioni.error;
      type RigaInstallazione = {
        modello_id: string;
        company_id: string;
        installato_il: string;
        companies: { name: string | null } | null;
      };
      const perModello = new Map<string, InstallazioneModello[]>();
      for (const r of (installazioni.data ?? []) as unknown as RigaInstallazione[]) {
        const lista = perModello.get(r.modello_id) ?? [];
        // Una riga per azienda: l'ultima installazione.
        if (!lista.some((i) => i.company_id === r.company_id)) {
          lista.push({
            modello_id: r.modello_id,
            company_id: r.company_id,
            azienda: r.companies?.name ?? "Azienda",
            installato_il: r.installato_il,
          });
        }
        perModello.set(r.modello_id, lista);
      }
      return ((modelli.data ?? []) as unknown as ModelloArea[]).map((m) => ({
        ...m,
        installazioni: perModello.get(m.id) ?? [],
      }));
    },
    staleTime: 30_000,
  });
}

/** I modelli pubblicati, per l'azienda che sta guardando il suo listino. */
export function useModelliDisponibili(enabled: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: [...CHIAVE_DISPONIBILI, companyId],
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<ModelloDisponibile[]> => {
      const { data, error } = await supabase.rpc("listino_modelli_disponibili" as never);
      if (error) throw error;
      return (data ?? []) as unknown as ModelloDisponibile[];
    },
    staleTime: 60_000,
  });
}

/** Cosa c'è dentro un modello: tipologie e prodotti, per l'anteprima (super admin). */
export interface ContenutoModello {
  tipologie: Array<{
    chiave: string;
    nome: string;
    fv_categoria: string | null;
    prodotti: Array<{
      chiave: string;
      nome: string;
      immagine_url: string | null;
      pdf_scheda_url: string | null;
      prezzo_base_vendita: number | null;
      assi: Array<{ nome: string; valori: unknown[] }>;
      documenti: unknown[];
    }>;
  }>;
}

export function useContenutoModello(id: string | null) {
  return useQuery({
    queryKey: [...CHIAVE_MODELLI, "contenuto", id],
    enabled: !!id,
    queryFn: async (): Promise<ContenutoModello> => {
      const { data, error } = await supabase
        .from("listino_modelli_area" as never)
        .select("contenuto")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return ((data as unknown as { contenuto: ContenutoModello | null })?.contenuto ?? { tipologie: [] });
    },
    staleTime: 5 * 60_000,
  });
}

/** Le aziende, per scegliere da dove fare un modello e dove installarlo (super admin). */
export function useAziendeLibreria() {
  return useQuery({
    queryKey: ["listino-modelli-aziende"],
    queryFn: async (): Promise<Array<{ id: string; name: string; status: string | null }>> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, status")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; status: string | null }>;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Il listino di un'azienda diviso per aree, come lo vede l'azienda
 * (costruisciListino): da qui si sceglie cosa mettere nel modello.
 * I prodotti si leggono a pagine: PostgREST ne dà al massimo mille per volta.
 */
export function useListinoPerModello(companyId: string | null) {
  return useQuery({
    queryKey: ["listino-modelli-origine", companyId],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const [macro, categorie] = await Promise.all([
        supabase
          .from("listino_macrocategorie")
          .select("id, nome, sort_order, verticali_abilitati, tipologia, categoria_tipo, fv_categoria, immagine_url, attivo")
          .eq("company_id", companyId!)
          .abortSignal(signal),
        supabase
          .from("listino_categorie")
          .select("id, nome, macrocategoria_id, sort_order")
          .eq("company_id", companyId!)
          .abortSignal(signal),
      ]);
      if (macro.error) throw macro.error;
      if (categorie.error) throw categorie.error;
      const famiglie = await loadCatalogPages<FamilyWithAxes>(async (from, to) => {
        const { data, error } = await supabase
          .from("article_families" as never)
          .select("*")
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(signal);
        const righe = ((data ?? []) as unknown as FamilyWithAxes[]).map((f) => ({ ...f, axes: [] as FamilyWithAxes["axes"] }));
        return { data: righe, error };
      });
      const fotoPerTipologia = new Map<string, number>();
      for (const f of famiglie) {
        if (f.macrocategoria_id && f.immagine_url) {
          fotoPerTipologia.set(f.macrocategoria_id, (fotoPerTipologia.get(f.macrocategoria_id) ?? 0) + 1);
        }
      }
      return {
        aree: costruisciListino(
          famiglie,
          (macro.data ?? []) as MacroListino[],
          (categorie.data ?? []) as CategoriaListino[],
        ),
        fotoPerTipologia,
      };
    },
    staleTime: 60_000,
  });
}

export interface NuovoModello {
  companyId: string;
  tipologie: string[];
  area: string;
  nome: string;
  descrizione?: string | null;
  conPrezzi: boolean;
  pubblicato: boolean;
}

export function useModelliAreaMutations() {
  const qc = useQueryClient();
  const aziendaAttiva = useEffectiveCompanyId();

  const aggiornaElenco = () => {
    void qc.invalidateQueries({ queryKey: CHIAVE_MODELLI });
    void qc.invalidateQueries({ queryKey: CHIAVE_DISPONIBILI });
  };

  const crea = useMutation({
    mutationFn: async (m: NuovoModello): Promise<string> => {
      const { data, error } = await supabase.rpc("listino_modello_crea" as never, {
        p_company_id: m.companyId,
        p_tipologie: m.tipologie,
        p_area: m.area,
        p_nome: m.nome,
        p_descrizione: m.descrizione ?? null,
        p_con_prezzi: m.conPrezzi,
        p_pubblicato: m.pubblicato,
      } as never);
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: aggiornaElenco,
  });

  const rifaiFotografia = useMutation({
    mutationFn: async (id: string): Promise<RiepilogoModello> => {
      const { data, error } = await supabase.rpc("listino_modello_aggiorna" as never, { p_modello_id: id } as never);
      if (error) throw error;
      return (data ?? {}) as unknown as RiepilogoModello;
    },
    onSuccess: aggiornaElenco,
  });

  const modifica = useMutation({
    mutationFn: async (m: { id: string; patch: Partial<Pick<ModelloArea, "nome" | "descrizione" | "pubblicato" | "area">> }) => {
      const { error } = await supabase
        .from("listino_modelli_area" as never)
        .update(m.patch as never)
        .eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: aggiornaElenco,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listino_modelli_area" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiornaElenco,
  });

  const installa = useMutation({
    mutationFn: async (m: { modelloId: string; companyId: string }): Promise<EsitoInstallazione> => {
      const { data, error } = await supabase.rpc("listino_modello_installa" as never, {
        p_modello_id: m.modelloId,
        p_company_id: m.companyId,
      } as never);
      if (error) throw error;
      return data as unknown as EsitoInstallazione;
    },
    onSuccess: (_esito, m) => {
      aggiornaElenco();
      // Il listino dell'azienda che si sta guardando, se è quella in cui si è installato.
      if (m.companyId === aziendaAttiva) {
        void qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
        void qc.invalidateQueries({ queryKey: ["listino-macrocategorie", m.companyId] });
        void qc.invalidateQueries({ queryKey: ["listino-categorie", m.companyId] });
        void qc.invalidateQueries({ queryKey: ["listino-schede-linea", m.companyId] });
        invalidaListinoNelPreventivatore(qc);
      }
    },
  });

  return { crea, rifaiFotografia, modifica, elimina, installa };
}
