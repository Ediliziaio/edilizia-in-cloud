/**
 * Motivi di perdita: regole pure condivise da dialog e impostazioni.
 * I sette standard valgono per tutte le aziende; ognuna aggiunge i suoi.
 */
export interface MotivoPerdita {
  value: string;
  label: string;
  /** true = voce standard del prodotto, non si rinomina né si toglie. */
  predefinito: boolean;
  /** id della riga in opportunity_loss_reasons (solo motivi dell'azienda). */
  id?: string;
}

export const MOTIVI_PERDITA_DEFAULT: MotivoPerdita[] = [
  { value: "prezzo", label: "Prezzo troppo alto", predefinito: true },
  { value: "concorrente", label: "Scelta concorrente", predefinito: true },
  { value: "budget_non_disponibile", label: "Budget non disponibile", predefinito: true },
  { value: "timing", label: "Timing non giusto", predefinito: true },
  { value: "prodotto_non_adatto", label: "Prodotto non adatto", predefinito: true },
  { value: "nessuna_risposta", label: "Nessuna risposta del cliente", predefinito: true },
  { value: "altro", label: "Altro", predefinito: true },
];

const chiave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Standard prima, poi quelli dell'azienda; niente doppioni per nome. */
export function unisciMotivi(
  aziendali: { id: string; label: string }[],
): MotivoPerdita[] {
  const visti = new Set(MOTIVI_PERDITA_DEFAULT.flatMap((m) => [chiave(m.label), chiave(m.value)]));
  const propri: MotivoPerdita[] = [];
  for (const r of aziendali) {
    const k = chiave(r.label);
    if (!k || visti.has(k)) continue;
    visti.add(k);
    propri.push({ id: r.id, value: r.label, label: r.label, predefinito: false });
  }
  return [...MOTIVI_PERDITA_DEFAULT, ...propri];
}

/**
 * Controlla un nome nuovo (o rinominato) prima di salvarlo.
 * Restituisce il nome pulito, oppure lancia con un messaggio da mostrare.
 */
export function nomeMotivoValido(
  nome: string,
  esistenti: MotivoPerdita[],
  escludiId?: string,
): string {
  const pulito = nome.trim().replace(/\s+/g, " ");
  if (!pulito) throw new Error("Scrivi il motivo prima di salvarlo");
  if (pulito.length > 80) throw new Error("Il motivo è troppo lungo (massimo 80 caratteri)");
  const k = chiave(pulito);
  const doppione = esistenti.find(
    (m) => !(escludiId && m.id === escludiId) && (chiave(m.label) === k || chiave(m.value) === k),
  );
  if (doppione) throw new Error(`Esiste già il motivo «${doppione.label}»`);
  return pulito;
}

/** Etichetta leggibile di un valore salvato, anche se il motivo è stato tolto. */
export function etichettaMotivo(valore: string | null | undefined, motivi: MotivoPerdita[]): string {
  if (!valore) return "";
  return motivi.find((m) => m.value === valore)?.label ?? valore;
}
