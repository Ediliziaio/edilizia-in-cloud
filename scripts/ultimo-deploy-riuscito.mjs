import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// A failed frontend build does not undo an already successful backend deploy.
// Conversely, a partial/failed deploy must never advance this checkpoint.
export async function ultimoDeployRiuscito(runs, readJobs, currentRunId) {
  for (const run of runs) {
    if (String(run.id) === String(currentRunId) || run.event !== 'push' || run.head_branch !== 'main' || run.status !== 'completed') continue;
    const jobs = await readJobs(run.id);
    if (jobs.some(job => job.name === 'Deploy edge functions' && job.conclusion === 'success')) return run.head_sha;
  }
  return '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY required');
  // Solo i campi che servono (--jq): 100 giri interi superano il buffer di execFileSync (ENOBUFS).
  const api = (path, jq) => JSON.parse(execFileSync('gh', ['api', path, '--jq', jq], {encoding:'utf8', maxBuffer: 64 * 1024 * 1024, stdio:['ignore','pipe','pipe']}));
  // 11/11/2026: si cercava solo negli ultimi 30 giri. Con molte sessioni che pubblicano
  // (54 giri in un giorno) e una fila di giri rossi o annullati, l'ultimo deploy riuscito
  // finiva oltre il trentesimo: il passo tornava a `event.before` e le funzioni dei giri
  // persi non uscivano più. Ora si scorre a pagine da 100, fino a 1.000 giri.
  let sha = '';
  for (let pagina = 1; pagina <= 10 && !sha; pagina++) {
    const runs = api(`repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=100&page=${pagina}`, '[.workflow_runs[] | {id, event, head_branch, status, head_sha}]');
    if (!runs.length) break;
    sha = await ultimoDeployRiuscito(runs, async id => api(`repos/${repository}/actions/runs/${id}/jobs?per_page=100`, '[.jobs[] | {name, conclusion}]'), process.env.GITHUB_RUN_ID);
  }
  process.stdout.write(sha);
}
