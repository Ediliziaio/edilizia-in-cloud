import ts from 'typescript';import fs from 'node:fs';
const area=process.argv[2],file=`src/components/${area}/${area[0].toUpperCase()+area.slice(1)}TemplateEditor.tsx`;
const before=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,before,99,true,4),nodes=[];
const walk=n=>{nodes.push(n);ts.forEachChild(n,walk)};walk(sf);
const edits=[];const edit=(n,text)=>edits.push({start:n.getStart(sf),end:n.end,text});
const tag=n=>ts.isJsxElement(n)?n.openingElement.tagName.getText(sf):ts.isJsxSelfClosingElement(n)?n.tagName.getText(sf):'';
const style=nodes.find(n=>tag(n)==='TemplateCoverStylePicker');
const text=nodes.find(n=>tag(n)==='TemplateCoverTextFields');
if(area!=='facciate'){
  edit(text.parent,'');
  edits.push({start:style.end,end:style.end,text:`\n<div className="my-4">${text.getText(sf)}</div>`});
}
if(area==='serramenti'){
  const media=nodes.find(n=>tag(n)==='div'&&n.getText(sf).includes('ref={coverInputRef}')&&n.getText(sf).includes('Carica file (PNG/JPG max 8 MB)')&&!n.getText(sf).includes('Opacità overlay'));
  if(!media)throw Error('Missing Sr media group');
  edit(media,`<TemplateImageFieldView label="Immagine copertina" value={form.pdf_cover_image_url ?? null} busy={uploadingCover} localOnly={!!localModule} inputRef={coverInputRef} onFile={file => { if (file) return handleCoverUpload(file); }} onRemove={() => update("pdf_cover_image_url", null)} />\n<Button type="button" size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>Scegli dalla libreria</Button>`);
  const textCard=nodes.find(n=>tag(n)==='SrCard'&&n.openingElement.getText(sf).includes('title="Testi copertina"'));
  // This card only contained text fields now provided by the common component.
  const contained=edits.find(e=>e.start>=textCard.getStart(sf)&&e.end<=textCard.end);
  if(contained)edits.splice(edits.indexOf(contained),1);
  edit(textCard,'');
}
if(area==='fotovoltaico'){
  const media=nodes.find(n=>tag(n)==='FvSettingsCard'&&n.openingElement.getText(sf).includes('title="Immagine copertina"'));
  edit(media,`<FvSettingsCard title="Immagine copertina"><TemplateImageFieldView label="Immagine copertina" value={form.pdf_cover_image_url ?? null} busy={uploadingCover} localOnly={!!localModule} inputRef={coverInputRef} onFile={file => { if (file) return handleCoverUpload(file); }} onRemove={() => update("pdf_cover_image_url", null)} /><Button type="button" size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>Scegli dalla libreria</Button></FvSettingsCard>`);
}
// Remove secondary delete controls wherever an uploader already owns removal.
if(!['serramenti','fotovoltaico','facciate'].includes(area)){
  const cover=nodes.find(n=>tag(n)==='SectionCard'&&n.openingElement.getText(sf).includes('title="Copertina"'));
  for(const node of nodes.filter(n=>tag(n)==='Button'&&n.getStart(sf)>cover.getStart(sf)&&n.end<cover.end&&/onClick=\{\(\) => (?:set|setCoverImage)\("?(?:pdf_cover_image_url|cover_image_url)?"?,?\s*null\)/.test(n.getText(sf)))){
    if(edits.some(e=>node.getStart(sf)>=e.start&&node.end<=e.end))continue;
    if(ts.isJsxExpression(node.parent))edit(node.parent,'');
    else {let p=node.parent;while(p&&!ts.isJsxExpression(p)&&p!==cover)p=p.parent;if(p&&ts.isJsxExpression(p))edit(p,'');}
  }
}
edits.sort((a,b)=>a.start-b.start);
for(let i=1;i<edits.length;i++)if(edits[i].start<edits[i-1].end)throw Error('overlap '+area);
let after=before;for(const e of edits.reverse())after=after.slice(0,e.start)+e.text+after.slice(e.end);
if(['serramenti','fotovoltaico'].includes(area))after='import { TemplateImageFieldView } from "@/components/preventivi/TemplateImageFieldView";\n'+after;
after=after.replaceAll('📷 Galleria stock','Scegli dalla libreria').replaceAll('title="Testi e stile copertina"','title="Aspetto e disposizione"');
// Retired components no longer mount or perform their brand lookup.
after=after.replace(/^import \{ CopertinaAnteprima[^\n]+\n/gm,'').replace(/^function LocalCoverPreview\([^\n]+\n[^\n]+\n\}\n/gm,'').replace(/^  const CoverPreview = [^\n]+\n/gm,'').replace(/^  const \[showPresets, setShowPresets\] = useState\(false\);\n/gm,'').replace(/^  const cover(?:Title|Subtitle)Ref = useRef<HTMLInputElement \| null>\(null\);\n/gm,'');
const parsed=ts.createSourceFile(file,after,99,true,4);if(parsed.parseDiagnostics.length)throw Error(parsed.parseDiagnostics[0].messageText);
console.log(JSON.stringify([{file,before,after}]));
