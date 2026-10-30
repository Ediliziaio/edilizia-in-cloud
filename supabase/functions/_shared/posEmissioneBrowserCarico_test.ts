// deno-lint-ignore-file require-await -- i finti restituiscono promesse come gli oggetti veri, senza aspettare niente
import assert from "node:assert/strict";
import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { esempioPdfPos } from "../../../src/test/fixtures/posEsempioPdf.ts";
import { disegnaPdfPos } from "./posPdfBrowser.ts";
import { preparaEmissioneBrowser } from "./posEmissioneBrowser.ts";
import { companyId, memoria, posId } from "./posProvaMemoria.ts";

pdfMake.addVirtualFileSystem(vfs);
const CONFIG = new URL("../genera-pos/deno.json", import.meta.url).pathname;
const PROVA = new URL("./posEmissioneBrowserCarico_prova.ts", import.meta.url).pathname;

/** Un POS enorme: 55 lavorazioni con 60 misure ciascuna e 90 operai in formazione. */
function posGrande() {
  const d = esempioPdfPos();
  d.contenuto.allegati = d.contenuto.allegati.map((a, i) => ({ ...a, file_path: `${companyId}/pos/${posId}/${i}.pdf` }));
  const base = d.contenuto.lavorazioni[0];
  d.contenuto.lavorazioni = Array.from({ length: 55 }, (_, i) => ({ ...structuredClone(base), id: `x${i}`, titolo: `${base.titolo} ${i + 1}`,
    misure: Array.from({ length: 60 }, (_, k) => `Misura ${i + 1}.${k + 1}: testo di collaudo per verificare la prosecuzione delle righe lunghe fra pagine senza omissioni o sovrapposizioni.`).join("\n") }));
  d.contenuto.formazione = Array.from({ length: 90 }, (_, i) => ({ nominativo: `Operaio ${i + 1}`, qualifica: "Posatore", base: true, rischi_specifici: true, rischi_cantiere: true,
    dpi_terza_categoria: false, verificata: true, altro: "", attestati: "Corso sicurezza generale 8h, ente X, scad. 12/05/2029" }));
  return d;
}
const contaPagine = (pdf: Uint8Array) => new TextDecoder("latin1").decode(pdf).match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;

Deno.test("Carico: un POS di oltre 150 pagine passa dal server, in un processo nuovo, SENZA caricare pdfmake (la CPU si stampa: è una misura, non una soglia)", async () => {
  const dati = posGrande();
  const nomeAutore = "APPROVATORE DI PROVA";
  const m = memoria();
  const prep = await preparaEmissioneBrowser(m.db, "utente-prova", { posId, companyId, attesoUpdatedAt: "2026-10-26T11:00:00+00:00", dati, nomeAutore, fonti: async () => ({ prova: "TEST" }) });
  assert.equal(prep.giaCompleta, false);
  if (prep.giaCompleta) return;
  // Il lavoro grosso lo fa il browser: qui lo si fa nel processo del test, che non conta.
  const pdf = await disegnaPdfPos(pdfMake, { html: prep.html, codice: prep.codice, revisione: prep.revisione, emessoIl: prep.emessoIl, anteprima: false, layoutServer: prep.layout });
  const pagine = contaPagine(pdf);
  assert.ok(pagine >= 150, `il POS di prova deve avere almeno 150 pagine, ne ha ${pagine}`);

  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/dati.json`, JSON.stringify(dati));
    await Deno.writeFile(`${dir}/POS.pdf`, pdf);
    // La mappa degli import della funzione, con `pdfmake` sostituito da un modulo che lancia: se il server lo carica, muore.
    const config = JSON.parse(await Deno.readTextFile(CONFIG));
    delete config.lock;
    config.imports.pdfmake = `file://${dir}/pdfmake_vietato.ts`;
    await Deno.writeTextFile(`${dir}/pdfmake_vietato.ts`, `export default new Proxy({}, { get() { throw new Error("pdfmake caricato sul server nel percorso del PDF disegnato dal browser"); } });\n`);
    await Deno.writeTextFile(`${dir}/deno.json`, JSON.stringify(config));

    // Il controllo del controllo: con quella mappa il percorso del server (posPdf.ts) DEVE morire, altrimenti il test sotto non direbbe nulla.
    await Deno.writeTextFile(`${dir}/controllo.ts`, `await import(${JSON.stringify(new URL("./posPdf.ts", import.meta.url).href)});\n`);
    const controllo = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", "--config", `${dir}/deno.json`, `${dir}/controllo.ts`], stdout: "piped", stderr: "piped" }).output();
    assert.notEqual(controllo.code, 0);
    assert.match(new TextDecoder().decode(controllo.stderr), /pdfmake caricato sul server/);

    // Un processo nuovo = un worker a freddo: paga anche l'importazione dei moduli, come una vera richiesta.
    const uscita = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", "--config", `${dir}/deno.json`, PROVA, dir, nomeAutore], stdout: "piped", stderr: "piped" }).output();
    assert.equal(uscita.code, 0, new TextDecoder().decode(uscita.stderr));
    const r = JSON.parse(new TextDecoder().decode(uscita.stdout).trim().split("\n").pop()!) as { stato: string; cpuMs: number; preparaMs: number; completaMs: number; pdfKb: number; pacchettoKb: number };
    // La CPU è una misura da leggere, non una soglia: i tempi ballano con il carico della macchina. Il limite della piattaforma è 2000 ms.
    console.log(`  MISURA: POS di ${pagine} pagine (HTML ${(prep.html.length / 1024).toFixed(0)} KB, PDF ${r.pdfKb} KB, pacchetto ${r.pacchettoKb} KB): CPU del server a freddo ${r.cpuMs} ms (prepara ${r.preparaMs}, completa ${r.completaMs}); limite della piattaforma 2000 ms`);
    assert.equal(r.stato, "completa");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

/** I moduli raggiunti da `entrata` seguendo solo gli import statici (quelli dinamici si pagano soltanto se eseguiti). */
async function importStatici(...entrate: string[]): Promise<string[]> {
  const raggiunti = new Set<string>();
  for (const entrata of entrate) {
    const uscita = await new Deno.Command(Deno.execPath(), { args: ["info", "--json", "--config", CONFIG, new URL(entrata, import.meta.url).pathname], stdout: "piped", stderr: "piped" }).output();
    assert.equal(uscita.code, 0, new TextDecoder().decode(uscita.stderr));
    const grafo = JSON.parse(new TextDecoder().decode(uscita.stdout)) as { roots: string[]; modules: Array<{ specifier: string; dependencies?: Array<{ isDynamic?: boolean; code?: { specifier: string }; type?: { specifier: string } }> }> };
    const moduli = new Map(grafo.modules.map(m => [m.specifier, m]));
    const coda = [...grafo.roots];
    while (coda.length) {
      const s = coda.pop()!;
      if (raggiunti.has(s)) continue;
      raggiunti.add(s);
      for (const d of moduli.get(s)?.dependencies ?? []) if (!d.isDynamic && (d.code?.specifier || d.type?.specifier)) coda.push((d.code?.specifier || d.type?.specifier)!);
    }
  }
  return [...raggiunti];
}
const PDFMAKE = /pdfmake@[\d.]+\/build\/pdfmake\.js$/;

Deno.test("Avvio a freddo: il percorso del PDF disegnato dal browser non importa pdfmake (il bundle costa CPU a ogni avvio)", async () => {
  const nuovo = await importStatici("./posEmissioneBrowser.ts", "./posSorgenti.ts", "./posRichiesta.ts");
  assert.deepEqual(nuovo.filter(s => PDFMAKE.test(s)), []);
  // La strada del server, invece, lo carica: se questo non fosse vero il controllo sopra non direbbe nulla.
  assert.equal((await importStatici("./posPdf.ts")).filter(s => PDFMAKE.test(s)).length, 1);
});
