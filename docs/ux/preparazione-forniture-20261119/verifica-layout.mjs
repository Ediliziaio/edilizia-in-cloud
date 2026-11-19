import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const risultati=[];
try{
 for(const width of [1600,1280,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:8099/?simulazione=appartamento');await page.waitForLoadState('networkidle');
  await page.getByRole('dialog').waitFor();
  const esito=await page.locator('[data-riga-preparazione]').evaluateAll((rows)=>rows.map(row=>{
   const boxes=Array.from(row.querySelectorAll('input')).map(input=>input.getBoundingClientRect());
   return {scartoY:Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y)),altezze:[...new Set(boxes.map(b=>b.height))]};
  }));
  assert.equal(esito.length,22);
  if(width>=1280)assert.ok(esito.every(r=>r.scartoY<=1&&r.altezze.length===1),JSON.stringify(esito));
  const overflow=await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);
  await page.screenshot({path:`/private/tmp/eic-forniture-allineate-${width}.png`});
  risultati.push({width,righe:esito.length,allineate:width>=1280?esito.every(r=>r.scartoY<=1):'griglia mobile',overflow});await page.close();
 }
 fs.writeFileSync('/private/tmp/eic-forniture-layout.json',JSON.stringify(risultati,null,2));console.log(JSON.stringify(risultati));
}finally{await browser.close();}
