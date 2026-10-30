// Banco di prova della generazione AI delle planimetrie.
//
//   node scripts/planimetrie-banco/esegui.ts --modello oracolo
//   node scripts/planimetrie-banco/esegui.ts --modello google/gemini-2.5-flash [--solo g01,s02] [--max-usd 1]
//   (chiave: OPENROUTER_API_KEY=… in ~/edilizia-in-cloud/.env.planimetrie, escluso da git)
//
// «oracolo» risponde con la verità nel formato del modello: costo zero, serve a
// collaudare costruzione, controllo e punteggio. Con un modello vero si usa lo
// STESSO codice della edge function (genera.ts), con OpenRouter chiamato da qui.
// Ogni giro salva i risultati in risultati/ e una riga in STORICO.md.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generaPlanimetria, type ChiamaModello, type Messaggio, type RichiestaGenerazione } from "../../supabase/functions/planimetria-genera/genera.ts";
import { applicaMisuraLocale } from "../../supabase/functions/planimetria-genera/costruisci.ts";
import { VERSIONE_PROMPT } from "../../supabase/functions/planimetria-genera/prompt.ts";
import type { PiantaGenerata } from "../../supabase/functions/planimetria-genera/generazione.ts";
import { MASSIMO_CORREZIONI, punteggio, type Punteggio } from "./punteggio.ts";

const QUI = dirname(fileURLToPath(import.meta.url));
const CAMPIONI = join(QUI, "campioni");

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const modello = argomento("modello") ?? "oracolo";
const solo = argomento("solo")?.split(",") ?? null;
const maxUsd = Number(argomento("max-usd") ?? "1.5");
const nota = argomento("nota") ?? "";
// La chiave sta in ~/edilizia-in-cloud/.env.planimetrie.local (escluso da git anche su
// main, regola .env.*.local) o .env.planimetrie (escluso da questo branch), oppure nell'ambiente.
function chiaveDaFile(): string | undefined {
  for (const nome of [".env.planimetrie.local", ".env.planimetrie"]) {
    const file = join(homedir(), "edilizia-in-cloud", nome);
    if (!existsSync(file)) continue;
    const riga = readFileSync(file, "utf8").split(/\r?\n/).find((r) => r.startsWith("OPENROUTER_API_KEY="));
    const chiave = riga?.slice("OPENROUTER_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
    if (chiave) return chiave;
  }
  return undefined;
}
const chiave = process.env.OPENROUTER_API_KEY || chiaveDaFile();
if (modello !== "oracolo" && !chiave) {
  console.error("Manca OPENROUTER_API_KEY (in ~/edilizia-in-cloud/.env.planimetrie o nell'ambiente).");
  process.exit(1);
}

// deno-lint-ignore no-explicit-any
type Verita = any;

function rispostaOracolo(v: Verita): string {
  if (v.ingresso === "documento") {
    return JSON.stringify({
      sistema: "immagine",
      leggibile: true,
      altezza_m: null,
      locali: v.locali.map((l: Verita) => ({ nome: l.nome, destinazione: l.destinazione, contorno: l.contorno_px, superficie_scritta_mq: null, altezza_scritta_m: 2.7 })),
      aperture: v.aperture.map((a: Verita) => ({ tipo: a.tipo, da: a.da_px, a: a.a_px })),
      quote: v.stile === "geometra"
        ? v.locali.map((l: Verita) => ({ valore_m: l.larghezza_cm / 100, da: l.contorno_px[0], a: l.contorno_px[1] }))
        : [],
    });
  }
  if (v.ingresso === "schizzo") {
    return JSON.stringify({
      sistema: "metri",
      leggibile: true,
      locali: v.locali.map((l: Verita) => ({ nome: l.nome, destinazione: l.destinazione, contorno: l.contorno_cm.map(([x, y]: number[]) => [x / 100, y / 100]), misure_lette: l.misure_scritte })),
      aperture: v.aperture.map((a: Verita) => ({ tipo: a.tipo, da: [a.da_cm[0] / 100, a.da_cm[1] / 100], a: [a.a_cm[0] / 100, a.a_cm[1] / 100] })),
      quote: [],
    });
  }
  // descrizione: stanze in fila con le superfici dette
  let x = 0;
  const locali = v.locali.map((l: Verita) => {
    const a = l.area_mq ?? 4;
    const w = a / 4;
    const c = [[x, 0], [x + w, 0], [x + w, 4], [x, 4]];
    x += w;
    return { nome: l.destinazione, destinazione: l.destinazione, contorno: c, misure_lette: false };
  });
  return JSON.stringify({ sistema: "metri", leggibile: true, locali, aperture: [], quote: [] });
}

let spesa = 0;

async function chiamaOpenRouter(messaggi: Messaggio[]): Promise<{ testo: string; costo: number; modello: string }> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json", "X-Title": "EiC banco planimetrie" },
    body: JSON.stringify({
      model: modello,
      messages: messaggi,
      temperature: 0.1,
      max_tokens: 12000,
      response_format: { type: "json_object" },
      usage: { include: true },
    }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (r.status === 402) {
    console.error("OpenRouter risponde 402: credito finito. Mi fermo.");
    process.exit(2);
  }
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${JSON.stringify(corpo).slice(0, 300)}`);
  const costo = Number(corpo.usage?.cost ?? 0);
  return { testo: corpo.choices?.[0]?.message?.content ?? "", costo, modello: corpo.model ?? modello };
}

function richiesta(v: Verita): RichiestaGenerazione {
  if (v.ingresso === "descrizione") return { ingresso: "descrizione", testo: v.testo };
  const dati = readFileSync(join(CAMPIONI, v.file)).toString("base64");
  return {
    ingresso: v.ingresso,
    file: { dataUrl: `data:${v.mime};base64,${dati}`, mime: v.mime, nome: v.file, larghezza: v.larghezza_px, altezza: v.altezza_px },
  };
}

function conScalaUtente(v: Verita, p: PiantaGenerata): { p: PiantaGenerata; usata: boolean } {
  if (!v.misura_utente || !p.generazione.scala?.da_confermare) return { p, usata: false };
  const locali = p.planimetria.livelli[0].fatto.locali;
  const vero = v.locali.find((l: Verita) => l.nome === v.misura_utente.locale);
  const loc = locali.find((l) => l.nome.toLowerCase() === String(v.misura_utente.locale).toLowerCase())
    ?? locali.find((l) => l.destinazione === vero?.destinazione);
  if (!loc) return { p, usata: false };
  return { p: applicaMisuraLocale(p, loc.id, v.misura_utente.asse, v.misura_utente.valore_cm), usata: true };
}

async function main() {
  const indice: string[] = JSON.parse(readFileSync(join(CAMPIONI, "indice.json"), "utf8"));
  const scelti = indice.filter((id) => !solo || solo.some((s) => id.startsWith(s)));
  const risultati: Array<Punteggio & { modello: string; costo_usd: number; tentativi: number; durata_ms: number; avvisi: string[]; esito: string }> = [];
  for (const id of scelti) {
    if (spesa >= maxUsd) {
      console.log(`Tetto di spesa raggiunto (${spesa.toFixed(3)} $): mi fermo.`);
      break;
    }
    const v: Verita = JSON.parse(readFileSync(join(CAMPIONI, `${id}.json`), "utf8"));
    let costo = 0;
    let usato = modello;
    const chiama: ChiamaModello = async (messaggi) => {
      if (modello === "oracolo") return { testo: rispostaOracolo(v), modello: "oracolo" };
      const r = await chiamaOpenRouter(messaggi);
      costo += r.costo;
      spesa += r.costo;
      usato = r.modello;
      return { testo: r.testo, modello: r.modello, costoUsd: r.costo };
    };
    const t0 = Date.now();
    let esito;
    try {
      esito = await generaPlanimetria(richiesta(v), chiama);
    } catch (e) {
      console.log(`${id}: errore ${(e as Error).message}`);
      risultati.push({ ...punteggio(v, null), modello: usato, costo_usd: costo, tentativi: 0, durata_ms: Date.now() - t0, avvisi: [], esito: `errore: ${(e as Error).message}` });
      continue;
    }
    let p = esito.ok ? esito.pianta : null;
    let usata = false;
    if (p) ({ p, usata } = conScalaUtente(v, p));
    const pt = punteggio(v, p?.planimetria ?? null, usata);
    risultati.push({ ...pt, modello: usato, costo_usd: costo, tentativi: esito.tentativi.length, durata_ms: Date.now() - t0, avvisi: p?.generazione.avvisi ?? [], esito: esito.ok ? "ok" : esito.codice, problemi: esito.tentativi.map((t) => t.errori) } as never);
    if (p && process.argv.includes("--salva-piante")) {
      mkdirSync(join(QUI, "risultati", "piante"), { recursive: true });
      writeFileSync(join(QUI, "risultati", "piante", `${id}.${modello.replace(/\W+/g, "_")}.json`), JSON.stringify(p, null, 1));
    }
    console.log(`${id.padEnd(30)} ${esito.ok ? "ok " : "NO "} stanze ${pt.stanze_trovate}/${pt.stanze_vere}${pt.stanze_in_piu ? ` +${pt.stanze_in_piu}` : ""}  area ±${pt.scarto_area_medio === null ? "-" : (pt.scarto_area_medio * 100).toFixed(1) + "%"}  porte ${pt.porte ? `${pt.porte.trovate}/${pt.porte.vere}` : "-"}  finestre ${pt.finestre ? `${pt.finestre.trovate}/${pt.finestre.vere}` : "-"}  correzioni ${pt.correzioni}  tent. ${esito.tentativi.length}  ${costo.toFixed(4)} $  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const corrette = risultati.filter((r) => r.corretta).length;
  const disegni = risultati.filter((r) => !r.id.startsWith("t"));
  const corretteDisegni = disegni.filter((r) => r.corretta).length;
  const riassunto = `${corrette}/${risultati.length} corrette (≤${MASSIMO_CORREZIONI} correzioni); disegni ${corretteDisegni}/${disegni.length}; spesa ${spesa.toFixed(3)} $`;
  console.log(`\n${riassunto}`);
  const ora = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(QUI, "risultati");
  mkdirSync(dir, { recursive: true });
  const file = `${ora}_${VERSIONE_PROMPT}_${modello.replace(/\W+/g, "_")}.json`;
  writeFileSync(join(dir, file), JSON.stringify({ modello, prompt: VERSIONE_PROMPT, nota, spesa_usd: spesa, risultati }, null, 1));
  const storico = join(QUI, "STORICO.md");
  if (!existsSync(storico)) {
    writeFileSync(storico, "# Storico del banco di prova\n\nUna riga per giro: prompt, modello, punteggio, spesa. I dettagli stanno in `risultati/`.\n\n| Data | Prompt | Modello | Campioni | Corrette | Disegni corretti | Scarto area medio | Spesa $ | Nota |\n|---|---|---|---|---|---|---|---|---|\n");
  }
  const scarti = risultati.map((r) => r.scarto_area_medio).filter((s): s is number => s !== null);
  const medio = scarti.length ? `${((scarti.reduce((a, b) => a + b, 0) / scarti.length) * 100).toFixed(1)}%` : "-";
  appendFileSync(storico, `| ${ora.slice(0, 16).replace("T", " ")} | ${VERSIONE_PROMPT} | ${modello} | ${risultati.length} | ${corrette} | ${corretteDisegni}/${disegni.length} | ${medio} | ${spesa.toFixed(3)} | ${nota} |\n`);
}

main();
