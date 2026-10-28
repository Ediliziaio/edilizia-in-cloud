import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { chiaviFascicolo } from "@/hooks/useFascicoloCantiere";
import type { DocumentoSubappaltatore } from "@/types/subappaltatori";
import {
  controllaArchivio,
  type DestinazioneArchivio,
  fileArchivio,
  marcatoreArchivio,
  notaArchivio,
  stessaFonteArchivio,
  tipoArchivioFascicolo,
} from "@/lib/sicurezza/importaArchivio";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";

export function useImportaArchivioFascicolo() {
  const permessi = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { fonte, destinazione }: {
        fonte: DocumentoSubappaltatore;
        destinazione: DestinazioneArchivio;
      },
    ) => {
      if (!permessi.canViewSicurezzaCantiere || permessi.solaLettura) {
        throw Error("Non hai il permesso di importare documenti.");
      }
      controllaArchivio(fonte, destinazione);
      const rileggi = async () => {
        const r = await supabase.from("documenti_subappaltatore" as never)
          .select("*").eq("id", fonte.id).eq(
            "company_id",
            destinazione.companyId,
          ).eq("subappaltatore_id", destinazione.subId).single();
        const d = r.data as unknown as DocumentoSubappaltatore | null;
        if (r.error || !d) {
          throw Error("Originale non più disponibile: ricarica l’archivio.");
        }
        if (!stessaFonteArchivio(fonte, d)) {
          throw Error("L’originale è cambiato: ricarica prima di importare.");
        }
        return d;
      };
      const leggiDest = async () => {
        const r = await supabase.from("sicurezza_fascicolo" as never).select(
          "*",
        ).eq("id", fonte.id).eq("company_id", destinazione.companyId).eq(
          "subappaltatore_id",
          destinazione.subId,
        ).maybeSingle();
        if (r.error) throw r.error;
        return r.data as unknown as EvidenzaFascicolo | null;
      };
      await rileggi();
      let esistente = await leggiDest();
      const appartiene = (r: EvidenzaFascicolo) =>
        r.note?.startsWith(marcatoreArchivio(fonte.id));
      if (esistente) {
        if (!appartiene(esistente)) {
          throw Error("Identificativo già usato: importazione interrotta.");
        }
        if (esistente.file_path) return { id: esistente.id, giaPresente: true };
      }
      const download = await supabase.storage.from("subappaltatori-documenti")
        .download(fonte.url);
      if (download.error || !download.data) {
        throw Error("Impossibile leggere l’originale privato.");
      }
      const file = await fileArchivio(
        download.data,
        fonte.nome_file || "documento",
      );
      await rileggi();
      const nota = notaArchivio(fonte, file.sha256);
      const tipo = tipoArchivioFascicolo(fonte.tipo);
      if (!esistente) {
        const r = await supabase.from("sicurezza_fascicolo" as never).insert({
          id: fonte.id,
          company_id: destinazione.companyId,
          subappaltatore_id: destinazione.subId,
          order_id: destinazione.orderId,
          operaio_id: null,
          tipo,
          titolo: destinazione.titolo.trim(),
          origine_requisito: "da_verificare",
          stato: "da_richiedere",
          data_rilascio: fonte.data_rilascio,
          data_scadenza: fonte.data_scadenza,
          note: nota,
        } as never).select("id").single();
        if (r.error && r.error.code !== "23505") throw r.error;
        esistente = await leggiDest();
      }
      if (!esistente || !appartiene(esistente)) {
        throw Error("Importazione non acquisita: rileggi il fascicolo.");
      }
      if (esistente.file_path) return { id: esistente.id, giaPresente: true };
      if (
        esistente.stato !== "da_richiedere" ||
        esistente.order_id !== destinazione.orderId ||
        esistente.tipo !== tipo ||
        esistente.titolo !== destinazione.titolo.trim() ||
        esistente.note !== nota
      ) {
        throw Error(
          "La copia incompleta è stata modificata: riprendila dal fascicolo senza sovrascriverla.",
        );
      }
      const nome = file.nome.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
      const path = `${destinazione.companyId}/${fonte.id}/archivio-${nome}`;
      const up = await supabase.storage.from("fascicoli-cantiere").upload(
        path,
        file.blob,
        { upsert: false, contentType: file.blob.type },
      );
      if (up.error) {
        if (
          String(up.error.statusCode) !== "409" &&
          !/already exists|duplicate/i.test(up.error.message)
        ) throw up.error;
        const precedente = await supabase.storage.from("fascicoli-cantiere")
          .download(path);
        if (
          precedente.error || !precedente.data ||
          (await fileArchivio(precedente.data, file.nome)).sha256 !==
            file.sha256
        ) {
          throw Error(
            "File già presente diverso dall’originale: nessuna sostituzione eseguita.",
          );
        }
      }
      let finale = supabase.from("sicurezza_fascicolo" as never).update(
        { file_path: path, file_name: file.nome, stato: "ricevuto" } as never,
      ).eq("id", fonte.id).eq("company_id", destinazione.companyId).eq(
        "subappaltatore_id",
        destinazione.subId,
      ).eq("stato", "da_richiedere").is("file_path", null).eq("note", nota).eq(
        "tipo",
        tipo,
      ).eq("titolo", destinazione.titolo.trim());
      finale = destinazione.orderId
        ? finale.eq("order_id", destinazione.orderId)
        : finale.is("order_id", null);
      const r = await finale.select("id").maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) {
        const attuale = await leggiDest();
        if (
          !attuale || attuale.file_path !== path || !appartiene(attuale) ||
          attuale.order_id !== destinazione.orderId || attuale.tipo !== tipo ||
          attuale.titolo !== destinazione.titolo.trim() || attuale.note !== nota
        ) {
          throw Error(
            "Il fascicolo è cambiato: verifica la copia prima di riprovare.",
          );
        }
      }
      return { id: fonte.id, giaPresente: false };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chiaviFascicolo }),
  });
}
