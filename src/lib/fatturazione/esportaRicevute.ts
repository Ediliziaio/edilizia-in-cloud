// Esportare le fatture ricevute (01/10/2026): l'elenco in Excel e gli XML
// originali in uno zip — quello che il commercialista chiede a fine mese.
// Prima la pagina aveva solo «Importa»: per riavere i file bisognava aprirli
// una fattura alla volta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { exportToXLSX } from "@/lib/csvExport";

export interface RigaRicevuta {
  id: string;
  data_fattura: string;
  numero_fattura: string;
  cedente_ragione_sociale: string;
  cedente_piva: string | null;
  tipo_documento: string;
  imponibile_totale: number | null;
  iva_totale: number | null;
  totale_documento: number | null;
  stato: string;
}

const TIPI: Record<string, string> = {
  TD01: "Fattura", TD02: "Acconto su fattura", TD03: "Acconto su parcella", TD04: "Nota di credito", TD05: "Nota di debito",
  TD06: "Parcella", TD16: "Integrazione reverse charge", TD17: "Integrazione servizi estero", TD18: "Integrazione beni UE",
  TD19: "Integrazione beni extra-UE", TD20: "Autofattura", TD24: "Fattura differita", TD25: "Fattura differita (triangolare)",
};

const STATI: Record<string, string> = { non_letta: "Non letta", letta: "Letta", contabilizzata: "Contabilizzata", rifiutata: "Rifiutata" };

const eur = (n: number | null | undefined): string => (n == null ? "" : n.toFixed(2).replace(".", ","));
const dataIt = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Nome file sicuro e leggibile: data_fornitore_numero.xml */
export function nomeFileRicevuta(r: Pick<RigaRicevuta, "data_fattura" | "cedente_piva" | "numero_fattura">): string {
  const pulisci = (v: string) => v.replace(/[^a-zA-Z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${r.data_fattura}_${pulisci(r.cedente_piva || "senza-piva")}_${pulisci(r.numero_fattura) || "senza-numero"}.xml`;
}

/** L'elenco delle fatture ricevute in Excel (una riga per fattura). */
export async function esportaElencoRicevute(righe: RigaRicevuta[], etichetta: string): Promise<void> {
  const colonne = [
    { key: "data", label: "Data fattura" }, { key: "numero", label: "Numero" }, { key: "fornitore", label: "Fornitore" },
    { key: "piva", label: "P.IVA fornitore" }, { key: "tipo", label: "Tipo documento" }, { key: "imponibile", label: "Imponibile" },
    { key: "iva", label: "IVA" }, { key: "totale", label: "Totale" }, { key: "stato", label: "Stato" },
  ];
  const dati = righe.map((r) => ({
    data: dataIt(r.data_fattura), numero: r.numero_fattura, fornitore: r.cedente_ragione_sociale, piva: r.cedente_piva ?? "",
    tipo: `${r.tipo_documento} ${TIPI[r.tipo_documento] ?? ""}`.trim(), imponibile: eur(r.imponibile_totale), iva: eur(r.iva_totale),
    totale: eur(r.totale_documento), stato: STATI[r.stato] ?? r.stato,
  }));
  await exportToXLSX(dati, colonne, `fatture_ricevute_${etichetta}.xlsx`, "Fatture ricevute");
}

export interface EsitoZip {
  inclusi: number;
  senzaXml: number;
}

/**
 * Gli XML originali delle fatture date, in uno zip. L'XML non sta nella lista
 * (è pesante): si legge a gruppi di quindici. Quelle senza XML (arrivate dal
 * gestionale, o registrate coi soli dati) non si perdono in silenzio: finiscono
 * in LEGGIMI.txt dentro lo zip.
 */
export async function esportaXmlRicevuteZip(
  supabase: SupabaseClient,
  companyId: string,
  righe: RigaRicevuta[],
  etichetta: string,
  avanzamento?: (fatte: number, totale: number) => void,
): Promise<EsitoZip> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const senza: RigaRicevuta[] = [];
  const usati = new Set<string>();
  let inclusi = 0;

  for (let i = 0; i < righe.length; i += 15) {
    const gruppo = righe.slice(i, i + 15);
    const { data, error } = await supabase
      .from("fatture_ricevute")
      .select("id, xml_raw")
      .eq("company_id", companyId)
      .in("id", gruppo.map((r) => r.id));
    if (error) throw error;
    const perId = new Map((data ?? []).map((d: { id: string; xml_raw: string | null }) => [d.id, d.xml_raw]));
    for (const r of gruppo) {
      const xml = perId.get(r.id);
      if (!xml) { senza.push(r); continue; }
      let nome = nomeFileRicevuta(r);
      // Due fatture con lo stesso nome (numero ripetuto): si distinguono, mai si sovrascrivono.
      for (let n = 2; usati.has(nome); n++) nome = nomeFileRicevuta(r).replace(/\.xml$/, `_${n}.xml`);
      usati.add(nome);
      zip.file(nome, xml);
      inclusi++;
    }
    avanzamento?.(Math.min(i + 15, righe.length), righe.length);
  }

  if (senza.length > 0) {
    zip.file(
      "LEGGIMI.txt",
      `Fatture senza file XML (${senza.length}): hanno i dati ma non il file originale.\r\n` +
        `Importa di nuovo lo zip del portale da Fatture ricevute > Importa XML per aggiungerlo.\r\n\r\n` +
        senza.map((r) => `${dataIt(r.data_fattura)}  n. ${r.numero_fattura}  ${r.cedente_ragione_sociale}`).join("\r\n"),
    );
  }
  if (inclusi === 0 && senza.length === 0) return { inclusi: 0, senzaXml: 0 };

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fatture_ricevute_xml_${etichetta}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { inclusi, senzaXml: senza.length };
}
