export type FishTranscriptSegment={segment_id:string;role:"agent"|"user";text:string;final:boolean};
/** Spoken text only; tool arguments, tokens and provider metadata never enter a ticket. */
export function normalizeFishTranscript(value:unknown):FishTranscriptSegment[]{
 if(!Array.isArray(value) || value.length>500)throw new Error("Trascrizione non valida.");
 const seen=new Set<string>();
 const rows=value.map((item:any)=>{
  const id=String(item?.segment_id || item?.segmentId || "");
  if(!id || id.length>160 || seen.has(id) || !["agent","user"].includes(item?.role) || typeof item?.text!=="string" || item.text.length>8000)throw new Error("Trascrizione non valida.");
  seen.add(id);return {segment_id:id,role:item.role,text:item.text.trim(),final:item.final===true};
 }).filter(item=>item.text);
 if(JSON.stringify(rows).length>180000)throw new Error("Trascrizione troppo lunga.");
 return rows;
}
