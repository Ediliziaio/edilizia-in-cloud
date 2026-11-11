import type {DisegnoCommercialeFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {triangoliFaccia,dalDisegnoAlMondo,type P3,type PannelloReale,type SelezioneReale,type InquadraturaReale} from "./tettoReale";
import {useRilievo,proiettaUV,verticiOrto} from "./RilievoContext";
const vec=(p:P3)=>new THREE.Vector3(p.x,p.z,-p.y);
export function VistaReale({pannelli,ids,faldaId,alto,foto,ostacoli,selezione,onSelezione,inquadratura,invalidi=[],onPunto,puntiTracciati=[],areaPosa}:{pannelli:PannelloReale[];ids:string[];faldaId:string;alto:boolean;foto:boolean;ostacoli:Array<{id:string;vertici:P3[]}>;selezione:SelezioneReale;onSelezione:(s:SelezioneReale)=>void;inquadratura:InquadraturaReale;invalidi?:string[];onPunto?:(p:P3)=>void;puntiTracciati?:P3[];areaPosa?:DisegnoCommercialeFv}){
  const {edificio,orto,modello}=useRilievo();
  const host=useRef<HTMLDivElement>(null),[errore,setErrore]=useState(false);
  const rendererRef=useRef<THREE.WebGLRenderer|null>(null);
  useEffect(()=>()=>{rendererRef.current?.dispose();rendererRef.current?.domElement.remove();rendererRef.current=null;},[]);
  const posaCamera=useRef<{pos:THREE.Vector3;target:THREE.Vector3;alto:boolean;versione:number;volume:string}|null>(null);
  useEffect(()=>{
    if(!host.current)return;
    const nodo=host.current;
    let renderer:THREE.WebGLRenderer;
    try{renderer=rendererRef.current??new THREE.WebGLRenderer({antialias:true,alpha:false});rendererRef.current=renderer;}catch{queueMicrotask(()=>setErrore(true));return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute("aria-label","Modello 3D reale del tetto, ruotabile e ingrandibile");renderer.domElement.setAttribute("role","img");if(renderer.domElement.parentElement!==nodo)nodo.appendChild(renderer.domElement);
    const scena=new THREE.Scene();scena.background=new THREE.Color("#f1f4f2");
    scena.add(new THREE.HemisphereLight(0xffffff,0x647468,2.1));
    const sole=new THREE.DirectionalLight(0xffffff,2.7);sole.position.set(-14,24,12);sole.castShadow=true;sole.shadow.mapSize.set(1024,1024);Object.assign(sole.shadow.camera,{left:-20,right:20,top:20,bottom:-20});sole.shadow.bias=-.001;scena.add(sole);
    const geometrie:THREE.BufferGeometry[]=[],materiali:THREE.Material[]=[],cliccabili:THREE.Object3D[]=[];
    let distrutto=false;
    const texture=orto?new THREE.TextureLoader().load(orto.url,()=>{if(!distrutto)render();}):null;if(texture){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
    for(const f of edificio.facce){
      const tris=triangoliFaccia(f),geo=new THREE.BufferGeometry().setFromPoints(tris.map(vec));geo.computeVertexNormals();geo.setAttribute("uv",new THREE.Float32BufferAttribute(tris.flatMap(p=>{const q=orto?proiettaUV(orto,p):{u:0,v:0};return[q.u,q.v];}),2));geometrie.push(geo);
      const mat=new THREE.MeshStandardMaterial({map:foto&&f.tipo==="RoofSurface"?texture:null,color:foto&&texture&&f.tipo==="RoofSurface"?"#ffffff":f.tipo==="RoofSurface"?(f.id===faldaId?edificio.attributi.schemaIndustriale?"#6b7e87":"#b79978":edificio.attributi.schemaIndustriale?"#6b7e87":"#979e98"):"#deddd4",roughness:.88,side:THREE.DoubleSide,transparent:!!modello,opacity:modello?.08:1,depthWrite:!modello});materiali.push(mat);
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;scena.add(mesh);cliccabili.push(mesh);
      const edges=new THREE.EdgesGeometry(geo,25);geometrie.push(edges);const lineMat=new THREE.LineBasicMaterial({color:"#56645d",transparent:true,opacity:.3});materiali.push(lineMat);scena.add(new THREE.LineSegments(edges,lineMat));
    }
    if(areaPosa)for(const f of areaPosa.falde){const punti=f.punti.map(p=>vec(dalDisegnoAlMondo(edificio,f.id,p,.07))),geo=new THREE.BufferGeometry().setFromPoints(punti),mat=new THREE.LineBasicMaterial({color:"#67e8b1"});geometrie.push(geo);materiali.push(mat);scena.add(new THREE.LineLoop(geo,mat));}
    if(modello){scena.add(modello);modello.traverse(o=>{if(o instanceof THREE.Mesh)cliccabili.push(o);});}
    for(const p of puntiTracciati){const geo=new THREE.SphereGeometry(.1,10,8),mat=new THREE.MeshBasicMaterial({color:"#f97316"});geometrie.push(geo);materiali.push(mat);const m=new THREE.Mesh(geo,mat);m.position.copy(vec(p));scena.add(m);}
    const texturePannelli=document.createElement("canvas");texturePannelli.width=128;texturePannelli.height=256;const ctx=texturePannelli.getContext("2d");
    if(ctx){ctx.fillStyle="#111b23";ctx.fillRect(0,0,128,256);ctx.strokeStyle="#536168";ctx.lineWidth=2;ctx.strokeRect(1,1,126,254);ctx.strokeStyle="#29343e";ctx.lineWidth=.6;for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(i*128/6,3);ctx.lineTo(i*128/6,253);ctx.stroke();}for(let i=1;i<12;i++){ctx.beginPath();ctx.moveTo(3,i*256/12);ctx.lineTo(125,i*256/12);ctx.stroke();}}
    const celleTexture=new THREE.CanvasTexture(texturePannelli);celleTexture.colorSpace=THREE.SRGBColorSpace;celleTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const corpiGeo=new THREE.BoxGeometry(1,1,1),corpiMat=new THREE.MeshStandardMaterial({map:celleTexture,color:0xffffff,metalness:.35,roughness:.3});geometrie.push(corpiGeo);materiali.push(corpiMat);
    const corpi=new THREE.InstancedMesh(corpiGeo,corpiMat,pannelli.length),matrice=new THREE.Matrix4(),colore=new THREE.Color();corpi.castShadow=true;
    const rack:THREE.Vector3[]=[];
    for(const [indice,p] of pannelli.entries()){
      const u=vec(p.piano.u),n=vec(p.piano.n),v=vec(p.piano.v).negate();matrice.makeBasis(u,n,v);matrice.scale(new THREE.Vector3(p.larghezza,.035,p.lunghezza));matrice.setPosition(vec(p.centro));corpi.setMatrixAt(indice,matrice);
      corpi.setColorAt(indice,colore.set(invalidi.includes(ids[indice])?"#b93e3e":selezione?.tipo==="pannello"&&selezione.id===ids[indice]?"#f5a35d":"#ffffff"));
      // Supporti illustrativi sotto i moduli inclinati, senza dimensionamento strutturale.
      if(Math.abs(p.piano.n.z)<.999&&edificio.facce.every(f=>f.tipo!=="RoofSurface"||(f.pendenza??0)<1))for(const k of [0,1,2,3]){const top=vec(p.vertici[k]),base=top.clone();base.y=Math.min(...p.vertici.map(v=>v.z))-.14;rack.push(top,base);}
    }
    corpi.instanceMatrix.needsUpdate=true;corpi.computeBoundingSphere();scena.add(corpi);cliccabili.push(corpi);
    if(rack.length){const g=new THREE.BufferGeometry().setFromPoints(rack),m=new THREE.LineBasicMaterial({color:"#66747b"});geometrie.push(g);materiali.push(m);scena.add(new THREE.LineSegments(g,m));}
    for(const o of ostacoli){
      const punti=o.vertici.map(vec),geo=new THREE.BufferGeometry().setFromPoints([punti[0],punti[1],punti[2],punti[0],punti[2],punti[3]]);geo.computeVertexNormals();geometrie.push(geo);
      const mat=new THREE.MeshBasicMaterial({color:selezione?.tipo==="ostacolo"&&selezione.id===o.id?"#facc15":"#fb923c",transparent:true,opacity:.85,side:THREE.DoubleSide});materiali.push(mat);const mesh=new THREE.Mesh(geo,mat);mesh.userData.selezione={tipo:"ostacolo",id:o.id};scena.add(mesh);cliccabili.push(mesh);
    }
    const bordo=orto?verticiOrto(orto):[{x:-50,y:50,z:0},{x:50,y:50,z:0},{x:50,y:-50,z:0},{x:-50,y:-50,z:0}];
    const terrenoGeo=new THREE.BufferGeometry().setFromPoints([bordo[0],bordo[1],bordo[2],bordo[0],bordo[2],bordo[3]].map(p=>vec({...p,z:-.04})));terrenoGeo.setAttribute("uv",new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,1,1,0,0,0],2));terrenoGeo.computeVertexNormals();
    const terrenoMat=new THREE.MeshStandardMaterial({map:foto?texture:null,color:foto&&texture?"#ffffff":"#e3e9e2",roughness:1,side:THREE.DoubleSide});geometrie.push(terrenoGeo);materiali.push(terrenoMat);const terreno=new THREE.Mesh(terrenoGeo,terrenoMat);terreno.receiveShadow=true;scena.add(terreno);
    const contesto=new THREE.Box3();if(modello)contesto.setFromObject(modello);for(const f of edificio.facce)for(const p of f.anelli.flat())contesto.expandByPoint(vec(p));if(contesto.isEmpty())contesto.setFromPoints(bordo.map(vec));const centro=contesto.getCenter(new THREE.Vector3()),raggio=Math.max(12,contesto.getSize(new THREE.Vector3()).length()*1.85);
    const volume=[...contesto.min.toArray(),...contesto.max.toArray()].map(n=>n.toFixed(2)).join(",");
    Object.assign(sole.shadow.camera,{left:-raggio,right:raggio,top:raggio,bottom:-raggio,far:raggio*8});sole.shadow.camera.updateProjectionMatrix();sole.position.copy(centro).add(new THREE.Vector3(-raggio,raggio*2,raggio));sole.target.position.copy(centro);scena.add(sole.target);
    const camera=new THREE.PerspectiveCamera(36,1,.05,10000);camera.position.copy(centro).add(alto?new THREE.Vector3(0,raggio,.001):new THREE.Vector3(raggio*.7,raggio*.65,raggio*.35));
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(centro);controls.maxPolarAngle=Math.PI/2-.03;controls.minDistance=4;controls.maxDistance=Math.max(65,raggio*6);controls.enableDamping=false;if(posaCamera.current?.alto===alto&&posaCamera.current.versione===inquadratura.versione&&posaCamera.current.volume===volume){camera.position.copy(posaCamera.current.pos);controls.target.copy(posaCamera.current.target);}
    else if(inquadratura.faldaId){const f=edificio.facce.find(f=>f.id===inquadratura.faldaId);if(f){const box=new THREE.Box3().setFromPoints(f.anelli[0].map(vec)),centro=box.getCenter(new THREE.Vector3()),r=Math.max(8,box.getSize(new THREE.Vector3()).length()*1.25);controls.target.copy(centro);camera.position.copy(centro).add(alto?new THREE.Vector3(0,r,.001):new THREE.Vector3(r*.65,r*.75,r*.4));}}
    controls.update();
    const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let premuto:{x:number;y:number}|null=null;
    const down=(e:PointerEvent)=>{premuto=e.button===0?{x:e.clientX,y:e.clientY}:null;};
    const up=(e:PointerEvent)=>{if(!premuto||Math.hypot(e.clientX-premuto.x,e.clientY-premuto.y)>5){premuto=null;return;}premuto=null;const b=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);raycaster.setFromCamera(mouse,camera);const primo=raycaster.intersectObjects(cliccabili,false)[0];if(onPunto&&primo){onPunto({x:primo.point.x,y:-primo.point.z,z:primo.point.y});}else onSelezione(primo?.object===corpi&&primo.instanceId!==undefined?{tipo:"pannello",id:ids[primo.instanceId]}:primo?.object.userData.selezione??null);};
    renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointerup",up);
    const render=()=>renderer.render(scena,camera);
    const resize=()=>{const w=nodo.clientWidth,h=nodo.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};
    controls.addEventListener("change",render);const observer=new ResizeObserver(resize);observer.observe(nodo);resize();
    return()=>{distrutto=true;posaCamera.current={pos:camera.position.clone(),target:controls.target.clone(),alto,versione:inquadratura.versione,volume};renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointerup",up);if(modello)scena.remove(modello);texture?.dispose();corpi.dispose();celleTexture.dispose();observer.disconnect();controls.dispose();geometrie.forEach(g=>g.dispose());materiali.forEach(m=>m.dispose());};
  },[pannelli,ids,faldaId,alto,foto,ostacoli,selezione,onSelezione,inquadratura,invalidi,edificio,orto,modello,onPunto,puntiTracciati,areaPosa]);
  return <div className="relative h-[450px] w-full overflow-hidden rounded-xl bg-slate-100" style={{height:370}} ref={host}>{errore&&<p role="alert" className="p-5 text-sm">WebGL non disponibile in questo browser. Puoi comunque confrontare l’ortofoto e i dati delle falde.</p>}</div>;
}
