/**
 * Link pubblico dell'offerta (quote-sign): la firma, e il rifiuto, valgono UNA volta.
 *
 * La funzione legge il preventivo, controlla che sia «inviata», e molte attese
 * dopo (righe, impronta del documento) scrive «accettata». Due richieste che
 * arrivano insieme (due schede aperte, un doppio tocco, un ritentativo del
 * telefono) leggevano entrambe «inviata» e scrivevano entrambe: la seconda
 * cancellava la prova di firma della prima, e al cliente partivano due email di
 * conferma e al titolare due avvisi. Un «accetto» e un «rifiuto» insieme
 * lasciavano un preventivo accettato con la data di rifiuto (o viceversa).
 *
 * E se la scrittura falliva (database in affanno) il cliente leggeva comunque
 * «Offerta accettata con successo» e riceveva la conferma: l'offerta restava «inviata».
 *
 * Qui il gestore VERO gira su un database finto; le richieste partono in parallelo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const condiviso = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  gestore: null as null | ((req: Request) => Promise<Response>),
  email: [] as unknown[],
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.db }));
vi.mock("../../../supabase/functions/_shared/withMetrics.ts", () => ({
  serveConMetriche: (_nome: string, g: (req: Request) => Promise<Response>) => { condiviso.gestore = g; },
}));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({
  sendEmailUnified: async (args: unknown) => { condiviso.email.push(args); return { ok: true, status: 200, body: {} }; },
}));

const TOKEN = "5f1c0a9e-7d2b-4c3a-8e11-0123456789ab";
const preventivo = (extra: Riga = {}): Riga => ({
  id: "q-1", company_id: "c-1", quote_number: "OFF-2026-042", title: "Serramenti", status: "inviata",
  signature_token: TOKEN, expires_at: "2026-12-31T10:00:00.000Z", subtotal: 1000, discount_percent: 0, discount_amount: 0,
  vat_amount: 220, total: 1220, signed_at: null, signed_by_name: null, created_at: "2026-08-01T10:00:00.000Z",
  client_name: "Mario Rossi", client_email: "mario@example.com", created_by: "u-1", custom_field_values: {}, ...extra,
});

const ambiente = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "service" };

async function carica() {
  if (condiviso.gestore) return;
  vi.resetModules();
  vi.stubGlobal("Deno", denoFinto(ambiente).finto);
  const percorso = "../../../supabase/functions/quote-sign/index.ts";
  await import(/* @vite-ignore */ percorso);
}

async function chiama(azione: string, extra: Riga = {}) {
  // Deno si ristabilisce a ogni chiamata: il gestore lo legge a ogni richiesta.
  vi.stubGlobal("Deno", denoFinto(ambiente).finto);
  const r = await condiviso.gestore!(new Request("http://x/functions/v1/quote-sign", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN, action: azione, ...extra }),
  }));
  return { stato: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

const notifiche = () => condiviso.db.rpcChiamate.filter((c) => c.nome === "create_notification");

beforeEach(async () => {
  condiviso.db = new DbMinimo();
  condiviso.email = [];
  condiviso.db.tabelle.companies = [{ id: "c-1", name: "Rossi Serramenti" }];
  condiviso.db.tabelle.quote_items = [{ quote_id: "q-1", name: "Finestra", quantity: 1, unit_price: 1000, line_total: 1000, vat_rate: 22, sort_order: 0 }];
  condiviso.db.tabelle.quotes = [preventivo()];
  await carica();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("quote-sign: due richieste insieme, una sola vince", () => {
  it("due firme insieme: una sola è registrata, una conferma, un avviso; l'altra sente «già firmata»", async () => {
    const [a, b] = await Promise.all([
      chiama("sign", { signed_by_name: "Mario Rossi" }),
      chiama("sign", { signed_by_name: "Mario R." }),
    ]);
    const riuscite = [a, b].filter((x) => x.corpo.success === true);
    const respinte = [a, b].filter((x) => x.corpo.success !== true);
    expect(riuscite).toHaveLength(1);
    expect(respinte).toHaveLength(1);
    expect(respinte[0].corpo).toMatchObject({ valid: false });

    const q = condiviso.db.tabelle.quotes[0];
    const vincitore = riuscite[0] === a ? "Mario Rossi" : "Mario R.";
    expect(q.status).toBe("accettata");
    expect(q.signed_by_name).toBe(vincitore);
    // La prova di firma è quella di chi ha firmato per primo, non sovrascritta.
    expect(((q.custom_field_values as Riga).prova_firma as Riga).firmato_da).toBe(vincitore);
    expect(condiviso.email).toHaveLength(1);
    expect(notifiche()).toHaveLength(1);
  });

  it("firma e rifiuto insieme: lo stato finale è uno solo e non porta i segni dell'altro", async () => {
    const [firma, rifiuto] = await Promise.all([
      chiama("sign", { signed_by_name: "Mario Rossi" }),
      chiama("refuse", { refuse_reason: "Troppo caro" }),
    ]);
    expect([firma, rifiuto].filter((x) => x.corpo.success === true)).toHaveLength(1);
    const q = condiviso.db.tabelle.quotes[0];
    if (firma.corpo.success === true) {
      expect(q.status).toBe("accettata");
      expect(q.refused_at ?? null).toBeNull();
    } else {
      expect(q.status).toBe("rifiutata");
      expect(q.signed_at ?? null).toBeNull();
      expect(q.signed_by_name ?? null).toBeNull();
    }
    expect(notifiche()).toHaveLength(1);
  });

  it("due rifiuti insieme: un solo avviso al titolare", async () => {
    const [a, b] = await Promise.all([chiama("refuse"), chiama("refuse")]);
    expect([a, b].filter((x) => x.corpo.success === true)).toHaveLength(1);
    expect(condiviso.db.tabelle.quotes[0].status).toBe("rifiutata");
    expect(notifiche()).toHaveLength(1);
  });

  it("una firma sola, senza concorrenti, riesce come prima", async () => {
    const { corpo } = await chiama("sign", { signed_by_name: "Mario Rossi" });
    expect(corpo).toMatchObject({ success: true });
    expect(condiviso.db.tabelle.quotes[0]).toMatchObject({ status: "accettata", signed_by_name: "Mario Rossi" });
    expect(condiviso.email).toHaveLength(1);
    expect(notifiche()).toHaveLength(1);
  });
});

describe("quote-sign: se il database non scrive, il cliente non legge «accettata»", () => {
  /** Un database che rifiuta le scritture su `quotes` (timeout, blocco): restituisce l'errore invece di scrivere. */
  function conScrittureInErrore() {
    const originale = condiviso.db.from.bind(condiviso.db);
    condiviso.db.from = ((tabella: string) => {
      const q = originale(tabella) as unknown as Record<string, unknown>;
      if (tabella !== "quotes") return q;
      const aggiorna = (q.update as (d: unknown) => unknown).bind(q);
      q.update = (dati: unknown) => {
        aggiorna(dati);
        q.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: "canceling statement due to lock timeout", code: "55P03" } }).then(resolve);
        return q;
      };
      return q;
    }) as unknown as typeof condiviso.db.from;
  }

  it("firma: errore del database → risposta di errore, nessuna conferma, nessun avviso", async () => {
    conScrittureInErrore();
    const { stato, corpo } = await chiama("sign", { signed_by_name: "Mario Rossi" });
    expect(corpo.success).not.toBe(true);
    expect(stato).toBeGreaterThanOrEqual(500);
    expect(condiviso.db.tabelle.quotes[0].status).toBe("inviata");
    expect(condiviso.email).toHaveLength(0);
    expect(notifiche()).toHaveLength(0);
  });

  it("rifiuto: errore del database → risposta di errore, nessun avviso", async () => {
    conScrittureInErrore();
    const { stato, corpo } = await chiama("refuse");
    expect(corpo.success).not.toBe(true);
    expect(stato).toBeGreaterThanOrEqual(500);
    expect(notifiche()).toHaveLength(0);
  });
});

describe("quote-sign view: le righe arrivano con categoria e opzione", () => {
  it("item_category e is_optional sono nella risposta (la pagina dice «Opzionale», «nota», «posa»)", async () => {
    condiviso.db.tabelle.quote_items = [
      { quote_id: "q-1", name: "Finestra", quantity: 1, unit_price: 1000, line_total: 1000, vat_rate: 22, sort_order: 0, item_category: "prodotto", is_optional: false, mostra_nel_pdf: true },
      { quote_id: "q-1", name: "Zanzariera", quantity: 1, unit_price: 150, line_total: 150, vat_rate: 22, sort_order: 1, item_category: "prodotto", is_optional: true, mostra_nel_pdf: true },
      { quote_id: "q-1", name: "Posa", quantity: 1, unit_price: 200, line_total: 200, vat_rate: 22, sort_order: 2, item_category: "posa", is_optional: false, mostra_nel_pdf: true },
    ];
    const { corpo } = await chiama("view");
    const righe = corpo.items as Riga[];
    expect(righe[0]).toMatchObject({ name: "Finestra", item_category: "prodotto", is_optional: false });
    expect(righe[1]).toMatchObject({ name: "Zanzariera", is_optional: true });
    expect(righe[2]).toMatchObject({ name: "Posa", item_category: "posa" });
  });
});

describe("quote-sign: un preventivo nel cestino non ha più il link", () => {
  // «Spostato nel cestino, recuperabile per 30 giorni»: per il cliente è ritirato.
  // Prima la funzione cercava solo il token e il link continuava a mostrare l'offerta e a farla firmare.
  it.each(["view", "sign", "refuse"])("%s: «link non valido» e niente cambia", async (azione) => {
    condiviso.db.tabelle.quotes = [preventivo({ deleted_at: "2026-10-01T10:00:00.000Z" })];
    const { stato, corpo } = await chiama(azione, { signed_by_name: "Mario Rossi" });
    expect(stato).toBe(404);
    expect(corpo).toMatchObject({ valid: false, reason: "token_invalid" });
    expect(condiviso.db.tabelle.quotes[0].status).toBe("inviata");
    expect(condiviso.email).toHaveLength(0);
    expect(notifiche()).toHaveLength(0);
  });

  it("recuperato dal cestino (deleted_at tornato vuoto) il link funziona di nuovo", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ deleted_at: null })];
    const { corpo } = await chiama("view");
    expect(corpo.valid).toBe(true);
  });
});
