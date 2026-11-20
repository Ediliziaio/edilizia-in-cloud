// Il motore resta sul backend: nessun parser GPL viene incorporato nel frontend.
// @ts-ignore -- Emscripten glue, provenance and license in vendor/.
import createModule from "./vendor/libredwg.mjs";
import { WASM_GZIP_BASE64, WASM_SHA256 } from "./vendor/wasmCompresso.ts";
interface Motore { FS: { writeFile(path: string, bytes: Uint8Array): void; readFile(path: string): Uint8Array; unlink(path: string): void; stat(path: string): { size: number } }; dwg_write_dxf(input: string, output: string): number }
let compilato: Promise<WebAssembly.Module> | null = null;
async function compila() {
  const gzip = Uint8Array.from(atob(WASM_GZIP_BASE64), c => c.charCodeAt(0));
  const bytes = await new Response(new Blob([gzip]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
  if (hash !== WASM_SHA256) throw new Error("Motore CAD non integro");
  return WebAssembly.compile(bytes);
}
/** Una memoria isolata per conversione; il solo codice compilato è riutilizzato. */
export async function convertiDwgOnline(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  compilato ??= compila().catch(e => { compilato = null; throw e; });
  const modulo = await compilato;
  const motore: Motore = await createModule({ print: () => {}, printErr: () => {},
    instantiateWasm(imports: WebAssembly.Imports, success: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
      const instance = new WebAssembly.Instance(modulo, imports); success(instance, modulo); return instance.exports;
    } });
  try {
    motore.FS.writeFile("input.dwg", bytes);
    if (motore.dwg_write_dxf("input.dwg", "output.dxf") !== 0) throw new Error("DWG non supportato");
    const size = motore.FS.stat("output.dxf").size;
    if (!size || size > 24 * 1024 * 1024) throw new Error("DXF oltre il limite online");
    return new Uint8Array(motore.FS.readFile("output.dxf"));
  } finally {
    for (const path of ["input.dwg", "output.dxf"]) { try { motore.FS.unlink(path); } catch { /* file non creato */ } }
  }
}
