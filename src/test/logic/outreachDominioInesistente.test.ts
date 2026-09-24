/**
 * Un dominio che non esiste non entra nei flussi (24/09/2026).
 *
 * domainHasMx trattava «nessun record» come «DNS che non risponde» e lasciava
 * passare: in coda c'erano indirizzi come «flags-sprite@2x.webp» (un nome
 * d'immagine) o «info@www.keynesia», che il server di invio rifiutava.
 * Adesso passa solo il DNS muto; il dominio inesistente no, e il risultato
 * resta in memoria 30 giorni come quello di un dominio vero.
 */
import { afterEach, describe, expect, it } from "vitest";
import { domainHasMx, nessunRecord } from "../../../supabase/functions/_shared/outreach-email-check";

class NotFound extends Error { name = "NotFound"; }
class TimedOut extends Error { name = "TimedOut"; }

function adminFinto() {
  const salvati: unknown[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null as unknown }) }) }),
      upsert: async (riga: unknown) => { salvati.push(riga); return { error: null as unknown }; },
    }),
    rpc: async () => ({ data: "altro" }),
  };
  return { admin, salvati };
}

/** DNS finto: risponde per «dominio TIPO», e per tutto il resto «no record found» come Deno. */
function dns(risposte: Record<string, unknown>, guasto?: Error) {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    resolveDns: async (dominio: string, tipo: string) => {
      if (guasto) throw guasto;
      const r = risposte[`${dominio} ${tipo}`];
      if (r === undefined) throw new NotFound(`no record found for Query { name: Name("${dominio}"), query_type: ${tipo} }`);
      return r;
    },
  };
}

afterEach(() => { delete (globalThis as unknown as { Deno?: unknown }).Deno; });

describe("domainHasMx: il dominio che non esiste", () => {
  it("un nome d'immagine o un dominio troncato non passa, e il risultato si ricorda", async () => {
    dns({});
    const { admin, salvati } = adminFinto();
    expect(await domainHasMx(admin, "2x.webp", new Map())).toBe(false);
    expect(await domainHasMx(admin, "www.keynesia", new Map())).toBe(false);
    expect(salvati).toHaveLength(2);
  });

  it("un DNS che non risponde lascia passare, come prima, e non si ricorda niente", async () => {
    dns({}, new TimedOut("request timed out"));
    const { admin, salvati } = adminFinto();
    expect(await domainHasMx(admin, "impresarossi.it", new Map())).toBe(true);
    expect(salvati).toHaveLength(0);
  });

  it("con l'MX passa; senza MX ma con un server che riceve (A) passa lo stesso", async () => {
    dns({ "impresarossi.it MX": [{ preference: 10, exchange: "mx.register.it" }], "ditta.it A": ["81.88.48.66"] });
    const { admin } = adminFinto();
    expect(await domainHasMx(admin, "impresarossi.it", new Map())).toBe(true);
    expect(await domainHasMx(admin, "ditta.it", new Map())).toBe(true);
  });

  it("riconosce il «nessun record» di Deno dal nome o dal messaggio, e nient'altro", () => {
    expect(nessunRecord(new NotFound("x"))).toBe(true);
    expect(nessunRecord(new Error("no record found for Query"))).toBe(true);
    expect(nessunRecord(new TimedOut("request timed out"))).toBe(false);
    expect(nessunRecord(new Error("connection refused"))).toBe(false);
    expect(nessunRecord(null)).toBe(false);
  });
});
