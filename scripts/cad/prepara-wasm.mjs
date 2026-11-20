// Genera i soli artefatti backend da una distribuzione npm ufficiale verificata.
// Uso: node scripts/cad/prepara-wasm.mjs /percorso/mlightcad-libredwg-web-0.9.0.tgz
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const archive = process.argv[2]; if (!archive) throw Error('Indica il tarball ufficiale @mlightcad/libredwg-web 0.9.0.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha(await fs.readFile(archive)) !== 'afa92ed91391408482f0aa9791fc1c2fabe17ba049b2924c83c0b85ab63c3e3a') throw Error('Checksum del tarball diverso dalla versione verificata.');
const temporary = await fs.mkdtemp(join(tmpdir(), 'eic-cad-wasm-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', temporary]);
  const source = join(temporary, 'package/wasm'), target = fileURLToPath(new URL('../../supabase/functions/cad-leggi-commessa/vendor/', import.meta.url));
  const original = await fs.readFile(join(source, 'libredwg-web.wasm'));
  if (sha(original) !== 'aa4347f80dd0aa4606b4268d112e04d3e47c3bf5f0d119a49cddf5b7d289e093') throw Error('WASM originale non riconosciuto.');
  let offset = 8, patched;
  function read() { let value = 0, shift = 0, b; do { b = original[offset++]; value |= (b & 127) << shift; shift += 7; } while (b & 128); return value; }
  function encode(value) { const out = []; do { let b = value & 127; value >>>= 7; if (value) b |= 128; out.push(b); } while (value); return Buffer.from(out); }
  while (offset < original.length) {
    const section = offset, id = original[offset++], length = read(), end = offset + length;
    if (id === 5) {
      const count = read(), flags = read(), min = read(), max = read();
      if (count !== 1 || flags !== 1 || min !== 16384 || max !== 65536 || offset !== end) throw Error('Dichiarazione di memoria diversa da quella collaudata.');
      // Unica memoria: 64 MB iniziali, tetto 128 MB. Il codice del parser non viene alterato.
      const body = Buffer.concat([encode(1), encode(1), encode(1024), encode(2048)]);
      patched = Buffer.concat([original.subarray(0, section), Buffer.from([5]), encode(body.length), body, original.subarray(end)]); break;
    }
    offset = end;
  }
  if (!patched || sha(patched) !== '9ec3c7d41e83ce637fe127440a1551279af197d4e843c2197dd2a0b6db5838b3') throw Error('Artefatto finale diverso da quello collaudato.');
  const glue = (await fs.readFile(join(source, 'libredwg-web.js'), 'utf8')).replace('import("module")', 'import("node:module")').replace(/[\t ]+$/gm, '');
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(join(target, 'libredwg.mjs'), '// GNU LibreDWG / @mlightcad/libredwg-web 0.9.0, GPL-3.0. See PROVENIENZA.md and COPYING.\n' + glue);
  await fs.writeFile(join(target, 'wasmCompresso.ts'), '// Generated with scripts/cad/prepara-wasm.mjs; backend only. GPL-3.0.\nexport const WASM_GZIP_BASE64 = "' + gzipSync(patched, { mtime: 0 }).toString('base64') + '";\nexport const WASM_SHA256 = "' + sha(patched) + '";\n');
  console.log('Artefatti DWG backend generati e verificati.');
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
