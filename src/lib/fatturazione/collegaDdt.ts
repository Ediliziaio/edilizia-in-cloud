import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { esigiRigaSalvata } from "./salvataggioFattura";

export interface DdtCollegabile {
  id: string;
  numero_ddt: string | null;
  data_ricezione: string;
  supplier_id: string | null;
  suppliers: { name: string } | null;
  destinazione: string | null;
}

export async function salvaCollegamentoDdt({
  companyId,
  fatturaId,
  ddtId,
  numero,
  data,
}: {
  companyId: string;
  fatturaId: string;
  ddtId?: string;
  numero: string;
  data: string | null;
}) {
  // Leggere la riga dopo la scrittura è essenziale: una modifica filtrata da RLS non è un successo.
  let campi = {
    numero_ddt: numero.trim(),
    data_ddt: data,
    ddt_ricezione_id: ddtId ?? null,
  };
  if (ddtId) {
    const d = esigiRigaSalvata(
      await db
        .from("ddt_ricezione")
        .select("id,numero_ddt,data_ricezione,supplier_id")
        .eq("company_id", companyId)
        .eq("id", ddtId)
        .maybeSingle(),
    ) as DdtCollegabile;
    const f = esigiRigaSalvata(
      await db
        .from("fatture_ricevute")
        .select("id,fornitore_id")
        .eq("company_id", companyId)
        .eq("id", fatturaId)
        .maybeSingle(),
    ) as { fornitore_id: string | null };
    if (f.fornitore_id && d.supplier_id && f.fornitore_id !== d.supplier_id)
      throw new Error(
        "Il DDT è di un altro fornitore. Controlla le anagrafiche prima di collegarlo.",
      );
    campi = {
      numero_ddt: d.numero_ddt?.trim() || `DDT ${d.id.slice(0, 8)}`,
      data_ddt: d.data_ricezione?.slice(0, 10) || null,
      ddt_ricezione_id: d.id,
    };
  }
  if (!campi.numero_ddt) throw new Error("Inserisci il numero DDT");
  // Un riferimento XML già presente viene completato con il documento reale, senza duplicarlo.
  const { data: esistenti, error } = await db
    .from("fattura_ddt")
    .select("id,numero_ddt,data_ddt,ddt_ricezione_id")
    .eq("company_id", companyId)
    .eq("fattura_ricevuta_id", fatturaId);
  if (error) throw error;
  const stessi = (esistenti ?? []) as Array<{
    id: string;
    numero_ddt: string;
    data_ddt: string | null;
    ddt_ricezione_id: string | null;
  }>;
  if (ddtId && stessi.some((d) => d.ddt_ricezione_id === ddtId))
    throw new Error("Questo DDT è già collegato alla fattura.");
  const riferimento = stessi.find(
    (d) =>
      d.numero_ddt === campi.numero_ddt &&
      (d.data_ddt ?? null) === campi.data_ddt,
  );
  if (riferimento?.ddt_ricezione_id)
    throw new Error(
      "Esiste già un documento con questo riferimento. Controlla il DDT collegato.",
    );
  if (riferimento)
    return esigiRigaSalvata(
      await db
        .from("fattura_ddt")
        .update(campi)
        .eq("id", riferimento.id)
        .eq("company_id", companyId)
        .eq("fattura_ricevuta_id", fatturaId)
        .is("ddt_ricezione_id", null)
        .select("id")
        .maybeSingle(),
    );
  return esigiRigaSalvata(
    await db
      .from("fattura_ddt")
      .insert({
        ...campi,
        company_id: companyId,
        fattura_ricevuta_id: fatturaId,
        origine: "manuale",
      })
      .select("id")
      .single(),
  );
}
