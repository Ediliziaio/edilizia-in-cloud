/**
 * Il «Piano dei lavori»: il documento unico degli otto preventivatori edili.
 * Qui le regole che non si vedono a occhio finché non si rompono: i nomi dei campi
 * che cambiano da modulo a modulo, il titolo con la parola in corsivo, i numeri
 * doppi, le durate, la tinta della copertina, la foto di serie.
 */
import { describe, expect, it } from "vitest";
import { giorniDellaDurata, senzaNumeroDavanti, spezzaAccento } from "@/components/preventivi/pdf/testoDocumento";
import { coloreDelDocumento, costruisciDatiEdile, leggiModello, type AziendaComune, type ProgettoComune, type VoceComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { coloriCopertina, copertinaInTinta, creaTema } from "@/components/preventivi/pdf/temaDocumento";
import { COPERTINA_DI_SERIE } from "@/components/preventivi/pdf/immaginiDocumento";
import { contrasto } from "../../../supabase/functions/_shared/temaColori";
import { inScalaDiGrigi } from "@/lib/serramenti/pdfImageUtils";

const PROGETTO: ProgettoComune = {
  code: "RST-2026-014", tipo_intervento: "Ristrutturazione completa",
  cliente_nome: "Mario", cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
  immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
};
const TOTALI = {
  imponibileLordo: 1000, scontoEur: 0, scontoPct: 0, imponibile: 1000, iva: 100, ivaPct: 10, totale: 1100,
  detrazionePct: 0, detrazioneEur: 0, costoTot: 600, margineEur: 400, marginePct: 40,
};

describe("titolo con la parola in corsivo", () => {
  it("spezza sugli asterischi", () => {
    expect(spezzaAccento("Il *progetto* per la tua casa.")).toEqual([
      { testo: "Il ", accento: false },
      { testo: "progetto", accento: true },
      { testo: " per la tua casa.", accento: false },
    ]);
  });

  it("un titolo senza asterischi resta intero (quelli già scritti dalle aziende non cambiano)", () => {
    expect(spezzaAccento("Il tuo progetto di ristrutturazione")).toEqual([
      { testo: "Il tuo progetto di ristrutturazione", accento: false },
    ]);
  });

  it("ogni modulo ha un titolo di serie con una parola in corsivo, e nessuno dice «Preventivo di …»", () => {
    for (const m of Object.values(MODULI_EDILI)) {
      expect(spezzaAccento(m.titoloCopertina).filter((p) => p.accento)).toHaveLength(1);
      expect(m.titoloCopertina).not.toMatch(/^Preventivo di /);
    }
    // Il sottotitolo di serie parla del mestiere giusto (era «La tua casa, rinnovata» anche sulle piscine).
    expect(MODULI_EDILI.piscine.sottotitoloCopertina).toMatch(/piscina/i);
    expect(MODULI_EDILI.elettrico.sottotitoloCopertina).toMatch(/elettrico/i);
  });
});

describe("numeri doppi e durate", () => {
  it("toglie il numero scritto a mano davanti al titolo: lo mette già l'impaginazione", () => {
    expect(senzaNumeroDavanti("1. Sopralluogo")).toBe("Sopralluogo");
    expect(senzaNumeroDavanti("02) Preventivo")).toBe("Preventivo");
    expect(senzaNumeroDavanti("3 - Cantiere")).toBe("Cantiere");
    expect(senzaNumeroDavanti("Consegna")).toBe("Consegna");
    // Un numero che fa parte del titolo resta.
    expect(senzaNumeroDavanti("110% di attenzione")).toBe("110% di attenzione");
  });

  it("legge le durate scritte a mano", () => {
    expect(giorniDellaDurata("1 settimana")).toBe(7);
    expect(giorniDellaDurata("2 settimane")).toBe(14);
    expect(giorniDellaDurata("2-3 settimane")).toBe(17.5);
    expect(giorniDellaDurata("2 giorni")).toBe(2);
    expect(giorniDellaDurata("10 gg")).toBe(10);
    expect(giorniDellaDurata("1 mese")).toBe(30);
    expect(giorniDellaDurata("da definire")).toBeNull();
    expect(giorniDellaDurata(null)).toBeNull();
  });
});

describe("i nomi dei campi cambiano da modulo a modulo", () => {
  const contesto = { progetto: PROGETTO, azienda: null as AziendaComune | null };

  it("sei moduli usano pdf_cover_*, i tetti cover_*: si leggono tutti e due", () => {
    const nuovo = leggiModello({ pdf_cover_bg_color: "#112233", pdf_cover_text_vertical: "top" }, contesto);
    const tetti = leggiModello({ cover_bg_color: "#112233", cover_text_vertical: "top" }, contesto);
    expect(nuovo.copertina.coloreFondo).toBe("#112233");
    expect(tetti.copertina.coloreFondo).toBe("#112233");
    expect(tetti.copertina.verticale).toBe("top");
  });

  it("l'opacità del velo arriva in 0–100 o in 0–1: esce sempre in 0–1", () => {
    expect(leggiModello({ pdf_cover_overlay_opacity: 65 }, contesto).copertina.opacitaVelo).toBeCloseTo(0.65);
    expect(leggiModello({ cover_overlay_opacity: 0.4 }, contesto).copertina.opacitaVelo).toBeCloseTo(0.4);
    expect(leggiModello({}, contesto).copertina.opacitaVelo).toBeNull();
  });

  it("dove c'è, il titolo nuovo (pdf_cover_hero) vince su quello storico", () => {
    expect(leggiModello({ pdf_cover_hero: "Nuovo", cover_title: "Storico" }, contesto).copertina.titolo).toBe("Nuovo");
    expect(leggiModello({ cover_title: "Storico" }, contesto).copertina.titolo).toBe("Storico");
  });

  it("il corpo 30 del campo storico è il valore di fabbrica, non una scelta", () => {
    expect(leggiModello({ cover_title_size: 30 }, contesto).copertina.corpoTitolo).toBeNull();
    expect(leggiModello({ cover_title_size: 36 }, contesto).copertina.corpoTitolo).toBe(36);
    expect(leggiModello({ pdf_cover_title_size: 30 }, contesto).copertina.corpoTitolo).toBe(30);
  });

  it("i segnaposto dell'editor si espandono, anche quelli del singolo modulo", () => {
    const m = leggiModello(
      { cover_title: "Per {cliente_nome}", cover_subtitle: "Piscina {tipo_piscina} a {cantiere_citta}" },
      { ...contesto, sostituzioniExtra: { tipo_piscina: "interrata" } },
    );
    expect(m.copertina.titolo).toBe("Per Mario");
    expect(m.copertina.sottotitolo).toBe("Piscina interrata a Milano");
  });

  it("le voci senza titolo non entrano nel documento", () => {
    const m = leggiModello({ usp: [{ titolo: "Chiavi in mano" }, { titolo: "  " }, {}], faq: [{ domanda: "", risposta: "x" }] }, contesto);
    expect(m.usp).toHaveLength(1);
    expect(m.faq).toHaveLength(0);
  });
});

describe("il kit del marchio: si sceglie una volta in «Brand & Azienda»", () => {
  it("il modello col colore di fabbrica eredita il colore dell'azienda", () => {
    expect(coloreDelDocumento("#1E3A5F", "#CBA87E")).toBe("#CBA87E");
    expect(coloreDelDocumento("#1e3a5f", "#CBA87E")).toBe("#CBA87E");
    expect(coloreDelDocumento(null, "#CBA87E")).toBe("#CBA87E");
  });

  it("un colore scelto nel modello vince su quello dell'azienda", () => {
    expect(coloreDelDocumento("#B91C1C", "#CBA87E")).toBe("#B91C1C");
  });

  it("senza kit del marchio resta il colore del modello", () => {
    expect(coloreDelDocumento("#1E3A5F", null)).toBe("#1E3A5F");
    expect(coloreDelDocumento(null, null)).toBeNull();
  });

  it("il blu con cui nasce la colonna del marchio non è una scelta dell'azienda", () => {
    // companies.brand_primary_color ha DEFAULT '#1E40AF': 19 aziende su 20 lo hanno
    // senza averlo mai scelto. Non deve tingere i documenti di chi non ha scelto.
    expect(coloreDelDocumento("#1E3A5F", "#1E40AF")).toBe("#1E3A5F");
    expect(coloreDelDocumento("#1E3A5F", "#1e40af")).toBe("#1E3A5F");
    expect(coloreDelDocumento(null, "#1E40AF")).toBeNull();
    // Chi quel blu lo vuole davvero lo sceglie nel modello, e lì vale.
    expect(coloreDelDocumento("#1E40AF", null)).toBe("#1E40AF");
  });

  it("arriva fino al documento passando dall'azienda", () => {
    const m = leggiModello({ color_primary: "#1E3A5F" }, { progetto: PROGETTO, azienda: { colore_marca: "#CBA87E" } });
    expect(m.colorePrimario).toBe("#CBA87E");
  });
});

describe("dal modulo al documento", () => {
  it("la scheda dell'intervento porta solo i fatti che ci sono", () => {
    const dati = costruisciDatiEdile({
      modulo: MODULI_EDILI.tetti,
      progetto: { ...PROGETTO, immobile_anno: null, immobile_piani: 0 },
      template: {}, azienda: null, capitoli: [], totali: TOTALI, media: [],
      schedaModulo: [{ etichetta: "Falde", valore: "2" }, { etichetta: "Amianto", valore: null }],
    });
    expect(dati.scheda.map((s) => s.etichetta)).toEqual(["Intervento", "Immobile", "Superficie", "Falde"]);
    expect(dati.cliente).toBe("Mario Rossi");
    expect(dati.cantiere).toBe("Via Roma 1, 20100 Milano, MI");
  });

  it("il margine della voce si calcola sui costi per quantità (documento interno)", () => {
    const dati = costruisciDatiEdile({
      modulo: MODULI_EDILI.bagni, progetto: PROGETTO, template: {}, azienda: null, totali: TOTALI, media: [],
      capitoli: [{ nome: "Posa", subtotale: 1000, voci: [{ id: "1", descrizione: "Posa gres", unita_misura: "mq", quantita: 10, prezzo_unitario: 100, importo: 1000, costo_materiali: 30, costo_manodopera: 20 }] }],
    });
    expect(dati.capitoli[0].voci[0].margineEur).toBe(500);
  });

  it("il preventivo può spegnere la rata del finanziamento", () => {
    const base = {
      modulo: MODULI_EDILI.bagni, template: {}, azienda: null as AziendaComune | null,
      capitoli: [] as Array<{ nome: string; voci: VoceComune[]; subtotale: number }>,
      totali: TOTALI, media: [] as Array<{ id: string; url: string }>,
    };
    expect(costruisciDatiEdile({ ...base, progetto: { ...PROGETTO, mostra_finanziamento: false } }).mostraFinanziamento).toBe(false);
    expect(costruisciDatiEdile({ ...base, progetto: PROGETTO }).mostraFinanziamento).toBe(true);
  });
});

describe("il colore dell'azienda in copertina", () => {
  it("con qualunque marchio il testo di copertina e l'evidenza si leggono sul fondo", () => {
    for (const marca of ["#1E3A5F", "#B91C1C", "#C8E600", "#FDE047", "#111111", "#CBA87E", "#00ADEF"]) {
      const tema = creaTema({ primario: marca });
      const { fondo, testo, evidenza } = coloriCopertina(tema, {});
      expect(contrasto(testo, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrasto(evidenza, fondo)).toBeGreaterThanOrEqual(4.5);
      // I numeri dei capitoli e gli occhielli, scritti sul bianco.
      expect(contrasto(tema.inchiostroMarca, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      // Il bianco sopra la banda dell'investimento.
      expect(contrasto("#FFFFFF", tema.fondo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("la foto va in tinta di regola; resta a colori solo con un velo quasi assente", () => {
    expect(copertinaInTinta(null)).toBe(true);
    expect(copertinaInTinta(0.4)).toBe(true);
    expect(copertinaInTinta(0.65)).toBe(true);
    expect(copertinaInTinta(0.1)).toBe(false);
  });

  it("la scala di grigi tocca i colori e lascia stare la trasparenza", () => {
    const pixel = [255, 0, 0, 200, 10, 200, 30, 255];
    inScalaDiGrigi(pixel);
    expect(pixel[0]).toBe(pixel[1]);
    expect(pixel[1]).toBe(pixel[2]);
    expect(pixel[3]).toBe(200);
    expect(pixel[4]).toBe(pixel[5]);
    expect(pixel[7]).toBe(255);
  });

  it("le foto di serie sono file dell'app, non di siti terzi", () => {
    for (const url of Object.values(COPERTINA_DI_SERIE)) {
      expect(url).toMatch(/^\/cover-stock\/[a-z]+\/\d+\.jpg$/);
    }
  });
});
