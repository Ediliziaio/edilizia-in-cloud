import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("scripts/typecheck-ratchet.mjs", "utf8");
const ast = ts.createSourceFile("ratchet.js", source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "eseguiTsc")!;
const diagnostic = "src/example.ts(1,2): error TS2322: Type mismatch\n";
function run(failure?: Record<string, unknown>) {
  const execute = vm.runInNewContext(`${fn.getText(ast)}; eseguiTsc`, {
    process: { env: {}, execPath: "/node" }, RADICE: "/fixture", COMPILATORE: "/fixture/tsc.js", execFileSync: () => { if (failure) throw failure; return ""; },
  });
  return execute();
}
describe("typecheck ratchet compiler failures", () => {
  it("accepts a completed clean compiler", () => expect(run()).toBe(""));
  it.each([1, 2])("compares completed compiler diagnostics, exit %s", status => {
    expect(run({ status, stdout: diagnostic, stderr: "", signal: null })).toBe(diagnostic);
  });
  it.each([
    { status: 143, stdout: "", stderr: "Terminated" },
    { status: 137, stdout: diagnostic, stderr: "Killed" },
    { status: null, signal: "SIGKILL", stdout: diagnostic },
    { status: 1, stdout: "", stderr: "npm error unavailable" },
    { status: 1, stdout: "error TS5058: Config does not exist" },
    { status: 2, stdout: diagnostic + "error TS5023: Unknown compiler option" },
    { status: 2, code: "ENOBUFS", stdout: diagnostic },
    { code: "ENOENT" },
  ])("never treats an incomplete/invalid run as zero errors: %j", failure => {
    expect(() => run(failure)).toThrow(/Controllo TypeScript non completato/);
  });
});
