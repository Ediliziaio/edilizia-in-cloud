import Papa from "papaparse";
import { validaTabellaNoleggio, type TabellaNoleggio, type RigaNoleggio, type UnitaCoefficiente } from "../../../../supabase/functions/_shared/noleggioOperativo";
export type GrigliaImport = {
    colonne: string[];
    righe: string[][];
    nomeFoglio?: string;
};
export const CAMPI_NOLEGGIO = ["importoDa", "importoA", "durataMesi", "periodoMesi", "coefficiente", "unita"] as const;
export type MappaNoleggio = Record<typeof CAMPI_NOLEGGIO[number], string>;
const alias: Record<string, string[]> = { importoDa: ["importo_da", "da", "minimo"], importoA: ["importo_a", "a", "massimo"], durataMesi: ["durata_mesi", "durata", "mesi"], periodoMesi: ["periodo_mesi", "periodicita", "periodicità"], coefficiente: ["coefficiente", "coeff", "canone"], unita: ["unita", "unità", "unita_coefficiente"] };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
export function mappaSuggerita(colonne: string[]): MappaNoleggio { return Object.fromEntries(CAMPI_NOLEGGIO.map(k => [k, colonne.find(c => alias[k].includes(norm(c))) ?? ""])) as MappaNoleggio; }
export function leggiNumero(s: string) { const v = s.trim().replace(/[€%\s\u00a0]/g, ""); if (!v || !/^[-+]?\d[\d.,]*$/.test(v))
    return NaN; if (!v.includes(",") && /^[-+]?\d{1,3}(\.\d{3})+$/.test(v))
    return NaN; const n = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v; return Number(n); }
export function csvNoleggio(testo: string): GrigliaImport { const r = Papa.parse<string[]>(testo, { skipEmptyLines: "greedy" }); if (r.errors.length)
    throw new Error("CSV non leggibile: verifica separatori e virgolette."); const [header, ...righe] = r.data; if (!header?.length || header.length > 80 || righe.length > 1000)
    throw new Error("Usa una tabella con intestazioni e massimo 1.000 righe."); const colonne = header.map(x => x.trim().replace(/^\uFEFF/, "")); if (new Set(colonne).size !== colonne.length || colonne.some(c => !c))
    throw new Error("Le intestazioni devono essere presenti e univoche."); return { colonne, righe }; }
export async function leggiFileNoleggio(file: File, foglio = 0): Promise<{
    griglia: GrigliaImport;
    fogli: string[];
}> {
    if (file.size > 12 * 1024 * 1024)
        throw new Error("Usa un file di massimo 12 MB.");
    if (/\.csv$/i.test(file.name))
        return { griglia: csvNoleggio(await file.text()), fogli: [] };
    if (!/\.xlsx$/i.test(file.name))
        throw new Error("Per importare le righe usa CSV o XLSX. Il PDF si conserva come allegato; i dati vanno verificati e trascritti nel modello CSV.");
    const ExcelJS = (await import("exceljs")).default, w = new ExcelJS.Workbook();
    await w.xlsx.load(await file.arrayBuffer());
    const s = w.worksheets[foglio];
    if (!s || s.rowCount > 1001 || s.columnCount > 80)
        throw new Error("Foglio assente o troppo grande: massimo 1.000 righe e 80 colonne.");
    const lines: string[] = [];
    s.eachRow({ includeEmpty: true }, r => { const valori: string[] = []; for (let i = 1; i <= s.columnCount; i++) {
        const c = r.getCell(i);
        if (c.type === ExcelJS.ValueType.Formula)
            throw new Error("Il foglio contiene formule: esporta una copia con valori verificati prima di importare.");
        valori.push(c.text);
    } lines.push(Papa.unparse([valori], { delimiter: ";", newline: "\n" })); });
    return { griglia: { ...csvNoleggio(lines.join("\n")), nomeFoglio: s.name }, fogli: w.worksheets.map(s => s.name) };
}
export function righeDaGriglia(g: GrigliaImport, m: MappaNoleggio, defaultUnita: UnitaCoefficiente | "", defaultPeriodo: 1 | 3): {
    righe: RigaNoleggio[];
    errori: string[];
} {
    const errori: string[] = [], righe: RigaNoleggio[] = [];
    const leggi = (r: string[], k: keyof MappaNoleggio) => r[g.colonne.indexOf(m[k])] ?? "";
    for (const k of ["importoDa", "importoA", "durataMesi", "coefficiente"] as const)
        if (!m[k] || !g.colonne.includes(m[k]))
            errori.push(`Associa la colonna ${k}.`);
    if (errori.length)
        return { righe, errori };
    g.righe.forEach((r, i) => { const p = leggi(r, "periodoMesi"), u = leggi(r, "unita") || defaultUnita; const periodo = p ? (/trimestr/i.test(p) ? 3 : /mensil/i.test(p) ? 1 : leggiNumero(p)) : defaultPeriodo; const row = { importoDa: leggiNumero(leggi(r, "importoDa")), importoA: leggiNumero(leggi(r, "importoA")), durataMesi: leggiNumero(leggi(r, "durataMesi")), coefficiente: leggiNumero(leggi(r, "coefficiente")), periodoMesi: periodo as 1 | 3, unita: u as UnitaCoefficiente }; if (Object.values(row).some(x => typeof x === "number" && !Number.isFinite(x)) || !u)
        errori.push(`Riga ${i + 2}: numero o unità del coefficiente mancante.`);
    else
        righe.push(row); });
    return { righe, errori };
}
export function tabellaDaImport(dati: Omit<TabellaNoleggio, "righe" | "fonte">, righe: RigaNoleggio[], fonte: TabellaNoleggio["fonte"]) { return validaTabellaNoleggio({ ...dati, righe, fonte }); }
export const MODELLO_CSV = "importo_da;importo_a;durata_mesi;periodo_mesi;coefficiente;unita\n";
export const ESEMPIO_CSV = MODELLO_CSV + "1000;500000;60;3;5,40;percentuale_periodo\n1000;500000;84;3;4,20;percentuale_periodo\n1000;500000;60;1;1,85;percentuale_periodo\n1000;500000;84;1;1,45;percentuale_periodo\n";
