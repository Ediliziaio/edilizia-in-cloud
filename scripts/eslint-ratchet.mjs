import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function contaErrori(results, root) {
  const counts = {};
  for (const result of results) {
    const file = relative(root, result.filePath).replaceAll("\\", "/");
    for (const m of result.messages) if (m.severity === 2) {
      const key = `${file}|${m.ruleId ?? "errore-parser"}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)));
}

export function nuoveViolazioni(current, baseline) {
  return Object.entries(current).filter(([key,count])=>count>(baseline[key] ?? 0))
    .map(([key,count])=>({ key, count, accepted:baseline[key] ?? 0 }));
}

async function main() {
  const root=process.cwd();
  const baseline=JSON.parse(readFileSync(resolve(root,"config/eslint-baseline.json"),"utf8"));
  // Solo sorgenti versionati: i risultati non dipendono da bozze e artefatti locali.
  const files=execFileSync("git",["ls-files","-z"],{encoding:"utf8",maxBuffer:16*1024*1024}).split("\0")
    .filter(p=>/\.(?:[cm]?[jt]s|tsx|jsx)$/.test(p) && !/^(supabase\/functions\/|dist\/|ios\/App\/(?:build|Pods)\/|android\/app\/build\/)/.test(p));
  if(!files.length)throw Error("Nessun sorgente trovato: controllo lint non eseguito.");
  const results=await new ESLint().lintFiles(files);
  const current=contaErrori(results,root);
  const regressions=nuoveViolazioni(current,baseline.errors);
  const errors=Object.values(current).reduce((a,b)=>a+b,0);
  const warnings=results.reduce((n,r)=>n+r.warningCount,0);
  console.log(`Lint: ${errors} errori pregressi, ${warnings} avvisi; ${regressions.length} regressioni per file/regola.`);
  for(const r of regressions)console.error(`${r.key}: ${r.count} > ${r.accepted}`);
  if(regressions.length)process.exitCode=1;
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  console.error("Controllo lint non completato:",error.message);process.exitCode=1;
});
