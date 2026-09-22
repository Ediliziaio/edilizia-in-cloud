/**
 * Le prove nei preventivi (22/09/2026): il voto su Google o Trustpilot scritto nel
 * Profilo azienda, la pagina «Dicono di noi», i sigilli delle garanzie, le domande
 * in fondo prima dei prossimi passi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  indirizzoDaLeggere, leggiVotiOnline, recensioniScritte, stellePiene, votoScritto,
} from "../../../supabase/functions/_shared/recensioniOnline";
import { contornoSigillo, durataDellaGaranzia, iconaDellaGaranzia } from "../../../supabase/functions/_shared/sigilloGaranzia";
import { CAPITOLI_EDILI, ordineEffettivo } from "@/components/preventivi/pdf/ordineCapitoli";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const chiavi = (o: Array<{ chiave: string }>) => o.map((v) => v.chiave);

describe("il voto online dell'azienda", () => {
  it("esce solo quello che l'azienda ha scritto, e solo se è un voto vero", () => {
    const voti = leggiVotiOnline([
      { piattaforma: "google", voto: 4.8, numero: 126, link: "https://g.page/r/esempio", aggiornato: "2026-09-22" },
      { piattaforma: "trustpilot", voto: "4,6", numero: "41" },
      { piattaforma: "google", voto: 5 }, // la stessa piattaforma due volte
      { piattaforma: "facebook", voto: 6 }, // fuori scala
      { piattaforma: "altro", voto: 4.9 }, // «Altro» senza nome
      { piattaforma: "sconosciuta", voto: 4 },
    ]);
    expect(voti.map((v) => [v.nome, v.voto, v.numero])).toEqual([["Google", 4.8, 126], ["Trustpilot", 4.6, 41]]);
    expect(voti[0].aggiornato).toBe("2026-09-22");
    expect(leggiVotiOnline(null)).toEqual([]);
    expect(leggiVotiOnline([{ piattaforma: "altro", nome: "Houzz Italia", voto: 5, numero: 0 }])[0]).toMatchObject({ nome: "Houzz Italia", numero: null });
  });

  it("nel PDF ne stanno tre: il quarto non esce", () => {
    const quattro = ["google", "trustpilot", "facebook", "houzz"].map((piattaforma) => ({ piattaforma, voto: 4.5 }));
    expect(leggiVotiOnline(quattro)).toHaveLength(3);
  });

  it("i numeri all'italiana, le stelle piene quanto il voto", () => {
    expect(votoScritto(4.8)).toBe("4,8");
    expect(votoScritto(5)).toBe("5,0");
    expect(recensioniScritte(1)).toBe("1 recensione");
    expect(recensioniScritte(126)).toBe("126 recensioni");
    expect(recensioniScritte(1240)).toBe("1.240 recensioni");
    expect(recensioniScritte(null)).toBeNull();
    expect(stellePiene(4.8).map((x) => Math.round(x * 10) / 10)).toEqual([1, 1, 1, 1, 0.8]);
    expect(stellePiene(3.5)).toEqual([1, 1, 1, 0.5, 0]);
    expect(indirizzoDaLeggere("https://www.trustpilot.com/review/esempio.it/")).toBe("trustpilot.com/review/esempio.it");
  });

  it("nessun voto di serie: la colonna nasce vuota e il documento non inventa", () => {
    const migrazione = leggi("supabase/migrations/20280922160000_recensioni_online_azienda.sql");
    expect(migrazione).toContain("default '[]'::jsonb");
    const adattatore = leggi("src/components/preventivi/pdf/adattatoreEdile.ts");
    expect(adattatore).toContain("votiOnline: leggiVotiOnline(");
  });
});

describe("il sigillo delle garanzie", () => {
  it("gli anni li dice la garanzia: in cifre, in lettere o con l'aggettivo", () => {
    expect(durataDellaGaranzia("Due anni sui lavori")).toEqual({ numero: 2, unita: "ANNI" });
    expect(durataDellaGaranzia("Dieci anni sui difetti gravi")).toEqual({ numero: 10, unita: "ANNI" });
    expect(durataDellaGaranzia("Garanzia decennale")).toEqual({ numero: 10, unita: "ANNI" });
    expect(durataDellaGaranzia("Garanzia 24 mesi sui componenti")).toEqual({ numero: 24, unita: "MESI" });
    expect(durataDellaGaranzia("Un anno di assistenza")).toEqual({ numero: 1, unita: "ANNO" });
    expect(durataDellaGaranzia("Garanzia dei produttori", "Vale quella di ogni produttore, 5 anni")).toEqual({ numero: 5, unita: "ANNI" });
    expect(durataDellaGaranzia("Garanzia dei produttori")).toBeNull();
  });

  it("senza anni, l'icona dell'argomento: prima il titolo, poi la descrizione", () => {
    expect(iconaDellaGaranzia("Prezzo bloccato")).toBe("pagamento");
    expect(iconaDellaGaranzia("Garanzia dei produttori", "ti lasciamo i certificati")).toBe("materiali");
    expect(iconaDellaGaranzia("Assistenza dopo la consegna")).toBe("assistenza");
    expect(iconaDellaGaranzia("Lavoro fatto bene")).toBe("garanzia");
  });

  it("il contorno a festoni ha il numero di punte chiesto", () => {
    expect(contornoSigillo(21, 24).split(" ")).toHaveLength(48);
  });
});

describe("«Dicono di noi» e le domande nel Piano dei lavori", () => {
  it("le recensioni hanno una pagina loro, subito prima del piano; le domande in fondo, dopo i tempi", () => {
    const serie = chiavi(ordineEffettivo([], []));
    expect(serie.indexOf("recensioni")).toBe(serie.indexOf("piano") - 1);
    expect(serie[serie.length - 1]).toBe("domande");
    expect(serie.indexOf("garanzie")).toBe(serie.indexOf("investimento") + 1);
    expect(CAPITOLI_EDILI.find((c) => c.chiave === "recensioni")?.etichetta).toBe("Dicono di noi");
  });

  it("chi aveva nascosto «Garanzie e domande» non si ritrova le domande", () => {
    const salvato = CAPITOLI_EDILI.filter((c) => c.chiave !== "domande" && c.chiave !== "recensioni")
      .map((c) => ({ chiave: c.chiave, visibile: c.chiave !== "garanzie" }));
    const o = ordineEffettivo(salvato, []);
    expect(o.find((v) => v.chiave === "domande")?.visibile).toBe(false);
    // Le recensioni sono nuove: escono, subito dopo le foto.
    expect(o.find((v) => v.chiave === "recensioni")?.visibile).toBe(true);
    expect(chiavi(o).indexOf("recensioni")).toBe(chiavi(o).indexOf("foto") + 1);
  });

  it("il documento: la pagina delle recensioni, le garanzie col sigillo, le domande che si spezzano una per volta", () => {
    const edile = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");
    expect(edile).toContain('<VotiOnline tema={tema} voti={votiOnline} larghezza={UTILE} />');
    expect(edile).toContain('<SchedeGaranzie tema={tema} voci={modello.garanzie}');
    expect(edile).toContain("piano: codaDelPiano, domande: codaDelleDomande,");
    // I prossimi passi in coda portano lo stacco sopra di sé: col margine sotto, il capitolo
    // prima (che ci stava a filo) saltava intero alla pagina dopo.
    expect(edile).toContain("<View wrap={false} style={inCoda ? { marginTop: STACCO } : undefined}>");
    // Un capitolo corto sale sulla pagina del blocco dopo, con la foto accorciata.
    expect(edile).toContain("segmenti[s + 1] = { propria: true, chiavi: [...corti, blocco.chiavi[0]]");
  });
});
