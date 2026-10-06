/**
 * Prima del PDF, in tutti gli otto moduli edili, la foto del prodotto del listino diventa
 * un'immagine incorporata in miniatura (06/10/2026): react-pdf non ha timeout e legge solo
 * JPG e PNG, un link da scaricare lascerebbe il PDF appeso. La descrizione resta com'è, e le
 * righe senza foto non si toccano. Si prova la funzione vera di ogni modulo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const { conversioni } = vi.hoisted(() => ({ conversioni: [] as Array<{ url: string; latoMax?: number }> }));

vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catena: any = new Proxy({}, {
    get: (_t, nome) => (nome === "then"
      ? (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as null }).then(ok)
      : () => catena),
  });
  const nulla = () => Promise.resolve({ data: null as null, error: null as null });
  return {
    supabase: {
      from: () => catena, rpc: nulla, functions: { invoke: nulla },
      storage: { from: () => ({ createSignedUrl: nulla, createSignedUrls: () => Promise.resolve({ data: [] as unknown[], error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});
vi.mock("@/lib/serramenti/pdfImageUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/serramenti/pdfImageUtils")>()),
  toDataUrl: async (url: string | null | undefined, opzioni?: { latoMax?: number }) => {
    if (!url) return null;
    conversioni.push({ url, latoMax: opzioni?.latoMax });
    return url.includes("rotta") ? null : "data:image/jpeg;base64,/9j/4AAQ";
  },
}));

const MODULI: Array<{ slug: string; funzione: string; hook: () => Promise<Record<string, unknown>> }> = [
  { slug: "bagni", funzione: "enrichBagniPdf", hook: () => import("@/hooks/useBagniPDF") },
  { slug: "tetti", funzione: "enrichTettiPdf", hook: () => import("@/hooks/useTettiPDF") },
  { slug: "climatizzazione", funzione: "enrichClimatizzazionePdf", hook: () => import("@/hooks/useClimatizzazionePDF") },
  { slug: "elettrico", funzione: "enrichElettricoPdf", hook: () => import("@/hooks/useElettricoPDF") },
  { slug: "termoidraulico", funzione: "enrichTermoidraulicoPdf", hook: () => import("@/hooks/useTermoidraulicoPDF") },
  { slug: "pavimenti", funzione: "enrichPavimentiPdf", hook: () => import("@/hooks/usePavimentiPDF") },
  { slug: "piscine", funzione: "enrichPiscinePdf", hook: () => import("@/hooks/usePiscinePDF") },
  { slug: "ristrutturazione", funzione: "enrichRistrutturazionePdf", hook: () => import("@/hooks/useRistrutturazionePDF") },
];

const voce = (id: string, descrizione: string, extra: Record<string, unknown> = {}) => ({
  id, progetto_id: "p1", company_id: "c1", capitolo_nome: "Sanitari", descrizione, unita_misura: "cad", quantita: 1, prezzo_unitario: 235,
  costo_materiali: 130, costo_manodopera: 0, sconto_pct: 0, importo: 235, margine_eur: 105, margine_pct: 44.7, listino_voce_id: null as string | null,
  fonte: null as string | null, ordine: 0, ...extra,
});

beforeEach(() => { conversioni.length = 0; });

describe.each(MODULI)("PDF di $slug: le foto dei prodotti", ({ funzione, hook }) => {
  it("la foto del prodotto diventa un'immagine incorporata in miniatura; la descrizione resta; le altre righe non si toccano", async () => {
    const modulo = await hook();
    const enrich = modulo[funzione] as (o: unknown) => Promise<{ capitoli: Array<{ voci: Array<Record<string, unknown>> }> }>;
    const computo = [
      voce("p", "Piatto doccia", { immagine_url: "/templates/bagno/products/piatto.webp", descrizione_estesa: "Antiscivolo, finitura pietra.", famiglia_id: "f1" }),
      voce("r", "Rubinetto", { immagine_url: "/templates/bagno/products/rotta.webp", descrizione_estesa: "Monocomando." }),
      voce("l", "Posa e collaudo"),
    ];
    const risultato = await enrich({
      progetto: { id: "p1", company_id: "c1", code: "X-1", sconto_pct: 0, iva_pct: 10, detrazione_pct: 0 },
      computo, media: [], template: { company_id: "c1" }, company: { name: "Bianchi" },
    });
    const voci = risultato.capitoli.flatMap((c) => c.voci);
    const per = (id: string) => voci.find((v) => v.id === id)!;
    expect(per("p").immagine_url).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect(per("p").descrizione_estesa).toBe("Antiscivolo, finitura pietra.");
    expect(per("p").famiglia_id).toBe("f1");
    // La foto che non si carica non c'è: nel PDF mai un link da scaricare.
    expect(per("r").immagine_url).toBeNull();
    expect(per("r").descrizione_estesa).toBe("Monocomando.");
    // La riga senza foto è quella di prima.
    expect(per("l")).toEqual(computo[2]);
    // Miniature, non foto a piena risoluzione.
    const delleVoci = conversioni.filter((c) => c.url.includes("/products/"));
    expect(delleVoci.length).toBe(2);
    for (const c of delleVoci) expect(c.latoMax).toBeLessThanOrEqual(400);
  });
});
