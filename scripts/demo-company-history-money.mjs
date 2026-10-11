/** Integer-cent allocation for synthetic purchase chapters, with exact net/VAT. */
export function purchaseChapterCents(total) {
 if(!Number.isSafeInteger(total)||total<=0)throw Error('Positive integer cents required');
 const rows=Array(5).fill(Math.round(total/6));rows.push(total-rows.reduce((s,n)=>s+n,0));
 const vat=n=>Math.round(n*22/100),target=vat(total),tax=()=>rows.reduce((s,n)=>s+vat(n),0);
 for(let step=0;step<12&&tax()!==target;step++){
  const before=tax();let best;
  for(let i=0;i<6;i++)for(let j=0;j<6;j++)if(i!==j)for(let shift=1;shift<=25;shift++){
   const after=before-vat(rows[i])-vat(rows[j])+vat(rows[i]+shift)+vat(rows[j]-shift),error=Math.abs(after-target);
   if(rows[j]>shift&&error<Math.abs(before-target)&&(!best||error<best.error))best={i,j,shift,error};
  }
  if(!best)throw Error('No exact purchase VAT allocation');rows[best.i]+=best.shift;rows[best.j]-=best.shift;
 }
 if(tax()!==target||rows.reduce((s,n)=>s+n,0)!==total)throw Error('Purchase cents differ');return rows;
}
