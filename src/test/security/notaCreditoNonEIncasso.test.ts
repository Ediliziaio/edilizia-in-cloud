import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.4 — una nota di credito non è un incasso.
 *
 * Provato su produzione con una fattura da 1.220 € scaduta e la sua nota di
 * credito, poi tutto cancellato (anno 2093, zero residuo):
 *   prima dello storno .... residuo 1.220,00 · stato «scaduta»
 *   dopo lo storno ........ residuo 0,00 · stato «stornata» · stornato 1.220,00
 *   la nota di credito non compare fra i crediti da incassare
 *   gli incassi da fatture passano a −1.220,00 (il rimborso è un'uscita)
 *   lo scadenzario smette di chiedere la fattura stornata e continua a
 *     chiedere quella non stornata
 *   una nota di credito ancora in bozza non storna nulla
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggi = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const nc = leggi("nota_credito_non_e_un_incasso");
const scad = leggi("scadenzario_nessuna_fonte_affamata");

describe("il segno del documento", () => {
  it("distingue crediti, storni e documenti che non impegnano nessuno", () => {
    expect(nc).toMatch(/WHEN 'fattura'\s+THEN\s+1/);
    expect(nc).toMatch(/WHEN 'nota_credito'\s+THEN -1/);
    expect(nc).toMatch(/WHEN 'nota_debito'\s+THEN\s+1/);
    expect(nc).toMatch(/ELSE 0/);
  });

  it("spiega perché autofattura vale zero", () => {
    expect(nc.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /l'autofattura l'azienda la emette a sé stessa/);
  });
});

describe("gli incassi non contengono più i rimborsi", () => {
  it("le due somme moltiplicano per il segno", () => {
    const somme = nc.match(/importo_pagato,0\) \* public\.documento_segno\(tipo\)/g) ?? [];
    expect(somme.length, "servono entrambe: quadro_incassi e company_kpi").toBe(2);
  });

  it("le sostituzioni sul catalogo non possono essere mute", () => {
    const guardie = nc.match(/RAISE EXCEPTION '[^']*non trovat[oa]/g) ?? [];
    expect(guardie.length).toBeGreaterThanOrEqual(5);
  });
});

describe("lo storno riduce quello che il cliente deve", () => {
  it("il residuo sottrae le note di credito collegate", () => {
    const sottrazioni = nc.match(/public\.documento_stornato\((id|d\.id)\)/g) ?? [];
    expect(sottrazioni.length, "residuo, scadenzario e filtro non-pagate").toBe(3);
  });

  it("una nota di credito in bozza non storna", () => {
    expect(nc).toMatch(/nc\.stato NOT IN \('bozza', 'annullata'\)/);
    expect(nc).toMatch(/una nota di credito non emessa non ha stornato niente/);
  });
});

describe("la vista da cui passa la dashboard", () => {
  it("mostra solo i documenti che sono un credito verso il cliente", () => {
    expect(nc).toMatch(/AND public\.documento_segno\(df\.tipo\) = 1;/);
  });

  it("«stornata» è distinto da «pagata»", () => {
    expect(nc).toMatch(/THEN 'stornata'::text/);
    expect(nc).toMatch(/non è «pagata»: nessuno ha pagato/);
  });

  it("la colonna nuova è in fondo, per non rompere chi legge la vista", () => {
    const corpo = nc.slice(nc.indexOf("CREATE OR REPLACE VIEW"));
    const posStornato = corpo.indexOf("AS importo_stornato");
    const posNumeroIncassi = corpo.indexOf("AS numero_incassi");
    expect(posStornato).toBeGreaterThan(posNumeroIncassi);
  });
});

describe("lo scadenzario non affama nessuna fonte", () => {
  it("il taglio è per fonte, non complessivo", () => {
    expect(scad).toMatch(/row_number\(\) OVER \(PARTITION BY u\.fonte ORDER BY u\.scadenza ASC\)/);
    expect(scad).toMatch(/z\.posto <= 100/);
  });

  it("resta comunque limitato", () => {
    expect(scad).toMatch(/LIMIT 300/);
  });

  it("il difetto è documentato coi numeri veri", () => {
    expect(scad).toMatch(/"fatture_crm": 100, "fatture_fiscali": 0, "rate_commesse": 0/);
  });
});
