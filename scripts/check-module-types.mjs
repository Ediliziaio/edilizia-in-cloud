import ts from "typescript";
import path from "node:path";
const files = ["src/vite-env.d.ts", ...process.argv.slice(2)].map(f => path.resolve(f));
const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true, noEmit: true, strict: false, noImplicitAny: true,
  allowImportingTsExtensions: true, paths: { "@/*": [path.resolve("src/*")] }, types: [],
});
const diagnostics = files.flatMap(f => [...program.getSyntacticDiagnostics(program.getSourceFile(f)), ...program.getSemanticDiagnostics(program.getSourceFile(f))]);
for (const d of diagnostics) {
  const pos = d.file?.getLineAndCharacterOfPosition(d.start || 0);
  console.log(`${d.file?.fileName}:${(pos?.line || 0) + 1} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
}
console.log(`${diagnostics.length} diagnostics in ${files.length} selected files`);
process.exitCode = diagnostics.length ? 1 : 0;
