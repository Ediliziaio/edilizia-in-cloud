/**
 * Le schede delle linee del listino (tabella listino_schede_linea): lettura e
 * salvataggio, con la foto del profilo e la scheda del produttore.
 *
 * Le schede sono poche, una per linea: si caricano tutte insieme e si cercano
 * in memoria con trovaSchedaLinea, dal listino e dal preventivatore.
 *
 * File: la foto va in `article-images`, il PDF in `article-pdfs`, entrambi in
 * `<company_id>/linee/<id scheda>.<ext>` (le regole dei due bucket vogliono
 * l'azienda come prima cartella).
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import { indiceSchede, type SchedaLinea, type ValoriScheda } from "@/lib/listino/schedeLinea";

const BUCKET_FOTO = "article-images";
const BUCKET_PDF = "article-pdfs";
const FOTO_AMMESSE = ["image/png", "image/jpeg", "image/webp"];
const FOTO_MAX_MB = 3;
const PDF_MAX_MB = 15;

export const COLONNE_SCHEDA_LINEA =
  "id, company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm, camere, guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome";

const NESSUNA_SCHEDA: SchedaLinea[] = [];

function numero(valore: unknown): number | null {
  if (valore === null || valore === undefined || valore === "") return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
}

function testo(valore: unknown): string | null {
  return typeof valore === "string" && valore !== "" ? valore : null;
}

/** Una riga del database come scheda: i numeric possono arrivare come stringhe. */
export function comeSchedaLinea(riga: Record<string, unknown>): SchedaLinea {
  return {
    id: String(riga.id),
    company_id: String(riga.company_id),
    macrocategoria_id: testo(riga.macrocategoria_id),
    chiave: String(riga.chiave ?? ""),
    nome: String(riga.nome ?? ""),
    descrizione: testo(riga.descrizione),
    immagine_url: testo(riga.immagine_url),
    profondita_mm: numero(riga.profondita_mm),
    camere: numero(riga.camere),
    guarnizioni: numero(riga.guarnizioni),
    uw: numero(riga.uw),
    scheda_tecnica_url: testo(riga.scheda_tecnica_url),
    scheda_tecnica_nome: testo(riga.scheda_tecnica_nome),
  };
}

const chiaveQuery = (companyId: string | null | undefined) => ["listino-schede-linea", companyId ?? null] as const;

export function useSchedeLinea() {
  const companyId = useEffectiveCompanyId();
  const query = useQuery({
    queryKey: chiaveQuery(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<SchedaLinea[]> => {
      // (supabase as any): tabella non ancora nei tipi generati
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("listino_schede_linea")
        .select(COLONNE_SCHEDA_LINEA)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map(comeSchedaLinea);
    },
  });
  const schede = query.data ?? NESSUNA_SCHEDA;
  const indice = useMemo(() => indiceSchede(schede), [schede]);
  return { schede, indice, isLoading: query.isLoading, isError: query.isError };
}

/** Il motivo per cui un file non va bene, o null. */
export function controllaFileScheda(tipo: "foto" | "pdf", file: File): string | null {
  if (tipo === "foto") {
    if (!FOTO_AMMESSE.includes(file.type)) return "La foto deve essere PNG, JPG o WEBP.";
    if (file.size > FOTO_MAX_MB * 1024 * 1024) return `La foto supera i ${FOTO_MAX_MB} MB.`;
    return null;
  }
  if (file.type !== "application/pdf") return "La scheda del produttore deve essere un PDF.";
  if (file.size > PDF_MAX_MB * 1024 * 1024) return `Il PDF supera i ${PDF_MAX_MB} MB.`;
  return null;
}

export interface SalvaSchedaLinea extends ValoriScheda {
  /** La scheda che c'è già; null se la linea non ne ha ancora una. */
  esistente: SchedaLinea | null;
  macrocategoriaId: string | null;
  nomeLinea: string;
  /** Foto nuova; null lascia quella che c'è. */
  foto: File | null;
  togliFoto: boolean;
  /** Scheda del produttore nuova; null lascia quella che c'è. */
  pdf: File | null;
  togliPdf: boolean;
}

/** Toglie i file della scheda rimasti con un'altra estensione (una foto png dopo una jpg). */
async function togliFileScheda(bucket: string, cartella: string, id: string, tranne?: string): Promise<void> {
  const { data } = await supabase.storage.from(bucket).list(cartella, { search: id });
  const vecchi = (data ?? [])
    .filter((f) => f.name.startsWith(`${id}.`) && f.name !== tranne)
    .map((f) => `${cartella}/${f.name}`);
  if (vecchi.length > 0) await supabase.storage.from(bucket).remove(vecchi);
}

export function useSalvaSchedaLinea() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (v: SalvaSchedaLinea): Promise<SchedaLinea> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const chiave = chiaveTesto(v.nomeLinea);
      if (!chiave) throw new Error("La linea non ha un nome");
      for (const [tipo, file] of [["foto", v.foto], ["pdf", v.pdf]] as const) {
        const errore = file ? controllaFileScheda(tipo, file) : null;
        if (errore) throw new Error(errore);
      }

      const id = v.esistente?.id ?? crypto.randomUUID();
      const cartella = `${companyId}/linee`;
      const caricati: Array<[bucket: string, percorso: string]> = [];

      try {
        let immagine_url = v.togliFoto ? null : (v.esistente?.immagine_url ?? null);
        if (v.foto) {
          const estensione = v.foto.type === "image/png" ? "png" : v.foto.type === "image/webp" ? "webp" : "jpg";
          const percorso = `${cartella}/${id}.${estensione}`;
          const { error } = await supabase.storage
            .from(BUCKET_FOTO)
            .upload(percorso, v.foto, { upsert: true, cacheControl: "3600", contentType: v.foto.type });
          if (error) throw new Error(`Foto non caricata: ${error.message}`);
          caricati.push([BUCKET_FOTO, percorso]);
          // Il ?t= fa vedere subito la foto nuova a chi aveva in cache quella vecchia.
          immagine_url = `${supabase.storage.from(BUCKET_FOTO).getPublicUrl(percorso).data.publicUrl}?t=${Date.now()}`;
        }

        let scheda_tecnica_url = v.togliPdf ? null : (v.esistente?.scheda_tecnica_url ?? null);
        let scheda_tecnica_nome = v.togliPdf ? null : (v.esistente?.scheda_tecnica_nome ?? null);
        if (v.pdf) {
          const percorso = `${cartella}/${id}.pdf`;
          const { error } = await supabase.storage
            .from(BUCKET_PDF)
            .upload(percorso, v.pdf, { upsert: true, cacheControl: "3600", contentType: "application/pdf" });
          if (error) throw new Error(`Scheda del produttore non caricata: ${error.message}`);
          caricati.push([BUCKET_PDF, percorso]);
          scheda_tecnica_url = `${supabase.storage.from(BUCKET_PDF).getPublicUrl(percorso).data.publicUrl}?t=${Date.now()}`;
          scheda_tecnica_nome = v.pdf.name.replace(/\.pdf$/i, "").trim() || "Scheda tecnica";
        }

        const campi = {
          macrocategoria_id: v.macrocategoriaId,
          chiave,
          nome: v.nomeLinea.trim(),
          descrizione: v.descrizione,
          immagine_url,
          profondita_mm: v.profondita_mm,
          camere: v.camere,
          guarnizioni: v.guarnizioni,
          uw: v.uw,
          scheda_tecnica_url,
          scheda_tecnica_nome,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tabella = (supabase as any).from("listino_schede_linea");
        const { data, error } = v.esistente
          ? await tabella.update(campi).eq("id", id).eq("company_id", companyId).select(COLONNE_SCHEDA_LINEA).single()
          : await tabella.insert({ id, company_id: companyId, ...campi }).select(COLONNE_SCHEDA_LINEA).single();
        if (error) {
          if (error.code === "23505") throw new Error("Questa linea ha già una scheda: ricarica la pagina e modificala.");
          throw new Error(error.message);
        }

        // I file tolti escono anche dallo spazio: se non ci riesce, la scheda è salvata lo stesso.
        if (v.togliFoto && !v.foto) await togliFileScheda(BUCKET_FOTO, cartella, id).catch((): undefined => undefined);
        if (v.foto) await togliFileScheda(BUCKET_FOTO, cartella, id, caricati.find(([b]) => b === BUCKET_FOTO)?.[1].split("/").pop()).catch((): undefined => undefined);
        if (v.togliPdf && !v.pdf) await togliFileScheda(BUCKET_PDF, cartella, id).catch((): undefined => undefined);

        return comeSchedaLinea(data as Record<string, unknown>);
      } catch (err) {
        // Scheda non salvata: i file appena caricati non devono restare orfani.
        if (!v.esistente) {
          for (const [bucket, percorso] of caricati) {
            await supabase.storage.from(bucket).remove([percorso]).catch((): undefined => undefined);
          }
        }
        throw err;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaveQuery(companyId) });
    },
  });
}
