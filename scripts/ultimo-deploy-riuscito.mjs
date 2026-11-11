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
  const api = path => JSON.parse(execFileSync('gh', ['api', path], {encoding:'utf8', stdio:['ignore','pipe','pipe']}));
  const runs = api(`repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=30`).workflow_runs;
  const sha = await ultimoDeployRiuscito(runs, async id => api(`repos/${repository}/actions/runs/${id}/jobs?per_page=100`).jobs, process.env.GITHUB_RUN_ID);
  process.stdout.write(sha);
}
