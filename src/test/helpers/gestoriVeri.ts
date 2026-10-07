/// <reference types="node" />
/**
 * Prende dal SORGENTE di un componente i gestori veri (le funzioni `const nome = ...`
 * dichiarate nel corpo) e li esegue in una sandbox con lo stato e le dipendenze che il
 * test fornisce: si prova il codice che gira davvero, senza disegnare la pagina intera.
 *
 * Le variabili che il gestore usa (stato, funzioni di aggiornamento, supabase, toast…)
 * vanno nel `contesto`; ciò che manca fa fallire il test con un errore chiaro.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

export function gestoriVeri(file: string, nomi: string[], contesto: Record<string, unknown>) {
  const sorgente = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trovati = new Map<string, ts.Expression>();
  const visita = (nodo: ts.Node) => {
    if (ts.isVariableDeclaration(nodo) && nodo.initializer && nomi.includes(nodo.name.getText(sorgente))) {
      trovati.set(nodo.name.getText(sorgente), nodo.initializer);
    }
    ts.forEachChild(nodo, visita);
  };
  visita(sorgente);
  vm.createContext(contesto);
  for (const nome of nomi) {
    const inizializzatore = trovati.get(nome);
    if (!inizializzatore) throw new Error(`Gestore mancante in ${file}: ${nome}`);
    const codice = ts.transpileModule(`globalThis[${JSON.stringify(nome)}] = ${inizializzatore.getText(sorgente)}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInContext(codice, contesto);
  }
  return contesto as Record<string, (...args: unknown[]) => unknown>;
}
