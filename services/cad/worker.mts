/// <reference types="node" />
import { summarizeCad } from './summary.mts';
// Spawned by the local converter, never exposed as an arbitrary path API.
const [file, id, size, name] = process.argv.slice(2);
try {
  const summary = await summarizeCad(file, { id, name, size: Number(size) });
  process.stdout.write(JSON.stringify(summary));
} catch { process.stderr.write('CAD extraction failed'); process.exitCode = 1; }
