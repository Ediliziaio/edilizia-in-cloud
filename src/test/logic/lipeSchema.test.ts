import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { xmlLipe, type ComunicazioneLipe, type RighiLipe } from "@/lib/contabilita/lipeXml";

const SCHEMA = join(__dirname, "../fixtures/lipe-xsd/fornituraIvp_2018_v1.xsd");
const haXmllint = spawnSync("xmllint", ["--version"]).status === 0;
const cartella = mkdtempSync(join(tmpdir(), "lipe-"));

const valido = (xml: string, nome: string) => {
  const f = join(cartella, `${nome}.xml`);
  writeFileSync(f, xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", SCHEMA, f], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

const r = (p: Partial<RighiLipe> = {}): RighiLipe => ({
  vp2: 10000.5, vp3: 5000, vp4: 2200, vp5: 1100, vp6_debito: 1100, vp6_credito: 0, vp7: 0, vp8: 0, vp9: 0,
  vp10: 0, vp11: 0, vp12: 0, vp13: 0, vp13_metodo: null, vp14_debito: 1100, vp14_credito: 0, ...p,
});
const base = { anno: 2026, codiceFiscale: "01234567890", partitaIva: "01234567890", cfDichiarante: "RSSMRA80A01H501U", codiceCarica: "1" };
const credito = { vp4: 100, vp5: 400, vp6_debito: 0, vp6_credito: 300, vp14_debito: 0 };

describe.skipIf(!haXmllint)("il file LIPE rispetta lo schema dell'Agenzia", () => {
  it.each<[string, ComunicazioneLipe]>([
    ["trimestre con interessi", { ...base, moduli: [{ trimestre: 1, righi: r({ vp12: 11, vp14_debito: 1111 }) }] }],
    ["tre mesi con credito", { ...base, moduli: [{ mese: 1, righi: r() }, { mese: 2, righi: r({ ...credito, vp14_credito: 300 }) }, { mese: 3, righi: r({ ...credito, vp8: 300, vp14_credito: 600 }) }] }],
    ["quarto trimestre con acconto", { ...base, moduli: [{ trimestre: 5, righi: r({ vp13: 500, vp13_metodo: 1, vp14_debito: 600 }) }] }],
    ["con intermediario", { ...base, cfIntermediario: "98765432109", dataImpegno: "2026-05-20", moduli: [{ trimestre: 2, righi: r({ vp9: 50, vp14_debito: 1050 }) }] }],
    ["persona fisica, imponibile negativo", { ...base, codiceFiscale: "RSSMRA80A01H501U", cfDichiarante: null, codiceCarica: null, moduli: [{ trimestre: 3, righi: r({ vp2: -20, vp4: 0, vp5: 0, vp6_debito: 0, vp14_debito: 0 }) }] }],
  ])("%s", (nome, c) => {
    expect(valido(xmlLipe(c), nome.replace(/\W/g, "_"))).toBe(true);
  });

  it("lo schema scarta davvero un file sbagliato", () => {
    const buono = xmlLipe({ ...base, moduli: [{ trimestre: 1, righi: r() }] });
    expect(valido(buono.replace("10000,50", "10000.50"), "punto")).toBe(false);
    expect(valido(buono.replace("<iv:NumeroModulo>1</iv:NumeroModulo>", ""), "senza_modulo")).toBe(false);
  });
});
