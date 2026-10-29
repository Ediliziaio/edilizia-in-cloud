import { describe, it, expect } from "vitest";
import { accordoCommessa } from "@/lib/appalto/rendiconto";

const euro = (v: number) => `${v.toLocaleString("it-IT", { useGrouping: "always" })} €`;
const base = { rendicontato: 0, extra: 0, euro };

describe("accordoCommessa — a corpo", () => {
  it("la cifra concordata è l'importo della commessa, non il tetto", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: 18500, tettoImporto: null });
    expect(a.riferimento).toBe(18500);
    expect(a.etichetta).toContain("A corpo");
    expect(a.etichetta).toContain("18.500");
    // «entro» è del tetto: a corpo la cifra è quella e basta.
    expect(a.etichetta).not.toContain("entro");
  });

  it("dice quanto resta da fare del concordato", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: 18500, tettoImporto: null, rendicontato: 7900 });
    expect(a.residuo).toBe(10600);
    expect(a.nota).toContain("10.600");
    expect(a.nota).toContain("concordato");
    expect(a.allarme).toBe(false);
  });

  it("oltre il concordato dice che quei soldi NON si fatturano", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: 10000, tettoImporto: null, rendicontato: 11200 });
    expect(a.residuo).toBe(-1200);
    expect(a.allarme).toBe(true);
    expect(a.nota).toContain("1.200");
    expect(a.nota).toContain("non li fatturi");
    expect(a.nota).not.toContain("tetto");
  });

  it("le commesse vecchie col solo tetto non restano senza cifra", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: 0, tettoImporto: 18000 });
    expect(a.riferimento).toBe(18000);
    expect(a.etichetta).toContain("18.000");
  });

  it("senza nessuna cifra dice solo «A corpo», non un numero finto", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: null, tettoImporto: null });
    expect(a.riferimento).toBeNull();
    expect(a.etichetta).toBe("A corpo");
    expect(a.residuo).toBeNull();
  });
});

describe("accordoCommessa — a misura", () => {
  it("vale il tetto, e l'importo stimato non lo sostituisce", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_misura", totalAmount: 14000, tettoImporto: 12000 });
    expect(a.riferimento).toBe(12000);
    expect(a.etichetta).toContain("entro");
    expect(a.etichetta).toContain("12.000");
  });

  it("senza tetto non c'è niente da superare", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_misura", totalAmount: 14000, tettoImporto: null, rendicontato: 20000 });
    expect(a.riferimento).toBeNull();
    expect(a.etichetta).toContain("vale quello che rendiconti");
    expect(a.allarme).toBe(false);
  });

  it("oltre il tetto il lavoro si fattura comunque: parola diversa da «a corpo»", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_misura", totalAmount: null, tettoImporto: 12000, rendicontato: 13500 });
    expect(a.allarme).toBe(true);
    expect(a.nota).toContain("tetto");
    expect(a.nota).not.toContain("non li fatturi");
  });
});

describe("accordoCommessa — senza cifra di riferimento", () => {
  it("al posto del residuo mostra il lavoro fuori contratto", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_misura", totalAmount: null, tettoImporto: null, extra: 900 });
    expect(a.nota).toContain("900");
    expect(a.nota).toContain("fuori contratto");
  });

  it("senza nemmeno quello dice solo che le bozze non contano", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_misura", totalAmount: null, tettoImporto: null });
    expect(a.nota).toBe("Bozze escluse");
  });
});

describe("accordoCommessa — numeri che arrivano come li dà il database", () => {
  it("le stringhe numeriche di PostgREST valgono come numeri", () => {
    const a = accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: "18500.00", tettoImporto: null, rendicontato: 500 });
    expect(a.riferimento).toBe(18500);
    expect(a.residuo).toBe(18000);
  });

  it("zero e stringa vuota non sono una cifra concordata", () => {
    expect(accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: "0.00", tettoImporto: null }).riferimento).toBeNull();
    expect(accordoCommessa({ ...base, valorizzazione: "a_corpo", totalAmount: "", tettoImporto: null }).riferimento).toBeNull();
  });
});
