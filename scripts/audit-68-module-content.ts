/** Run from repository root: bun scripts/audit-68-module-content.ts [output-directory] */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runModule68Audit, module68Markdown } from "../src/test/audits/module68ContentAudit";
// Factories must be entirely offline. Do not allow accidental runtime fetches.
globalThis.fetch = async () => { throw new Error("Network forbidden in factory content audit"); };
const output = path.resolve(process.argv[2] || "../../outputs/module68-content-audit");
const report = runModule68Audit();
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(output, "matrix.md"), module68Markdown(report));
console.log(JSON.stringify({ ...report.summary, output }, null, 2));
for (const model of report.models) for (const issue of model.issues.filter(i => i.severity === "error")) console.log(model.key, issue.code, issue.field, issue.detail);
process.exitCode = report.summary.errors ? 1 : 0;
