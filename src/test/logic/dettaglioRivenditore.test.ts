import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { denoFinto } from "../helpers/edgeFinto";

const runtime = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({ from: runtime.from }),
}));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: "admin-demo", supabaseAdmin: { from: runtime.from } }),
}));

let handler: ((request: Request) => Response | Promise<Response>) | null = null;

beforeEach(async () => {
  runtime.from.mockImplementation((table: string) => {
    let columns = "";
    let column = "";
    let value = "";
    const query = {
      select: (fields: string) => { columns = fields; return query; },
      eq: (field: string, match: string) => { column = field; value = match; return query; },
      order: () => query,
      limit: () => query,
      single: async () => ({ data: { company_id: "produttore-demo" } }),
      maybeSingle: async () => {
        const row = {
          id: value,
          name: "Rivenditore " + value,
          parent_company_id: value === "interno" ? "produttore-demo" : "altro-produttore",
        } satisfies Record<string, string>;
        const selection = new Set(columns.split(",").map((entry) => entry.trim()));
        // PostgREST restituisce soltanto le colonne selezionate.
        return { data: Object.fromEntries(Object.entries(row).filter(([field]) => selection.has(field))) };
      },
      then: (resolve: (result: { data: unknown[]; count: number }) => void) => {
        const data = table === "user_roles" ? [{ role: "produttore_admin" }] : [];
        const count = table === "orders" && column === "company_id" && value === "interno" ? 2 : 0;
        return Promise.resolve({ data, count }).then(resolve);
      },
    };
    return query;
  });

  if (!handler) {
    const deno = denoFinto();
    vi.stubGlobal("Deno", deno.finto);
    const endpoint = "../../../supabase/functions/get-reseller-detail/index.ts";
    await import(/* @vite-ignore */ endpoint);
    handler = deno.gestore();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function dettaglio(id: string) {
  return handler!(new Request("https://produttore.ediliziaincloud.com/functions/v1/get-reseller-detail", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://produttore.ediliziaincloud.com" },
    body: JSON.stringify({ reseller_id: id }),
  }));
}

it("mostra il conteggio delle commesse di un rivenditore del produttore autenticato", async () => {
  const response = await dettaglio("interno");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    reseller: { id: "interno" },
    counts: { orders: 2 },
  });
});

it("vieta di aprire il dettaglio di un rivenditore di un altro produttore", async () => {
  const response = await dettaglio("esterno");
  expect(response.status).toBe(403);
  expect(runtime.from).not.toHaveBeenCalledWith("orders");
});
