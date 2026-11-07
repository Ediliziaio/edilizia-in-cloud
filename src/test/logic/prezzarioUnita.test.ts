import { describe, expect, it } from "vitest";
import {
  QUOTA_MINIMA_UNITA,
  controlloUnitaMisura,
  fraseDiMisura,
  messaggioUnitaMancanti,
} from "../../../supabase/functions/_shared/prezzarioUnita";

const voce = (unita: string | null, extra: Record<string, unknown> = {}) => ({ descrizione: "Voce", prezzo: 10, unita_misura: unita, ...extra });
const voci = (conUnita: number, senza: number) => [
  ...Array.from({ length: conUnita }, () => voce("m²")),
  ...Array.from({ length: senza }, () => voce(null)),
];

describe("controlloUnitaMisura", () => {
  it("ferma un prezzario importato senza la colonna dell'unità (le 16 regioni del 05/11/2026)", () => {
    const c = controlloUnitaMisura(voci(0, 18521));
    expect(c).toMatchObject({ valide: 18521, conUnita: 0, senzaUnita: 18521, bloccante: true });
    expect(messaggioUnitaMancanti(c)).toContain("18.521 voci su 18.521 (100%)");
  });

  it("lascia passare la Lombardia 2025 (93,6% con l'unità)", () => {
    expect(controlloUnitaMisura(voci(38973, 2642)).bloccante).toBe(false);
  });

  it("la soglia è inclusa: esattamente il 90% passa, appena sotto no", () => {
    expect(QUOTA_MINIMA_UNITA).toBe(0.9);
    expect(controlloUnitaMisura(voci(9, 1)).bloccante).toBe(false);
    expect(controlloUnitaMisura(voci(89, 11)).bloccante).toBe(true);
  });

  it("conta solo le voci che verrebbero importate", () => {
    const c = controlloUnitaMisura([
      voce("m²"),
      voce(null, { errors: ["Prezzo non valido"] }),
      voce(null, { descrizione: "  " }),
      voce(null, { prezzo: 0 }),
      voce(null, { prezzo: "abc" }),
      voce("  "),
    ]);
    expect(c).toMatchObject({ valide: 2, conUnita: 1, senzaUnita: 1, bloccante: true });
  });

  it("un elenco vuoto non blocca (ci pensano gli altri controlli)", () => {
    expect(controlloUnitaMisura([])).toMatchObject({ valide: 0, quota: 1, bloccante: false });
  });
});

describe("fraseDiMisura", () => {
  it("trova la regola di misura composta della demolizione solai (Marche 02.03.017*)", () => {
    const testo = "Demolizione di solaio misto in laterizio e cemento armato. Demolizione di solaio misto di qualunque tipo. " +
      "Sono da computarsi a parte le eventuali opere di protezione ed il trasporto a discarica con i relativi oneri. " +
      "È inoltre compreso quanto altro occorre per dare il lavoro finito. La misurazione sarà eseguita al m² per ogni cm di spessore del solaio.";
    expect(fraseDiMisura(testo)).toBe("La misurazione sarà eseguita al m² per ogni cm di spessore del solaio.");
  });

  it("senza una frase di misura restituisce la variante in fondo (Marche 02.03.008*.001)", () => {
    const testo = "Demolizione di tramezzi. Demolizione di tramezzi di qualsiasi genere e tipo. Per uno spessore compreso tra cm 6-11.";
    expect(fraseDiMisura(testo)).toBe("Per uno spessore compreso tra cm 6-11.");
  });

  it("riconosce «al m²» anche se dopo «²» non c'è un confine di parola", () => {
    expect(fraseDiMisura("Lastra in cartongesso. Prezzo al m² di superficie posata. Colore bianco.")).toBe("Prezzo al m² di superficie posata.");
  });

  it("una densità «Kg/m³» non è una regola di misura", () => {
    const testo = "Materassino in lana di roccia della densità di Kg/m³ 40. Spessore cm 6.";
    expect(fraseDiMisura(testo)).toBe("Spessore cm 6.");
  });

  it("accorcia dall'inizio le frasi troppo lunghe e tollera il vuoto", () => {
    const lunga = `Valutato ${"x".repeat(400)} fine.`;
    const frase = fraseDiMisura(lunga, 50);
    expect(frase.startsWith("…")).toBe(true);
    expect(frase.length).toBeLessThanOrEqual(50);
    expect(frase.endsWith("fine.")).toBe(true);
    expect(fraseDiMisura(null)).toBe("");
    expect(fraseDiMisura("   ")).toBe("");
  });
});
