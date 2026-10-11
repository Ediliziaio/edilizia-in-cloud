/** Current-year demo maintenance: independent IDs/checkpoints; never move issued history. */
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { C, A, q, j, sql, guard, context, insert } from './demo-company-55m.mjs';
export { C, A, q, j, sql, guard, context, insert };
export const YEAR = 2026, AS_OF = '2026-10-10';
export const MARK = '[DEMO 5.5M 2026 v1]', DIR = 'tmp/demo-integrated/annual-2026';
mkdirSync(DIR, { recursive: true, mode: 0o700 });
export const uid = key => {
  const h = createHash('sha256').update(`${MARK}:${key}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
export const save = (name, value, immutable = false) => {
  const path = `${DIR}/${name}.json.gz`;
  if (immutable && existsSync(path)) throw Error(`Preserve original checkpoint: ${name}`);
  writeFileSync(path, gzipSync(JSON.stringify(value)), { mode: 0o600 });
};
export const read = name => JSON.parse(gunzipSync(readFileSync(`${DIR}/${name}.json.gz`)));
export const has = name => existsSync(`${DIR}/${name}.json.gz`);

export function run(stage, dry) {
  guard();
  const plan = read(`${stage}-plan`);
  const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  if (plan.company !== C || plan.year !== YEAR || plan.asOf !== AS_OF) throw Error('Wrong tenant/date plan');
  if (!dry && (!has(`${stage}-dry`) || read(`${stage}-dry`).hash !== hash)) throw Error('Matching rollback test required');
  const name = `${stage}-${dry ? 'dry' : 'applied'}`;
  const checkpoint = has(name) ? read(name) : { company: C, hash, completed: [] };
  if (checkpoint.hash !== hash) throw Error('Applied plan immutable');
  for (const [index, batch] of plan.batches.entries()) {
    if (checkpoint.completed.includes(index)) continue;
    sql(`begin; ${context} ${batch.join('\n')}
      delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;
      delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;
      ${dry ? 'rollback' : 'commit'};`);
    checkpoint.completed.push(index); save(name, checkpoint);
    console.log(`${dry ? 'ROLLBACK' : 'APPLIED'} ${stage} ${index + 1}/${plan.batches.length}`);
  }
}

if (process.argv[1]?.endsWith('/demo-company-2026.mjs') || process.argv[1] === 'scripts/demo-company-2026.mjs') {
  if (['dry', 'apply'].includes(process.argv[2])) run(process.argv[3], process.argv[2] === 'dry');
  else console.log('dry STAGE | apply STAGE. Demo Azienda 2 only; outbound guards and rollback required.');
}
