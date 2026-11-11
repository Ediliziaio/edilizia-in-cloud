import { describe, it, expect } from "vitest";
import { CAPANNONE_BASE, POSA_BASE, creaCapannone, fonteCapannone, configuraCapannone, gruppiProduzione } from "../../../dev/fotovoltaico-locale/capannone";
import { edificioCorretto, conservaPosaDopoCorrezione,nuovaFalda,edificioDaFalde } from "../../../dev/fotovoltaico-locale/rilievoLocale";
import { pannelliDalDisegnoReale, sub, dot } from "../../../dev/fotovoltaico-locale/tettoReale";
import { leggiDisegnoCommerciale, pannelliDaRivedere, disponiModuliAutomaticamente, aggiornaOstacoloConPosa, ingombroModulo, dimensioniModulo } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { datiDalDisegno } from "@/lib/fotovoltaico/disegnoPreventivo";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { anteprimaFotovoltaico } from "@/lib/fotovoltaico/anteprima";
import { richiestaProduzione, parametriPVGIS, aggregaIrraggiamento } from "../../../dev/fotovoltaico-locale/pvgisLocale";
const modulo = { corto: 1.134, lungo: 1.762, stimato: false };
const fonte = () => fonteCapannone(CAPANNONE_BASE, "test-capannone");
describe("Capannone: geometria, produzione e preventivo", () => {
    it("conserva le misure fisiche sui tetti quasi piani e ricava l’esposizione effettiva",()=>{
        const f=fonte();f.edificioBase=edificioDaFalde([nuovaFalda([{x:-20,y:-20,z:8},{x:20,y:-20,z:8+40*Math.tan(.5*Math.PI/180)},{x:20,y:20,z:8+40*Math.tan(.5*Math.PI/180)},{x:-20,y:20,z:8}],"piano","Piano con drenaggio")],true);
        const p=configuraCapannone(f,modulo,POSA_BASE,10),reali=pannelliDalDisegnoReale(f.edificioBase,p),g=gruppiProduzione(p,f.edificioBase,450);
        for(const r of reali){expect(r.larghezza).toBeCloseTo(modulo.corto,6);expect(r.lunghezza).toBeCloseTo(modulo.lungo,6);}
        expect(Math.abs(g[0].azimut-180)).toBeLessThan(3);expect(g[0].inclinazione).toBeCloseTo(15,0);
    });

    it.each(["piano", "due_falde", "shed"] as const)("crea una copertura %s con quote e falde distinte", copertura => {
        const f = fonteCapannone({ ...CAPANNONE_BASE, copertura }), p = configuraCapannone(f, modulo, { ...POSA_BASE, posa: copertura === "piano" ? "sud" : "aderente" }, 600, 1.2);
        expect(f.edificioBase.facce.filter(f => f.tipo === "RoofSurface")).toHaveLength(copertura === "piano" ? 1 : copertura === "due_falde" ? 2 : 6);
        expect(p.pannelli.length).toBeGreaterThan(500);
        expect(pannelliDaRivedere(p)).toEqual([]);
        expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)))).toEqual(p);
    });
    it.each(["sud", "est_ovest"] as const)("i pannelli su supporti %s conservano le dimensioni fisiche e l’orientamento", posa => {
        const f = fonte(), p = configuraCapannone(f, modulo, { ...POSA_BASE, posa }, 700, 1.2), reali = pannelliDalDisegnoReale(f.edificioBase, p), g = gruppiProduzione(p, f.edificioBase, 450);
        for (const [i, r] of reali.entries()) {
            const dim = dimensioniModulo(p.pannelli[i], modulo);
            expect(Math.hypot(...Object.values(sub(r.vertici[1], r.vertici[0])))).toBeCloseTo(dim.w, 6);
            expect(Math.hypot(...Object.values(sub(r.vertici[3], r.vertici[0])))).toBeCloseTo(dim.h, 6);
            expect(dot(r.piano.n, r.piano.u)).toBeCloseTo(0, 6);
            expect(r.piano.n.z).toBeCloseTo(Math.cos(15 * Math.PI / 180), 6);
        }
        expect(g.map(x => x.azimut).sort((a, b) => a - b)).toEqual(posa === "sud" ? [180] : [90, 270]);
        expect(g.reduce((n, x) => n + x.kwp, 0)).toBeCloseTo(p.pannelli.length * .45);
        expect(pannelliDaRivedere(p)).toEqual([]);
    });
    it("gestisce 2.000 moduli senza troncare il JSON o perdere le strutture nel ricalcolo", () => {
        const f = fonteCapannone({ ...CAPANNONE_BASE, larghezza: 80, profondita: 80 }), p = configuraCapannone(f, modulo, { ...POSA_BASE, posa: "aderente" }, 3000);
        expect(p.pannelli).toHaveLength(2000);
        expect(leggiDisegnoCommerciale(p)?.pannelli).toHaveLength(2000);
        expect(disponiModuliAutomaticamente(p, 2500).pannelli).toHaveLength(2000);
        expect(new Set(p.pannelli.map(m => m.id)).size).toBe(2000);
    });
    it("esclude corridoi e lucernari conservando la posa e la distanza tra file", () => {
        const f = fonte(), p = configuraCapannone(f, modulo, POSA_BASE, 600, 1.2);
        expect(p.ostacoli[0].tipo).toBe("corridoio");
        const m = p.pannelli[0], r = ingombroModulo(m, p.modulo), next = aggiornaOstacoloConPosa(p, { id: "luce", tipo: "lucernario", x: r.x, y: r.y, w: 2, h: 2 })!;
        expect(next).toBeTruthy();
        expect(next.industriale).toEqual(p.industriale);
        expect(next.pannelli.every(m => m.supporto?.inclinazione === 15)).toBe(true);
        expect(pannelliDaRivedere(next)).toEqual([]);
        const spostato = { ...p, pannelli: p.pannelli.map((m, i) => i === 0 ? { ...m, y: m.y + .5 } : m) };
        expect(pannelliDaRivedere(spostato).length).toBeGreaterThan(0);
    });
    it("non applica cavalletti a falde inclinate e rifiuta geometrie/configurazioni fuori limite", () => {
        expect(() => configuraCapannone(fonteCapannone({ ...CAPANNONE_BASE, copertura: "due_falde" }), modulo, POSA_BASE, 10)).toThrow(/piana/);
        expect(() => creaCapannone({ ...CAPANNONE_BASE, larghezza: NaN })).toThrow();
        const p = configuraCapannone(fonte(), modulo, POSA_BASE, 10);
        expect(leggiDisegnoCommerciale({ ...p, industriale: { ...p.industriale, inclinazione: 50 } })).toBeNull();
        expect(leggiDisegnoCommerciale({ ...p, pannelli: [{ ...p.pannelli[0], supporto: undefined }] })).toBeNull();
        expect(leggiDisegnoCommerciale({ ...p, pannelli: [{ ...p.pannelli[0], supporto: { ...p.pannelli[0].supporto, verso: "x+" } }] })).toBeNull();
    });
    it("mantiene posa industriale e costi quando si corregge l’altezza", () => {
        const f = fonte(), p = configuraCapannone(f, modulo, POSA_BASE, 20), e = edificioCorretto({ ...f, altezzaManuale: 18 }), next = conservaPosaDopoCorrezione(p, f.edificioBase, e);
        expect(next.industriale).toEqual(p.industriale);
        expect(next.pannelli).toHaveLength(20);
        expect(leggiDisegnoCommerciale(next)).toEqual(next);
        const a = pannelliDalDisegnoReale(f.edificioBase, p), b = pannelliDalDisegnoReale(e, next);
        expect(b[0].centro.z - a[0].centro.z).toBeCloseTo(10);
    });
    it("porta strutture e inverter aggiuntivi nelle righe native senza duplicarli o perdere altri extra", () => {
        const p = configuraCapannone(fonte(), modulo, { ...POSA_BASE, costi: { strutturaModulo: 35, inverterAggiuntivi: 2, prezzoInverter: 5000 } }, 600), extra = [{ uid: "cliente", listino_id: null as string | null, descrizione: "Pratica", quantita: 1, prezzo_vendita: 100, prezzo_acquisto: null as number | null }], d = { ...INITIAL, con_accumulo: false, pannello_id: "p", inverter_id: "i", ...datiDalDisegno(p, 450, extra) }, listino = { pannelli: [{ id: "p", potenza_w: 450, prezzo_vendita: 180 }], inverter: [{ id: "i", prezzo_vendita: 5000 }], accumuli: [] as never[] };
        expect(d.prodotti_extra).toHaveLength(3);
        expect(datiDalDisegno(p, 450, d.prodotti_extra).prodotti_extra).toHaveLength(3);
        const a = anteprimaFotovoltaico(d, { listino, regoleSconto: [], impiantoConfigurato: true }), ridotto = { ...d, ...datiDalDisegno({ ...p, pannelli: p.pannelli.slice(1) }, 450, d.prodotti_extra) }, b = anteprimaFotovoltaico(ridotto, { listino, regoleSconto: [], impiantoConfigurato: true });
        expect(a.totaleDocumento! - b.totaleDocumento!).toBeCloseTo(215 * 1.1);
        expect(datiDalDisegno({ ...p, industriale: undefined, pannelli: [] }, 450, d.prodotti_extra).prodotti_extra).toEqual(extra);
    });
    it("converte gli azimut PVGIS e pesa l’irraggiamento per la potenza effettiva", () => {
        const gruppi = [{ inclinazione: 15, azimut: 90, kwp: 100, moduli: 200 }, { inclinazione: 15, azimut: 270, kwp: 50, moduli: 100 }], r = richiestaProduzione({ lat: 45, lng: 9, kwp: 150, gruppi });
        expect(parametriPVGIS(r.lat, r.lng, gruppi[0]).get("aspect")).toBe("-90");
        expect(parametriPVGIS(r.lat, r.lng, gruppi[1]).get("aspect")).toBe("90");
        expect(aggregaIrraggiamento(gruppi, [1500, 1200])).toBe(1400);
        expect(() => richiestaProduzione({ lat: 45, lng: 9, kwp: 200, gruppi })).toThrow();
        expect(() => richiestaProduzione({ lat: NaN, lng: 9, kwp: 150, gruppi })).toThrow();
        expect(() => aggregaIrraggiamento(gruppi, [NaN, 1000])).toThrow();
    });
});
