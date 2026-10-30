// src/hooks/useGeneraleVendita.ts
// Il materiale di vendita di un'unità: i file dell'archivio della sua commessa che la checklist
// riconosce come planimetria, capitolato, foto o render (src/lib/orders/generali/vendita.ts),
// le loro anteprime e le immagini pronte per la scheda vendita in PDF.
// Si carica con il caricamento della checklist (useCaricaDocumentoVoce): stesso archivio, stessa
// cartella, stesso segno sulla voce. La chiave di lettura sta sotto quella della checklist
// della generale, così un caricamento da qui o dalla scheda Documenti si rilegge da solo.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachmentStorage } from "@/components/orders/filePreviewUtils";
import { chiaviDocumentiGenerale, useVociDocumentiAzienda } from "@/hooks/useGeneraleDocumenti";
import { fotoPerPdf } from "@/hooks/useGeneraleRendiconto";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { oggiLocale, vociDelModello, type AllegatoCommessa, type SegnoDocumento } from "@/lib/orders/generali/documenti";
import { fileVenditaUnita, tipoAnteprima, type FileVendita } from "@/lib/orders/generali/vendita";

// La tabella dei segni e la colonna thumb_path non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Un file dell'archivio con la sua miniatura, se il caricamento l'ha fatta. */
export interface AllegatoVendita extends AllegatoCommessa { thumb_path: string | null }

export const chiaviVendita = {
  file: (generaleId: string, orderId: string) => [...chiaviDocumentiGenerale.checklist(generaleId), "vendita", orderId] as const,
  anteprima: (allegatoId: string) => ["generale-vendita-anteprima", allegatoId] as const,
};

/** Planimetria, capitolato e foto di un'unità, con le voci (e i nomi) dell'azienda. */
export function useFileVenditaUnita(p: { generaleId: string; modello: ModelloGenerale; orderId: string | null }) {
  const azienda = useVociDocumentiAzienda();
  const query = useQuery({
    queryKey: chiaviVendita.file(p.generaleId, p.orderId ?? "-"),
    enabled: !!p.orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<{ allegati: AllegatoVendita[]; segni: SegnoDocumento[] }> => {
      const [a, s] = await Promise.all([
        db
          .from("order_attachments")
          .select("id, order_id, file_name, file_url, file_type, created_at, thumb_path")
          .eq("order_id", p.orderId)
          .order("created_at", { ascending: false })
          .limit(500),
        db
          .from("commesse_generali_documenti")
          .select("id, order_id, voce, tipo, attachment_id, scadenza")
          .eq("order_id", p.orderId)
          .limit(1000),
      ]);
      if (a.error) throw a.error;
      // Senza la tabella dei segni (o senza permesso) restano i file riconosciuti dal nome.
      return {
        allegati: (Array.isArray(a.data) ? a.data : []) as AllegatoVendita[],
        segni: !s.error && Array.isArray(s.data) ? (s.data as SegnoDocumento[]) : [],
      };
    },
  });
  const voci = useMemo(() => vociDelModello(p.modello, azienda.righe), [p.modello, azienda.righe]);
  const dati = query.data && Array.isArray(query.data.allegati) ? query.data : null;
  const file = useMemo((): Record<keyof FileVendita, AllegatoVendita[]> | null => {
    if (!dati || !p.orderId) return null;
    const f = fileVenditaUnita({ voci, orderId: p.orderId, allegati: dati.allegati, segni: dati.segni, oggi: oggiLocale() });
    return f as Record<keyof FileVendita, AllegatoVendita[]>;
  }, [dati, voci, p.orderId]);
  return { file, voci, isLoading: query.isLoading, isError: query.isError, refetch: (): void => { void query.refetch(); } };
}

/** Un link temporaneo al file (o alla sua miniatura) nell'archivio. */
async function linkFirmato(fileUrl: string, secondi = 3600): Promise<string | null> {
  const t = attachmentStorage(fileUrl);
  const { data, error } = await supabase.storage.from(t.bucket).createSignedUrl(t.path, secondi);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/** La prima pagina di un PDF come JPEG (data URL), larga al massimo `lato` pixel. */
async function primaPaginaPdf(url: string, lato: number): Promise<string | null> {
  const risposta = await fetch(url);
  if (!risposta.ok) return null;
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  const doc = await lib.getDocument({ data: new Uint8Array(await risposta.arrayBuffer()) }).promise;
  try {
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: lato / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    void doc.loadingTask.destroy();
  }
}

/**
 * Cosa mostrare nell'anteprima: l'immagine stessa, la miniatura salvata accanto al PDF o, se
 * non c'è, la sua prima pagina disegnata qui. null = niente anteprima (si apre il file).
 */
export function useAnteprimaAllegato(a: AllegatoVendita | null) {
  return useQuery({
    queryKey: chiaviVendita.anteprima(a?.id ?? "-"),
    enabled: !!a && tipoAnteprima(a) !== null,
    // I link durano un'ora: non rifirmare a ogni apertura.
    staleTime: 45 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const tipo = tipoAnteprima(a!);
      if (tipo === "immagine") return linkFirmato(a!.file_url);
      if (a!.thumb_path) {
        const miniatura = await linkFirmato(a!.thumb_path);
        if (miniatura) return miniatura;
      }
      const url = await linkFirmato(a!.file_url, 300);
      if (!url) return null;
      try {
        return await primaPaginaPdf(url, 640);
      } catch {
        return null;
      }
    },
  });
}

/** Un file pronto per la scheda in PDF: JPEG ridotto; un PDF diventa la sua prima pagina. null se non si riesce. */
export async function immaginePerScheda(a: AllegatoVendita, lato = 1400): Promise<string | null> {
  const tipo = tipoAnteprima(a);
  if (!tipo) return null;
  const url = await linkFirmato(a.file_url, 300);
  if (!url) return null;
  if (tipo === "immagine") return fotoPerPdf(url, lato);
  try {
    return await primaPaginaPdf(url, lato);
  } catch {
    return null;
  }
}

