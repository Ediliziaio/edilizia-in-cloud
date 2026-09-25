import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer as NodeBuffer } from "node:buffer";
import { createContext, runInContext } from "node:vm";
import { execFileSync } from "node:child_process";

// Execute a real browser-targeted bundle in an isolated realm with no Node
// globals. This neither removes Vitest's Buffer nor requires a browser/network.
let browserBundle: string;
beforeAll(() => {
  // Vite runs outside jsdom to avoid its mixed-realm Uint8Array/TextEncoder;
  // the resulting browser bundle is still executed without any Node globals.
  browserBundle = execFileSync(process.execPath, ["--input-type=module", "-e", `
  import { build } from "vite";
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: "src/lib/pdf/ensurePdfBufferCompatibility.ts",
        name: "PdfBufferCompatibility",
        formats: ["iife"],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => "output" in item ? item.output : []);
  const chunk = outputs.find(item => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("Missing browser compatibility bundle");
  process.stdout.write(chunk.code);
  `], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}, 30_000);

// Exercise the actual installed dependency body, not a rewritten approximation.
// Image decoding is stubbed: the regression happens AFTER successful decoding.
const layoutSource = readFileSync(resolve("node_modules/@react-pdf/layout/lib/index.js"), "utf8");
const fetchImageSource = layoutSource.match(/const fetchImage = async \(node, pageWidth\) => \{[\s\S]*?^\};/m)?.[0];
if (!fetchImageSource) throw new Error("Installed react-pdf fetchImage changed; inspect this regression harness");

function browserRealm(existingBuffer?: unknown) {
  const warn = vi.fn();
  const sandbox = createContext({
    ...(existingBuffer === undefined ? {} : { Buffer: existingBuffer }),
    console: { warn },
    Blob,
    getSource: (node: { props: { src: unknown } }) => node.props.src,
    resolveSource: async (src: unknown) => typeof src === "string" ? { uri: src } : src,
    resolveImage: async () => ({ width: 1, height: 1 }),
  });
  runInContext(browserBundle, sandbox);
  runInContext(fetchImageSource!, sandbox);
  return {
    sandbox,
    warn,
    install: () => runInContext("PdfBufferCompatibility.ensurePdfBufferCompatibility()", sandbox),
    fetch: async (source: unknown) => {
      const node: { props: { src: unknown }; image?: { key?: string; width: number } } = { props: { src: source } };
      sandbox.testNode = node;
      await runInContext("fetchImage(testNode, 595)", sandbox);
      return node;
    },
  };
}

describe("PDF browser Buffer compatibility", () => {
  it("reproduces the reported successful image decode followed by a missing cache key", async () => {
    const realm = browserRealm();
    expect(runInContext("typeof Buffer", realm.sandbox)).toBe("undefined");
    const node = await realm.fetch("/module-art/photo.jpg");
    expect(node.image?.width).toBe(1);
    expect(node.image?.key).toBeUndefined();
    expect(realm.warn).toHaveBeenCalledWith("Buffer is not defined");
  });

  it.each(["/module-art/photo.jpg", "data:image/png;base64,aGVsbG8="])("restores the exact cache key without warnings for %s", async source => {
    const realm = browserRealm();
    realm.install();
    expect((await realm.fetch(source)).image?.key).toBe(source);
    expect(realm.warn).not.toHaveBeenCalled();
  });

  it("supports data objects and excludes real Buffer and Blob sources from URI keys", async () => {
    const realm = browserRealm();
    realm.install();
    const bytes = runInContext("Buffer.from('hello')", realm.sandbox);
    expect((await realm.fetch({ data: bytes, format: "png" })).image?.key).toBe("hello");
    expect((await realm.fetch(bytes)).image?.key).toBeUndefined();
    expect((await realm.fetch(new Blob(["hello"]))).image?.key).toBeUndefined();
    expect(realm.warn).not.toHaveBeenCalled();
  });

  it("installs the complete browser Buffer API idempotently without process/require shims", () => {
    const realm = browserRealm();
    realm.install();
    const installed = realm.sandbox.Buffer;
    realm.install();
    expect(realm.sandbox.Buffer).toBe(installed);
    expect(runInContext("Buffer.from('aGVsbG8=', 'base64').toString('utf8')", realm.sandbox)).toBe("hello");
    expect(runInContext("Buffer.isBuffer(Buffer.from('hello'))", realm.sandbox)).toBe(true);
    expect(runInContext("Buffer.isBuffer(new Uint8Array(2))", realm.sandbox)).toBe(false);
    expect(runInContext("typeof process + '/' + typeof require", realm.sandbox)).toBe("undefined/undefined");
  });

  it("preserves an existing native or application Buffer", () => {
    for (const existing of [NodeBuffer, { isBuffer: () => false }]) {
      const realm = browserRealm(existing);
      realm.install();
      expect(realm.sandbox.Buffer).toBe(existing);
    }
  });

  it("initializes compatibility at the shared edile PDF entry point", () => {
    const source = readFileSync(resolve("src/components/preventivi/pdf/DocumentoEdilePDF.tsx"), "utf8");
    expect(source).toContain('import { ensurePdfBufferCompatibility } from "@/lib/pdf/ensurePdfBufferCompatibility"');
    expect(source).toContain("\nensurePdfBufferCompatibility();");
  });
});
