/**
 * Ondata 0.4 — prova permanente: carico e scarico in una transazione sola.
 *
 * La prova di concorrenza vera (due scarichi simultanei su connessioni HTTP
 * separate) è nella parte dal vivo: due `fetch` lanciati insieme sulla stessa
 * riga. Senza il blocco sulla riga passerebbero entrambi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../supabase/migrations");
const migrazione = (frammento: string): string => {
  const nome = readdirSync(DIR).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione non trovata: ${frammento}`);
  return readFileSync(resolve(DIR, nome), "utf8");
};

const sql = migrazione("magazzino_transazionale");

describe("0.4 · il movimento è una transazione, non tre passi separati", () => {
  it("la riga viene bloccata prima di leggerne la giacenza", () => {
    const corpo = sql.split("FUNCTION public.warehouse_movimento_rapido(")[1].split("$function$;")[0];
    expect(corpo).toMatch(/FROM public\.warehouse_stock\s+WHERE id = p_stock_item_id\s+FOR UPDATE/);
  });

  it("la giacenza si aggiorna in modo relativo, non riscrivendo un valore assoluto", () => {
    const corpo = sql.split("FUNCTION public.warehouse_movimento_rapido(")[1].split("$function$;")[0];
    expect(corpo).toMatch(/SET quantity = quantity \+ CASE WHEN p_tipo = 'carico'/);
    // il difetto originale: `.update({ quantity: Math.max(0, newQty) })`
    expect(corpo).not.toMatch(/GREATEST\(0/);
  });

  it("uno scarico maggiore della giacenza è un rifiuto motivato, non uno zero", () => {
    const corpo = sql.split("FUNCTION public.warehouse_movimento_rapido(")[1].split("$function$;")[0];
    expect(corpo).toMatch(/IF p_tipo = 'scarico' AND v_prima < p_quantita THEN/);
    expect(corpo).toContain("Giacenza insufficiente");
    expect(corpo).toMatch(/disponibili %, richiesti %/);
  });

  it("il movimento si scrive dopo l'aggiornamento, nella stessa transazione", () => {
    const corpo = sql.split("FUNCTION public.warehouse_movimento_rapido(")[1].split("$function$;")[0];
    const posUpdate = corpo.indexOf("UPDATE public.warehouse_stock");
    const posInsert = corpo.indexOf("INSERT INTO public.warehouse_movements");
    expect(posUpdate).toBeGreaterThan(0);
    expect(posInsert).toBeGreaterThan(posUpdate);
  });

  it("SECURITY INVOKER: i permessi restano quelli che il client ha già", () => {
    const corpo = sql.split("FUNCTION public.warehouse_movimento_rapido(")[1].split("$function$;")[0];
    expect(corpo).toContain("SECURITY INVOKER");
    expect(corpo).not.toContain("SECURITY DEFINER");
  });

  it("una giacenza negativa è impossibile per vincolo, non per convenzione", () => {
    expect(sql).toMatch(/CHECK \(quantity >= 0\)/);
    expect(sql).toContain("warehouse_stock_quantity_non_negativa");
  });
});

describe("0.4 · cancellare una ricezione toglie quello che aveva aggiunto", () => {
  it("esiste il gesto contrario del carico automatico", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_auto_storno_stock_delete\s+BEFORE DELETE ON public\.goods_receipts/);
  });

  it("storna solo ciò che era stato caricato, con la stessa condizione dell'INSERT", () => {
    const corpo = sql.split("FUNCTION public.auto_storno_stock_on_receipt_delete()")[1].split("$function$;")[0];
    expect(corpo).toMatch(/NOT IN \('ok', 'partial'\)/);
    expect(corpo).toContain("FOR UPDATE");
    expect(corpo).toContain("'scarico'");
  });

  it("se la merce è già uscita toglie quello che c'è, e lo scrive nella nota", () => {
    const corpo = sql.split("FUNCTION public.auto_storno_stock_on_receipt_delete()")[1].split("$function$;")[0];
    expect(corpo).toMatch(/LEAST\(v_attuale, OLD\.quantity_received\)/);
    expect(corpo).toMatch(/in giacenza solo/);
  });
});

describe("0.4 · l'uscita da magazzino aveva lo stesso difetto, più piccolo", () => {
  it("register_warehouse_uscita blocca la riga prima di controllare la giacenza", () => {
    const corpo = sql.split("FUNCTION public.register_warehouse_uscita(")[1];
    expect(corpo).toMatch(/FROM public\.warehouse_stock WHERE id = v_item_id AND company_id = v_company_id\s+FOR UPDATE;/);
  });

  it("e non nasconde più lo sconfinamento con un clamp a zero", () => {
    const corpo = sql.split("FUNCTION public.register_warehouse_uscita(")[1];
    expect(corpo).toMatch(/SET quantity = quantity - v_qty, updated_at = now\(\)/);
    expect(corpo).not.toMatch(/GREATEST\(0, quantity - v_qty\)/);
  });
});

describe("0.4 · due trigger che rompevano operazioni vere", () => {
  it("il movimento iniziale cerca l'azienda in profiles, non in user_roles", () => {
    // user_roles ha solo (id, user_id, role): il fallback interrogava una
    // colonna inesistente e l'errore bloccava l'INSERT invece di essere assorbito
    expect(sql).toMatch(/FROM public\.profiles p WHERE p\.company_id = v_company/);
    const corpo = sql.split("FUNCTION public.warehouse_stock_ensure_initial_movement()")[1];
    expect(corpo).not.toMatch(/user_roles WHERE company_id/);
    // e tutto il corpo sta dentro il gestore di errore
    expect(corpo).toMatch(/BEGIN\s+BEGIN/);
  });

  it("nessun letterale non tipizzato concatenato a un array di testo", () => {
    // `text[] || 'letterale'` viene risolto come array||array e il letterale
    // esplode con 22P02, abortendo la transazione dell'utente. Ha rotto in
    // produzione lo scarico sotto scorta minima, il cambio stato commessa, il
    // completamento attività e il cambio stato ticket — e una funzione scritta
    // in questa stessa ondata.
    const nomi = readdirSync(DIR).filter((f) => f.startsWith("20280904"));
    expect(nomi.length).toBeGreaterThan(0);
    for (const nome of nomi) {
      // i commenti citano il difetto per spiegarlo: si guarda solo il codice
      const testo = readFileSync(resolve(DIR, nome), "utf8")
        .split("\n")
        .filter((riga) => !riga.trimStart().startsWith("--"))
        .join("\n");
      const sospetti = [...testo.matchAll(/(\w+)\s*:=\s*\1\s*\|\|\s*'[^']*'(?!::)/g)].map((m) => m[0]);
      expect(sospetti, `${nome}: letterale non tipizzato`).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.EIC_TEST_EMAIL ?? "";
const PASSWORD = process.env.EIC_TEST_PASSWORD ?? "";
const ATTIVA = URL_BASE.startsWith("https://") && CHIAVE.length > 40 && Boolean(EMAIL && PASSWORD);

describe.runIf(ATTIVA)("0.4 · due scarichi simultanei sulla stessa riga", () => {
  it("uno passa, l'altro è respinto, e il libro torna con la giacenza", async () => {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const tok = (await r.json()).access_token as string;
    expect(tok).toBeTruthy();
    const h = { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

    // Un articolo con giacenza sufficiente, scelto fra quelli esistenti: la
    // prova non crea né lascia nulla, e alla fine ripristina la giacenza.
    const articoli = await (
      await fetch(
        `${URL_BASE}/rest/v1/warehouse_stock?select=id,name,quantity&quantity=gte.5&limit=1`,
        { headers: h },
      )
    ).json();
    if (!Array.isArray(articoli) || articoli.length === 0) {
      expect.unreachable("nessun articolo con giacenza >= 5 su cui provare");
    }
    const item = articoli[0];
    const meta = Math.floor(Number(item.quantity) / 2) + 1; // due scarichi non ci stanno

    const movimento = (tipo: string, q: number) =>
      fetch(`${URL_BASE}/rest/v1/rpc/warehouse_movimento_rapido`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          p_stock_item_id: item.id, p_tipo: tipo, p_quantita: q,
          p_note: "prova automatica concorrenza",
        }),
      });

    const [a, b] = await Promise.all([movimento("scarico", meta), movimento("scarico", meta)]);
    const stati = [a.status, b.status].sort();
    expect(stati, "uno doveva passare e l'altro essere respinto").toEqual([200, 400]);

    const respinta = a.status === 400 ? a : b;
    expect(await respinta.text()).toContain("Giacenza insufficiente");

    // la giacenza è scesa una volta sola
    const dopo = await (
      await fetch(`${URL_BASE}/rest/v1/warehouse_stock?id=eq.${item.id}&select=quantity`, { headers: h })
    ).json();
    expect(Number(dopo[0].quantity)).toBe(Number(item.quantity) - meta);

    // ripristino
    const ripristino = await movimento("carico", meta);
    expect(ripristino.status).toBe(200);
    const finale = await (
      await fetch(`${URL_BASE}/rest/v1/warehouse_stock?id=eq.${item.id}&select=quantity`, { headers: h })
    ).json();
    expect(Number(finale[0].quantity)).toBe(Number(item.quantity));
  }, 90_000);

  it("una quantità nulla o negativa è rifiutata", async () => {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const tok = (await r.json()).access_token as string;
    const risposta = await fetch(`${URL_BASE}/rest/v1/rpc/warehouse_movimento_rapido`, {
      method: "POST",
      headers: { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_stock_item_id: "00000000-0000-0000-0000-000000000000",
        p_tipo: "scarico", p_quantita: 0,
      }),
    });
    expect(risposta.status).toBe(400);
    expect(await risposta.text()).toContain("maggiore di zero");
  }, 30_000);
});

describe.runIf(!ATTIVA)("0.4 · prova di concorrenza", () => {
  it("saltata: servono SUPABASE_URL, SUPABASE_ANON_KEY, EIC_TEST_EMAIL, EIC_TEST_PASSWORD", () => {
    expect(ATTIVA).toBe(false);
  });
});
