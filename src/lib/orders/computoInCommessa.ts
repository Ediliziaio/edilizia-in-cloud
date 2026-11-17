/**
 * Il computo caricato in «Carica contratto» diventa il computo della commessa appena creata (17/11/2026).
 *
 * Prima la stessa cosa andava caricata due volte: una per creare la commessa, una nella scheda Computo per
 * le lavorazioni e i materiali. Ora l'originale, già nei documenti della commessa, si rilegge qui (PDF di
 * PriMus, XPWE o Excel: nel browser, in un secondo, senza AI), si salva come computo della commessa e
 * diventa fasi, sottofasi e voci con gli importi (`commessa_lavorazioni_dal_computo`, fasi per categoria,
 * fuori onorari e IVA). «Genera dal computo» dei materiali lo trova già lì.
 */
import { supabase } from "@/integrations/supabase/client";
import { leggiFileComputo } from "@/lib/computo/leggiFileComputo";
import { daComputoStrutturato } from "@/lib/computo/importaVoci";
import { salvaComputoImportato } from "@/hooks/useComputoCommessa";
import type { StoredContractFile } from "./contractPreparation";

export interface EsitoComputoInCommessa {
  computoId: string;
  voci: number;
  fasi: number;
  lavorazioni: number;
}

export async function computoInCommessa(
  orderId: string, companyId: string, userId: string | undefined, originale: Pick<StoredContractFile, "bucket" | "path" | "name" | "mime">,
): Promise<EsitoComputoInCommessa> {
  const { data: blob, error } = await supabase.storage.from(originale.bucket).download(originale.path);
  if (error || !blob) throw new Error(`Originale non scaricato: ${error?.message ?? "file non trovato"}`);
  const file = new File([blob], originale.name, { type: originale.mime || blob.type });
  const computo = await leggiFileComputo(file);
  const { esito, voci } = daComputoStrutturato(computo, originale.name);
  const formato = computo.formato === "primus_pdf" ? "PDF PriMus" : computo.formato === "xpwe" ? "XPWE" : "Excel";
  const salvato = await salvaComputoImportato(orderId, companyId, userId, {
    voci, file: [{ file, formato, via: "browser" }], totaleDocumento: esito.totaleDocumento ?? computo.totale_dichiarato,
    origine: "carica-contratto",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: errLav } = await (supabase as any).rpc("commessa_lavorazioni_dal_computo", {
    p_order_id: orderId, p_computo_id: salvato.id, p_fasi: {},
  });
  if (errLav) throw new Error(`Computo salvato, lavorazioni non create: ${errLav.message}`);
  const l = (data ?? {}) as { fasi?: number; voci?: number };
  return { computoId: salvato.id, voci: voci.length, fasi: l.fasi ?? 0, lavorazioni: l.voci ?? 0 };
}
