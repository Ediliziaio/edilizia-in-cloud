import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import {
  readRenderFilters,
  writeRenderFilters,
} from "@/lib/render/renderArchiveFilters";
import { renderArchiveReturn } from "@/lib/render/renderNavigation";
import {
  normalizeStoredRender,
  loadStoredRender,
  renderVariantKey,
} from "@/lib/render/renderSessionData";
import { renderSessionSource } from "@/lib/render/renderSources";
import {
  savedRenderChoices,
  savedRenderSamples,
} from "@/lib/render/renderSavedChoices";
import { loadRenderHistoryPage } from "@/lib/render/renderHistory";
import { appendRenderMetadataPages } from "@/lib/render/renderPdf";
import {
  leggiFiltriElenco,
  scriviFiltriElenco,
} from "@/lib/planimetrie/elenco";
const db = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
  select: vi.fn(),
  data: [] as unknown[],
  count: 193,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from },
}));
vi.mock("@/lib/render/renderGalleryMeta", () => ({
  loadRenderGalleryMeta: async () => ({}),
  resolveRenderGalleryMeta: () => ({}),
}));
vi.mock("@/lib/render/renderPlanOrigin", async (original) => ({
  ...(await original<object>()),
  loadRenderPlanOrigins: async () => ({}),
}));
beforeEach(() => {
  vi.clearAllMocks();
  db.data = [];
  const q = {
    select: db.select,
    eq: db.eq,
    range: db.range,
    order: () => q,
    abortSignal: () => q,
    maybeSingle: async () => ({
      data: db.data[0] ?? null,
      error: null as null,
    }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: db.data, error: null, count: db.count }).then(
        resolve,
      ),
  };
  for (const fn of [db.from, db.select, db.eq, db.range]) fn.mockReturnValue(q);
});
const modules = [
  "infissi",
  "bagno",
  "stanza",
  "facciata",
  "pavimento",
  "persiane",
  "tetto",
  "pergole",
  "piscine",
  "ristrutturazioni",
  "pavimenti-esterni",
  "giardini",
  "porte-blindate",
  "porte-interne",
];

describe("Archivio e provenienza dei render", () => {
  it("conserva filtri, data, progetto e pagina e rifiuta date e ritorni non validi", () => {
    const filters = readRenderFilters(
      new URLSearchParams(
        "q=rovere&stato=failed&progetto=p1&vista=projects&pagina=8&dal=2026-11-01&al=2026-11-10",
      ),
    );
    expect(
      readRenderFilters(
        writeRenderFilters(new URLSearchParams("estraneo=si"), filters),
      ),
    ).toEqual(filters);
    expect(
      readRenderFilters(
        new URLSearchParams("dal=2026-02-30&pagina=-1&vista=bad&stato=bad"),
      ),
    ).toMatchObject({ from: "", page: 1, view: "grid", status: "completed" });
    expect(
      renderArchiveReturn("/azienda/render/stanza/gallery?q=bagno&pagina=4"),
    ).toBe("/azienda/render/stanza/gallery?q=bagno&pagina=4");
    for (const path of [
      "https://evil.test",
      "//evil.test",
      "/azienda/render/../../login",
      "/azienda/render/infissi/new",
    ])
      expect(renderArchiveReturn(path)).toBe("/azienda/render");
  });
  it("mantiene il contesto dell’elenco delle piante senza accettare parametri sconosciuti come filtri", () => {
    const params = scriviFiltriElenco(new URLSearchParams("vista=elenco"), {
      ricerca: "Rossi",
      stato: "in_uso",
      pagina: 3,
      ordine: "nome",
    });
    expect(params.get("vista")).toBe("elenco");
    expect(leggiFiltriElenco(params)).toMatchObject({
      ricerca: "Rossi",
      stato: "in_uso",
      pagina: 3,
      ordine: "nome",
    });
    expect(
      leggiFiltriElenco(
        new URLSearchParams("stato=falso&collegamento=falso&pagina=NaN"),
      ),
    ).toMatchObject({ stato: "attive", collegamento: "tutti", pagina: 0 });
  });
  it.each(modules)(
    "carica %s solo dall’azienda corrente e dalla sua sorgente",
    async (module) => {
      const source = renderSessionSource(module);
      db.data = [
        {
          id: "r1",
          status: "completed",
          stato: "completato",
          created_at: "2026-11-10",
          config: { materiale: "Rovere" },
          configurazione: { materiale: "Travertino" },
          result_urls: ["saved.png"],
          render_result_url: "bath.png",
        },
      ];
      const session = await loadStoredRender("azienda-A", module, "r1");
      expect(db.from).toHaveBeenCalledWith(source.table);
      expect(db.eq).toHaveBeenCalledWith("company_id", "azienda-A");
      expect(db.eq).toHaveBeenCalledWith("id", "r1");
      if (source.technical)
        expect(db.eq).toHaveBeenCalledWith("module_type", module);
      expect(session?.results).toEqual([
        module === "bagno" ? "bath.png" : "saved.png",
      ]);
      expect(db.select.mock.calls[0][0]).not.toMatch(/prompt|cost|provider/);
    },
  );
  it("risolve la configurazione fotografata al salvataggio, senza inventare scelte mancanti", () => {
    const session = normalizeStoredRender("pergole", {
      id: "r",
      config: { materiale: "Nuovo" },
      config_snapshot: {
        materiale: "Legno originale",
        isMotorized: false,
        larghezza: 0,
      },
      result_urls: [null, "", "actual.png"],
    });
    expect(session.results).toEqual(["actual.png"]);
    const values = savedRenderChoices(session.config).map(
      (entry) => entry.value,
    );
    expect(values).toEqual(["Legno originale", "No", "0"]);
    expect(savedRenderChoices({})).toEqual([]);
    expect(
      savedRenderSamples({
        pavimento: { attivo: true, tipo: "gres_porcellanato" },
      }),
    ).toEqual([]);
    expect(savedRenderSamples({ pavimento: { attivo: true } })).toEqual([]);
    expect(
      savedRenderChoices({
        pavimento: { attivo: false, tipo: "Gres" },
        provider: { material: "segreto" },
        technical_specification: [
          {
            material: "PVC",
            promptFragment: "segreto",
            finish: { name: "Rovere" },
          },
        ],
      }).map((entry) => entry.value),
    ).toEqual(["PVC", "Rovere"]);
  });
  it("non confonde stanze omonime, versioni, piani e sorgenti differenti", () => {
    const base = normalizeStoredRender("stanza", {
      id: "r",
      config: {
        planimetria: {
          planimetria_id: "p1",
          locale_id: "a",
          locale_nome: "Bagno",
          versione: 3,
          livello_id: "pt",
          ambito: "fatto",
        },
      },
    });
    const plan = base.config.planimetria as object;
    for (const patch of [
      { locale_id: "b" },
      { versione: 4 },
      { livello_id: "p1" },
      { ambito: "progetto:A" },
      { planimetria_id: "p2" },
    ])
      expect(
        renderVariantKey({
          ...base,
          config: { planimetria: { ...plan, ...patch } },
        }),
      ).not.toBe(renderVariantKey(base));
    expect(
      renderVariantKey({ ...base, config: {}, originalPath: null }),
    ).toBeNull();
  });
  it("legge anche oltre i primi 96 render, con ordine stabile e conteggio totale", async () => {
    db.data = [{ id: "r193", render_type: "stanza", status: "completed" }];
    const page = await loadRenderHistoryPage("azienda-A", "stanza", 192);
    expect(db.range).toHaveBeenCalledWith(192, 287);
    expect(db.eq).toHaveBeenCalledWith("render_type", "stanza");
    expect(page.rows[0].id).toBe("r193");
    expect(page.total).toBe(193);
    expect(page.next).toBeUndefined();
  });
  it("esporta tutte le scelte su più pagine e nasconde i dettagli interni", async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Verifica impaginazione - scelte del render", 12, 20);
    appendRenderMetadataPages(
      doc,
      [
        { label: "Pavimento", value: "Rovere naturale opaco" },
        {
          label: "Note",
          value: "Finitura e posa conservate nel progetto. ".repeat(500),
        },
        { label: "Provider", value: "DATOSEGRETO" },
        { label: "Ultima scelta", value: "ULTIMAVOCE" },
      ],
      "Progetto dimostrativo - materiali salvati",
    );
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(doc.output()).toContain("ULTIMAVOCE");
    expect(doc.output()).not.toContain("DATOSEGRETO");
    if (process.env.RENDER_PDF_PROOF) {
      const fs = await import("node:fs/promises");
      await fs.writeFile(
        process.env.RENDER_PDF_PROOF,
        new Uint8Array(doc.output("arraybuffer")),
      );
    }
  });
});
