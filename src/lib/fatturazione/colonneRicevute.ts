/**
 * Le colonne scegliibili della lista delle fatture ricevute, e i dati di pagamento che ci finiscono
 * dentro. La scelta resta su quel browser: è una comodità di chi guarda, non un dato.
 */
import { etichettaModalitaPagamento } from "@/lib/fatturazione/pagamentoFatturaRicevuta";

export const COLONNE_RICEVUTE = [
  { id: "imponibile", etichetta: "Imponibile" },
  { id: "stato", etichetta: "Stato" },
  { id: "verifica", etichetta: "Verifica" },
  { id: "pagamento", etichetta: "Pagamento" },
  { id: "metodo", etichetta: "Modalità di pagamento" },
  { id: "scadenza", etichetta: "Prossima scadenza" },
  { id: "netto", etichetta: "Netto a pagare" },
  { id: "collegata", etichetta: "Collegata a" },
  { id: "allegati", etichetta: "Allegati" },
  { id: "note", etichetta: "Note interne" },
] as const;

export type ColonnaRicevute = (typeof COLONNE_RICEVUTE)[number]["id"];

export const COLONNE_PREDEFINITE: ColonnaRicevute[] = ["imponibile", "stato", "verifica", "pagamento", "metodo", "scadenza", "collegata", "allegati"];
const CHIAVE = "fatture-ricevute-colonne-v1";

export function leggiColonne(): Set<ColonnaRicevute> {
  try {
    const salvate = JSON.parse(localStorage.getItem(CHIAVE) ?? "null");
    if (Array.isArray(salvate)) {
      const valide = new Set<string>(COLONNE_RICEVUTE.map((c) => c.id));
      return new Set(salvate.filter((c): c is ColonnaRicevute => valide.has(c)));
    }
  } catch { /* storage bloccato o valore rovinato: valgono le predefinite */ }
  return new Set(COLONNE_PREDEFINITE);
}

export function salvaColonne(colonne: ReadonlySet<ColonnaRicevute>): void {
  try { localStorage.setItem(CHIAVE, JSON.stringify([...colonne])); } catch { /* resta per questa visita */ }
}

interface Rata { scadenza?: unknown; modalita?: unknown }
const rate = (piano: unknown): Rata[] => (Array.isArray(piano) ? (piano as Rata[]) : []);

/** Come si paga, in parole. Con metodi diversi fra le rate li elenca tutti. */
export function metodiPagamento(piano: unknown): string[] {
  const visti = rate(piano).map((r) => etichettaModalitaPagamento(r.modalita)).filter((m): m is string => !!m);
  return [...new Set(visti)];
}

/** La prima scadenza da oggi in poi; se sono tutte passate, l'ultima. Senza date: null. */
export function prossimaScadenza(piano: unknown, oggi: string): string | null {
  const date = rate(piano).map((r) => r.scadenza).filter((d): d is string => typeof d === "string" && d.length >= 10).map((d) => d.slice(0, 10)).sort();
  if (!date.length) return null;
  return date.find((d) => d >= oggi) ?? date[date.length - 1];
}
