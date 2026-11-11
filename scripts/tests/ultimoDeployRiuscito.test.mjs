import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ultimoDeployRiuscito } from '../ultimo-deploy-riuscito.mjs';
const run=(id,extra={})=>({id,event:'push',head_branch:'main',status:'completed',head_sha:`sha-${id}`,...extra});
test('keeps a successful backend checkpoint when the frontend failed',async()=>{
 assert.equal(await ultimoDeployRiuscito([run(3,{conclusion:'failure'}),run(2)],async()=>[{name:'Deploy edge functions',conclusion:'success'}],99),'sha-3');
});
test('does not skip missed functions after a partial, cancelled or skipped deploy',async()=>{
 const jobs={4:'failure',3:'cancelled',2:'skipped',1:'success'};
 assert.equal(await ultimoDeployRiuscito([4,3,2,1].map(id=>run(id)),async id=>[{name:'Deploy edge functions',conclusion:jobs[id]}],99),'sha-1');
});
test('ignores verification tags, manual partial deployments, unfinished runs and itself',async()=>{
 const queried=[];const runs=[run(6),run(5,{event:'workflow_dispatch'}),run(4,{head_branch:'verify-automation-completion-test'}),run(3,{status:'in_progress'}),run(2)];
 assert.equal(await ultimoDeployRiuscito(runs,async id=>{queried.push(id);return[{name:'Deploy edge functions',conclusion:'success'}]},6),'sha-2');assert.deepEqual(queried,[2]);
});
test('fails closed when deployment history cannot be read',async()=>{
 await assert.rejects(ultimoDeployRiuscito([run(1)],async()=>{throw Error('API unavailable')},99),/API unavailable/);
});
