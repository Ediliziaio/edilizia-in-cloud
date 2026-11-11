/** Condizioni contrattuali esplicite, condivise da importazione, preventivo e prospetto. */
export type UnitaCoefficiente = "percentuale_mese" | "percentuale_periodo" | "euro_mille_mese" | "euro_mille_periodo" | "canone_periodo";
export type RigaNoleggio = {
    importoDa: number;
    importoA: number;
    durataMesi: number;
    periodoMesi: 1 | 3;
    coefficiente: number;
    unita: UnitaCoefficiente;
};
export type CondizioniNoleggio = {
    anticipoPct: number;
    speseIniziali: number;
    prelocazione: number;
    assicurazioneAnnua: number;
    manutenzioneAnnua: number;
    manutenzioneInclusa: boolean;
    canoniAnticipati: boolean;
    fine: "da_definire" | "restituzione" | "acquisto";
    acquistoFinale: number | null;
};
export type TabellaNoleggio = {
    versione: 1;
    id: string;
    companyId: string;
    fornitore: string;
    nome: string;
    revisione: string;
    dal: string;
    al: string;
    attiva: boolean;
    prova: boolean;
    soloSimulazione?:boolean;
    validitaNonIndicata?:boolean;
    assicurazioneDaQuotare?:boolean;
    note?:string;
    righe: RigaNoleggio[];
    condizioni: CondizioniNoleggio;
    fonte: {
        nome: string;
        sha256: string;
    } | null;
    allegati?: {
        nome: string;
        sha256: string;
    }[];
};
const unita: UnitaCoefficiente[] = ["percentuale_mese", "percentuale_periodo", "euro_mille_mese", "euro_mille_periodo", "canone_periodo"];
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const numero = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const testo = (x: unknown, max = 160): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
export function dataValida(s: unknown): s is string { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s))
    return false; const d = new Date(s + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; }
export function validaTabellaNoleggio(raw: unknown): TabellaNoleggio {
    if (!record(raw) || raw.versione !== 1 || !testo(raw.id, 80) || !testo(raw.companyId, 80) || !testo(raw.fornitore) || !testo(raw.nome) || !testo(raw.revisione, 80) || !(raw.validitaNonIndicata===true&&raw.soloSimulazione===true&&raw.dal===""&&raw.al==="" || dataValida(raw.dal)&&dataValida(raw.al)&&raw.al>=raw.dal) || typeof raw.attiva !== "boolean" || typeof raw.prova !== "boolean" || !Array.isArray(raw.righe) || !raw.righe.length || raw.righe.length > 1000)
        throw new Error("Completa fornitore, nome, versione, validità e almeno una riga della tabella.");
    if(["soloSimulazione","validitaNonIndicata","assicurazioneDaQuotare"].some(k=>raw[k]!==undefined&&typeof raw[k]!=="boolean")||(raw.note!==undefined&&(typeof raw.note!=="string"||raw.note.length>1000)))throw new Error("Avvertenze della tabella non valide.");
    if(raw.validitaNonIndicata===true&&!(raw.soloSimulazione===true&&raw.dal===""&&raw.al===""))throw new Error("Validità non indicata: utilizzabile solo come simulazione senza date commerciali inventate.");
    const c = raw.condizioni;
    if (!record(c) || !numero(c.anticipoPct, 0, 99) || !numero(c.speseIniziali, 0, 1e6) || !numero(c.prelocazione, 0, 1e6) || !numero(c.assicurazioneAnnua, 0, 1e6) || !numero(c.manutenzioneAnnua, 0, 1e6) || typeof c.manutenzioneInclusa !== "boolean" || typeof c.canoniAnticipati !== "boolean" || !["da_definire", "restituzione", "acquisto"].includes(String(c.fine)) || (c.acquistoFinale !== null && !numero(c.acquistoFinale, 0, 1e7)) || (c.fine === "acquisto" && c.acquistoFinale === null))
        throw new Error("Verifica anticipo, spese, servizi e condizioni di fine contratto.");
    const righe = raw.righe.map((r, i) => { if (!record(r) || !numero(r.importoDa, .01, 1e8) || !numero(r.importoA, r.importoDa, 1e8) || !numero(r.durataMesi, 1, 240) || !Number.isInteger(r.durataMesi) || (r.periodoMesi !== 1 && r.periodoMesi !== 3) || r.durataMesi % Number(r.periodoMesi) !== 0 || !numero(r.coefficiente, .000001, 1e7) || !unita.includes(r.unita as UnitaCoefficiente))
        throw new Error(`Riga ${i + 1}: verifica fascia, durata, periodicità, coefficiente e unità.`); return { importoDa: r.importoDa, importoA: r.importoA, durataMesi: r.durataMesi, periodoMesi: r.periodoMesi as 1 | 3, coefficiente: r.coefficiente, unita: r.unita as UnitaCoefficiente }; });
    for (let i = 0; i < righe.length; i++)
        for (let j = i + 1; j < righe.length; j++) {
            const a = righe[i], b = righe[j];
            if (a.durataMesi === b.durataMesi && a.periodoMesi === b.periodoMesi && Math.max(a.importoDa, b.importoDa) <= Math.min(a.importoA, b.importoA))
                throw new Error(`Fasce sovrapposte alle righe ${i + 1} e ${j + 1}: il canone deve avere una sola corrispondenza.`);
        }
    let fonte: TabellaNoleggio["fonte"] = null;
    if (raw.fonte !== null) {
        if (!record(raw.fonte) || !testo(raw.fonte.nome, 255) || typeof raw.fonte.sha256 !== "string" || !(/^[a-f0-9]{64}$/).test(raw.fonte.sha256))
            throw new Error("Riferimento al file originale non valido.");
        fonte = { nome: raw.fonte.nome, sha256: raw.fonte.sha256 };
    }
    const allegati = raw.allegati === undefined ? [] : raw.allegati;
    if (!Array.isArray(allegati) || allegati.length > 2 || !allegati.every(f => record(f) && testo(f.nome, 255) && typeof f.sha256 === "string" && /^[a-f0-9]{64}$/.test(f.sha256)))
        throw new Error("Riferimenti agli allegati non validi.");
    return { versione: 1, id: raw.id, companyId: raw.companyId, fornitore: raw.fornitore.trim(), nome: raw.nome.trim(), revisione: raw.revisione.trim(), dal: raw.dal as string, al: raw.al as string, soloSimulazione:raw.soloSimulazione===true,validitaNonIndicata:raw.validitaNonIndicata===true,assicurazioneDaQuotare:raw.assicurazioneDaQuotare===true,note:typeof raw.note==="string"?raw.note:"", attiva: raw.attiva, prova: raw.prova, righe, condizioni: { anticipoPct: c.anticipoPct, speseIniziali: c.speseIniziali, prelocazione: c.prelocazione, assicurazioneAnnua: c.assicurazioneAnnua, manutenzioneAnnua: c.manutenzioneAnnua, manutenzioneInclusa: c.manutenzioneInclusa, canoniAnticipati: c.canoniAnticipati, fine: c.fine as CondizioniNoleggio["fine"], acquistoFinale: c.acquistoFinale as number | null }, fonte, allegati: allegati.map(f => ({ nome: f.nome as string, sha256: f.sha256 as string })) };
}
export const euro = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export function calcolaCanone(tabella: TabellaNoleggio, importoNetto: number, durataMesi: number, periodoMesi: number, companyId: string, oggi: string) {
    const t = validaTabellaNoleggio(tabella);
    if (t.companyId !== companyId)
        throw new Error("Tabella non appartenente all’azienda selezionata.");
    if (!t.attiva || !dataValida(oggi) || (!t.validitaNonIndicata&&(oggi < t.dal || oggi > t.al)))
        throw new Error("La tabella non è attiva o non è valida alla data del preventivo.");
    if (!numero(importoNetto, .01, 1e8))
        throw new Error("Importo del noleggio non valido.");
    const r = t.righe.find(r => r.durataMesi === durataMesi && r.periodoMesi === periodoMesi && importoNetto >= r.importoDa && importoNetto <= r.importoA);
    if (!r)
        throw new Error("Nessuna condizione per questo importo, durata e periodicità. Seleziona una riga disponibile.");
    const anticipo = euro(importoNetto * t.condizioni.anticipoPct / 100), base = importoNetto - anticipo;
    const valore = r.unita === "canone_periodo" ? r.coefficiente : r.unita.startsWith("percentuale") ? base * r.coefficiente / 100 : base * r.coefficiente / 1000;
    const canone = euro(valore * (r.unita.endsWith("_mese") ? r.periodoMesi : 1));
    if (canone <= 0)
        throw new Error("Il coefficiente genera un canone nullo: verifica l’unità.");
    return { tabella: t, riga: r, anticipo, base, canonePeriodo: canone, equivalenteMensile: euro(canone / r.periodoMesi), numeroCanoni: r.durataMesi / r.periodoMesi, totaleCanoni: euro(canone * r.durataMesi / r.periodoMesi) };
}
export const CONDIZIONI_VUOTE: CondizioniNoleggio = { anticipoPct: 0, speseIniziali: 0, prelocazione: 0, assicurazioneAnnua: 0, manutenzioneAnnua: 0, manutenzioneInclusa: false, canoniAnticipati: true, fine: "da_definire", acquistoFinale: null };
