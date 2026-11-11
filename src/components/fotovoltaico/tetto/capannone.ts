import { nuovaFalda, edificioDaFalde, edificioCorretto, pianoDelRilievo, type RilievoLocale } from "./rilievoLocale";
import { pannelliDalDisegnoReale, type EdificioReale, type FacciaReale } from "./tettoReale";
import { disponiModuliIndustriali, leggiDisegnoCommerciale, limitiDisegno, type DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
export type ParametriCapannone = {
    copertura: "piano" | "due_falde" | "shed";
    larghezza: number;
    profondita: number;
    altezza: number;
    pendenza: number;
    shed: number;
    corridoio: number;
};
export const CAPANNONE_BASE: ParametriCapannone = { copertura: "piano", larghezza: 60, profondita: 40, altezza: 8, pendenza: 12, shed: 3, corridoio: 1.2 };
export const POSA_BASE: NonNullable<DisegnoCommercialeFv["industriale"]> = { versione: 1, posa: "sud", inclinazione: 15, interfila: .8, costi: { strutturaModulo: 35, inverterAggiuntivi: 0, prezzoInverter: 5000 } };
export function creaCapannone(p: ParametriCapannone): EdificioReale {
    if (![p.larghezza, p.profondita, p.altezza, p.pendenza, p.shed, p.corridoio].every(Number.isFinite) || p.larghezza < 10 || p.larghezza > 80 || p.profondita < 10 || p.profondita > 80 || p.altezza < 2 || p.altezza > 40 || p.pendenza < 2 || p.pendenza > 25 || !Number.isInteger(p.shed) || p.shed < 2 || p.shed > 6 || p.corridoio < 0 || p.corridoio > 5)
        throw new Error("Verifica misure: lati 10–80 m, gronda 2–40 m, pendenza 2–25°, da 2 a 6 shed e corridoio 0–5 m.");
    const falde: FacciaReale[] = [], w = p.larghezza / 2, d = p.profondita / 2;
    const falda = (y1: number, y2: number, z1: number, z2: number, nome: string) => falde.push(nuovaFalda([{ x: -w, y: y1, z: z1 }, { x: w, y: y1, z: z1 }, { x: w, y: y2, z: z2 }, { x: -w, y: y2, z: z2 }], `falda-${falde.length + 1}`, nome));
    if (p.copertura === "piano")
        falda(-d, d, p.altezza, p.altezza, "Copertura piana");
    else {
        const n = p.copertura === "shed" ? p.shed : 1, passo = p.profondita / n;
        for (let i = 0; i < n; i++) {
            const y = -d + i * passo, colmo = y + passo * (p.copertura === "shed" ? .7 : .5), z = p.altezza + (colmo - y) * Math.tan(p.pendenza * Math.PI / 180);
            falda(y, colmo, p.altezza, z, n > 1 ? `Shed ${i + 1} · sud` : "Falda sud");
            falda(colmo, y + passo, z, p.altezza, n > 1 ? `Shed ${i + 1} · nord` : "Falda nord");
        }
    }
    return { ...edificioDaFalde(falde, true), id: "schema-capannone", attributi: { schemaIndustriale: { ...p }, paretiIllustrative: true } };
}
export function fonteCapannone(p: ParametriCapannone, id = `rilievo-${crypto.randomUUID()}`): RilievoLocale { return { versione: 1, id, nome: `Schema capannone ${p.larghezza} × ${p.profondita} m · ${p.copertura.replaceAll("_", " ")}`, creato: new Date().toISOString(), edificioBase: creaCapannone(p), orto: null, modello: null, altezzaManuale: null, allineamentoConfermato: true, provenienza: "schema" }; }
export function configuraCapannone(fonte: RilievoLocale, modulo: DisegnoCommercialeFv["modulo"], cfg: NonNullable<DisegnoCommercialeFv["industriale"]>, quantita: number, corridoio = 0): DisegnoCommercialeFv {
    const edificio = edificioCorretto(fonte);
    if (cfg.posa !== "aderente" && edificio.facce.some(f => f.tipo === "RoofSurface" && (f.pendenza ?? 0) > 1))
        throw new Error("Le strutture inclinate richiedono una copertura piana. Sulle falde usa la posa aderente.");
    const schema = { ...pianoDelRilievo(fonte, modulo, 0), industriale: cfg };
    if (corridoio > 0)
        for (const f of schema.falde) {
            const b = limitiDisegno({ falde: [f] });
            if (b.w > corridoio + 2)
                schema.ostacoli.push({ id: `corridoio-${f.id}`, tipo: "corridoio", x: b.x + (b.w - corridoio) / 2, y: b.y, w: corridoio, h: b.h });
        }
    if (!leggiDisegnoCommerciale(schema))
        throw new Error("Schema o parametri di posa non validi.");
    return disponiModuliIndustriali(schema, quantita);
}
export type GruppoPVGIS = {
    inclinazione: number;
    azimut: number;
    kwp: number;
    moduli: number;
};
export function gruppiProduzione(piano: DisegnoCommercialeFv, edificio: EdificioReale, wp: number): GruppoPVGIS[] {
    const gruppi = new Map<string, GruppoPVGIS>();
    for (const p of pannelliDalDisegnoReale(edificio, piano)) {
        const n = p.piano.n, inclinazione = Math.round(Math.acos(Math.min(1, Math.max(0, n.z))) * 180 / Math.PI * 10) / 10, azimut = inclinazione < .1 ? 180 : Math.round((Math.atan2(n.x, n.y) * 180 / Math.PI + 360) % 360) % 360, key = `${inclinazione}:${azimut}`;
        const g = gruppi.get(key) ?? { inclinazione, azimut, kwp: 0, moduli: 0 };
        g.moduli++;
        g.kwp = Math.round(g.moduli * wp) / 1000;
        gruppi.set(key, g);
    }
    return [...gruppi.values()];
}
