/**
 * Le misure di un infisso nel sopralluogo, in millimetri (08/11/2026).
 *
 * I rilievi scrivono `larghezza_foro` / `altezza_foro`, quasi sempre in centimetri:
 * l'unità sta nel modello del sopralluogo fotografato quando è stato creato. Prima si
 * leggevano solo `larghezza` e `larghezza_mm`, e le misure arrivavano vuote.
 */
type Valori = Record<string, unknown>;
type Campo = { key?: unknown; unit?: unknown; fields?: unknown };
type Tipo = { key?: unknown; sections?: unknown };

function campi(lista: unknown): Campo[] {
  if (!Array.isArray(lista)) return [];
  return (lista as Campo[]).flatMap((c) => [c, ...campi(c?.fields)]);
}

function unitaDelCampo(schema: unknown, tipoElemento: string, chiave: string): string | null {
  const tipi = (schema as { element_types?: unknown } | null)?.element_types;
  if (!Array.isArray(tipi)) return null;
  const tipo = (tipi as Tipo[]).find((t) => t?.key === tipoElemento);
  if (!tipo || !Array.isArray(tipo.sections)) return null;
  const campo = (tipo.sections as Campo[]).flatMap((s) => campi(s?.fields)).find((c) => c?.key === chiave);
  return typeof campo?.unit === "string" ? campo.unit : null;
}

const FATTORE: Record<string, number> = { mm: 1, cm: 10, m: 1000 };

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Il foro, se c'è; altrimenti la misura generica. Le due misure vengono sempre dalla stessa coppia. */
const COPPIE: Array<{ l: string; h: string; senzaUnita: string }> = [
  { l: "larghezza_mm", h: "altezza_mm", senzaUnita: "mm" },
  // Il modello standard rileva il foro in centimetri.
  { l: "larghezza_foro", h: "altezza_foro", senzaUnita: "cm" },
  // Sopralluoghi vecchi senza modello: si è sempre letto così, come millimetri.
  { l: "larghezza", h: "altezza", senzaUnita: "mm" },
];

export function misureDelRilievo(
  valori: Valori | null | undefined,
  schema: unknown,
  tipoElemento = "infisso",
): { larghezza_mm: number | null; altezza_mm: number | null } {
  const v = valori ?? {};
  for (const { l, h, senzaUnita } of COPPIE) {
    const larghezza = numero(v[l]);
    const altezza = numero(v[h]);
    if (larghezza == null && altezza == null) continue;
    const fattore = FATTORE[unitaDelCampo(schema, tipoElemento, l) ?? senzaUnita] ?? 1;
    return {
      larghezza_mm: larghezza == null ? null : Math.round(larghezza * fattore),
      altezza_mm: altezza == null ? null : Math.round(altezza * fattore),
    };
  }
  return { larghezza_mm: null, altezza_mm: null };
}
