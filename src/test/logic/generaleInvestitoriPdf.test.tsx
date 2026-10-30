/**
 * Il rendiconto all'investitore letto dal PDF vero: renderer vero, offline, testo estratto
 * con pdfjs. È la carta che l'investitore ha in mano, quindi la prova guarda quella.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { RendicontoInvestitorePDF } from "@/components/orders/generali/investitori/RendicontoInvestitorePDF";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { calcolaInvestitori, type Fonte } from "@/lib/orders/generali/investitoriConti";
import { datiRendiconto, type DatiRendiconto } from "@/lib/orders/generali/investitoriRendiconto";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";

vi.setConfig({ testTimeout: 120_000 });

const fonte = (f: Partial<Fonte> & Pick<Fonte, "id" | "tipo" | "nome">): Fonte => ({
  soggetto: "persona", clienteId: null, email: null, impegno: 0, quotaUtilePct: null, tassoPct: null,
  dataInizio: null, scadenza: null, nota: null, ordine: 0, ...f,
});

const numeri: NumeriInvestitori = {
  capitaleMassimoImpegnato: 600_000, meseCapitaleMassimo: "2027-09", capitaleInvestitoOggi: 250_000,
  previsto: { ricavi: 1_500_000, costi: 1_200_000, margine: 300_000 },
  stimaFinale: { ricavi: 1_450_000, costi: 1_210_000, margine: 240_000 },
  tirAnnuo: 0.18, durataMesi: 24,
  flussoMensile: [{ mese: "2027-01", entrate: 0, uscite: 0, netto: 0, cumulato: 0 }, { mese: "2028-12", entrate: 0, uscite: 0, netto: 0, cumulato: 0 }],
};

const riepilogo: RiepilogoGenerale = {
  generale: { id: "g", codice: "C-27", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null },
  figlie: ["A1", "A2"].map((nome, i): RiepilogoGenerale["figlie"][number] => ({
    id: `u${i}`, codice: null, nome, stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null,
    avanzamento: 40, importo: 700_000, eseguito: null, fatturato: null, incassato: i === 0 ? 120_000 : null, costo: null, margine: null,
  })),
  permessi: { importi: true, costi: true, margini: true },
};

async function testo(d: Parameters<typeof RendicontoInvestitorePDF>[0]["d"]) {
  const buffer = await renderToBuffer(<RendicontoInvestitorePDF d={d} />);
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pagine: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const t = (await (await pdf.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pagine.push(t.replace(/\s+/g, " "));
  }
  return pagine.join(" ");
}

describe("PDF del rendiconto all'investitore", () => {
  const conti = calcolaInvestitori({
    fonti: [
      fonte({ id: "M", tipo: "capitale", nome: "Mario Rossi", impegno: 200_000, email: "mario@example.com" }),
      fonte({ id: "P", tipo: "propri", nome: "Edil Srl", impegno: 200_000 }),
      fonte({ id: "B", tipo: "banca", nome: "Banca Locale", impegno: 300_000, tassoPct: 4.5, dataInizio: "2027-02-01", scadenza: "2028-12-31" }),
    ],
    movimenti: [
      { id: "1", fonteId: "M", tipo: "versamento", data: "2027-01-15", importo: 200_000, nota: null },
      { id: "2", fonteId: "P", tipo: "versamento", data: "2027-01-15", importo: 200_000, nota: null },
      { id: "3", fonteId: "B", tipo: "versamento", data: "2027-03-01", importo: 100_000, nota: null },
    ],
    numeri: {
      marginePrevisto: 300_000, margineStima: 240_000, capitaleMassimo: 600_000, meseCapitaleMassimo: "2027-09",
      capitaleInvestitoOggi: 250_000, inizio: "2027-01", fine: "2028-12", interessiNelPiano: true,
    },
    oggi: "2027-06-30",
  });
  const azienda: DatiRendiconto["azienda"] = { nome: "Edil Srl", partitaIva: "01234567890", indirizzo: "Via Po 1, Torino", email: null, telefono: null, logo: null };

  it("porta la posizione dell'investitore, l'operazione e la regola", async () => {
    const d = datiRendiconto({
      oggi: "2027-06-30", riepilogo, numeri, conti, fonteId: "M", azienda, unitaNome: "Unità",
      vendite: { totale: 2, perStato: { libera: 0, prenotata: 0, compromesso: 1, rogitata: 1 } }, note: "Rogito di A1 a maggio.",
    })!;
    const t = await testo(d);
    expect(t).toContain("Rendiconto all'investitore");
    expect(t).toContain("Mario Rossi");
    expect(t).toContain("Investitore a capitale");
    expect(t).toContain("Residenza Via Roma");
    expect(t).toContain("lavori al 40%");
    expect(t).toContain("Le spetta ancora a fine operazione");
    expect(t).toContain(`€ ${new Intl.NumberFormat("it-IT").format(Math.round(d.conto.spettaAFine))}`);
    expect(t).toContain("1 su 2");
    expect(t).toContain("€ 120.000");
    expect(t).toContain("Margine");
    expect(t).toContain("Pro quota");
    expect(t).toContain("Rogito di A1 a maggio.");
    expect(t).toContain("Capitale massimo (settembre 2027)");
    // I costi voce per voce non ci sono, né i nomi degli altri investitori.
    expect(t).not.toContain("Banca Locale");
  });

  it("per la banca parla di interessi, senza piano dice che le stime arriveranno", async () => {
    const d = datiRendiconto({ oggi: "2027-06-30", riepilogo, numeri: null, conti, fonteId: "B", azienda, unitaNome: "Unità", vendite: null })!;
    const t = await testo(d);
    expect(t).toContain("Interessi");
    expect(t).toContain("Interessi maturati fino a oggi");
    expect(t).toContain("4,5% annuo");
    expect(t).toContain("non è ancora pronto");
  });
});
