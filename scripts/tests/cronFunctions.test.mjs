import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronSenzaFunzione } from '../check-cron-functions.mjs';
test('un cron attivo verso una funzione mancante ferma la verifica senza esporre il comando',()=>{
  const row={id:1,nome:'legacy',active:true,endpoint:'process-internal-automation',command:'SQL NON DEVE USCIRE'};
  assert.deepEqual(cronSenzaFunzione([row],['process-automation']),[{id:1,nome:'legacy',endpoint:'process-internal-automation'}]);
});
test('job disattivati, SQL senza HTTP e destinazioni esistenti non danno falsi allarmi',()=>{
  assert.deepEqual(cronSenzaFunzione([{id:1,active:false,endpoint:'legacy'},{id:2,active:true,endpoint:null},{id:3,active:true,endpoint:'process-automation'}],['process-automation']),[]);
});
