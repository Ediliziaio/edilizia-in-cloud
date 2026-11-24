// Shared by the UI and local readers. An extracted member is current only while
// every original container in its provenance is current and byte-identical.
export function currentDocuments(rows,{includeArchived=false}={}){
 const byId=new Map(rows.map(r=>[r.id,r])),replaced=new Set(rows.map(r=>r.previous_id).filter(Boolean));
 const current=(r,seen=new Set(),root=true)=>{
  if(!r||(r.archived&&!(root&&includeArchived))||replaced.has(r.id)||seen.has(r.id))return false;
  if(!r.source_parent_id)return true;
  seen.add(r.id);const parent=byId.get(r.source_parent_id);
  return parent?.sha256===r.source_parent_sha256&&current(parent,seen,false);
 };
 return rows.filter(r=>current(r));
}
