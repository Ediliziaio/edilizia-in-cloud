import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { verifySignedRequest } from "./signature.ts";

test("firma CMS: verifica crittografica, contenuto esatto e rifiuto di file alterati", async () => {
  const dir = mkdtempSync(join(tmpdir(), "smts-cms-test-"));
  try {
    const key = join(dir, "key.pem"), cert = join(dir, "cert.pem"), input = join(dir, "input.xml"), output = join(dir, "signed.p7m");
    const xml = '<?xml version="1.0"?><Test>Richiesta sintetica</Test>';
    writeFileSync(input, xml);
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=synthetic-smts-test", "-days", "1", "-keyout", key, "-out", cert], { stdio: "ignore", timeout: 20_000 });
    execFileSync("openssl", ["cms", "-sign", "-binary", "-nodetach", "-in", input, "-signer", cert, "-inkey", key, "-outform", "DER", "-out", output], { stdio: "ignore", timeout: 20_000 });
    const signed = readFileSync(output);
    await verifySignedRequest(signed.toString("base64"), xml);
    await assert.rejects(verifySignedRequest(signed.toString("base64"), xml + "alterata"), /non corrisponde/);
    signed[signed.length - 1] ^= 1;
    await assert.rejects(verifySignedRequest(signed.toString("base64"), xml), /non verificabile/);
    await assert.rejects(verifySignedRequest("YQ==", xml), /non verificabile/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
