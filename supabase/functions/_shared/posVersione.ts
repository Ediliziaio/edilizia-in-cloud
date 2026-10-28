/** Compare the exact database revision token; Date parsing would lose microseconds. */
export function verificaVersionePos(pos:{updated_at:string|null},body:Record<string,unknown>):void {
  const presente=Object.prototype.hasOwnProperty.call(body,'attesa_updated_at');
  // Old deployed clients do not yet send the editor token. Retire this legacy
  // route with the coordinated frontend rollout; never silently ignore a token.
  if(!presente && body.versione_client!==2) return;
  if(!presente || (body.attesa_updated_at!==null && typeof body.attesa_updated_at!=='string')) {
    throw Object.assign(new Error('Ricarica l’app e il POS prima di approvare: manca la versione letta nell’editor'),{status:409});
  }
  if(body.attesa_updated_at!==pos.updated_at) throw Object.assign(new Error('Il POS è cambiato rispetto alla versione che hai letto. Ricarica e ricontrolla la bozza prima di approvare.'),{status:409});
}
