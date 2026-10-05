import { describe, expect, it } from "vitest";
import {
  BLACK_AND_WHITE_RULE,
  MAX_SHARED_REFERENCES,
  buildReferenceLabel,
  isBlackAndWhite,
  listReferencePaths,
  pickReferences,
  type PhotoEntry,
  type ReferenceCandidate,
} from "../../../shared/render-references/referencePicker.ts";

const forma = (filename: string, text = "a frameless walk-in shower"): PhotoEntry => ({ folder: "bathroom", filename, text });
const materia = (filename: string, text = "polished white marble with grey veining"): PhotoEntry => ({ folder: "bathroom", filename, text });
const cand = (priority: number, key: string, entry: PhotoEntry, role = "SHOWER TYPE TARGET"): ReferenceCandidate => ({ priority, role, key, entry });

describe("referencePicker: scelta delle foto condivise", () => {
  it("il tetto condiviso è 3 (il tetto totale di 4 immagini lo applicano i generate-*-render)", () => {
    expect(MAX_SHARED_REFERENCES).toBe(3);
  });

  it("vince la priorità più bassa; a parità vale l'ordine d'ingresso", () => {
    const refs = pickReferences([
      cand(20, "c", forma("C-BN.webp")),
      cand(10, "a", forma("A-BN.webp")),
      cand(10, "b", forma("B-BN.webp")),
    ]);
    expect(refs.map((r) => r.filename)).toEqual(["A-BN.webp", "B-BN.webp", "C-BN.webp"]);
  });

  it("si ferma al massimo richiesto", () => {
    const quattro = [1, 2, 3, 4].map((n) => cand(n, `k${n}`, forma(`F${n}-BN.webp`)));
    expect(pickReferences(quattro)).toHaveLength(MAX_SHARED_REFERENCES);
    expect(pickReferences(quattro, 2)).toHaveLength(2);
    expect(pickReferences(quattro, 0)).toHaveLength(0);
  });

  it("la stessa foto non entra due volte: resta quella più importante", () => {
    const refs = pickReferences([
      cand(30, "integrato", forma("Mobile-Sospeso-BN.webp"), "BASIN TYPE TARGET"),
      cand(10, "sospeso_moderno", forma("Mobile-Sospeso-BN.webp"), "VANITY STYLE TARGET"),
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toMatch(/^VANITY STYLE TARGET — sospeso_moderno/);
  });

  it("due cartelle con lo stesso nome file sono foto diverse", () => {
    const refs = pickReferences([
      cand(1, "a", { folder: "bathroom", filename: "Stesso.webp", text: "x" }),
      cand(2, "b", { folder: "floors", filename: "Stesso.webp", text: "y" }),
    ]);
    expect(refs.map((r) => r.folder)).toEqual(["bathroom", "floors"]);
  });

  it("l'URL punta alla cartella della voce, non a quella del modulo", () => {
    const [ref] = pickReferences([cand(1, "a", { folder: "exterior", filename: "Masselli-Autobloccanti.webp", text: "interlocking pavers" })]);
    expect(ref.url).toMatch(/\/render-references\/exterior\/Masselli-Autobloccanti\.webp$/);
  });

  it("nessuna candidata → nessuna foto", () => {
    expect(pickReferences([])).toEqual([]);
  });
});

describe("referencePicker: etichette e regola bianco/nero", () => {
  it("il file «-BN.webp» è di forma: l'etichetta dice di copiare solo la forma", () => {
    expect(isBlackAndWhite(forma("Walk-In-BN.webp"))).toBe(true);
    const label = buildReferenceLabel(cand(1, "walk_in", forma("Walk-In-BN.webp")));
    expect(label).toBe(`SHOWER TYPE TARGET — walk_in: a frameless walk-in shower. Copy the shape and construction only — ${BLACK_AND_WHITE_RULE}`);
  });

  it("un file a colori è di materia: copia superficie e scala, il tono lo detta il testo", () => {
    expect(isBlackAndWhite(materia("Marmo-Carrara.webp"))).toBe(false);
    const label = buildReferenceLabel(cand(1, "marmo_carrara", materia("Marmo-Carrara.webp"), "WALL TILE EFFECT TARGET"));
    expect(label).toMatch(/^WALL TILE EFFECT TARGET — marmo_carrara: polished white marble/);
    expect(label).toMatch(/Copy the surface, pattern and scale; the exact colour tone comes from the written specification$/);
    expect(label).not.toMatch(/black-and-white/);
  });

  it("`bn` esplicito vince sul nome del file (foto vecchie convertite prima della regola)", () => {
    expect(isBlackAndWhite({ filename: "Vecchia-Foto.webp", bn: true })).toBe(true);
    expect(isBlackAndWhite({ filename: "Nuova-BN.webp", bn: false })).toBe(false);
  });

  it("una frase finale propria sostituisce quella di default", () => {
    const c: ReferenceCandidate = { ...cand(1, "coppi", materia("Coppi.webp")), copy: "Do NOT copy this building." };
    expect(buildReferenceLabel(c).endsWith("Do NOT copy this building.")).toBe(true);
    expect(buildReferenceLabel(c)).not.toMatch(/exact colour tone/);
  });

  it("nelle etichette di forma il testo della foto non porta colori: lo dice la regola, i test di libreria lo verificano", () => {
    // l'etichetta di una foto B/N contiene sempre la clausola che rimanda il colore al testo
    expect(buildReferenceLabel(cand(1, "x", forma("X-BN.webp")))).toContain("colour, finish and material come from the written specification");
  });
});

describe("referencePicker: elenco dei percorsi dichiarati", () => {
  it("restituisce «cartella/file» senza doppioni, per voci singole e liste", () => {
    const paths = listReferencePaths(
      { a: forma("A-BN.webp"), b: forma("A-BN.webp") },
      { c: [{ folder: "pools", filename: "P1.webp", text: "t" }, { folder: "pools", filename: "P2.webp", text: "t" }] },
    );
    expect(paths.sort()).toEqual(["bathroom/A-BN.webp", "pools/P1.webp", "pools/P2.webp"]);
  });
});
