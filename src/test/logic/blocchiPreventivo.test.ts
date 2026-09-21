import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BLOCCHI, FOTO_LIBRERIA, bloccoDiSerie, eFotoDiSerie, fotoDellaLibreria, leggiBlocco, settoreBlocchi,
  type SettoreBlocchi,
} from "../../../supabase/functions/_shared/blocchiPreventivo";
import { ICONE } from "../../../supabase/functions/_shared/iconePreventivo";
import { testoPerPdf } from "../../../supabase/functions/_shared/testoPerPdf";
import { CAPITOLI_EDILI, ordineEffettivo } from "@/components/preventivi/pdf/ordineCapitoli";

const SETTORI: SettoreBlocchi[] = ["serramenti", "fotovoltaico", "ristrutturazione", "bagni", "tetti", "climatizzazione", "elettrico", "termoidraulico", "pavimenti", "piscine"];
const pubblico = (url: string) => resolve(process.cwd(), "public", url.replace(/^\//, ""));

// 22/09/2026 — Le pagine nuove del preventivo: una libreria unica per tutti i moduli.
describe("blocchi del preventivo: la libreria di serie", () => {
  it("ogni blocco ha titolo e voci in ogni settore, e le foto esistono davvero nel sito", () => {
    for (const { chiave } of BLOCCHI) {
      for (const settore of SETTORI) {
        const b = bloccoDiSerie(chiave, settore);
        expect(b.titolo, `${chiave}/${settore}`).toBeTruthy();
        expect(b.voci.length, `${chiave}/${settore}`).toBeGreaterThan(2);
        for (const f of b.foto) expect(existsSync(pubblico(f)), f).toBe(true);
        for (const x of [...b.voci, ...b.escluse]) if (x.icona) expect(ICONE[x.icona], x.icona).toBeDefined();
      }
    }
  });

  it("i testi di serie si stampano così come sono (niente caratteri che il PDF perde)", () => {
    for (const { chiave } of BLOCCHI) {
      for (const settore of SETTORI) {
        const b = bloccoDiSerie(chiave, settore);
        for (const t of [b.occhiello, b.titolo, b.intro ?? "", b.nota ?? "", ...b.voci.flatMap((x) => [x.titolo, x.testo ?? ""]), ...b.escluse.map((x) => x.titolo)]) {
          expect(testoPerPdf(t), `${chiave}/${settore}: ${t}`).toBe(t);
        }
      }
    }
  });

  it("le promesse sono segnate come tali, e dal 22/09/2026 nascono accese nell'ordine dei capitoli", () => {
    const promesse = BLOCCHI.filter((b) => b.promessa).map((b) => b.chiave);
    expect(promesse).toEqual(["compreso", "protezione", "controlli", "documenti", "diario"]);
    const ordine = ordineEffettivo([], []);
    for (const k of [...promesse, "comeFunziona"]) expect(ordine.find((v) => v.chiave === k)?.visibile, k).toBe(true);
    // Chi aveva già scelto l'ordine trova i capitoli nuovi accesi, al loro posto.
    const vecchio = CAPITOLI_EDILI.filter((c) => !BLOCCHI.some((b) => b.chiave === c.chiave)).map((c) => ({ chiave: c.chiave, visibile: true }));
    const completato = ordineEffettivo(vecchio, []);
    for (const k of promesse) expect(completato.find((v) => v.chiave === k)?.visibile, k).toBe(true);
    // Spento dall'azienda, resta spento.
    const spento = ordineEffettivo([...vecchio, { chiave: "diario", visibile: false }], []);
    expect(spento.find((v) => v.chiave === "diario")?.visibile).toBe(false);
  });

  it("ogni foto della libreria esiste, e l'editor propone quelle del settore più le comuni", () => {
    for (const [cartella, file] of Object.entries(FOTO_LIBRERIA)) {
      for (const f of file) expect(existsSync(pubblico(`/pdf-stock/${cartella}/${f}.jpg`)), `${cartella}/${f}`).toBe(true);
    }
    const bagni = fotoDellaLibreria("bagni").map((f) => f.url);
    expect(bagni).toContain("/pdf-stock/bagni/tecnica-doccia.jpg");
    expect(bagni).toContain("/pdf-stock/comune/protezione-ambienti.jpg");
    expect(bagni.some((u) => u.includes("/fotovoltaico/"))).toBe(false);
  });
});

describe("blocchi del preventivo: le scelte dell'azienda", () => {
  it("un campo cambiato vince, uno vuoto torna di serie; le voci si sostituiscono intere", () => {
    const b = leggiBlocco("protezione", "bagni", {
      protezione: { titolo: "La casa *prima* di tutto.", occhiello: "", voci: [{ titolo: "Teli ovunque", testo: null, icona: "protezione" }] },
    });
    expect(b.titolo).toBe("La casa *prima* di tutto.");
    expect(b.occhiello).toBe(bloccoDiSerie("protezione", "bagni").occhiello);
    expect(b.voci).toEqual([{ titolo: "Teli ovunque", testo: null, icona: "protezione" }]);
  });

  it("le foto dell'azienda tolgono la nota «Immagini indicative»; «senza foto» le toglie tutte", () => {
    const serie = leggiBlocco("controlli", "serramenti", {});
    expect(serie.foto.every(eFotoDiSerie)).toBe(true);
    expect(serie.nota).toMatch(/indicative/);
    const proprie = leggiBlocco("controlli", "serramenti", { controlli: { foto: ["https://esempio.test/posa.jpg"] } });
    expect(proprie.foto).toEqual(["https://esempio.test/posa.jpg"]);
    expect(proprie.nota).toBeNull();
    expect(leggiBlocco("controlli", "serramenti", { controlli: { senzaFoto: true } }).foto).toEqual([]);
  });

  it("un'introduzione svuotata apposta non esce; un'icona sconosciuta si perde, la voce resta", () => {
    const b = leggiBlocco("diario", "ristrutturazione", { diario: { intro: "", voci: [{ titolo: "Foto", icona: "inesistente" }] } });
    expect(b.intro).toBeNull();
    expect(b.voci).toEqual([{ titolo: "Foto", testo: null, icona: null }]);
  });

  it("i moduli sconosciuti ricadono sulla ristrutturazione", () => {
    expect(settoreBlocchi("bagni")).toBe("bagni");
    expect(settoreBlocchi("pergole")).toBe("ristrutturazione");
  });
});

describe("blocchi del preventivo: dal modello al PDF degli edili", () => {
  const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("il normalizzatore di ogni modulo porta pdf_blocchi (una colonna fuori dal normalizzatore non arriva al PDF)", () => {
    for (const hook of [
      "useRistrutturazioneProgetto", "useBagniProgetto", "useTettiProgetto", "useClimatizzazioneProgetto",
      "useElettricoProgetto", "useTermoidraulicoProgetto", "usePavimentiProgetto", "usePiscineProgetto",
    ]) {
      const src = leggi(`src/hooks/${hook}.ts`);
      expect(src.slice(src.indexOf("function normalizeTemplate")), hook).toContain("pdf_blocchi:");
    }
  });

  it("le foto si caricano solo per i blocchi accesi, e ogni editor passa settore e scelte", () => {
    expect(leggi("src/components/preventivi/pdf/immaginiDocumento.ts")).toContain("const blocchiAccesi = BLOCCHI.filter(");
    for (const m of ["bagni", "climatizzazione", "elettrico", "pavimenti", "piscine", "ristrutturazione", "termoidraulico", "tetti"]) {
      const nome = m.charAt(0).toUpperCase() + m.slice(1);
      const src = leggi(`src/components/${m}/${nome}TemplateEditor.tsx`);
      expect(src, m).toContain(`settore="${m}"`);
      expect(src, m).toContain('onBlocchi={(v) => set("pdf_blocchi", v)}');
    }
  });

  it("«Cosa è compreso» resta intero: mai il titolo in fondo a una pagina e le voci su quella dopo", () => {
    expect(leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx")).toMatch(/if \(chiave === "compreso"\) \{[\s\S]{0,300}<View wrap=\{false\}>/);
  });
});
