/**
 * Gli avvisi che le funzioni di lettura (fattura, DDT) allegano alla risposta
 * sotto `controlli` (vedi supabase/functions/_shared/controlliDocumento.ts).
 *
 * Il server non corregge niente: dice cosa non torna (totali che non quadrano,
 * P.IVA con la cifra di controllo sbagliata, data nel futuro, fattura già
 * registrata). Qui diventano righe da mostrare accanto ai dati letti, perché
 * chi conferma sappia dove guardare.
 */

export type GravitaAvviso = "info" | "warn" | "error";

export interface AvvisoLettura {
  code?: string;
  field?: string;
  message: string;
  severity: GravitaAvviso;
}

const PESO: Record<GravitaAvviso, number> = { error: 0, warn: 1, info: 2 };

function eAvviso(v: unknown): v is AvvisoLettura {
  if (!v || typeof v !== "object") return false;
  const { message, severity } = v as Partial<AvvisoLettura>;
  return typeof message === "string" && message.trim() !== "" && typeof severity === "string" && severity in PESO;
}

/** Gli avvisi che meritano l'occhio di chi conferma: niente informativi, prima gli errori. */
export function avvisiDaMostrare(controlli: unknown, massimo = 6): AvvisoLettura[] {
  const grezzi = (controlli as { warnings?: unknown } | null | undefined)?.warnings;
  if (!Array.isArray(grezzi)) return [];
  return grezzi
    .filter(eAvviso)
    .filter((w) => w.severity !== "info")
    .sort((a, b) => PESO[a.severity] - PESO[b.severity])
    .slice(0, massimo);
}

/** Come `avvisiDaMostrare`, già in forma di riga di testo. */
export function righeAvvisiLettura(controlli: unknown, massimo = 6): string[] {
  return avvisiDaMostrare(controlli, massimo).map(
    (w) => `${w.severity === "error" ? "⛔" : "⚠️"} ${w.message.trim()}`,
  );
}
