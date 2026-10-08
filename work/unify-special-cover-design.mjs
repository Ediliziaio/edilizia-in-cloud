import fs from 'node:fs';import ts from 'typescript';
const area=process.argv[2],name={serramenti:'Serramenti',fotovoltaico:'Fotovoltaico',facciate:'Facciate'}[area];
const path=`src/components/${area}/${name}TemplateEditor.tsx`,source=fs.readFileSync(path,'utf8'),sf=ts.createSourceFile(path,source,99,true,4),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk);}walk(sf);
const fields=[];const call=(key,value)=>area==='facciate'?`patch({ ${key}: ${value} })`:`update("${key}", ${value})`;
const numeric={
serramenti:[["eyebrowSize","eyebrow_size",11,8,20],["titleSize","title_size",40,22,64],["subtitleSize","subtitle_size",13,9,22],["logoSize","logo_size",100,60,160,5],["overlayOpacity","overlay_opacity",65,0,100,5]],
fotovoltaico:[["eyebrowSize","eyebrow_size",11,8,14],["titleSize","title_size",40,28,64],["subtitleSize","subtitle_size",13,10,18],["overlayOpacity","overlay_opacity",62,0,100]],
facciate:[["eyebrowSize","eyebrow_size",10,7,20],["titleSize","title_size",30,16,60],["subtitleSize","subtitle_size",13,8,24],["overlayOpacity","overlay_opacity",65,0,100]],
};
for(const[id,suffix,fallback,min,max,step=1]of numeric[area]){const key='pdf_cover_'+suffix;fields.push(`{id:"${id}",kind:"range",value:${area==='facciate'?`Number(coverFields.${key} ?? ${fallback})`:`form.${key} ?? ${fallback}`},min:${min},max:${max},step:${step},unit:"${id==='logoSize'||id==='overlayOpacity'?'%':'pt'}",onChange:value=>${call(key,'value')}}`);}
for(const [id,suffix,fallback] of [['textAlign','text_align','left'],['textVertical','text_vertical','bottom'],['logoPosition','logo_position','top_left'],['overlayStyle','overlay_style','flat'],['decorationStyle','decoration_style',area==='facciate'?'none':'square']]) {
const key='pdf_cover_'+suffix; const value=area==='facciate'?`String(coverFields.${key} ?? ${id==='logoPosition'?'form.cover_logo_position ?? ':''}"${fallback}")`:`form.${key} ?? "${fallback}"`;
fields.push(`{id:"${id}",kind:"choice",value:${value},choices:COVER_DESIGN_CHOICES.${id},onChange:value=>${area==='facciate'?`patch({ ${key}: value } as Record<string, unknown>)`:call(key,`value as typeof form.${key}`)}}`);
}
const colors=[['textColor','text_color','#FFFFFF'],['backgroundColor','bg_color',area==='serramenti'?'#0F2A2E':'#0F2542']];
if(area==='serramenti')colors.push(['eyebrowColor','eyebrow_color','#2D7D5C'],['titleColor','title_color','#FFFFFF'],['subtitleColor','subtitle_color','#D1D5DB']);
for(const[id,suffix,fallback]of colors){const key='pdf_cover_'+suffix;const resolved=area==='serramenti'&&id==='eyebrowColor'?'form.colore_primario || "#2D7D5C"':area==='serramenti'&&id==='titleColor'?'form.pdf_cover_text_color || "#FFFFFF"':`"${fallback}"`;fields.push(`{id:"${id}",kind:"color",value:form.${key},fallback:${resolved},onChange:value=>${call(key,area==='facciate'?'value':'value || null')}${area==='facciate'?'':`,onReset:()=>${call(key,'null')}`}}`);}
for(const[id,suffix]of [['showDecoration','show_decoration'],['showClientCard','show_client_card']]){const key='pdf_cover_'+suffix;fields.push(`{id:"${id}",kind:"toggle",value:${area==='facciate'?`!!form.${key}`:`form.${key} !== false`},onChange:value=>${call(key,'value')}}`);}
const panel=(extras='')=>`<TemplateCoverDesignControls hasImage={!!form.pdf_cover_image_url} fields={[\n${fields.join(',\n')}\n]}>${extras}</TemplateCoverDesignControls>`;
const changes=[];function replace(n,after){const start=source.lastIndexOf('\n',n.getStart())+1,end=source.indexOf('\n',n.end);changes.push({before:source.slice(start,end),after:source.slice(start,n.getStart())+after+source.slice(n.end,end)});}
const jsx=(tag,marker)=>nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText()===tag&&n.openingElement.getText().includes(marker));
if(area==='fotovoltaico'){
const card=jsx('FvSettingsCard','Aspetto e disposizione');
const url=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText()==='div'&&n.getStart()>card.getStart()&&n.end<card.end&&n.getText().includes('URL immagine cover')&&!n.getText().includes('Sfondo solido'));
replace(card,panel(url.getText()));
}else if(area==='serramenti'){
const card=jsx('SrCard','Logo, tipografia');
const grid=card.children.find(n=>ts.isJsxElement(n));
const logo=grid.children.find(n=>ts.isJsxElement(n)&&n.getText().includes('ref={coverLogoInputRef}'));
const reset=grid.children.find(n=>ts.isJsxElement(n)&&n.getText().includes('Ripristina default tipografia'));
const bg=jsx('SrCard','Sfondo copertina');
const palette=nodes.find(n=>ts.isJsxElement(n)&&n.getStart()>bg.getStart()&&n.end<bg.end&&n.openingElement.getText().includes('mt-2 space-y-1.5')&&n.getText().includes('CURATED_PALETTES'));
const image=nodes.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText()==='TemplateImageFieldView'&&n.getStart()>bg.getStart()&&n.end<bg.end);
replace(bg,`<div data-cover-media className="space-y-3">${image.getText()}<Button type="button" size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>Scegli dalla libreria</Button>${logo.getText()}</div>`);
replace(card,panel(`{!form.pdf_cover_image_url && (${palette.getText()})}${reset.getText()}`));
}else{
const start=source.indexOf('          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Colore fondo');
const end=source.indexOf('{toggle("pdf_cover_show_client_card", "Mostra scheda cliente")}',start)+'{toggle("pdf_cover_show_client_card", "Mostra scheda cliente")}'.length;
if(start<0||end<start)throw Error('Facciate target missing');
changes.push({before:source.slice(start,end),after:panel()});
}
console.log(JSON.stringify({path,changes,first:source.split('\n')[0]}));
