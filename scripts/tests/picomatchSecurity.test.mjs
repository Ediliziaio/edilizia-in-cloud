import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const versions=[require.resolve('picomatch'),require.resolve('picomatch',{paths:[require.resolve('micromatch')]}),require.resolve('picomatch',{paths:[require.resolve('anymatch')]})];
for(const entry of [...new Set(versions)]){
 test(`blocca i casi ReDoS della dipendenza ${entry}`,()=>{
  const code=`const pm=require(${JSON.stringify(entry)});for(const glob of ['+(*)','+(*a)','*(*)!','+(*a)!','+(?)']){for(const opts of [{},{maxExtglobRecursion:false},{dot:true}]){const match=pm(glob,opts);match('a'.repeat(80)+'!');}}process.stdout.write('done');`;
  const r=spawnSync(process.execPath,['-e',code],{timeout:2000,encoding:'utf8'});
  assert.equal(r.error,undefined,r.error?.message);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'done');
 });
 test(`conserva glob ordinari, nomi e alternative letterali ${entry}`,()=>{
  const pm=require(entry);
  assert.equal(pm('src/**/*.{ts,tsx}')('src/components/warehouse/StockItemDialog.tsx'),true);
  assert.equal(pm('**/*.png')('images/logo.svg'),false);
  assert.equal(pm('+(foo|bar).js')('foobar.js'),true);
  assert.equal(pm('+(a).txt')('aaa.txt'),true);
  assert.equal(pm('assets/@(icon|logo).svg')('assets/logo.svg'),true);
 });
}
