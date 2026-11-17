import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { generaDistinta, type VoceComputo } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";

/**
 * I materiali dal computo PriMus vero di Genzano (riqualificazione energetica, 182 voci di
 * lavoro), simulazione del 17/11/2026. Prima: 510 moduli fotovoltaici invece di 160, 28.862 mq
 * di pannelli in più dal «sovrapprezzo per ogni cm di spessore», termostati da un bollitore,
 * mattoni da un controtelaio, cinque tipi di serramento in un «Serramento» solo.
 */
function vociLavori(): VoceComputo[] {
  const pagine: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { pagine.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...testo] = riga.split("\t");
    pagine.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: testo.join("\t") });
  }
  return leggiComputoPrimus(pagine).voci
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.super_categoria?.nome?.trim() === "ECO")
    .map(({ v, i }): VoceComputo => ({
      id: String(i + 1), codice_tariffa: v.codice_tariffa, descrizione_breve: v.descrizione, unita_misura: v.unita_misura,
      quantita: v.quantita, is_sicurezza: v.is_sicurezza, is_detrazione: v.is_detrazione, a_corpo: v.a_corpo, categoria: v.categoria?.nome ?? null,
    }));
}

describe("materiali dal computo di Genzano", () => {
  const r = generaDistinta({ voci: vociLavori(), scomposizioni: [], riserva: catalogoComeScomposizioni() });
  const righe = (re: RegExp) => r.righe.filter((m) => re.test(m.descrizione));
  const totale = (re: RegExp) => righe(re).reduce((t, m) => t + m.quantita_calcolata, 0);

  it("160 moduli fotovoltaici, con la potenza scritta nel computo", () => {
    expect(totale(/^Modulo fotovoltaico/)).toBe(160);
    expect(righe(/^Modulo fotovoltaico/)[0].specifiche).toContain("510-580 Wp");
  });

  it("il sovrapprezzo per ogni cm di spessore non è altra superficie di cappotto", () => {
    // 3.104,39 mq della voce + 5% di sfrido, non 32.122 mq.
    expect(totale(/^Pannello isolante per cappotto/)).toBeLessThan(3104.39 * 1.06);
    expect(r.escluse.some((e) => /sovrapprezzo/i.test(e.motivo) && /ogni cm/i.test(e.descrizione))).toBe(true);
  });

  it("niente materiali da parole lette in mezzo alla descrizione", () => {
    expect(righe(/^Termostato/)).toHaveLength(0);       // dal bollitore e dal radiatore
    expect(righe(/^Blocco in laterizio|^Malta per muratura/)).toHaveLength(0); // dal controtelaio
    expect(righe(/^Rasante/)).toHaveLength(0);           // dal manto in coppi
    // La controsoglia in travertino non porta pannelli da cappotto.
    expect(r.righe.some((m) => /cappotto/i.test(m.descrizione) && m.origini.some((p) => /travertino/i.test(p.descrizione ?? "")))).toBe(false);
  });

  it("i cinque tipi di serramento restano distinti", () => {
    const serramenti = righe(/^Serramento ·/).map((m) => m.descrizione);
    expect(new Set(serramenti).size).toBe(5);
    expect(serramenti).toContain("Serramento · finestra a 2 ante, a battente");
  });
});

describe("capitoli del computo nelle fasi della commessa (Genzano)", () => {
  it("ogni capitolo va nella fase col suo nome, l'impianto termico non finisce nel cappotto", async () => {
    const { propostaFasi } = await import("@/lib/distinta/fasiMateriali");
    const nomi = ["ONERI DELLA SICUREZZA", "ECO · ISOLAMENTO TERMICO SU STRUTTURE OPACHE", "ECO · SOSTITUZIONE INFISSI E SCHERMATURE",
      "ECO · ISTALLAZIONE IMPIANTO FOTOVOLTAICO", "ECO · ISTALLAZIONE IMPIANTO DI ACCUMULO", "ECO · ISTALLAZIONE COLONNINA DI RICARICA ELETRICCA", "ECO · IMPIANTO TERMICO"];
    const fasi = nomi.map((name, i) => ({ id: `f${i}`, name }));
    const voci = nomi.map((c, i): VoceComputo => ({ id: String(i), descrizione_breve: "x", capitolo_nome: c }));
    const p = propostaFasi(voci, fasi);
    nomi.forEach((c, i) => expect(p.get(c)).toBe(`f${i}`));
    // Anche con le fasi senza la super-categoria davanti.
    const corte = nomi.map((name, i) => ({ id: `c${i}`, name: name.replace(/^ECO · /, "") }));
    expect(propostaFasi(voci, corte).get("ECO · IMPIANTO TERMICO")).toBe("c6");
  });
});
