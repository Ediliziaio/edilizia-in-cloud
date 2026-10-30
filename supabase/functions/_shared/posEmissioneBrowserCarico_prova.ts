// deno-lint-ignore-file require-await -- i finti restituiscono promesse come gli oggetti veri, senza aspettare niente
// Non è un test: lo lancia posEmissioneBrowserCarico_test.ts in un processo nuovo, che equivale a un worker a freddo.
// Fa ciò che fa il server per un'emissione col PDF disegnato dal browser (prepara + completa) importando i moduli
// come fa il gestore, dentro la richiesta, e stampa su una riga di JSON quanta CPU ha speso in tutto (importazioni comprese).
import process from "node:process";

const [dir, nomeAutore] = Deno.args;
const dati = JSON.parse(await Deno.readTextFile(`${dir}/dati.json`));
const pdf = await Deno.readFile(`${dir}/POS.pdf`);

const c0 = process.cpuUsage();
const ms = (da: { user: number; system: number }) => { const u = process.cpuUsage(da); return Math.round((u.user + u.system) / 1000); };

const { companyId, id, memoria, posId, token } = await import("./posProvaMemoria.ts");
const { completaEmissioneBrowser, preparaEmissioneBrowser } = await import("./posEmissioneBrowser.ts");
const { sha256Hex } = await import("./improntaDocumento.ts");

const m = memoria();
const sorgente = { posId, companyId, attesoUpdatedAt: "2026-10-26T11:00:00+00:00", dati, nomeAutore, fonti: async () => ({ prova: "TEST" }) };
const prep = await preparaEmissioneBrowser(m.db, "utente-prova", sorgente);
if (prep.giaCompleta) throw new Error("atteso un modello da disegnare");
const preparaMs = ms(c0);
const c1 = process.cpuUsage();
const finale = await completaEmissioneBrowser(m.db, "utente-prova", { companyId, emissioneId: id, token, pdf, pdfSha256: await sha256Hex(pdf), sorgente: async () => sorgente });
const completaMs = ms(c1);
const pacchetto = m.store.get(`${companyId}/${id}/${token}/fascicolo.zip`)!;
console.log(JSON.stringify({ stato: finale.stato, cpuMs: ms(c0), preparaMs, completaMs, pdfKb: Math.round(pdf.length / 1024), pacchettoKb: Math.round(pacchetto.length / 1024) }));
