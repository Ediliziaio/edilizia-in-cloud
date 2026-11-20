import { expect, it } from "vitest";
import { leggiPdfTabellare } from "@/lib/computo/pdfTabellare";
import { contrattoDaComputo } from "@/lib/orders/contrattoDaComputo";
import type { PdfPezzoTesto } from "@/lib/computo/primusPdf";
import { daComputoStrutturato } from "@/lib/computo/importaVoci";
import { rigaDaVoce, improntaVoci } from "@/lib/computo/computoDaVoci";
const p = (x: number, y: number, text: string, right = x + text.length * 5): PdfPezzoTesto => ({ x, y, text, right });
const voce = (n: string, y: number, descrizione: string, u: string, q: string, prezzo: string, importo: string) => [
  p(45, y + 35, n), p(80, y + 35, "U.05.10.10/a"), p(115, y + 35, descrizione),
  p(115, y, "Sommano U.05.10.10/a)"), p(347, y, u), p(594, y, q, 635), p(685, y, prezzo + " €", 718), p(738, y, importo, 779),
];
const items = () => [
  p(100, 800, "COMPUTO METRICO ESTIMATIVO"), p(582, 760, "QUANTITA'", 635), p(657, 760, "PREZZO", 700), p(724, 760, "IMPORTO", 779),
  p(115, 730, "LC3 Segnaletica e barriere"),
  ...voce("5", 650, "SCAVO DI SBANCAMENTO", "m³", "17.317,41", "6,66", "115.333,95"),
  ...voce("6", 560, "FORMAZIONE DI RILEVATO", "m³", "797,58", "20,43", "16.294,56"),
  ...voce("7", 470, "STESA DI TERRA", "m³", "2.797,20", "11,42", "31.944,02"),
  ...voce("8", 380, "Segnaletica orizzontale", "m", "2.000,00", "0,62", "1.240,00"),
  p(115, 340, "OS Oneri per la sicurezza"),
  ...voce("9", 290, "Segnaletica orizzontale", "m", "2.000,00", "0,62", "1.240,00"),
  p(115, 200, "Riepilogo"), p(115, 180, "Segnaletica e barriere"), p(738, 180, "166.052,53"),
  p(115, 140, "TOTALE OPERE"), p(738, 140, "166.052,53"),
];
it("legge colonne, maiuscole e riepilogo senza cancellare righe identiche di capitoli diversi", () => {
  const c = leggiPdfTabellare([{ page: 1, items: items() }])!;
  expect(c.voci).toHaveLength(5);
  expect(c.totale_dichiarato).toBe(166052.53);
  expect(c.voci[0]).toMatchObject({ descrizione: "SCAVO DI SBANCAMENTO", quantita: 17317.41, unita_misura: "m³", prezzo_unitario: 6.66, importo: 115333.95 });
  expect(c.voci[3].is_sicurezza).toBe(false);
  expect(c.voci[4].is_sicurezza).toBe(true);
});
it("una voce mancante non passa il controllo solo perché il PDF contiene un totale", () => {
  const foglio = items().filter(p => p.y < 615 || p.y > 690);
  expect(leggiPdfTabellare([{ page: 1, items: foglio }])).toBeNull();
});
it("conserva quantità, prezzo e importo discordanti e non inventa un nuovo prezzo", () => {
  const c = leggiPdfTabellare([{ page: 1, items: items() }])!;
  c.voci[0] = { ...c.voci[0], quantita: 6.07, prezzo_unitario: 1.1, importo: 133.54 };
  const e = contrattoDaComputo(c);
  expect(e.voci[0]).toMatchObject({ quantita: 6.07, prezzo_unitario_eur: 1.1, importo_eur: 133.54 });
  const v = daComputoStrutturato(c, "PDF").voci[0];
  expect(rigaDaVoce(v, 0).voce).toMatchObject({ quantita: 6.07, prezzo_unitario_computo: 1.1, importo_computo: 133.54 });
  expect(rigaDaVoce({ ...v, quantita: "10" }, 0).voce.importo_computo).toBe(11);
  expect(improntaVoci([v])).not.toBe(improntaVoci([{ ...v, valoriDocumento: { ...v.valoriDocumento!, importo: 6.68 } }]));
});
it("ricompone unità su due righe senza scambiarle per metri quadrati semplici", () => {
  const foglio = items().map(x => x.x === 347 && x.y === 380 ? { ...x, text: "cm" } : x);
  foglio.push(p(347, 392, "m² x"));
  const c = leggiPdfTabellare([{ page: 1, items: foglio }])!;
  expect(c.voci[3].unita_misura).toBe("m² x cm");
});
