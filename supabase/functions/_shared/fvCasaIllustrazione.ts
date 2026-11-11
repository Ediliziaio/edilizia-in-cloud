/** Abitazione vettoriale condivisa dal bilancio annuale e dalla spiegazione giorno/sera. */
function pannelliCasa(){
 let out="";
 for(let r=0;r<2;r++)for(let c=0;c<6;c++){
  const u=.06+c*.88/6,v=.09+r*.8/2,w=.88/6-.014,h=.8/2-.045;
  const at=(a:number,b:number)=>`${200+270*a+90*b},${310+105*a-100*b}`;
  out+=`<polygon points="${at(u,v)} ${at(u+w,v)} ${at(u+w,v+h)} ${at(u,v+h)}" fill="#172B3B" stroke="#52697B" stroke-width=".7"/>`;
  for(let k=1;k<4;k++)out+=`<path d="M${at(u+w*k/4,v)} L${at(u+w*k/4,v+h)}" stroke="#8DA8BB" stroke-opacity=".23" stroke-width=".5"/>`;
  out+=`<path d="M${at(u,v+h/2)} L${at(u+w,v+h/2)}" stroke="#8DA8BB" stroke-opacity=".28" stroke-width=".5"/>`;
 }return out;
}
export function illustrazioneCasa({hasAccumulo=false,notte=false,etichettaAccumulo=true}:{hasAccumulo?:boolean;notte?:boolean;etichettaAccumulo?:boolean}={}){
 const html=`
 <!-- Abitazione illustrativa con tetto a falde e moduli scuri -->
 <path d="M170 461 468 581 692 445 397 330Z" fill="#DCE4DC" opacity=".7"/>
 <path d="M175 448 468 563 689 435 397 323Z" fill="#E5E9DF"/>
 <path d="M200 310 470 415 470 550 200 445Z" fill="url(#fe-wall)"/>
 <path d="M470 415 560 315 650 310 650 445 470 550Z" fill="#D7DEDB"/>
 <path d="M290 210 560 315 650 310 380 205Z" fill="#B18C77"/>
 ${[.2,.4,.6,.8].map(t=>`<path d="M${290+90*t} ${210-5*t}l270 105" stroke="#9D7964" stroke-width="1"/>`).join("")}
 <path d="M195 310 470 418 564 314 289 206Z" fill="#8E6B59"/>
 ${pannelliCasa()}
 <path d="M289 207 561 313" stroke="#C1A18C" stroke-width="4"/>
 <path d="M195 310 470 418 655 309" fill="none" stroke="#837B72" stroke-width="4"/>
 <path d="M200 318 470 423 470 430 200 325Z" fill="#CCD6D2"/>
 <!-- Finestre, porta e loggia seguono la proiezione dei muri -->
 <g transform="matrix(1 .389 0 1 219 352)"><rect width="53" height="51" fill="#748D96" stroke="#F8F9F6" stroke-width="5"/><path d="M26 2v48M2 25h49" stroke="#E4EBE7" stroke-width="2"/><path d="M3 8 40 3 3 42Z" fill="#B9CDCD" opacity=".3"/></g>
 <g transform="matrix(1 .389 0 1 306 386)"><rect width="46" height="91" fill="#897C6A" stroke="#D4DBD5" stroke-width="4"/><rect x="7" y="8" width="32" height="38" fill="#A3B6B3"/><path d="M37 55v10" stroke="#E3DDD0" stroke-width="2"/></g>
 <g transform="matrix(1 .389 0 1 390 419)"><rect width="52" height="59" fill="#748D96" stroke="#F8F9F6" stroke-width="5"/><path d="M26 2v55M2 28h49" stroke="#E4EBE7" stroke-width="2"/></g>
 <g transform="matrix(1 -.583 0 1 502 424)"><rect width="105" height="78" fill="#78919A" stroke="#EFF3EE" stroke-width="5"/><path d="M35 2v74m35-74v74M2 40h100" stroke="#E1E9E5" stroke-width="2"/><path d="M8 10h38L8 65Z" fill="#C5D6D2" opacity=".25"/></g>
 <path d="M200 444 470 550 650 445" stroke="#B0BEB5" stroke-width="3" fill="none"/>
 <path d="M303 487 356 508 347 516 294 495Z" fill="#C3CCC3"/>
 <!-- Vegetazione discreta per distinguere il contesto residenziale -->
 <path d="M174 419v40" stroke="#9CA98E" stroke-width="4"/><ellipse cx="174" cy="400" rx="22" ry="36" fill="#B6C8AE"/><ellipse cx="166" cy="391" rx="15" ry="25" fill="#CDDAC3"/>
 <path d="M633 452 659 437 670 444 645 460Z" fill="#B9C9AC"/><path d="M639 448 639 435m10 8v-15m10 10v-11" stroke="#98AF8C" stroke-width="7" stroke-linecap="round"/>
 ${hasAccumulo?`<g transform="translate(486 472)"><path d="M0 0 15-9 34-2 19 7Z" fill="#F3F5ED"/><path d="M0 0 19 7v43L0 43Z" fill="#E8EDE4" stroke="#A7B7AF" stroke-width="1"/><path d="M19 7 34-2v43l-15 9Z" fill="#BBCBC3"/><path d="M7 11v24" stroke="#188569" stroke-width="2"/><circle cx="7" cy="8" r="1.5" fill="#188569"/></g>${etichettaAccumulo?'<path d="M495 518 461 555 281 555" fill="none" stroke="#889D90" stroke-width="1"/><text x="281" y="573" fill="#647B70" font-size="10" letter-spacing=".8">ACCUMULO PREVISTO</text>':""}`:""}
`;
 return `<!--fv-art:casa_${notte?"sera":"giorno"}:145,190,550,400-->`+html.replaceAll('url(#fe-wall)',notte?'#A8B7BC':'#EDF1EA').replaceAll('#748D96',notte?'#EBCB82':'#748D96').replaceAll('#A3B6B3',notte?'#EBCB82':'#A3B6B3').replaceAll('#E5E9DF',notte?'#334A58':'#E5E9DF').replaceAll('#DCE4DC',notte?'#223C4C':'#DCE4DC')+'<!--/fv-art-->';
}
