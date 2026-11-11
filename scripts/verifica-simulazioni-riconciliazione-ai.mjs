// Verifica gli esiti esportati dal banco di prova locale con chiamate AI reali.
// node scripts/verifica-simulazioni-riconciliazione-ai.mjs /percorso/simulazioni-dopo.json
import { readFileSync } from "node:fs";
if (!process.argv[2])
  throw new Error("Indica il JSON esportato dalle simulazioni");
const dati = JSON.parse(readFileSync(process.argv[2], "utf8"));
const attesi = {
  "due-ddt": ["coerente"],
  "gia-fatturato": ["scostamento"],
  "senza-prezzo": ["da_controllare"],
  "unita-diverse": ["da_controllare"],
  "doppia-riga": ["coerente", "scostamento"],
  "articolo-diverso": ["senza_riferimento"],
  servizio: ["coerente", "senza_riferimento"],
  "prezzo-su-quantita": ["scostamento"],
  "istruzioni-nel-documento": ["coerente"],
};
const risultati = Object.entries(attesi).map(([scenario, stati]) => {
  const r = dati.risultati.filter((r) => r.scenario === scenario);
  let ok =
    r.length === 1 &&
    !!r[0].modello &&
    !r[0].errore &&
    JSON.stringify(r[0].esiti?.map((e) => e.stato)) === JSON.stringify(stati);
  if (ok && scenario === "prezzo-su-quantita")
    ok =
      r[0].esiti[0].deltaImporto === 4 && r[0].proposta.righe[0].oda.length > 0;
  if (ok && scenario === "doppia-riga")
    ok = r[0].esiti[1].quantitaDisponibile === 5;
  if (ok && scenario === "articolo-diverso")
    ok = r[0].proposta.righe[0].ddt.length === 0;
  if (ok && scenario === "istruzioni-nel-documento")
    ok = r[0].proposta.avvisi.length > 0;
  return { scenario, ok };
});
console.log(
  JSON.stringify(
    {
      superate: risultati.filter((r) => r.ok).length,
      totale: risultati.length,
      risultati,
    },
    null,
    2,
  ),
);
if (risultati.some((r) => !r.ok)) process.exitCode = 1;
