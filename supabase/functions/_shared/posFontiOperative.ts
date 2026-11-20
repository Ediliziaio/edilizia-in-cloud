import { percorsoStorageSicuro } from "./posPercorsi.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { dataRiscontriDpiPos, dpiPrevistiPos, riscontriDpiDisponibili, stessoRiscontroDpi, type AddettoConConsegne, type FonteRumorePos } from "./posEvidenzeOperative.ts";
import type { PosContenuto } from "./posModello.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
export type LeggiConsegnePos = (ordine: string, data: string) => Promise<AddettoConConsegne[]>;
export interface OriginaleRapportoPos {
  fonte: FonteRumorePos;
  path: string;
  nome: string;
  bytes: Uint8Array;
}

export async function originaleRapportoRumorePos(db: Db, companyId: string, ordine: string, posId: string,
  contenuto: PosContenuto, chiave: Pick<FonteRumorePos, "origine" | "id">): Promise<OriginaleRapportoPos> {
  let path: string, nome: string, titolo: string, dataArchivio: string | null;
  if (chiave.origine === "archivio") {
    if (!/^[a-f0-9-]{36}$/i.test(chiave.id)) throw new Error("Seleziona un rapporto dall’archivio");
    const { data: record, error } = await db.from("sicurezza_documenti").select("id,order_id,titolo,file_path,file_name,data_documento")
      .eq("company_id", companyId).eq("id", chiave.id).eq("tipo", "valutazione_rumore").is("subappaltatore_id", null).maybeSingle();
    if (error || !record || (record.order_id !== null && record.order_id !== ordine)) {
      throw new Error("Rapporto del rumore non disponibile per questa commessa");
    }
    path = record.file_path;
    const percorsoAtteso = `${companyId}/documenti/${record.order_id ?? "azienda"}/`;
    const storico = typeof path === "string" && path.split("/").length === 2;
    if (typeof path !== "string" || (!storico && (!path.startsWith(percorsoAtteso) || path.split("/").length !== 4))) {
      throw new Error("Percorso del rapporto del rumore estraneo all’archivio");
    }
    nome = record.file_name || record.titolo; titolo = record.titolo; dataArchivio = record.data_documento;
  } else {
    const a = contenuto.allegati.find(r => r.tipo === "valutazione_rumore" && r.file_path === chiave.id);
    if (!a || !a.file_path.startsWith(`${companyId}/pos/${posId}/`) || a.file_path.split("/").length !== 4) {
      throw new Error("Seleziona un rapporto già salvato negli allegati del POS");
    }
    path = a.file_path; nome = a.nome; titolo = a.nome; dataArchivio = null;
  }
  if (!percorsoStorageSicuro(path) || !path.startsWith(`${companyId}/`)) throw new Error("Originale del rapporto non disponibile");
  const { data: file, error } = await db.storage.from("sicurezza-documenti").download(path);
  if (error || !file || file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error("Originale del rapporto assente o superiore a 20 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { fonte: { ...chiave, titolo: titolo.trim().slice(0, 250), data_archivio: dataArchivio, sha256: await sha256Hex(bytes) }, path, nome, bytes };
}
export async function verificaConsegnePos(contenuto: PosContenuto, ordine: string, emessoIl: string, leggi?: LeggiConsegnePos) {
  const lavorazioni = contenuto.lavorazioni.filter(l => l.riscontri_dpi?.length);
  if (!lavorazioni.length) return undefined;
  if (!leggi) throw new Error("Registro DPI non disponibile per l’approvazione");
  // Usa lo stato corrente del registro, anche se la prenotazione ha oltrepassato la mezzanotte.
  const data = dataRiscontriDpiPos(new Date(Math.max(Date.parse(emessoIl) || 0, Date.now())));
  const addetti = await leggi(ordine, data);
  return { data_riscontro: data, lavorazioni: lavorazioni.map(l => {
    const previsti = dpiPrevistiPos(l.dpi);
    for (const r of l.riscontri_dpi!) {
      if (!previsti.includes(r.previsto) || !riscontriDpiDisponibili(addetti, r.previsto, data, l.fase_id).some(x => stessoRiscontroDpi(x, r))) {
        throw new Error(`«${l.titolo || "Lavorazione"}»: il collegamento DPI di ${r.addetto} è cambiato. Aggiorna il riscontro dal registro DPI.`);
      }
    }
    return { lavorazione_id: l.id, consegne: l.riscontri_dpi };
  }) };
}
