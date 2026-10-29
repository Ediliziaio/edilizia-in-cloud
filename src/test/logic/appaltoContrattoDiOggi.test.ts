import {afterEach, describe, expect, it, vi} from "vitest";
import {contrattoDiOggi, oggiISO} from "@/lib/appalto/contratti";

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

/**
 * `new Date().toISOString().slice(0, 10)` da' il giorno UTC: in Italia, fra
 * mezzanotte e l'una (le due d'estate), e' ANCORA IERI. Un contratto creato a
 * quell'ora nasceva valido dal giorno prima.
 */
describe("oggiISO: il giorno locale, non quello UTC", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("segue il calendario di chi guarda lo schermo", () => {
    const istante = new Date("2026-10-29T23:30:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(istante);

    expect(oggiISO()).toBe(istante.toLocaleDateString("en-CA"));
    // A est di Greenwich quell'istante e' gia' il giorno dopo: e' il caso che
    // il difetto sbagliava. A ovest, o a Greenwich, i due giorni coincidono.
    if (istante.getTimezoneOffset() < 0) {
      expect(oggiISO()).not.toBe(istante.toISOString().slice(0, 10));
    }
  });

  it("e' sempre nella forma AAAA-MM-GG", () => {
    expect(oggiISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
