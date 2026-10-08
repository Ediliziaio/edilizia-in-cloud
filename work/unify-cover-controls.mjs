// One-off, read-only patch generator. Output is applied through apply_patch.
import ts from 'typescript';
import fs from 'node:fs';
const areas = ['bagni','termoidraulico','climatizzazione','elettrico','pavimenti','piscine','ristrutturazione','tetti','serramenti','fotovoltaico'];
const patches = [];
for (const area of areas) {
  if (process.argv[2] && process.argv[2] !== area) continue;
  const file = `src/components/${area}/${area[0].toUpperCase()+area.slice(1)}TemplateEditor.tsx`;
  const source = fs.readFileSync(file,'utf8');
  const sf = ts.createSourceFile(file,source,99,true,4);
  const nodes=[]; const walk=n=>{nodes.push(n);ts.forEachChild(n,walk)};walk(sf);
  const edits=[];
  const edit=(node,text)=>edits.push({start:node.getStart(sf),end:node.end,text});
  const presetNodes=nodes.filter(n=>ts.isJsxElement(n)&&n.getText(sf).includes('activeCoverPresetId')&&n.getText(sf).includes('applyCoverPreset(')&&!['<Input','<Textarea','<ImageUploadField','type="file"'].some(t=>n.getText(sf).includes(t))).sort((a,b)=>(b.end-b.pos)-(a.end-a.pos));
  if(!presetNodes[0])throw Error(`No presets ${area}`);
  const presetName=area==='bagni'?'COVER_LAYOUT_PRESETS':area==='ristrutturazione'?'RST_COVER_PRESETS':'COVER_PRESETS';
  edit(presetNodes[0], `<TemplateCoverStylePicker presets={${presetName}} activeId={activeCoverPresetId} onApply={${area==='ristrutturazione'?'id => { const preset = RST_COVER_PRESETS.find(p => p.id === id); if (preset) applyCoverPreset(coverStyleOnly(preset.patch)); }':'applyCoverPreset'}} />`);

  // Retain every original field handler, including alias updates and dirty tracking.
  const fields=[];
  for(const n of nodes.filter(n=>ts.isJsxSelfClosingElement(n)&&['Input','Textarea'].includes(n.tagName.getText(sf)))){
    const attrs=Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(sf),a.initializer]));
    const match=attrs.value?.getText(sf).match(/form\.(pdf_cover_(eyebrow|hero|subhero|subhero_template)|cover_(title|subtitle|eyebrow))\b/);
    if(!match)continue;
    const native=match[1]; const key= native.endsWith('subhero_template')?'dynamicSubtitle': /eyebrow$/.test(native)?'eyebrow':/hero$|title$/.test(native)&&! /subhero$|subtitle$/.test(native)?'title':'subtitle';
    let parent=n.parent;
    while(parent&&!ts.isJsxElement(parent))parent=parent.parent;
    if(!parent||parent.openingElement.tagName.getText(sf)!=='div')throw Error(`Unexpected field wrapper ${area} ${native}`);
    const handler=attrs.onChange.expression;
    const param=handler.parameters[0].name.getText(sf);
    const body=handler.body.getText(sf).replaceAll(`${param}.target.value`,'(value ?? "")');
    fields.push({key,native,parent,body});
  }
  if(fields.length<2)throw Error(`No cover text ${area}`);
  const available=fields.map(f=>f.key);
  // Termoidraulico already persists this field but previously offered no input.
  if(area==='termoidraulico')fields.push({key:'eyebrow',native:'pdf_cover_eyebrow',body:'set("pdf_cover_eyebrow", value)'});
  const value=fields.map(f=>`${f.key}: form.${f.native}`).join(', ');
  const handlers=fields.map(f=>`if (field === "${f.key}") ${f.body.startsWith('{')?f.body:`{ ${f.body}; }`}`).join('\n');
  const common=`<div className="col-span-full w-full min-w-0"><TemplateCoverTextFields value={{ ${value} }} onChange={(field, value) => { ${handlers} }} ${available.includes('dynamicSubtitle')?'dynamicSubtitle':''} ${area==='piscine'?'hideEyebrow':''} placeholders={(value, onChange) => <PlaceholderChips value={value} onChange={onChange} ${area==='fotovoltaico'?'accumulo={!!localModule}':''} />} /></div>`;
  fields.filter(f=>f.parent).forEach((f,i)=>edit(f.parent,i===0?common:''));

  // Remove the second renderer; leave actual image upload controls intact.
  for(const n of nodes.filter(n=>ts.isJsxSelfClosingElement(n)&&['CopertinaAnteprima','CoverPreview'].includes(n.tagName.getText(sf)))){
    const parent=n.parent;
    const grid=parent.parent;
    if(area==='pavimenti'){
      edit(n,'');
      const label=parent.children.find(c=>ts.isJsxElement(c)&&c.openingElement.tagName.getText(sf)==='Label');
      if(label)edit(label,'');
    } else edit(parent,'');
    if(ts.isJsxElement(grid)){
      const attr=grid.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(sf)==='className');
      if(attr&&attr.getText(sf).includes('grid'))edit(attr,'className="space-y-4"');
    }
  }
  if(area==='serramenti'){
    const hidden=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.getText(sf)==='<div className="hidden">'&&n.getText(sf).includes('Anteprima approssimativa'));
    if(hidden)edit(hidden,'');
  }
  if(area==='fotovoltaico'){
    const preview=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.getText(sf).includes('relative aspect-[3/4]'));
    if(!preview)throw Error('Missing FV duplicate preview');
    edit(preview,`{form.pdf_cover_image_url && <ImgRiservata src={form.pdf_cover_image_url} alt="Immagine copertina" className="aspect-video max-h-48 w-full rounded-lg border object-contain" />}`);
  }
  edits.sort((a,b)=>a.start-b.start);
  for(let i=1;i<edits.length;i++)if(edits[i].start<edits[i-1].end)throw Error(`Overlapping edits ${area}`);
  let next=source;
  for(const e of edits.reverse())next=next.slice(0,e.start)+e.text+next.slice(e.end);
  next='import { TemplateCoverStylePicker, TemplateCoverTextFields, coverStyleOnly } from "@/components/preventivi/TemplateCoverControls";\n'+next;
  // Preserve existing images even when a preset offers a stock fallback or null.
  next=next.replaceAll('const patch = { ...preset.patch };','const patch = coverStyleOnly(preset.patch);');
  // Simple direct-spread implementations (Tetti, Serramenti, Fotovoltaico).
  next=next.replaceAll('...preset.patch,','...coverStyleOnly(preset.patch),');
  next=next.replace(/\s*\.\.\.\(localModule && preset\.category === "photo" \? \{ (?:pdf_cover_image_url|cover_image_url): prev\.(?:pdf_cover_image_url|cover_image_url) \|\| moduleDefaults\?\.(?:pdf_cover_image_url|cover_image_url)(?: \|\| null)? \} : \{\}\),?/g,'');
  next=next.replace('title="Anteprima e immagine"','title="Immagine copertina"');
  const parsed=ts.createSourceFile(file,next,99,true,4);if(parsed.parseDiagnostics.length)throw Error(`Invalid TSX ${area}: ${parsed.parseDiagnostics[0].messageText}`);
  patches.push({file,before:source,after:next});
}
console.log(JSON.stringify(patches));
