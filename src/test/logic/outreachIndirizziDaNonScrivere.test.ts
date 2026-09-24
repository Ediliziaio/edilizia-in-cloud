/**
 * Email che il dispatcher non deve spedire (24/09/2026).
 *
 * L'opt-out stava sulla scheda: lo stesso indirizzo può stare su più schede
 * (una per lista importata), e quella che non aveva rimbalzato né chiesto di
 * uscire avrebbe spedito lo stesso. La lista nera invece è per indirizzo.
 * E i domini senza posta, bloccati all'iscrizione dal 24/09, erano già in coda
 * a decine di migliaia: il dispatcher li guardava solo per distribuire gli
 * invii tra i server, e spediva lo stesso.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chiusuraEsclusione, esclusioneIndirizzo } from "../../../supabase/functions/_shared/outreach-dispatch-logic";
import { risolviPosta } from "../../../supabase/functions/_shared/outreach-email-check";

const listaNera = (voci: Record<string, string[]>) => new Map(Object.entries(voci));
const nessunDominio = new Set<string>();

describe("esclusioneIndirizzo", () => {
  it("un indirizzo pulito parte", () => {
    expect(esclusioneIndirizzo("info@edilrossi.it", listaNera({}), nessunDominio)).toBeNull();
  });

  it("rimbalzato su un'altra scheda: non parte, qualunque sia la scheda in coda", () => {
    expect(esclusioneIndirizzo("info@edilrossi.it", listaNera({ "info@edilrossi.it": ["hard_bounce"] }), nessunDominio)).toBe("rimbalzato");
    expect(esclusioneIndirizzo("x@y.it", listaNera({ "x@y.it": ["invalid"] }), nessunDominio)).toBe("rimbalzato");
  });

  it("maiuscole e spazi non lo fanno passare", () => {
    expect(esclusioneIndirizzo("  Info@EdilRossi.IT ", listaNera({ "info@edilrossi.it": ["hard_bounce"] }), nessunDominio)).toBe("rimbalzato");
  });

  it("chi si è disiscritto, ha segnalato spam o va tolto per legge non riceve niente", () => {
    for (const motivo of ["unsubscribe", "spam_complaint", "manual", "legal"]) {
      expect(esclusioneIndirizzo("a@b.it", listaNera({ "a@b.it": [motivo] }), nessunDominio)).toBe("disiscritto");
    }
  });

  it("rimbalzo e disiscrizione insieme: conta la volontà della persona", () => {
    expect(esclusioneIndirizzo("a@b.it", listaNera({ "a@b.it": ["hard_bounce", "unsubscribe"] }), nessunDominio)).toBe("disiscritto");
  });

  it("dominio senza posta: non parte; la lista nera viene prima", () => {
    const morti = new Set(["2x.webp"]);
    expect(esclusioneIndirizzo("flags-sprite@2x.webp", listaNera({}), morti)).toBe("dominio_senza_posta");
    expect(esclusioneIndirizzo("a@2x.webp", listaNera({ "a@2x.webp": ["unsubscribe"] }), morti)).toBe("disiscritto");
  });
});

describe("chiusuraEsclusione", () => {
  it("chiude l'iscrizione con gli stati del resto del motore", () => {
    expect(chiusuraEsclusione("rimbalzato")).toEqual({ status: "bounced", stop_reason: "hard_bounce", last_error: "lista nera: rimbalzato" });
    expect(chiusuraEsclusione("disiscritto")).toEqual({ status: "opted_out", stop_reason: "optout_email", last_error: "lista nera: disiscritto" });
    // Come i 22 indirizzi impossibili annullati la mattina del 24/09.
    expect(chiusuraEsclusione("dominio_senza_posta")).toEqual({ status: "bounced", stop_reason: "indirizzo impossibile", last_error: "indirizzo impossibile" });
  });
});

class NotFound extends Error { name = "NotFound"; }
class TimedOut extends Error { name = "TimedOut"; }

/** DNS finto: risponde per «dominio TIPO», e per il resto «no record found» come Deno. */
function dns(risposte: Record<string, unknown>, guasto?: Error) {
  const opzioni: unknown[] = [];
  (globalThis as unknown as { Deno: unknown }).Deno = {
    resolveDns: async (dominio: string, tipo: string, opz?: unknown) => {
      opzioni.push(opz);
      if (guasto) throw guasto;
      const r = risposte[`${dominio} ${tipo}`];
      if (r === undefined) throw new NotFound(`no record found for Query { name: Name("${dominio}"), query_type: ${tipo} }`);
      return r;
    },
  };
  return opzioni;
}

afterEach(() => { delete (globalThis as unknown as { Deno?: unknown }).Deno; });

describe("risolviPosta", () => {
  it("il server MX con la priorità più alta", async () => {
    dns({ "edilrossi.it MX": [{ preference: 20, exchange: "mx2.aruba.it" }, { preference: 10, exchange: "mx1.aruba.it" }] });
    expect(await risolviPosta("EdilRossi.it")).toEqual({ host: "mx1.aruba.it", errore: false });
  });

  it("senza MX ma con un A: la posta arriva al dominio stesso", async () => {
    dns({ "piccola.it A": ["1.2.3.4"] });
    expect(await risolviPosta("piccola.it")).toEqual({ host: "piccola.it", errore: false });
  });

  it("nessun record: lì la posta non arriva", async () => {
    dns({});
    expect(await risolviPosta("2x.webp")).toEqual({ host: null, errore: false });
  });

  it("DNS che non risponde: non si sa, e non si esclude", async () => {
    dns({}, new TimedOut("timed out"));
    expect(await risolviPosta("lento.it")).toEqual({ host: null, errore: true });
  });

  it("ogni domanda al DNS ha un tempo massimo", async () => {
    const opzioni = dns({});
    await risolviPosta("2x.webp");
    expect(opzioni).toHaveLength(2);
    for (const o of opzioni) expect((o as { signal?: unknown }).signal).toBeInstanceOf(AbortSignal);
  });
});
