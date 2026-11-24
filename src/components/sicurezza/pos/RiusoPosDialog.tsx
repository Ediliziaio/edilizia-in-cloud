import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommesseFascicolo } from "@/hooks/useFascicoloCantiere";
import { useCreaPos, useSalvaModelloPos, type PosRiga } from "@/hooks/usePos";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Mount only for the selected saved POS: one dialog for the entire board. */
export function RiusoPosDialog({ pos, onClose }: { pos: PosRiga; onClose: () => void }) {
  const t = useT();
  const navigate=useNavigate();
  const [modo,setModo]=useState("duplica");
  const [ordine,setOrdine]=useState("");
  const [nome,setNome]=useState("");
  const [ambito,setAmbito]=useState("");
  const [conferma,setConferma]=useState(false);
  const commesse=useCommesseFascicolo(modo==="duplica" ? pos.company_id : "");
  const crea=useCreaPos();
  const salva=useSalvaModelloPos();
  const pending=crea.isPending||salva.isPending;
  async function esegui() {
    try {
      if(modo==="duplica") {
        const r=await crea.mutateAsync({orderId:ordine,sorgentePos:pos});
        onClose(); navigate(`/azienda/sicurezza-cantiere/pos/${r.pos_id}`,{state:{avvisi:r.avvisi}});
      } else {
        await salva.mutateAsync({pos,nome,ambito,testiVerificati:conferma});
        onClose();
      }
    } catch { /* mutation displays actionable error; retain the form */ }
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!pending)onClose();}}><DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>{t("Riutilizza il POS")}</DialogTitle><DialogDescription>{t("Parti dalle lavorazioni salvate di {pos}, revisione {revisione}.", { pos: pos.commessa?.order_code || t("questo POS"), revisione: String(pos.revisione ?? "") })}</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2"><Button variant={modo==="duplica"?"default":"outline"} disabled={pending} onClick={()=>setModo("duplica")}>{t("Duplica su commessa")}</Button><Button variant={modo==="modello"?"default":"outline"} disabled={pending} onClick={()=>setModo("modello")}>{t("Salva modello")}</Button></div>
    <p className="text-sm text-muted-foreground">{t("Si riprendono descrizioni, rischi, misure e DPI delle lavorazioni. Persone, nomine, indirizzi, turni, durate, imprese esecutrici, allegati, firme e approvazioni non vengono copiati. I nuovi POS sono bozze con lavorazioni da confermare.")}</p>
    {!pos.contenuto.lavorazioni.length && <p className="text-sm text-amber-800">{t("Questo POS non ha lavorazioni salvate. La copia recupererà i dati della commessa scelta; per salvare un modello, compila prima le lavorazioni.")}</p>}
    {modo==="duplica" ? <div className="space-y-2"><Label htmlFor="duplica-pos-commessa">{t("Commessa di destinazione")}</Label>
      {commesse.isError ? <p role="alert">{t("Commesse non caricate.")} <Button variant="link" onClick={()=>commesse.refetch()}>{t("Riprova")}</Button></p> : <Select value={ordine} onValueChange={setOrdine} disabled={pending||commesse.isLoading}><SelectTrigger id="duplica-pos-commessa"><SelectValue placeholder={commesse.isLoading?t("Caricamento…"):t("Scegli la commessa")}/></SelectTrigger><SelectContent>{(commesse.data||[]).map(o=><SelectItem key={o.id} value={o.id}>{o.order_code} — {o.description}</SelectItem>)}</SelectContent></Select>}
      {ordine===pos.order_id&&<p className="text-xs text-amber-800">{t("Stai creando un POS distinto sulla stessa commessa. Per aggiornare il documento esistente usa la revisione.")}</p>}
      <p className="text-xs text-muted-foreground">{t("I dati vengono recuperati dalla commessa scelta al momento della creazione.")}</p>
    </div> : <div className="space-y-3">
      <div><Label htmlFor="modello-pos-nome">{t("Nome dello standard aziendale")}</Label><Input id="modello-pos-nome" value={nome} maxLength={100} disabled={pending} onChange={e=>setNome(e.target.value)} placeholder={t("Es. Posa serramenti")}/><p className="text-xs text-muted-foreground">{t("Con lo stesso nome si crea una nuova versione, conservando le precedenti.")}</p></div>
      <div><Label htmlFor="modello-pos-ambito">{t("Campo d’impiego e limiti")}</Label><Input id="modello-pos-ambito" value={ambito} maxLength={500} disabled={pending} onChange={e=>setAmbito(e.target.value)} placeholder={t("Es. Posa interna, esclusi lavori in quota")}/></div>
      <div className="rounded-lg border p-3 text-sm"><p className="font-medium">{t("Lavorazioni incluse ({n})", { n: pos.contenuto.lavorazioni.length })}</p><ul className="max-h-28 overflow-auto list-disc pl-4">{pos.contenuto.lavorazioni.map((l,i)=><li key={i}>{l.titolo||t("Senza titolo")}</li>)}</ul></div>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={conferma} disabled={pending} onCheckedChange={v=>setConferma(v===true)}/>{t("Ho verificato che i testi delle lavorazioni siano riutilizzabili e non contengano dati personali o riferimenti al vecchio cantiere.")}</label>
    </div>}
    <DialogFooter><Button variant="outline" disabled={pending} onClick={onClose}>{t("Annulla")}</Button><Button disabled={pending||(modo==="duplica"?!ordine||commesse.isError:!nome.trim()||!ambito.trim()||!conferma||!pos.contenuto.lavorazioni.length)} onClick={()=>void esegui()}>{pending?t("Salvataggio…"):modo==="duplica"?t("Crea una copia in bozza"):t("Salva lo standard")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
