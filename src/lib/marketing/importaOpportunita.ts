/**
 * I campi del contatto nell'importazione delle opportunità: chi importa opportunità
 * crea anche il loro contatto, e deve poterne riempire città e campi personalizzati.
 * Valgono solo per i contatti nuovi: un contatto già presente non viene riscritto.
 */
import type { ImportField } from "@/components/shared/CSVImportDialog";

const PREFISSO_CUSTOM = "contact_custom_";

export function campiContattoImport(campiPersonalizzati: ReadonlyArray<{ id: string; name: string }>): ImportField[] {
  return [
    { key: "contact_company_name", label: "Azienda Contatto", required: false },
    { key: "contact_city", label: "Città Contatto", required: false },
    { key: "contact_province", label: "Provincia Contatto", required: false },
    ...campiPersonalizzati.map((f) => ({
      key: `${PREFISSO_CUSTOM}${f.id}`,
      label: `${f.name} (contatto)`,
      required: false,
      type: "text" as const,
    })),
  ];
}

/** Quello che dalla riga va sul contatto nuovo, oltre a nome, email e telefono. */
export function datiContattoDaRiga(riga: Record<string, string>) {
  return {
    company_name: riga.contact_company_name?.trim() || null,
    city: riga.contact_city?.trim() || null,
    province: riga.contact_province?.trim() || null,
    source: riga.source?.trim() || "importazione",
  };
}

/** I valori dei campi personalizzati del contatto presenti nella riga. */
export function valoriCustomContatto(riga: Record<string, string>, contactId: string) {
  return Object.entries(riga).flatMap(([chiave, valore]) => {
    const testo = valore?.trim();
    return chiave.startsWith(PREFISSO_CUSTOM) && testo
      ? [{ contact_id: contactId, field_id: chiave.slice(PREFISSO_CUSTOM.length), value: testo }]
      : [];
  });
}
