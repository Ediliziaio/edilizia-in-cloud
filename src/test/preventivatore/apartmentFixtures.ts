import { advanceApartment, apartmentSimulations, APARTMENT_REQUIREMENTS, type ApartmentCatalogRow, type ApartmentConversation, type ApartmentKey, type ApartmentOverride } from "@/lib/preventivi/devLombardiaApartment";
export const source = { id: "published-demo-source", regione: "Lombardia", anno: 2025, versione: "ed.1", nome: "Lombardia 2025 (ed.2)", stato: "pubblicato" };
// Synthetic prices, test-only; NEVER used as a runtime catalogue fallback.
export const catalog: ApartmentCatalogRow[] = APARTMENT_REQUIREMENTS.filter(([key]) => key !== "screed").map(([key, , unit, suffix]) => ({ id: key, fonte_id: source.id, codice: "LOM252." + suffix, descrizione: `Specifiche demo ${key}; esclusioni da verificare`, unita_misura: unit, prezzo: "100" }));
export function simulate(index: number): ApartmentConversation {
  return apartmentSimulations[index].answers.reduce((state, answer) => advanceApartment(state, answer).next, { step: "request", measurements: {} } as ApartmentConversation);
}
export const approved = Object.fromEntries(APARTMENT_REQUIREMENTS.map(([key]) => [key, { approved: true }])) as Partial<Record<ApartmentKey, ApartmentOverride>>;
