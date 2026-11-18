import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import type { RataDellaFattura } from '@/hooks/useRataDellaFattura';

export function CommessaRateFattura({ordineId,rate,loading,error,onRetry}:{ordineId?:string|null;rate:RataDellaFattura[];loading?:boolean;error?:boolean;onRetry:()=>void}) {
 const commessa=rate.find(r=>r.commessa)?.commessa;
 const id=commessa?.id??ordineId;
 if(!id&&!rate.length)return null;
 return <Card>
  <CardHeader className="pb-3"><CardTitle className="text-sm">{rate.length?'Commessa e rate collegate':'Commessa collegata'}</CardTitle></CardHeader>
  <CardContent className="space-y-3 text-sm">
   {id&&<Link className="font-medium text-primary hover:underline" to={`/azienda/ordini/${id}?tab=finanza&vista_economia=pagamenti`}>{commessa?.order_code||'Apri Fatture e Incassi della commessa'}</Link>}
   {error?<p role="alert">Rate collegate non disponibili. <Button variant="link" size="sm" onClick={onRetry}>Riprova rate</Button></p>:loading?<p role="status">Lettura delle rate collegate…</p>:rate.length>0?<>
    <ul className="divide-y rounded-lg border">{rate.map(r=><li key={r.id} className="p-3"><div className="flex justify-between gap-2"><strong>{r.label}</strong><span>{formatCurrency(r.documento_quota_lorda??r.amount)}</span></div><p className="mt-1 text-xs text-muted-foreground">{r.is_paid?'Quota esigibile incassata':'Da incassare'}{r.documento_quota_lorda!=null&&` · incassato ${formatCurrency(Number(r.fattura?.importo_pagato??0))} · residuo ${formatCurrency(r.quota_fattura_residua??0)}`}</p></li>)}</ul>
    <p className="text-xs text-muted-foreground">I versamenti si registrano una volta su questa fattura. Le quote ripartite aggiornano le rate nell’ordine del piano.</p>
   </>:<p className="text-xs text-muted-foreground">Fattura senza rata collegata. Il documento e i suoi incassi sono già presenti in Fatture e Incassi della commessa.</p>}
  </CardContent>
 </Card>;
}
