import fs from 'node:fs';
import ts from 'typescript';
const names={bagni:'Bagni',tetti:'Tetti',climatizzazione:'Climatizzazione',termoidraulico:'Termoidraulico',elettrico:'Elettrico',pavimenti:'Pavimenti',piscine:'Piscine',ristrutturazione:'Ristrutturazione'};
const area=process.argv[2], path=`src/components/${area}/${names[area]}TemplateEditor.tsx`;
const source=fs.readFileSync(path,'utf8'), sf=ts.createSourceFile(path,source,99,true,4);
const nodes=[]; function walk(n){nodes.push(n);ts.forEachChild(n,walk);}walk(sf);
const card=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText()==='SectionCard'&&n.openingElement.getText().includes('Copertina'));
if(!card||card.getText().includes('TemplateCoverDesignControls'))throw Error('Expected original cover card');
const within=nodes.filter(n=>n.getStart()>card.getStart()&&n.end<card.end);
const self=(tag)=>within.filter(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()===tag);
const attr=(n,key)=>{const a=n.attributes.properties.find(x=>ts.isJsxAttribute(x)&&x.name.getText()===key);if(!a?.initializer)return null;return ts.isJsxExpression(a.initializer)?a.initializer.expression.getText():a.initializer.text;};
const text=card.getText(), prefix=area==='tetti'?'cover_':'pdf_cover_';
const field=(suffix)=>area==='piscine'&&['title_size','text_color','text_align','logo_position','overlay_opacity'].includes(suffix)?`cover_${suffix}`:`${prefix}${suffix}`;
const update=(key,value)=>`set(${JSON.stringify(key)}, ${value})`;
const fields=[];
const rangeIds={eyebrow_size:'eyebrowSize',title_size:'titleSize',subtitle_size:'subtitleSize',logo_size:'logoSize',overlay_opacity:'overlayOpacity'};
for(const n of within.filter(n=>ts.isJsxSelfClosingElement(n)&&['Slider','input'].includes(n.tagName.getText()))) {
  if(n.tagName.getText()==='input'&&attr(n,'type')!=='range')continue;
  const handler=attr(n,'onValueChange')??attr(n,'onChange')??'', key=handler.match(/set\("([^"]+)"/)?.[1];
  const suffix=Object.keys(rangeIds).sort((a,b)=>b.length-a.length).find(x=>key?.endsWith(x));if(!suffix)continue;
  let value=attr(n,'value');if(value.startsWith('['))value=value.slice(1,-1);
  const factor=Number(attr(n,'max'))===1?100:1;
  fields.push(`{ id: "${rangeIds[suffix]}", kind: "range", value: ${factor===100?`Math.round((${value}) * 100)`:value}, min: ${Number(attr(n,'min'))*factor}, max: ${Number(attr(n,'max'))*factor}, step: ${Number(attr(n,'step')??1)*factor}, unit: "${suffix==='logo_size'||suffix==='overlay_opacity'?'%':'pt'}", onChange: value => ${update(key,factor===100?'value / 100':'value')} }`);
}
const defaults={textAlign:'left',textVertical:'bottom',logoPosition:'top_left',overlayStyle:area==='pavimenti'?'flat':'flat',decorationStyle:'square'};
const choiceIds={text_align:'textAlign',text_vertical:'textVertical',logo_position:'logoPosition',overlay_style:'overlayStyle',decoration_style:'decorationStyle'};
for(const [suffix,id] of Object.entries(choiceIds)) {
 const key=field(suffix);if(!text.includes(`set("${key}"`))throw Error(`missing ${key}`);
 let change=update(key,`value as typeof form.${key}`);
 if(area==='climatizzazione'&&['text_align','logo_position'].includes(suffix))change=`{ ${change}; ${update('cover_'+suffix,`value as typeof form.cover_${suffix}`)}; }`;
 fields.push(`{ id: "${id}", kind: "choice", value: form.${key} ?? "${defaults[id]}", choices: ${id==='textAlign'&&area==='piscine'?'[...COVER_DESIGN_CHOICES.textAlign, ["right", "Destra"]]':`COVER_DESIGN_CHOICES.${id}`}, onChange: value => ${change} }`);
}
for(const [suffix,id,fallback] of [['text_color','textColor','#FFFFFF'],['bg_color','backgroundColor','#0F1B2A']]) {
 const key=field(suffix);if(!text.includes(`set("${key}"`))continue;
 let change=update(key,'value');
 if(area==='climatizzazione'&&suffix==='text_color')change=`{ ${change}; ${update('cover_text_color','value')}; }`;
 fields.push(`{ id: "${id}", kind: "color", value: form.${key}, fallback: "${fallback}", onChange: value => ${change} }`);
}
for(const [suffix,id] of [['show_decoration','showDecoration'],['show_client_card','showClientCard']]) {
 const key=field(suffix), match=text.match(new RegExp(`checked=\\{(form\\.${key}[^}]*)\\}`));
 if(!match)throw Error('Missing toggle '+key);
 fields.push(`{ id: "${id}", kind: "toggle", value: !!(${match[1]}), onChange: value => ${update(key,'value')} }`);
}
const picker=self('TemplateCoverStylePicker')[0].getText(), texts=self('TemplateCoverTextFields')[0].getText();
const uploads=self('ImageUploadField').map(n=>n.getText());
if(area==='elettrico')uploads.push('<TemplateImageFieldView label="Immagine copertina" value={form.pdf_cover_image_url ?? null} busy={uploadingCover} disabled={!companyId} localOnly={!!localModule} inputRef={coverInputRef} onFile={handleCoverUpload} onRemove={() => setCoverImage(null)} />');
const imageKey=area==='piscine'||area==='tetti'?'cover_image_url':'pdf_cover_image_url';
const content=`\n              ${picker}\n              ${texts}\n              <div data-cover-media className="space-y-4">\n${uploads.join('\n')}\n<Button type="button" size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>Scegli dalla libreria</Button>\n</div>\n              <TemplateCoverDesignControls hasImage={!!form.${imageKey}} fields={[\n${fields.join(',\n')}\n]} />\n`;
const lineStart=source.lastIndexOf('\n',card.getStart())+1;
const indent=source.slice(lineStart,card.getStart());
const before=source.slice(lineStart,card.end);
const after=indent+card.openingElement.getText()+content+indent+card.closingElement.getText();
const change={path,before,after,import:'import { TemplateCoverDesignControls, COVER_DESIGN_CHOICES } from "@/components/preventivi/TemplateCoverDesignControls";\n'};
console.log(JSON.stringify(change));
