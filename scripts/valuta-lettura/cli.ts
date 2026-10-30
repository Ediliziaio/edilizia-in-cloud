// Misura la lettura dei documenti: confronta ciò che l'AI ha letto con ciò che era scritto.
// Uso (con bun, oppure con node >= 22.6 e --experimental-strip-types):
//   bun run scripts/valuta-lettura/cli.ts --atteso=<cartella> --letto=<cartella> [--json=<file>] [--soglia=0.9]
// Dettagli e formato dei file: scripts/valuta-lettura/README.md
import { writeFileSync } from "node:fs";
import { confrontaCartelle, type Rapporto } from "./confronta.ts";

const args: Record<string, string> = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...resto] = a.slice(2).split("=");
      return [k, resto.join("=")];
    }),
);

const percentuale = (n: number | null) => (n === null ? "  n/d" : `${(n * 100).toFixed(1).padStart(5)}%`);

function stampa(r: Rapporto) {
  console.log(`\nDocumenti: ${r.totale.documenti}   perfetti: ${r.totale.perfetti}   campi giusti: ${percentuale(r.totale.accuratezza)}`);
  if (r.nonLetti.length) console.log(`Senza lettura (contano come tutto mancante): ${r.nonLetti.join(", ")}`);
  if (r.senzaAtteso.length) console.log(`Letti ma senza file «atteso» (ignorati): ${r.senzaAtteso.join(", ")}`);

  for (const [tipo, riepilogo] of Object.entries(r.perTipo)) {
    console.log(`\n── ${tipo}: ${riepilogo.documenti} documenti, ${riepilogo.perfetti} perfetti, campi giusti ${percentuale(riepilogo.accuratezza)}`);
    const dasistemare = riepilogo.perCampo.filter((c) => c.errati + c.mancanti + c.inventati > 0).slice(0, 8);
    if (dasistemare.length === 0) console.log("   nessun campo sbagliato");
    for (const c of dasistemare) {
      console.log(
        `   ${c.campo.padEnd(34)} ${percentuale(c.accuratezza)}   errati ${c.errati}, non letti ${c.mancanti}, inventati ${c.inventati}  (su ${c.attesi})`,
      );
    }
  }

  const sbagliati = r.casi.filter((c) => !c.valutazione.perfetta);
  if (sbagliati.length) {
    console.log("\nCampi da guardare, documento per documento:");
    for (const caso of sbagliati) {
      for (const c of caso.valutazione.campi.filter((x) => x.esito === "errato" || x.esito === "mancante" || x.esito === "inventato")) {
        console.log(`   ${caso.nome}  ${c.percorso}: ${c.esito}  (scritto: ${JSON.stringify(c.atteso)}, letto: ${JSON.stringify(c.letto)})`);
      }
    }
  }
}

try {
  if (!args.atteso || !args.letto) {
    console.error("Uso: --atteso=<cartella> --letto=<cartella> [--json=<file>] [--soglia=0.9]");
    process.exit(2);
  }
  const rapporto = confrontaCartelle(args.atteso, args.letto);
  stampa(rapporto);
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(rapporto, null, 2));
    console.log(`\nRapporto completo scritto in ${args.json}`);
  }
  const soglia = args.soglia ? Number(args.soglia) : null;
  if (soglia !== null && (rapporto.totale.accuratezza ?? 0) < soglia) {
    console.error(`\nSotto la soglia: ${percentuale(rapporto.totale.accuratezza)} < ${percentuale(soglia)}`);
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
}
