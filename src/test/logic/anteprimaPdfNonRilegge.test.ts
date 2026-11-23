/**
 * Il PDF a lato del preventivatore serramenti si rifà a ogni modifica. Qui si
 * controlla che ogni giro non ricominci daccapo: il listino si rilegge una
 * volta sola, le foto si convertono una volta sola, e una modifica che nel
 * documento non si vede non fa rifare niente.
 *
 * Misurato il 23/11/2026 su una sessione vera: 164 letture di listino in due
 * minuti e mezzo di lavoro su un solo preventivo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dimenticaCatalogoPdf, memoriaCatalogoPdf } from "@/lib/serramenti/memoriaCatalogoPdf";
import { chiaveAnteprimaPdf } from "@/lib/preventivatore/chiaveAnteprimaPdf";
import { chiaveImmagine, dimenticaImmaginiConvertite, toDataUrl } from "@/lib/serramenti/pdfImageUtils";

beforeEach(() => {
  dimenticaCatalogoPdf();
  dimenticaImmaginiConvertite();
});

describe("la memoria delle letture di listino", () => {
  it("l'anteprima legge una volta sola, anche se il PDF si rifà dieci volte", async () => {
    const leggi = vi.fn(async () => ({ data: [{ id: "f1" }] }));
    const memo = memoriaCatalogoPdf(false);
    for (let giro = 0; giro < 10; giro++) {
      expect(await memo("prodotti:azienda:f1", leggi)).toEqual({ data: [{ id: "f1" }] });
    }
    expect(leggi).toHaveBeenCalledTimes(1);
  });

  it("due richieste in volo insieme non diventano due letture", async () => {
    const leggi = vi.fn(async () => ({ data: [] }));
    const memo = memoriaCatalogoPdf(false);
    await Promise.all([memo("k", leggi), memo("k", leggi)]);
    expect(leggi).toHaveBeenCalledTimes(1);
  });

  it("chiavi diverse restano letture diverse", async () => {
    const leggi = vi.fn(async () => ({ data: [] }));
    const memo = memoriaCatalogoPdf(false);
    await memo("prodotti:a:f1", leggi);
    await memo("prodotti:a:f2", leggi);
    expect(leggi).toHaveBeenCalledTimes(2);
  });

  it("il documento vero («Scarica», «Invia al cliente») rilegge sempre tutto", async () => {
    const leggi = vi.fn(async () => ({ data: [] }));
    const memo = memoriaCatalogoPdf(true);
    await memo("prodotti:a:f1", leggi);
    await memo("prodotti:a:f1", leggi);
    expect(leggi).toHaveBeenCalledTimes(2);
  });

  it("una lettura andata male non resta in memoria, anche se non ha lanciato", async () => {
    // Supabase non lancia: torna { data: null, error }. Senza controllo,
    // l'anteprima avrebbe ripetuto lo stesso errore per un minuto.
    const leggi = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "permesso negato" } })
      .mockResolvedValue({ data: [{ id: "f1" }], error: null });
    const memo = memoriaCatalogoPdf(false);
    expect(await memo("k", leggi as () => Promise<unknown>)).toEqual({ data: null, error: { message: "permesso negato" } });
    expect(await memo("k", leggi as () => Promise<unknown>)).toEqual({ data: [{ id: "f1" }], error: null });
    expect(leggi).toHaveBeenCalledTimes(2);
  });

  it("una lettura fallita non resta in memoria: il giro dopo riprova", async () => {
    const leggi = vi.fn()
      .mockRejectedValueOnce(new Error("rete assente"))
      .mockResolvedValue({ data: [{ id: "f1" }] });
    const memo = memoriaCatalogoPdf(false);
    await expect(memo("k", leggi as () => Promise<unknown>)).rejects.toThrow("rete assente");
    expect(await memo("k", leggi as () => Promise<unknown>)).toEqual({ data: [{ id: "f1" }] });
    expect(leggi).toHaveBeenCalledTimes(2);
  });

  it("si dimentica tutto quando le prove svuotano le memorie", async () => {
    const leggi = vi.fn(async () => ({ data: [] }));
    const memo = memoriaCatalogoPdf(false);
    await memo("k", leggi);
    dimenticaCatalogoPdf();
    await memo("k", leggi);
    expect(leggi).toHaveBeenCalledTimes(2);
  });
});

describe("quando l'anteprima si rifà", () => {
  interface PreventivoDiProva {
    progetto: Record<string, unknown>;
    media: Array<{ id: string; url: string }>;
  }
  const preventivo = (dati: Record<string, unknown> = {}): PreventivoDiProva => ({
    progetto: { id: "p1", totale_max: 1000, updated_at: "2026-11-23T11:30:00Z", pdf_url: null, ...dati },
    media: [{ id: "m1", url: "https://db.example.com/storage/v1/object/sign/sr-progetti/foto.jpg?token=AAA" }],
  });

  it("il salvataggio automatico da solo non la fa rifare", () => {
    const prima = chiaveAnteprimaPdf(preventivo());
    const dopo = chiaveAnteprimaPdf(preventivo({ updated_at: "2026-11-23T11:30:02Z" }));
    expect(dopo).toBe(prima);
  });

  it("nemmeno la firma nuova sul link di una foto già vista", () => {
    const prima = chiaveAnteprimaPdf(preventivo());
    const stessaFotoRifirmata = {
      ...preventivo(),
      media: [{ id: "m1", url: "https://db.example.com/storage/v1/object/sign/sr-progetti/foto.jpg?token=BBB" }],
    };
    expect(chiaveAnteprimaPdf(stessaFotoRifirmata)).toBe(prima);
  });

  it("un prezzo diverso invece sì: quello nel PDF si vede", () => {
    expect(chiaveAnteprimaPdf(preventivo({ totale_max: 1200 }))).not.toBe(chiaveAnteprimaPdf(preventivo()));
  });

  it("e anche una foto diversa", () => {
    const altraFoto = {
      ...preventivo(),
      media: [{ id: "m1", url: "https://db.example.com/storage/v1/object/sign/sr-progetti/altra.jpg?token=AAA" }],
    };
    expect(chiaveAnteprimaPdf(altraFoto)).not.toBe(chiaveAnteprimaPdf(preventivo()));
  });
});

describe("le immagini del PDF", () => {
  it("la stessa foto firmata due volte è la stessa chiave", () => {
    const a = chiaveImmagine("https://db.example.com/storage/v1/object/sign/sr-progetti/foto.jpg?token=AAA");
    const b = chiaveImmagine("https://db.example.com/storage/v1/object/sign/sr-progetti/foto.jpg?token=BBB");
    expect(a).toBe(b);
  });

  it("due foto diverse restano due chiavi", () => {
    expect(chiaveImmagine("https://x/a.jpg?token=1")).not.toBe(chiaveImmagine("https://x/b.jpg?token=1"));
  });

  it("una foto irraggiungibile non si ritenta a ogni giro del PDF", async () => {
    let costruite = 0;
    class ImmagineFinta {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      naturalWidth = 0;
      naturalHeight = 0;
      constructor() { costruite++; }
      set src(_valore: string) { setTimeout(() => this.onerror?.(), 0); }
    }
    const originale = globalThis.Image;
    (globalThis as { Image: unknown }).Image = ImmagineFinta;
    try {
      const rotta = "https://db.example.com/storage/v1/object/sign/sr-progetti/rotta.jpg?token=AAA";
      expect(await toDataUrl(rotta)).toBeNull();
      expect(await toDataUrl(rotta)).toBeNull();
      expect(await toDataUrl(`${rotta.split("?")[0]}?token=BBB`)).toBeNull();
      expect(costruite).toBe(1);
    } finally {
      (globalThis as { Image: unknown }).Image = originale;
    }
  });
});

// ── Il giro vero: le pagine «Il sistema scelto» del PDF ───────────────────
const letture = vi.hoisted(() => ({ tabelle: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const risposte: Record<string, unknown[]> = {
    listino_schede_linea: [{ id: "s1", company_id: "az", chiave: "linea-x", nome: "Linea X", macrocategoria_id: "m1" }],
    article_families: [{ id: "f1", nome: "Finestra", categoria_id: "c1", macrocategoria_id: null }],
    article_family_axes: [],
    listino_categorie: [{ id: "c1", nome: "Finestre", macrocategoria_id: "m1" }],
    listino_macrocategorie: [{ id: "m1", nome: "Serramenti" }],
  };
  const catena = (tabella: string) => {
    letture.tabelle.push(tabella);
    const nodo: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: risposte[tabella] ?? [], error: null }).then(ok),
    };
    for (const metodo of ["select", "eq", "in", "order", "limit"]) nodo[metodo] = () => nodo;
    return nodo;
  };
  return { supabase: { from: catena } };
});

describe("le pagine del sistema scelto, giro dopo giro", () => {
  interface DetailDiProva {
    progetto: { id: string; company_id: string };
    serramenti: Array<{
      id: string; family_id: string; valori_assi: Record<string, string>;
      supplier_product_line_id: string | null; tipologia: string;
    }>;
    accessori: unknown[];
    media: unknown[];
    risparmio: null;
    servizi: unknown[];
  }
  const detail: DetailDiProva = {
    progetto: { id: "p1", company_id: "az" },
    serramenti: [{ id: "r1", family_id: "f1", valori_assi: {}, supplier_product_line_id: null, tipologia: "Finestra" }],
    accessori: [],
    media: [],
    risparmio: null,
    servizi: [],
  };

  it("l'anteprima legge il listino al primo giro e non più ai successivi", async () => {
    const { caricaLineeDedicate } = await import("@/hooks/useSerramentoPDF");
    const memo = memoriaCatalogoPdf(false);
    letture.tabelle = [];
    await caricaLineeDedicate("az", detail as never, memo);
    const primoGiro = [...letture.tabelle];
    expect(primoGiro.length).toBeGreaterThan(0);
    letture.tabelle = [];
    await caricaLineeDedicate("az", detail as never, memo);
    expect(letture.tabelle).toEqual([]);
  });

  it("il documento vero rilegge tutto, ogni volta", async () => {
    const { caricaLineeDedicate } = await import("@/hooks/useSerramentoPDF");
    const memo = memoriaCatalogoPdf(true);
    letture.tabelle = [];
    await caricaLineeDedicate("az", detail as never, memo);
    const primoGiro = letture.tabelle.length;
    letture.tabelle = [];
    await caricaLineeDedicate("az", detail as never, memo);
    expect(letture.tabelle.length).toBe(primoGiro);
  });
});
