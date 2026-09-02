/**
 * Guardia di coerenza del motore automazioni.
 *
 * Il catalogo (flow-node-catalog.ts) è la vetrina; l'executor
 * (process-automation) è il motore; gli emettitori (migrations + edge) sono
 * la benzina. Storicamente si sono rotti in silenzio proprio negli incastri:
 * trigger offerti ma mai mappati, azioni offerte ma senza case nel motore,
 * eventi mappati che nessuno emette. Questo test fotografa gli incastri e
 * fallisce quando qualcuno aggiunge un pezzo dimenticando gli altri due.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TRIGGER_CATALOG, ACTION_CATALOG, CONDITION_CATALOG } from "@/lib/flow-node-catalog";

const ROOT = join(__dirname, "../../..");
const EXECUTOR = readFileSync(join(ROOT, "supabase/functions/process-automation/index.ts"), "utf8");
const PLATFORM_SHARED = readFileSync(join(ROOT, "supabase/functions/_shared/platformAutomation.ts"), "utf8");

/** Chiavi italiane presenti in TRIGGER_EVENT_MAP dell'executor. */
function chiaviTriggerMap(): Set<string> {
  const out = new Set<string>();
  const blocco = EXECUTOR.slice(EXECUTOR.indexOf("const TRIGGER_EVENT_MAP"), EXECUTOR.indexOf("const canonicalEvent"));
  for (const m of blocco.matchAll(/^\s{4}([a-z_]+):\s*"/gm)) out.add(m[1]);
  const iPlat = PLATFORM_SHARED.indexOf("PLATFORM_TRIGGER_EVENT_MAP");
  const bloccoPlat = PLATFORM_SHARED.slice(iPlat, PLATFORM_SHARED.indexOf("};", iPlat));
  for (const m of bloccoPlat.matchAll(/^\s+([a-z_]+):/gm)) out.add(m[1]);
  return out;
}

/** Valori canonici (inglesi) della TRIGGER_EVENT_MAP. */
function eventiCanonici(): Map<string, string> {
  const out = new Map<string, string>();
  const blocco = EXECUTOR.slice(EXECUTOR.indexOf("const TRIGGER_EVENT_MAP"), EXECUTOR.indexOf("const canonicalEvent"));
  for (const m of blocco.matchAll(/^\s{4}([a-z_]+):\s*"([a-z_]+)"/gm)) out.set(m[1], m[2]);
  return out;
}

function actionAliases(): Map<string, string> {
  const out = new Map<string, string>();
  const i = EXECUTOR.indexOf("ACTION_ALIASES");
  const blocco = EXECUTOR.slice(i, EXECUTOR.indexOf("}", i));
  for (const m of blocco.matchAll(/([a-z_]+):\s*"([a-z_]+)"/g)) out.set(m[1], m[2]);
  return out;
}

function caseExecutor(): Set<string> {
  const out = new Set<string>();
  for (const m of EXECUTOR.matchAll(/case\s+"([a-z_0-9]+)"/g)) out.add(m[1]);
  return out;
}

/** Tutto il testo dove può vivere un emettitore di eventi. */
function testoEmettitori(): string {
  const pezzi: string[] = [];
  const migDir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(migDir)) {
    if (f.endsWith(".sql")) pezzi.push(readFileSync(join(migDir, f), "utf8"));
  }
  const fnDir = join(ROOT, "supabase/functions");
  for (const d of readdirSync(fnDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try {
      pezzi.push(readFileSync(join(fnDir, d.name, "index.ts"), "utf8"));
    } catch { /* function senza index */ }
  }
  return pezzi.join("\n");
}

describe("coerenza catalogo ↔ executor ↔ emettitori", () => {
  it("ogni trigger del catalogo è mappato nell'executor (o è un cron interno)", () => {
    const mappa = chiaviTriggerMap();
    // Questi non passano dalla TRIGGER_EVENT_MAP per design (enrollment
    // diretto dal cron scheduler o dal frontend): eccezioni ESPLICITE.
    const gestitiAltrove = new Set(["cron_giornaliero", "cron_settimanale", "cron_mensile", "manuale"]);
    const orfani = TRIGGER_CATALOG
      .map((t) => t.id)
      .filter((id) => !mappa.has(id) && !gestitiAltrove.has(id));
    expect(orfani, `Trigger nel catalogo ma NON in TRIGGER_EVENT_MAP (il flusso non scatterà mai): ${orfani.join(", ")}`).toEqual([]);
  });

  it("ogni azione del catalogo ha un case nel motore (direttamente o via alias)", () => {
    const aliases = actionAliases();
    const cases = caseExecutor();
    const orfane = ACTION_CATALOG
      .map((a) => a.id)
      .filter((id) => {
        const risolta = aliases.get(id) ?? id;
        return !cases.has(risolta);
      });
    expect(orfane, `Azioni offerte dal builder ma senza implementazione nel motore: ${orfane.join(", ")}`).toEqual([]);
  });

  it("ogni evento canonico mappato ha un emettitore da qualche parte", () => {
    const testo = testoEmettitori();
    const senzaEmettitore: string[] = [];
    for (const [ita, canonico] of eventiCanonici()) {
      // Il canonico deve comparire come letterale in una migration (trigger DB)
      // o in una edge function (emettitore applicativo/cron).
      if (!testo.includes(`'${canonico}'`) && !testo.includes(`"${canonico}"`)) {
        senzaEmettitore.push(`${ita} → ${canonico}`);
      }
    }
    expect(senzaEmettitore, `Eventi mappati che NESSUNO emette (trigger di cartone): ${senzaEmettitore.join(", ")}`).toEqual([]);
  });

  it("trigger, azioni e condizioni non condividono MAI un id (ruoli non intercambiabili)", () => {
    // Un id in due cataloghi renderebbe ambigui getCatalogItem, la mappa
    // eventi e gli alias azione: un trigger eseguito come azione (o
    // viceversa) fallirebbe in modi difficili da diagnosticare. La
    // separazione dei ruoli parte dai nomi.
    const t = new Set(TRIGGER_CATALOG.map((x) => x.id));
    const a = new Set(ACTION_CATALOG.map((x) => x.id));
    const c = new Set(CONDITION_CATALOG.map((x) => x.id));
    const collisioni = [
      ...[...t].filter((id) => a.has(id)).map((id) => `${id} (trigger+azione)`),
      ...[...t].filter((id) => c.has(id)).map((id) => `${id} (trigger+condizione)`),
      ...[...a].filter((id) => c.has(id)).map((id) => `${id} (azione+condizione)`),
    ];
    expect(collisioni).toEqual([]);
  });

  it("i picker del builder attingono ognuno al SOLO catalogo del proprio ruolo", () => {
    // Il '+ Trigger' non deve poter offrire azioni né viceversa: qui si
    // verifica che i componenti catalogo importino solo la loro metà.
    const triggerList = readFileSync(join(ROOT, "src/components/flow-builder/catalog/TriggerCatalogList.tsx"), "utf8");
    const actionList = readFileSync(join(ROOT, "src/components/flow-builder/catalog/ActionCatalogList.tsx"), "utf8");
    expect(triggerList).toContain("TRIGGERS_BY_CATEGORY");
    expect(triggerList).not.toContain("ACTIONS_BY_CATEGORY");
    expect(actionList).toContain("ACTIONS_BY_CATEGORY");
    expect(actionList).not.toContain("TRIGGERS_BY_CATEGORY");
  });

  it("i campi required con default hanno il default seminabile (anti caso-Priorità)", () => {
    // Un required SENZA defaultValue costringe l'utente a compilare: ok.
    // Un required CON defaultValue viene seminato alla creazione del nodo
    // (seedConfigDefaults): qui si verifica che il default sia un valore
    // valido tra le options quando il campo è un select.
    const rotti: string[] = [];
    for (const item of [...TRIGGER_CATALOG, ...ACTION_CATALOG]) {
      for (const f of item.configSchema ?? []) {
        if (f.defaultValue !== undefined && f.type === "select" && Array.isArray(f.options)) {
          const valori = f.options.map((o: { value: string }) => o.value);
          if (!valori.includes(String(f.defaultValue))) rotti.push(`${item.id}.${f.id} default "${f.defaultValue}" non tra le options`);
        }
      }
    }
    expect(rotti).toEqual([]);
  });
});
