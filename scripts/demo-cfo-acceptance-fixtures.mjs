// Creates only the three scoped fictional drafts. Does not overwrite existing editions.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const m = JSON.parse(readFileSync("work/demo-cfo/manifest.json", "utf8"));
mkdirSync("tmp/pdfs", { recursive: true });
await build({
  entryPoints: [
    "supabase/functions/collaudo-commessa/render.ts",
    "supabase/functions/collaudo-commessa/model.ts",
  ],
  outdir: "tmp/pdfs/acceptance",
  bundle: true,
  format: "esm",
  platform: "node",
  outExtension: { ".js": ".mjs" },
  plugins: [
    {
      name: "deno-pdf",
      setup(b) {
        b.onResolve({ filter: /^https:\/\/esm.sh\/pdf-lib/ }, () => ({
          path: require.resolve("pdf-lib"),
        }));
      },
    },
  ],
});
const { emptyAcceptance, validateAcceptance } = await import(
  pathToFileURL(resolve("tmp/pdfs/acceptance/model.mjs"))
);
const { renderAcceptance } = await import(
  pathToFileURL(resolve("tmp/pdfs/acceptance/render.mjs"))
);
const definitions = [
  {
    key: "int",
    name: "Aurora",
    outcome: "positive",
    scope:
      "Ristrutturazione parziale con soli operai interni: ripristini, finiture e pulizia. Verifica dimostrativa a fine dei due mesi.",
    reservation: "",
    actions: [],
  },
  {
    key: "mix",
    name: "Betulla",
    outcome: "reserves",
    scope:
      "Ristrutturazione parziale con operai interni e subappaltatori: finiture bagno e soggiorno. Verifica dimostrativa dopo due mesi.",
    reservation:
      "Sigillatura del piatto doccia da riprendere e prova di tenuta da ripetere. Nessun extra economico approvato con questo verbale.",
    actions: [
      {
        work: "Ripristinare la sigillatura e ripetere la prova con verbale di riscontro",
        owner: "Impresa idraulica DEMO — referente Marco Test",
        due: "2026-10-05",
      },
    ],
  },
  {
    key: "sub",
    name: "Cedro",
    outcome: "negative",
    scope:
      "Ristrutturazione parziale affidata a soli subappaltatori. Verifica dimostrativa delle opere consegnate dopo due mesi.",
    reservation:
      "Prova funzionale non superata sullo scarico della doccia. Consegna da verificare nuovamente dopo il ripristino.",
    actions: [
      {
        work: "Verificare scarico e ripristinare la funzionalità, poi ripetere la prova",
        owner: "Subappaltatore DEMO — referente Luca Test",
        due: "2026-10-06",
      },
    ],
  },
];
const actor = "e592255e-0c82-86cd-7f7b-d3046317f9cd";
const quote = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const audit = [];
let inserts = "";
for (const d of definitions) {
  const order = m.records.find((r) => r.key === "order-" + d.key).id;
  const content = {
    ...emptyAcceptance("2026-09-30"),
    title: `DEMO CFO — ${d.name} — Verifica e consegna`,
    customer: `Cliente dimostrativo ${d.name}`,
    inspector: "Referente verifiche DEMO",
    scope: d.scope,
    outcome: d.outcome,
    reservations: d.reservation,
    actions: d.actions,
    documents:
      "Esempio: manuali prodotti e istruzioni manutenzione. Le certificazioni tecniche non sono simulate né dichiarate rilasciate.",
    notes:
      "[DEMO CFO 2026-09 v1] Dati e verifiche interamente fittizi. Non utilizzare come certificazione o accettazione reale.",
  };
  content.checks = content.checks.map((c, i) => ({
    ...c,
    result: i === 1 && d.outcome !== "positive" ? "reserve" : "ok",
    note:
      i === 1 && d.outcome !== "positive"
        ? d.reservation
        : "Riscontro dimostrativo completato; nessuna verifica reale attestata.",
  }));
  const errors = validateAcceptance(content, true);
  if (errors.length) throw new Error(errors.join("\n"));
  const result = await renderAcceptance(content, {
    company: "Demo Azienda 2 S.r.l.",
    order: "DEMO-CFO-" + d.key.toUpperCase(),
    address: "Cantiere dimostrativo " + d.name,
    id: order,
    version: 1,
  });
  const path = `tmp/pdfs/collaudo-${d.key}.pdf`;
  writeFileSync(path, result.bytes);
  const text = execFileSync("pdftotext", ["-layout", path, "-"], {
    encoding: "utf8",
  });
  for (const required of [
    "EDIZIONE NON FIRMATA",
    "Controlli effettuati",
    "Esito e riserve",
    "Documenti e istruzioni",
    "non approva costi extra",
  ])
    if (!text.includes(required))
      throw new Error(d.key + " missing " + required);
  if (d.actions.length && !text.includes(d.actions[0].due))
    throw new Error("Missing action due date");
  audit.push({
    scenario: d.key,
    pages: result.pages,
    path,
    outcome: d.outcome,
  });
  inserts += `insert into public.order_acceptance_reports(company_id,order_id,created_by,content) select ${quote(m.company)},o.id,${quote(actor)},${quote(JSON.stringify(content))}::jsonb from public.orders o where o.id=${quote(order)} and o.company_id=${quote(m.company)} and not exists(select 1 from public.order_acceptance_reports r where r.order_id=o.id and r.content->>'title'=${quote(content.title)});\n`;
}
if (process.argv.includes("--seed")) {
  console.log(
    execFileSync(
      "supabase",
      [
        "db",
        "query",
        "--linked",
        "-o",
        "json",
        `begin;${inserts} select count(*) demo_reports from public.order_acceptance_reports where company_id=${quote(m.company)} and content->>'notes' like '[DEMO CFO 2026-09 v1]%';commit;`,
      ],
      { encoding: "utf8" },
    ),
  );
}
writeFileSync(
  "work/demo-cfo/acceptance-audit.json",
  JSON.stringify(audit, null, 2),
);
console.log(audit);
