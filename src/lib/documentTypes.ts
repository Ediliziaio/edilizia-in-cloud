export const EMPLOYEE_DOCUMENT_TYPES = [
  { value: "contratto", label: "Contratto di Lavoro" },
  { value: "documento_identita", label: "Documento di Identità" },
  { value: "patente", label: "Patente di Guida" },
  { value: "certificazione", label: "Certificazione" },
  { value: "attestato", label: "Attestato Formazione" },
  { value: "altro", label: "Altro" },
] as const;

export const EXTERNAL_TEAM_DOCUMENT_TYPES = [
  { value: "visura_camerale", label: "Visura Camerale" },
  { value: "durc", label: "DURC" },
  { value: "polizza", label: "Polizza Assicurativa" },
  { value: "contratto", label: "Contratto" },
  { value: "fattura", label: "Fattura" },
  { value: "altro", label: "Altro" },
] as const;

export type EmployeeDocumentType = typeof EMPLOYEE_DOCUMENT_TYPES[number]["value"];
export type ExternalTeamDocumentType = typeof EXTERNAL_TEAM_DOCUMENT_TYPES[number]["value"];

export const getDocumentTypeLabel = (
  value: string,
  types: readonly { value: string; label: string }[]
): string => {
  return types.find((t) => t.value === value)?.label || value;
};
