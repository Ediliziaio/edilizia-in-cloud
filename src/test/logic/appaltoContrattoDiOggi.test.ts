import {describe, expect, it} from "vitest";
import {contrattoDiOggi} from "@/lib/appalto/contratti";

const oggi = new Date().toLocaleDateString("en-CA");
const ieri = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
const domani = new Date(Date.now() + 86400000).toLocaleDateString("en-CA");
const c = (id: string, valido_dal: string, valido_al: string | null, attivo = true) => ({id, valido_dal, valido_al, attivo});

describe("quale contratto d'appalto vale oggi", () => {
  it("prende quello in corso, non il più recente in assoluto", () => {
    // L'elenco arriva ordinato per valido_dal decrescente: il primo non è detto sia in corso.
    const lista = [c("futuro", domani, null), c("corrente", ieri, domani)];
    expect(contrattoDiOggi(lista)?.id).toBe("corrente");
  });

  it("un contratto senza scadenza resta in corso", () => {
    expect(contrattoDiOggi([c("aperto", ieri, null)])?.id).toBe("aperto");
  });

  it("scade il giorno dopo valido_al, non il giorno stesso", () => {
    expect(contrattoDiOggi([c("ultimo-giorno", ieri, oggi)])?.id).toBe("ultimo-giorno");
    expect(contrattoDiOggi([c("scaduto-ieri", ieri, ieri), c("x", ieri, ieri)])?.id).toBe("scaduto-ieri");
  });

  it("salta i contratti spenti anche se validi per data", () => {
    const lista = [c("spento", ieri, domani, false), c("acceso", ieri, domani)];
    expect(contrattoDiOggi(lista)?.id).toBe("acceso");
  });

  it("se nessuno è in corso propone comunque un attivo: meglio uno scaduto in vista che il vuoto", () => {
    const lista = [c("vecchio", "2020-01-01", "2020-12-31")];
    expect(contrattoDiOggi(lista)?.id).toBe("vecchio");
  });

  it("senza contratti non inventa niente", () => {
    expect(contrattoDiOggi([])).toBeNull();
  });
});
