import { supabase } from "@/integrations/supabase/client";
import type { DocumentoFiscale, RigaDocumento } from "@/types/fatturazione";

/**
 * Creates a deferred invoice (Fattura Differita TD24) from multiple DDT documents.
 * All DDTs must belong to the same client.
 */
export async function creaFatturaDaDDT(
  ddtIds: string[]
): Promise<Partial<DocumentoFiscale>> {
  if (ddtIds.length === 0) throw new Error("Seleziona almeno un DDT");

  const { data, error } = await supabase
    .from("documenti_fiscali" as never)
    .select("*")
    .in("id", ddtIds);

  if (error) throw error;
  const ddts = (data as unknown as DocumentoFiscale[]) ?? [];

  if (ddts.length !== ddtIds.length) {
    throw new Error("Alcuni DDT non sono stati trovati");
  }

  // Validate same client
  const anagraficheIds = new Set(ddts.map((d) => d.anagrafica_id).filter(Boolean));
  if (anagraficheIds.size > 1) {
    throw new Error("Tutti i DDT devono appartenere allo stesso cliente");
  }

  // Aggregate righe
  let lineNumber = 0;
  const righe: RigaDocumento[] = ddts.flatMap((ddt) =>
    ddt.righe.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      numero_linea: ++lineNumber,
      note_riga: `${r.note_riga ? r.note_riga + " — " : ""}Rif. DDT N° ${ddt.numero} del ${ddt.data_emissione}`,
    }))
  );

  const riferimenti_ddt = ddts.map((ddt) => ({
    numero: ddt.numero,
    data: ddt.data_emissione,
    id: ddt.id,
  }));

  return {
    tipo: "fattura",
    anagrafica_id: ddts[0].anagrafica_id,
    cliente_snapshot: ddts[0].cliente_snapshot,
    righe,
    riferimenti_ddt,
    note_documento: `Fattura differita art.21 c.4 lett.a) DPR 633/72 — DDT: ${ddts.map((d) => d.numero).join(", ")}`,
  };
}
