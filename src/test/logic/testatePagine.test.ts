/**
 * Le testate delle pagine che raccontano l'azienda (22/09/2026): occhiello, titolo e
 * introduzione di «Dicono di noi», domande, garanzie e lavori si riscrivono
 * dall'editor, e i tre motori le leggono dallo stesso posto.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chiaveTestata, leggiTestata, LUNGHEZZA_TESTATA, pagineConTestata, testataDiSerie,
} from "../../../supabase/functions/_shared/testatePagine";
import { leggiModello, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const PROGETTO: ProgettoComune = {
  code: "BGN-2026-001", tipo_intervento: "Rifacimento bagno",
  cliente_nome: "Mario", cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Milano", cantiere_provincia: "MI", cantiere_cap: "20100",
  immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
};

describe("la testata di serie", () => {
  it("ogni motore ha la sua: asterischi nel Piano dei lavori, a capo negli altri", () => {
    expect(testataDiSerie("recensioni", "edili")?.titolo).toBe("La parola ai *nostri clienti*.");
    expect(testataDiSerie("domande", "serramenti")?.titolo).toBe("Le risposte\nprima della conferma.");
    expect(testataDiSerie("recensioni", "fotovoltaico")?.titolo).toBe("La parola ai\nnostri clienti.");
  });

  it("il Fotovoltaico non ha «I nostri lavori»; il titolo delle sue garanzie lo sceglie il documento", () => {
    expect(pagineConTestata("fotovoltaico")).toEqual(["recensioni", "domande", "garanzie"]);
    expect(pagineConTestata("edili")).toEqual(["recensioni", "domande", "garanzie", "lavori"]);
    expect(testataDiSerie("garanzie", "fotovoltaico")?.titolo).toBeNull();
    expect(testataDiSerie("garanzie", "fotovoltaico")?.segnaposto?.titolo).toMatch(/anni di tranquillità/);
  });
});

describe("la testata scritta dall'azienda", () => {
  it("ripristina la testata dell'intervento senza perdere le personalizzazioni degli altri campi", () => {
    const salvati = {
      modulo_defaults: { testata_garanzie: { titolo: "Le garanzie dell'accumulo", intro: "Condizioni del sistema scelto." } },
      testata_garanzie: { occhiello: "La nostra assistenza", titolo: "" },
    };
    expect(leggiTestata("garanzie", "fotovoltaico", salvati)).toEqual({
      occhiello: "La nostra assistenza", titolo: "Le garanzie dell'accumulo", intro: "Condizioni del sistema scelto.",
    });
  });
  it("vale solo quello che l'azienda ha scritto: il resto resta di serie", () => {
    const salvati = { [chiaveTestata("garanzie")]: { titolo: "Dieci anni *senza pensieri*." } };
    expect(leggiTestata("garanzie", "edili", salvati)).toEqual({
      occhiello: "Le nostre garanzie", titolo: "Dieci anni *senza pensieri*.", intro: null,
    });
  });

  it("un campo svuotato torna quello di serie", () => {
    const salvati = { testata_lavori: { occhiello: "   ", titolo: "", intro: "\n\n" } };
    expect(leggiTestata("lavori", "serramenti", salvati)).toEqual({
      occhiello: "I nostri lavori", titolo: "Lavori finiti, non promesse.", intro: "Alcuni interventi che abbiamo già consegnato.",
    });
  });

  it("gli a capo restano, le righe vuote e i caratteri di controllo no", () => {
    const salvati = { testata_domande: { titolo: "Prima di firmare,\r\n\r\n  le risposte.\u0007" } };
    expect(leggiTestata("domande", "serramenti", salvati).titolo).toBe("Prima di firmare,\nle risposte.");
  });

  it("un testo troppo lungo si accorcia: la pagina del Fotovoltaico è alta quanto il foglio", () => {
    const salvati = { testata_recensioni: { intro: "parola ".repeat(80) } };
    const intro = leggiTestata("recensioni", "fotovoltaico", salvati).intro ?? "";
    expect(intro.length).toBeLessThanOrEqual(LUNGHEZZA_TESTATA.intro);
    expect(intro.endsWith("…")).toBe(true);
  });

  it("un valore che non è un testo non conta", () => {
    expect(leggiTestata("domande", "edili", { testata_domande: { titolo: 42 } }).titolo).toBe("Le domande che ci fanno *più spesso*.");
    expect(leggiTestata("domande", "edili", null).occhiello).toBe("Domande e risposte");
  });
});

describe("i tre motori leggono la testata", () => {
  it("il Piano dei lavori: dal modello, coi segnaposto espansi come nelle pagine libere", () => {
    const modello = leggiModello(
      { pdf_blocchi: { testata_recensioni: { titolo: "Cosa dicono a {cliente_nome}.", intro: "Tutte vere." } } },
      { progetto: PROGETTO, azienda: null, settore: "bagni" },
    );
    expect(modello.testate.recensioni).toEqual({ occhiello: "Dicono di noi", titolo: "Cosa dicono a Mario.", intro: "Tutte vere." });
    expect(modello.testate.lavori.titolo).toBe("Lavori *finiti*, non promesse.");
    const pdf = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");
    expect(pdf).toContain("occhiello={tRecensioni.occhiello} titolo={tRecensioni.titolo} sommario={sommarioRecensioni}");
    expect(pdf).not.toContain('titolo="Più *certezze*, meno dubbi."');
  });

  it("i Serramenti e il Fotovoltaico non hanno più le testate scritte nel motore", () => {
    const sr = leggi("src/components/serramenti/SerramentoPDF.tsx");
    expect(sr).toContain('leggiTestata(pagina, "serramenti", tpl.pdf_blocchi)');
    expect(sr).not.toContain("<Text style={styles.pageTitle}>La parola ai nostri clienti.</Text>");
    const fv = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");
    expect(fv).toContain('leggiTestata(pagina, "fotovoltaico", d.template?.pdf_blocchi)');
    expect(fv).not.toContain('<h1 class="page-title">Le domande<br/>che fanno tutti.</h1>');
  });

  it("il Fotovoltaico prende le foto degli impianti dalla galleria dell'editor", () => {
    const fv = leggi("supabase/functions/fv-genera-pdf/index.ts");
    expect(fv).toContain("(template as Record<string, unknown>).gallery_lavori");
    expect(fv).toContain("(template as Record<string, unknown>).cantieri_galleria");
  });
});
