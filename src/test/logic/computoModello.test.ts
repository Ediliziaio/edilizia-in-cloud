import { describe, expect, it } from "vitest";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { bozzaDalModello, leggiModelloComputo, modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";

/**
 * Il modello del computo dell'azienda (29/10/2026): veste del PDF e
 * condizioni di partenza. Un modello salvato da un'altra versione non deve
 * mai rompere un preventivo: si tiene quello che è valido.
 */
const bozza = { ...bozzaVuota(), titolo: "Campo da tennis", committente: "Circolo Esempio", voci: [
  { ...voceVuota(), capitolo: "Scavi", descrizione: "Scavo di sbancamento", unita: "mc", quantita: "10", prezzo: "12" },
  { ...voceVuota(), capitolo: "Manto", descrizione: "Resina acrilica", unita: "mq", quantita: "20", prezzo: "32" },
] };

describe("lettura del modello salvato", () => {
  it("un campo sbagliato torna di serie, gli altri restano", () => {
    const m = leggiModelloComputo({ copertina: "inventata", colorePrimario: "#123456", premessa: "Gentile cliente", sconosciuto: 1 });
    expect(m.copertina).toBe("piena");
    expect(m.colorePrimario).toBe("#123456");
    expect(m.premessa).toBe("Gentile cliente");
    expect(m).not.toHaveProperty("sconosciuto");
  });
  it("niente modello (azienda nuova) = valori di serie", () => {
    expect(leggiModelloComputo(null)).toEqual(modelloComputoDiSerie());
    expect(leggiModelloComputo([1, 2])).toEqual(modelloComputoDiSerie());
  });
  it("un computo nuovo parte con formato, condizioni e IVA del modello", () => {
    const m = { ...modelloComputoDiSerie(), formatoPredefinito: "tecnico" as const, pagamenti: "30% alla firma", ivaModalita: "applicata" as const, ivaAliquota: "10" };
    const b = bozzaDalModello(bozzaVuota(), m);
    expect(b.formatoPdf).toBe("tecnico"); expect(b.pagamenti).toBe("30% alla firma"); expect(b.ivaAliquota).toBe("10");
  });
});

describe("il PDF del preventivo con computo usa la veste del modello", () => {
  const genera = (veste: ReturnType<typeof vesteDalModello> | undefined) =>
    generaComputoPdf(vociDaBozza(bozza), { ...bozza, presentazione: "preventivo", azienda: "Impresa Esempio", stato: "", veste });
  it("premessa, firme e piè di pagina compaiono", async () => {
    const pdf = (await genera({ ...vesteDalModello(modelloComputoDiSerie()), premessa: "Gentile cliente ecco il computo", mostraFirma: true, firmatario: "Mario Rossi titolare", piePagina: "Impresa Esempio srl - Monza" })).output();
    expect(pdf).toContain("Gentile cliente ecco il computo");
    expect(pdf).toContain("ACCETTAZIONE PROPOSTA"); expect(pdf).toContain("FIRMA DEL COMMITTENTE");
    expect(pdf).toContain("Mario Rossi titolare");
    expect(pdf).toContain("Impresa Esempio srl - Monza");
  });
  it("senza modello niente firme, e il documento definitivo non dice «bozza»", async () => {
    const pdf = (await genera(undefined)).output();
    expect(pdf).not.toContain("PER ACCETTAZIONE");
    expect(pdf.toLowerCase()).not.toContain("bozza locale");
  });
  it("le tre copertine si stampano tutte", async () => {
    for (const copertina of ["piena", "fascia", "sobria"] as const) {
      const pdf = (await genera({ ...vesteDalModello(modelloComputoDiSerie()), copertina, sopratitolo: "Offerta impianti sportivi" })).output();
      expect(pdf).toContain("OFFERTA IMPIANTI SPORTIVI");
    }
  });
});
