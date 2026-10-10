/** Read-only final reconciliation of the recoverable Demo 2 cleanup. */
import { C, q, read, save, sql, guard } from './demo-company-55m.mjs';
guard();
const previous = read('retire-old-jobs-before');
const technical = read('technical-fixture-before')[0];
const targets = [...previous.rows, technical];
const rows = sql(`select * from orders where company_id=${q(C)} and id in (${targets.map(r=>q(r.id)).join(',')}) order by id`);
const [scope] = sql(`select count(*) filter(where deleted_at is null) remaining_jobs,
 count(*) filter(where deleted_at is null and order_code like 'DEMO-2025-%') annual_jobs
 from orders where company_id=${q(C)}`);
const calendar = read('annual-calendar-verified');
const coverage = read('tenant-wide-coverage-verified');
const financial = read('retire-old-jobs-verified');
const issues = [];
if(rows.length !== targets.length || rows.some(r=>!r.deleted_at || !r.internal_notes?.includes('[DEMO CLEANUP 2026-10-10]'))) issues.push('An archival target is missing or still visible');
for(const row of rows) {
  const before = targets.find(r=>r.id===row.id);
  for(const key of Object.keys(row)) {
    if(['deleted_at','internal_notes','updated_at','version'].includes(key)) continue;
    if(JSON.stringify(row[key])!==JSON.stringify(before[key])) issues.push(`${row.order_code}: unexpected change to ${key}`);
  }
}
if(!financial.financialUnchanged || financial.errors.length) issues.push('Financial preservation verification failed');
if(calendar.company!==C || calendar.exercise!==2025 || calendar.months.length!==12 || calendar.issues.length) issues.push('Full-year calendar verification failed');
if(coverage.company!==C || coverage.jobs!==Number(scope.remaining_jobs) || coverage.issues.length || coverage.warnings.length) issues.push('Remaining-job coverage verification failed');
const invoicedCents = calendar.months.reduce((total,m)=>total+Math.round(Number(m.invoiced_net)*100),0);
if(invoicedCents!==550_000_000) issues.push('Annual issued net invoices do not reconcile to 5.5M');
const result = {
  company:C, checkedAt:new Date().toISOString(), readOnly:true,
  archivedJobs:rows.filter(r=>r.deleted_at).length, recoverable:true,
  remainingJobs:Number(scope.remaining_jobs), annualJobs:Number(scope.annual_jobs),
  exercise:2025, coveredMonths:calendar.months.length, issuedNet:invoicedCents/100,
  financialUnchanged:financial.financialUnchanged,
  dateAlignedJobs:read('calendar-jobs-before').length,
  plannedJobsWithoutInventedReports:coverage.notRequired.length,
  issues,
  limitations:[
    'UI validation blocked: the local browser currently shows a connection error.',
    'Frontend filters are local changes, not a production deployment.',
    'Historical accounting records are retained, not deleted with old jobs.',
    '2025 is the full annual exercise; 2026 is not a second 5.5M simulation.',
    'Demo photos, draft acceptance documents and unsigned reports are not real site evidence or certified signatures.',
    'This verification does not certify a complete balance-sheet or bank reconciliation.',
  ],
};
save('cleanup-cycle-result',result);
console.log(result);
if(issues.length)process.exitCode=1;
