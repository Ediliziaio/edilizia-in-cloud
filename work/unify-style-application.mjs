import ts from 'typescript';import fs from 'node:fs';
const area=process.argv[2],file=`src/components/${area}/${area[0].toUpperCase()+area.slice(1)}TemplateEditor.tsx`;
const before=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,before,99,true,4),nodes=[];
const walk=n=>{nodes.push(n);ts.forEachChild(n,walk)};walk(sf);
const declaration=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(sf)==='applyCoverPreset');
const value=declaration.initializer;
const presetName=area==='bagni'?'COVER_LAYOUT_PRESETS':'COVER_PRESETS';
const body=area==='ristrutturazione'?`(patch: CoverPresetPatch) => {
    setForm(prev => prev ? { ...prev, ...coverStyleOnly(patch) } : prev);
    setDirty(true);
  }`:`useCallback((presetId: string) => {
    const preset = ${presetName}.find(item => item.id === presetId);
    if (!preset) return;
    setForm(prev => prev ? { ...prev, ...coverStyleOnly(preset.patch) } : prev);
    setDirty(true);
  }, [])`;
const after=before.slice(0,value.getStart(sf))+body+before.slice(value.end);
const presetFile=`src/components/${area}/coverPresets.ts`,pBefore=fs.readFileSync(presetFile,'utf8'),psf=ts.createSourceFile(presetFile,pBefore,99,true);
const fn=psf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='detectActiveCoverPreset');
if(!fn)throw Error('No detector '+area);
const pAfter='import { detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";\n'+pBefore.slice(0,fn.body.getStart(psf))+'{ return detectCoverStyle(form, COVER_PRESETS); }'+pBefore.slice(fn.body.end);
console.log(JSON.stringify([{file,before,after},{file:presetFile,before:pBefore,after:pAfter}]));
