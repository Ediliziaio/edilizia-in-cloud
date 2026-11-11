import { disponiModuliOttimizzati, ingombroModulo, limiteModuliDisegno, pannelliDaRivedere, type DisegnoCommercialeFv, type ModuloPosatoFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
export type PropostaPosa = {
    id: "verticale" | "orizzontale" | "compatta";
    titolo: string;
    descrizione: string;
    piano: DisegnoCommercialeFv;
    moduliFalda: number;
    richiesti: number;
};
/** Massimo rettangolo completo della griglia già valida, senza avvicinare i moduli. */
export function bloccoRegolare(moduli: ModuloPosatoFv[], modulo: DisegnoCommercialeFv["modulo"], spazio: number): ModuloPosatoFv[] {
    if (!moduli.length || moduli.some(m => m.orizzontale !== moduli[0].orizzontale || m.supporto))
        return [];
    const r0 = ingombroModulo(moduli[0], modulo), passoX = Math.ceil((r0.w + spazio) * 100) / 100, passoY = Math.ceil((r0.h + spazio) * 100) / 100;
    const xs = [...new Set(moduli.map(m => m.x))].sort((a, b) => a - b), ys = [...new Set(moduli.map(m => m.y))].sort((a, b) => a - b), celle = new Map(moduli.map(m => [`${m.x},${m.y}`, m])), altezze = xs.map(() => 0);
    let migliore: ModuloPosatoFv[] = [];
    for (let r = 0; r < ys.length; r++) {
        if (r > 0 && ys[r] - ys[r - 1] > passoY + .021)
            altezze.fill(0);
        for (let c = 0; c < xs.length; c++)
            altezze[c] = celle.has(`${xs[c]},${ys[r]}`) ? altezze[c] + 1 : 0;
        const pila: Array<{
            x: number;
            h: number;
        }> = [];
        const colonna = (c: number, h: number) => {
            let inizio = c;
            while (pila.length && pila.at(-1)!.h > h) {
                const v = pila.pop()!;
                inizio = v.x;
                const area = v.h * (c - v.x);
                if (area > migliore.length) {
                    const candidati: ModuloPosatoFv[] = [];
                    for (let y = r - v.h + 1; y <= r; y++)
                        for (let x = v.x; x < c; x++)
                            candidati.push(celle.get(`${xs[x]},${ys[y]}`)!);
                    migliore = candidati;
                }
            }
            if (h > 0 && (!pila.length || pila.at(-1)!.h < h))
                pila.push({ x: inizio, h });
        };
        for (let c = 0; c <= xs.length; c++) {
            if (c > 0 && c < xs.length && xs[c] - xs[c - 1] > passoX + .021)
                colonna(c, 0);
            colonna(c, c < xs.length ? altezze[c] : 0);
        }
    }
    return migliore;
}
/** Posa aderente su una sola falda; conserva moduli delle altre falde e tutti gli ingombri. */
export function propostePosa(piano: DisegnoCommercialeFv, faldaId: string, richiesti: number): PropostaPosa[] {
    if (!piano.falde.some(f => f.id === faldaId) || !Number.isInteger(richiesti) || richiesti < 1 || richiesti > limiteModuliDisegno(piano) || piano.industriale && piano.industriale.posa !== "aderente")
        return [];
    const proposte: PropostaPosa[] = ([false, true] as const).map(orizzontale => { const next = disponiModuliOttimizzati(piano, richiesti, orizzontale, faldaId); return { id: orizzontale ? "orizzontale" : "verticale", titolo: orizzontale ? "Moduli orizzontali" : "Moduli verticali", descrizione: orizzontale ? "Il lato lungo segue la fila sulla falda." : "Il lato corto segue la fila sulla falda.", piano: next, moduliFalda: next.pannelli.filter(m => m.faldaId === faldaId).length, richiesti } satisfies PropostaPosa; }).filter(p => p.moduliFalda > 0 && !pannelliDaRivedere(p.piano).length);
    const rettangoli = proposte.map(p => { const blocco = bloccoRegolare(p.piano.pannelli.filter(m => m.faldaId === faldaId), piano.modulo, piano.spazioModuli); return { ...p, blocco }; }).sort((a, b) => b.blocco.length - a.blocco.length);
    if (rettangoli.length) {
        const p = rettangoli[0], next = { ...p.piano, pannelli: [...p.piano.pannelli.filter(m => m.faldaId !== faldaId), ...p.blocco] };
        if (p.blocco.length > 0 && !proposte.some(v => firmaPosa(v.piano) === firmaPosa(next)))
            proposte.push({ id: "compatta", titolo: "Blocco regolare", descrizione: "Un rettangolo completo, con meno sporgenze nella sagoma dei moduli.", piano: next, moduliFalda: p.blocco.length, richiesti });
    }
    return proposte;
}
export function firmaPosa(piano: DisegnoCommercialeFv) { return JSON.stringify(piano.pannelli.map(m => { const r = ingombroModulo(m, piano.modulo); return [m.faldaId, r.x, r.y, r.w, r.h]; }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))); }
