import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configurazioniStandard, GRUPPI_CONFIGURAZIONI } from "@/lib/serramenti/catalogoConfigurazioni";
import { TIPOLOGIE_DISEGNO, disegnaSerramento } from "@/lib/serramenti/disegnoSerramento";
import { apertureDellaTipologia } from "@/lib/serramenti/assiDisegno";
import { configDaFamiglia, disegnoDaConfig } from "@/lib/serramenti/disegnoDaFamiglia";
import { tipologiaDaNome } from "@/lib/serramenti/tipologiaDaNome";
import { controllaMisure } from "@/lib/serramenti/limitiSerramento";
import type { FamilyWithAxes } from "@/types/articleFamily";

const f = (tipo: string, codice: string, label: string, asse = "apertura") => ({
  nome: tipo, disegno_tipologia: tipo,
  axes: [{ codice: asse, values: [{ id: "scelta", valore: codice, label, attivo: true }] }],
}) as unknown as FamilyWithAxes;

describe("catalogo geometrico indipendente dalla linea e dall'azienda", () => {
  it("editor e database espongono ogni configurazione del motore, senza copie divergenti", () => {
    const sql = readFileSync("supabase/migrations/20261009082822_serramenti_catalogo_configurazioni_comune.sql", "utf8");
    const payload = JSON.parse(sql.split("$configurazioni$")[1]);
    expect(payload).toEqual(configurazioniStandard().filter((c) => c.id !== "porta_finestra_scorrevole_2_ante"));
    expect(new Set(payload.map((p: { id: string }) => p.id)).size).toBe(TIPOLOGIE_DISEGNO.length - 1);
    expect(GRUPPI_CONFIGURAZIONI.flatMap((g) => g.voci.map(([id]) => id)).sort()).toEqual(TIPOLOGIE_DISEGNO.map((t) => t.id).sort());
    expect(sql).toContain("has_permission_for_company");
    expect(sql).toContain("company_id = v_company");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toMatch(/update public\.(article_families|article_family_axis_values|sr_quote)/i);
  });
  it("non inventa prezzi, gamma o prestazioni di Rehau, Salamander, Aluplast", () => {
    expect(JSON.stringify(configurazioniStandard())).not.toMatch(/prezzo|Uw|Rehau|Salamander|Aluplast/);
  });
  it.each(TIPOLOGIE_DISEGNO.map((t) => [t.id, t] as const))("%s: due viste e quote valide a tre dimensioni", (id, t) => {
    for (const k of [0.8, 1, 1.25]) {
      const d = disegnoDaConfig({ v: 1, tipologia: id }, Math.round(t.larghezzaMm * k), Math.round(t.altezzaMm * k));
      expect(d?.tipo).toBe("serramento");
      if (d?.tipo !== "serramento") throw new Error(id);
      for (const v of d.viste) {
        const scena = disegnaSerramento(v.disegno);
        expect(scena.forme.length).toBeGreaterThan(3);
        expect(JSON.stringify(scena)).not.toMatch(/NaN|Infinity/);
        expect(scena.quote.length).toBeGreaterThan(0);
      }
    }
  });
  it("finestre e porte a quattro ante sono vere configurazioni", () => {
    for (const id of ["finestra_4_ante", "porta_finestra_4_ante"]) {
      expect(apertureDellaTipologia(id)[0].ante).toHaveLength(4);
    }
    expect(tipologiaDaNome("Finestra 4 ante")).toBe("finestra_4_ante");
    expect(tipologiaDaNome("Porta finestra 4 ante")).toBe("porta_finestra_4_ante");
  });
  it("non confonde la porta finestra con una finestra nei composti laterali", () => {
    for (const lato of ["SX", "DX"]) {
      expect(tipologiaDaNome(`Porta finestra 2 ante con fisso laterale ${lato}`)).toBe(`porta_finestra_2_ante_fisso_${lato.toLowerCase()}`);
      expect(tipologiaDaNome(`Finestra 2 ante con fisso laterale ${lato}`)).toBe(`finestra_2_ante_fisso_${lato.toLowerCase()}`);
    }
  });
  it("il verso specchia l'intero scorrevole, compreso il fisso, senza appiattire le centrali", () => {
    const due = apertureDellaTipologia("alzante_as_fa");
    expect(due[0].ante[0].tipo).toBe("alzante_scorrevole");
    expect(due[1].ante[1].tipo).toBe("alzante_scorrevole");
    for (const id of ["slide_plus", "finestra_scorrevole_2_ante", "alzante_fa_as_as_fa"]) {
      expect(apertureDellaTipologia(id)).toHaveLength(2);
      const lati = apertureDellaTipologia(id)[0].ante.filter((a) => a.tipo.includes("scorrevole")).map((a) => a.lato);
      expect(new Set(lati)).toEqual(new Set(["sx", "dx"]));
    }
  });
  it("le nuove scelte si congelano e gli snapshot precedenti conservano il comportamento storico", () => {
    const c = configDaFamiglia(f("traslante_4_ante", "scorre_dx", "Scorre verso DX"), { apertura: "scelta" })!;
    const d = disegnoDaConfig(JSON.parse(JSON.stringify(c)), 3200, 2200);
    expect(c.ante).toHaveLength(4);
    if (d?.tipo === "serramento") expect(new Set(d.viste[0].disegno.ante.filter((a) => a.tipo === "scorrevole").map((a) => a.lato))).toEqual(new Set(["sx", "dx"]));
    const vecchio = disegnoDaConfig({ v: 1, tipologia: "traslante_4_ante", aperturaCodice: "scorre_dx" }, 3200, 2200);
    if (vecchio?.tipo === "serramento") expect(new Set(vecchio.viste[0].disegno.ante.filter((a) => a.tipo === "scorrevole").map((a) => a.lato))).toEqual(new Set(["dx"]));
    const fisso = configDaFamiglia({ nome: "Fisso nel telaio", disegno_tipologia: "fisso", axes: [] } as unknown as FamilyWithAxes, {})!;
    expect(fisso.ante).toEqual(TIPOLOGIE_DISEGNO.find((t) => t.id === "fisso")!.ante);
    expect(fisso.ante).not.toBe(TIPOLOGIE_DISEGNO.find((t) => t.id === "fisso")!.ante);
  });
  it("soglia e sopraluce scelti si ritrovano nel disegno salvato", () => {
    const c = configDaFamiglia(f("porta_finestra_1_anta", "senza", "Senza soglia", "soglia"), { soglia: "scelta" })!;
    expect(c.soglia).toBe(false);
    const d = disegnoDaConfig(c, 900, 2200);
    if (d?.tipo === "serramento") expect(d.viste[0].disegno.soglia).toBe(false);
    const s = configDaFamiglia(f("finestra_2_ante_sopraluce", "vasistas", "Apribile a vasistas", "apertura_sopraluce"), { apertura_sopraluce: "scelta" })!;
    const ds = disegnoDaConfig(s, 1200, 1800);
    if (ds?.tipo === "serramento") expect(ds.viste[0].disegno.sopraluce?.apribile).toBe(true);
  });
  it("il compositore mantiene larghezze, traversi, inglesine e sopraluce nel PDF", () => {
    const c = { v: 1 as const, tipologia: "personalizzata", definizione: { ante: [{ tipo: "battente" as const, larghezzaMm: 600 }, { tipo: "fisso" as const, nelTelaio: true }], sopraluce: { altezzaMm: 300, apribile: true }, traversi: [{ daBassoMm: 600 }], inglesine: { colonne: 2, righe: 2 } } };
    const d = disegnoDaConfig(c, 1400, 2000);
    if (d?.tipo !== "serramento") throw new Error("Disegno assente");
    expect(d.viste[0].disegno.ante[0].larghezzaMm).toBe(600);
    expect(d.viste[0].disegno.traversi).toEqual(c.definizione.traversi);
    expect(d.viste[0].disegno.inglesine).toEqual(c.definizione.inglesine);
    expect(controllaMisure(d.viste[0].disegno).filter((a) => a.gravita === "errore")).toEqual([]);
  });
});
