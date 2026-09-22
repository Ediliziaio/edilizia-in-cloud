/**
 * Le tavole nei preventivi (22/09/2026): le grafiche verticali del pacchetto bento,
 * con le scritte dentro. Non si ritagliano: una foto sola e verticale si mostra
 * intera, grande, con le voci del blocco accanto (edili, Serramenti) o sotto
 * (Fotovoltaico, pagina più stretta e alta).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eTavola, PROPORZIONE_TAVOLA } from "@/lib/pdf/proporzioniImmagine";
import { bloccoDiSerie, FOTO_LIBRERIA } from "../../../supabase/functions/_shared/blocchiPreventivo";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const jpg = (w: number, h: number) => {
  const b = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return `data:image/jpeg;base64,${Buffer.from(b).toString("base64")}`;
};

describe("quando una foto è una tavola", () => {
  it("una foto verticale sì, una orizzontale o quadrata no", () => {
    expect(eTavola(jpg(1080, 1350))).toBeCloseTo(0.8, 3);
    expect(eTavola(jpg(1600, 900))).toBeNull();
    expect(eTavola(jpg(1000, 1000))).toBeNull();
    expect(PROPORZIONE_TAVOLA).toBeLessThan(1);
  });

  it("le tavole di serie si riconoscono anche dall'indirizzo, quando la foto non è stata convertita", () => {
    expect(eTavola("https://app.ediliziaincloud.com/pdf-stock/tetti/tavola-sistema-tetto.jpg")).toBe(0.8);
    expect(eTavola("/pdf-stock/comune/tavola-prima-durante-dopo.jpg?v=2")).toBe(0.8);
    expect(eTavola("/pdf-stock/tetti/diario.jpg")).toBeNull();
    expect(eTavola(null)).toBeNull();
  });
});

describe("le tavole di serie", () => {
  const casi: Array<[Parameters<typeof bloccoDiSerie>[0], Parameters<typeof bloccoDiSerie>[1], string]> = [
    ["comeFunziona", "tetti", "tetti/tavola-sistema-tetto"],
    ["diario", "tetti", "tetti/tavola-percorso-lavori"],
    ["controlli", "bagni", "bagni/tavola-protezione-acqua"],
    ["diario", "bagni", "bagni/tavola-dal-vecchio-al-nuovo"],
    ["protezione", "ristrutturazione", "ristrutturazione/tavola-percorso-lavori"],
    ["diario", "ristrutturazione", "ristrutturazione/tavola-un-unico-progetto"],
    ["comeFunziona", "pavimenti", "pavimenti/tavola-posa-da-sotto"],
    ["diario", "piscine", "piscine/tavola-come-nasce"],
    ["comeFunziona", "climatizzazione", "climatizzazione/tavola-come-funziona"],
    ["controlli", "climatizzazione", "climatizzazione/tavola-installazione-collaudo"],
    ["diario", "elettrico", "comune/tavola-prima-durante-dopo"],
    ["diario", "termoidraulico", "comune/tavola-prima-durante-dopo"],
    ["controlli", "serramenti", "serramenti/tavola-posa-professionale"],
    ["diario", "serramenti", "serramenti/tavola-prima-durante-dopo"],
    ["comeFunziona", "fotovoltaico", "fotovoltaico/tavola-giorno-e-sera"],
    ["controlli", "fotovoltaico", "fotovoltaico/tavola-controlli"],
  ];

  it("ogni blocco con una tavola ne ha una sola, e il file esiste ed è verticale 4:5", () => {
    for (const [chiave, settore, file] of casi) {
      const foto = bloccoDiSerie(chiave, settore).foto;
      expect(foto, `${settore} ${chiave}`).toEqual([`/pdf-stock/${file}.jpg`]);
      const percorso = resolve(process.cwd(), `public/pdf-stock/${file}.jpg`);
      expect(existsSync(percorso), file).toBe(true);
      expect(eTavola(`data:image/jpeg;base64,${readFileSync(percorso).toString("base64")}`), file).toBeCloseTo(0.8, 2);
    }
  });

  it("le tavole sono anche nella libreria dell'editor, per chi le vuole in un'altra pagina", () => {
    expect(FOTO_LIBRERIA.comune).toEqual(expect.arrayContaining(["tavola-controlli", "tavola-cosa-comprende", "tavola-prima-durante-dopo"]));
    expect(FOTO_LIBRERIA.tetti).toEqual(expect.arrayContaining(["tavola-sistema-tetto", "tavola-percorso-lavori"]));
  });
});

describe("i motori", () => {
  it("Piano dei lavori: la tavola intera con le voci accanto, e nessun capitolo sale sulla sua pagina", () => {
    const edile = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");
    expect(edile).toContain("{tavola != null ? <TavolaBlocco tema={tema} blocco={blocco} proporzione={tavola} /> : (");
    expect(edile).toContain('objectFit: "contain"');
    expect(edile).toContain("tavolaDelBlocco(modello.blocchi[b.chiave]) != null)) continue;");
  });

  it("Serramenti: la stessa tavola, con lo stacco fra le sezioni che scorrono", () => {
    const sr = leggi("src/components/serramenti/SerramentoPDF.tsx");
    expect(sr).toContain("const tavola = foto.length === 1 ? eTavola(foto[0].src) : null;");
    expect(sr).toContain("- 16 - 30;");
  });

  it("Fotovoltaico: la tavola al centro, alta quanto lo spazio che resta, le voci sotto", () => {
    const fv = leggi("supabase/functions/_shared/fvHtmlTemplate.ts");
    expect(fv).toContain('if (foto.length === 1 && eTavola(foto[0].src) != null) {');
    expect(fv).toContain("height: min(calc(100cqh - 6mm), calc(100cqw * 1.25))");
  });
});
