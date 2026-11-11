import { useState } from "react";
const key="automation-qa-graph-v1";
const initial={nodes:[{id:"entry",node_type:"trigger",position_x:300,position_y:80,label:"Nuovo contatto",config_json:{item_id:"contatto_creato"}},{id:"task",node_type:"action",position_x:300,position_y:340,label:"Prepara il sopralluogo",config_json:{item_id:"crea_task",titolo:"Prepara il sopralluogo",priorita:"media"}}].map(n=>({...n,flow_id:"qa",company_id:"qa-company",created_at:"",updated_at:""})),connections:[{id:"entry-task",flow_id:"qa",company_id:"qa-company",from_node_id:"entry",to_node_id:"task",label:null,created_at:""}]};
export function useAutomationBuilder(){
 const [loaded]=useState(()=>JSON.parse(localStorage.getItem(key)||JSON.stringify(initial)));
 const [nodes,setNodes]=useState<any[]>(loaded.nodes);const [connections,setConnections]=useState<any[]>(loaded.connections);const [dirty,setDirty]=useState(false);
 const mark=()=>setDirty(true);
 return {flow:{id:"qa",name:"Collaudo recupero trigger",company_id:"qa-company",status:"draft"},dbNodes:loaded.nodes,dbConnections:loaded.connections,nodes,connections,remoteEmpty:!loaded.nodes.length,isLoading:false,isSaving:false,hasUnsavedChanges:dirty,canUndo:false,canRedo:false,revision:0,canPersist:true,effectiveCompany:{id:"qa-company"},user:{id:"qa-user"},
 addNode:(n:any)=>{setNodes(p=>[...p,n]);mark();},addConnection:(c:any)=>{setConnections(p=>[...p,c]);mark();},removeConnection:(id:string)=>{setConnections(p=>p.filter(c=>c.id!==id));mark();},removeNode:(id:string)=>{setNodes(p=>p.filter(n=>n.id!==id));setConnections(p=>p.filter(c=>c.from_node_id!==id&&c.to_node_id!==id));mark();},updateNode:(id:string,data:any)=>{setNodes(p=>p.map(n=>n.id===id?{...n,...data}:n));mark();},updateNodePositions:()=>{},
 saveImmediate:async()=>{localStorage.setItem(key,JSON.stringify({nodes,connections}));setDirty(false);return true;},undo:()=>{},redo:()=>{},togglePublish:()=>{throw new Error("Pubblicazione vietata nel collaudo");},createFlowMutation:{},updateFlowMutation:{mutate:()=>{}},applyRestoredGraph:()=>{}};
}
