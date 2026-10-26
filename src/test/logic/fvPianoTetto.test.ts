/**
 * Il piano di posa dei pannelli sul tetto (25/10/2026): la geometria in scala, la lettura del piano salvato e la
 * pagina del PDF. Il piano si disegna solo su richiesta: senza, il PDF non ha la pagina.
 */
import { describe, expect, it } from "vitest";
import {
  MODULO_RIFERIMENTO, PIANO_ALTEZZA, PIANO_LARGHEZZA, colonneSuggerite, disponiPannelli, leggiPiano,
  metriPerPunto, metriTesto, pianoIniziale, svgPannelli,
} from "../../../supabase/functions/_shared/fvPianoTetto.ts";
import { FV_PDF_PAGES_META, normalizeFvPdfPagesOrder } from "../../../supabase/functions/_shared/fvPagine.ts";
import { getFvPdfRenderedPagesCount, renderFvPdfHtml, type FvPdfTemplateData } from "../../../supabase/functions/_shared/fvHtmlTemplate.ts";
import { calcolaEnergyFlows } from "../../../supabase/functions/_shared/fvCalcoli.ts";

describe("scala della vista", () => {
  it("a zoom 20 i metri per punto seguono la latitudine (Web Mercator)", () => {
    expect(metriPerPunto(0)).toBeCloseTo(0.1493, 3);
    expect(metriPerPunto(42.5)).toBeCloseTo(0.1493 * Math.cos((42.5 * Math.PI) / 180), 3);
    expect(metriPerPunto(60)).toBeLessThan(metriPerPunto(30));
  });
});

describe("il piano salvato", () => {
  it("un piano in metri si legge; i vecchi piani in percentuale, senza unità, non sono in scala e si ignorano", () => {
    expect(leggiPiano({ x: 2, y: -3, rot: 15, cols: 6, unita: "m", orient: "o" })).toEqual({ x: 2, y: -3, rot: 15, cols: 6, unita: "m", orient: "o" });
    expect(leggiPiano({ x: 5, y: -3, rot: 12, cols: 4 })).toBeNull();
    expect(leggiPiano(null)).toBeNull();
    expect(leggiPiano("x")).toBeNull();
    expect(leggiPiano({ x: "2", y: 0, rot: 0, cols: 3, unita: "m" })).toBeNull();
  });

  it("valori fuori misura rientrano nei limiti; l'orientamento sconosciuto è «in verticale»", () => {
    const p = leggiPiano({ x: 900, y: -900, rot: 400, cols: 99, unita: "m", orient: "?" })!;
    expect(p).toEqual({ x: 60, y: -60, rot: 180, cols: 40, unita: "m", orient: "v" });
  });

  it("si parte al centro, dritto, in verticale, con una disposizione larga più che alta", () => {
    expect(pianoIniziale(12)).toEqual({ x: 0, y: 0, rot: 0, cols: 5, unita: "m", orient: "v" });
    expect(colonneSuggerite(1)).toBe(1);
    expect(colonneSuggerite(3)).toBeLessThanOrEqual(3);
    expect(colonneSuggerite(24)).toBe(6);
  });
});

describe("moduli disegnati in scala", () => {
  const mpp = metriPerPunto(42);
  const piano = pianoIniziale(12);

  it("tanti moduli quanti scelti, ognuno grande quanto un modulo vero, fra loro due centimetri", () => {
    const d = disponiPannelli({ moduli: 12, piano: { ...piano, cols: 4 }, metriPerPuntoVista: mpp });
    expect(d.pannelli).toHaveLength(12);
    expect(d.righe).toBe(3);
    expect(d.pannelli[0].w * mpp).toBeCloseTo(MODULO_RIFERIMENTO.larghezza_m, 6);
    expect(d.pannelli[0].h * mpp).toBeCloseTo(MODULO_RIFERIMENTO.altezza_m, 6);
    expect(d.larghezzaM).toBeCloseTo(4 * 1.134 + 3 * 0.02, 6);
    expect(d.altezzaM).toBeCloseTo(3 * 1.722 + 2 * 0.02, 6);
    expect(d.areaM2).toBeCloseTo(12 * 1.134 * 1.722, 6);
  });

  it("in orizzontale larghezza e altezza si scambiano", () => {
    const d = disponiPannelli({ moduli: 6, piano: { ...piano, cols: 3, orient: "o" }, metriPerPuntoVista: mpp });
    expect(d.pannelli[0].w * mpp).toBeCloseTo(1.722, 6);
    expect(d.pannelli[0].h * mpp).toBeCloseTo(1.134, 6);
  });

  it("l'ultima fila può essere incompleta: 10 moduli in 4 colonne sono 3 file", () => {
    const d = disponiPannelli({ moduli: 10, piano: { ...piano, cols: 4 }, metriPerPuntoVista: mpp });
    expect(d.pannelli).toHaveLength(10);
    expect(d.righe).toBe(3);
  });

  it("il centro segue lo spostamento in metri dal centro della vista", () => {
    const d = disponiPannelli({ moduli: 4, piano: { ...piano, x: 3, y: -1.5 }, metriPerPuntoVista: mpp });
    expect(d.cx).toBeCloseTo(PIANO_LARGHEZZA / 2 + 3 / mpp, 6);
    expect(d.cy).toBeCloseTo(PIANO_ALTEZZA / 2 - 1.5 / mpp, 6);
  });

  it("dice se i moduli escono dalla vista: al centro stanno, spostati di 40 metri no", () => {
    expect(disponiPannelli({ moduli: 12, piano, metriPerPuntoVista: mpp }).fuori).toBe(false);
    expect(disponiPannelli({ moduli: 12, piano: { ...piano, x: 40 }, metriPerPuntoVista: mpp }).fuori).toBe(true);
    expect(disponiPannelli({ moduli: 0, piano, metriPerPuntoVista: mpp }).fuori).toBe(false);
  });

  it("anche ruotando l'ingombro si controlla sugli angoli veri: una fila lunga ruotata di 90° esce in altezza", () => {
    const lunga = { ...piano, cols: 40, orient: "o" as const };
    expect(disponiPannelli({ moduli: 40, piano: lunga, metriPerPuntoVista: mpp }).fuori).toBe(false);
    expect(disponiPannelli({ moduli: 40, piano: { ...lunga, rot: 90 }, metriPerPuntoVista: mpp }).fuori).toBe(true);
  });

  it("l'SVG ha un rettangolo per modulo dentro un gruppo ruotato; senza moduli è vuoto", () => {
    const d = disponiPannelli({ moduli: 5, piano: { ...piano, cols: 5, rot: 20 }, metriPerPuntoVista: mpp });
    const svg = svgPannelli(d);
    expect(svg.match(/<rect /g)).toHaveLength(5);
    expect(svg).toContain("rotate(20)");
    expect(svgPannelli(disponiPannelli({ moduli: 0, piano, metriPerPuntoVista: mpp }))).toBe("");
  });

  it("le lunghezze si scrivono in italiano", () => {
    expect(metriTesto(12.44)).toBe("12,4 m");
    expect(metriTesto(3)).toBe("3 m");
  });
});

describe("pagina del piano nel PDF", () => {
  const dati = (piano: FvPdfTemplateData["piano_tetto"]): FvPdfTemplateData => ({
    azienda: { name: "Demo Solar", phone: "02 1", email: "a@b.it", website: "https://e.it", vat_number: "IT1" },
    cliente: { nome: "Mario", cognome: "Rossi", indirizzo: "Via Roma 1", comune: "Terni", cap: "05100", provincia: "TR", tipologia_immobile: "Abitazione" },
    progetto: { numero: "FV-1", titolo: "Mario Rossi", creato_il: "2026-10-05T10:00:00Z", valido_giorni: 30, potenza_kwp: 6, numero_pannelli: 12, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, costo_kwh_attuale: 0.32, profilo_consumo: "misto", ore_sole_annue: 1500, superficie_tetto_disponibile_mq: null, azimut: "SE 152°", inclinazione_tetto: 25 },
    costi: { prezzo_vendita_iva_inclusa: 12345.67, iva_perc: 10, detrazione_eur: 6173, detrazione_perc: 50, costo_netto_dopo_detrazione: 6173 },
    finanziamento: null,
    modalita_pagamento: null,
    scenario: { risparmio_mensile_eur: 100, risparmio_anno1_eur: 1205, risparmio_25_anni_eur: 20000, payback_anni: 9.4, npv_25_anni: 8000, cassa_anno_per_anno: [{ anno: 0, cumulato: -12345.67 }, { anno: 25, cumulato: 20000 }] },
    flows: calcolaEnergyFlows({ potenza_kwp: 6, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, ore_sole_annue: 1500, produzione_kwh: 6808.5, autoconsumo_pct: 0.35 }),
    componenti: [{ categoria: "pannello", descrizione: "Pannello 500 W", quantita: 12, potenza_w: 500, garanzia_anni: 25 }],
    piano_tetto: piano,
  } as unknown as FvPdfTemplateData);

  const PIANO = { img: "data:image/png;base64,AAAA", piano: { x: 1, y: 0, rot: 10, cols: 4, unita: "m" as const, orient: "v" as const }, latitudine: 42.56, moduli: 12, kwp: 6 };

  it("la pagina è tra quelle del modello, dopo l'anteprima, accesa di serie", () => {
    const ids = FV_PDF_PAGES_META.map((p) => p.id);
    expect(ids.indexOf("piano_tetto")).toBe(ids.indexOf("anteprima") + 1);
    expect(normalizeFvPdfPagesOrder(null).find((p) => p.id === "piano_tetto")?.visible).toBe(true);
  });

  it("col piano disegnato esce una pagina in più, con moduli, ingombro, scala e nord", () => {
    const senza = dati(null);
    const con = dati(PIANO);
    expect(getFvPdfRenderedPagesCount(con)).toBe(getFvPdfRenderedPagesCount(senza) + 1);
    const html = renderFvPdfHtml(con);
    expect(html).toContain("Piano di posa");
    expect(html).toContain("Dove vanno");
    expect(html.match(/data-fv-section="piano_tetto"/g)).toHaveLength(1);
    expect(html).toContain('width="640" height="400"');
    expect((html.match(/rx="1" fill="rgba\(37,99,235,0.78\)"/g) ?? []).length).toBe(12);
    expect(html).toContain("5 m");
    expect(html).toContain("SE 152°");
    expect(html).toContain("1,13 × 1,72 m");
  });

  it("senza piano, o senza la vista satellitare, la pagina non c'è", () => {
    expect(renderFvPdfHtml(dati(null))).not.toContain("Piano di posa");
    expect(renderFvPdfHtml(dati({ ...PIANO, img: "" }))).not.toContain("Piano di posa");
    expect(renderFvPdfHtml(dati({ ...PIANO, moduli: 0 }))).not.toContain("Piano di posa");
  });
});
