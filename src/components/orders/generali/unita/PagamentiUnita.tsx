import { UniformSelect } from "@/components/ui/uniform-select";
// src/components/orders/generali/unita/PagamentiUnita.tsx
// I pagamenti di un'unità: caparra, acconti, saldo e permuta, con quanto resta.
// La permuta paga il prezzo senza incasso e vale anche come costo del terreno.
import { useState } from "react";
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { ArrowRight, Loader2, Plus, Receipt, Undo2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottoneFattura } from "@/components/orders/generali/fatture/BottoneFattura";
import { dataBreve, euro, leggiCampo, oggi } from "@/components/orders/generali/unita/aspetto";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useAggiungiMovimento, useEliminaMovimento, useContabilizzaIncassoUnita } from "@/hooks/useGeneraleUnita";
import { errorePagamentoUnita, NOMI_MOVIMENTO, prezzoConVarianti, tipiMovimentoAmmessi, type MovimentoUnita, type TipoMovimento, type UnitaGenerale } from "@/lib/orders/generali/unita";
import { pagamentiUnita } from "@/lib/orders/generali/unitaConti";
import { percento } from "@/components/orders/generali/piano/formato";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  generaleId: string;
  unita: UnitaGenerale;
  /** Si possono aggiungere e togliere pagamenti (computer o tablet, con il permesso). */
  gestisci: boolean;
  apriVendita: () => void;
}

export function PagamentiUnita({ generaleId, unita: u, gestisci, apriVendita }: Props) {
  const t = useT();
  const elimina = useEliminaMovimento(generaleId);
  const [nuovo, setNuovo] = useState(false);
  const [daStornare, setDaStornare] = useState<MovimentoUnita | null>(null);
  const pag = pagamentiUnita(u);
  const ammessi = tipiMovimentoAmmessi(u.stato);
  const puoRegistrare = gestisci && ammessi.length > 0;
  const prezzo = u.stato === "libera" ? null : prezzoConVarianti(u);
  const coperto = prezzo !== null && prezzo > 0 && pag.pagato !== null ? Math.max(0, Math.min(1, pag.pagato / prezzo)) : null;
  const movimenti = [...u.movimenti].sort((a, b) => b.data.localeCompare(a.data));
  const storna = (id: string) => elimina.mutate(id, {
    onSuccess: () => toast.success(t("Movimento stornato")),
    onError: e => toast.error(messaggioGenerale(e, "il pagamento")),
  });

  return <div className="space-y-4">
    {(u.stato !== "libera" || movimenti.length > 0) && <section aria-label={t("Riepilogo pagamenti")} className="rounded-lg border bg-card">
      <dl className="grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">{u.variantiAccettate ? t("Prezzo con varianti") : t("Prezzo concordato")}</dt>
          <dd className="text-xl font-semibold tabular-nums">{euro(prezzo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Quota del prezzo pagata")}</dt>
          <dd className="text-xl font-semibold tabular-nums">{euro(pag.pagato)}</dd>
          {(pag.permute ?? 0) > 0 && <dd className="text-xs text-muted-foreground">{t("Di cui {permute} in permuta", { permute: euro(pag.permute) })}</dd>}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Residuo sul prezzo")}</dt>
          <dd className="text-xl font-semibold tabular-nums text-blue-800 dark:text-blue-300">{euro(pag.residuo)}</dd>
        </div>
      </dl>
      {coperto !== null && <div className="flex items-center gap-3 border-t px-4 py-2.5">
        <Progress value={coperto * 100} className="h-1.5 bg-slate-200 dark:bg-slate-800"
          indicatorClassName="bg-blue-600 motion-reduce:transition-none" aria-label={t("Copertura del prezzo di vendita")} />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("{coperto} coperto", { coperto: String(percento(coperto) ?? "") })}</span>
      </div>}
    </section>}

    <section aria-label={t("Movimenti dell’unità")} className="min-w-0 rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <WalletCards className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> {t("Movimenti dell’unità")}
        </h3>
        {puoRegistrare && !nuovo && <Button type="button" size="sm" className="gap-1.5" onClick={() => setNuovo(true)}>
          <Plus className="size-4" aria-hidden="true" /> {t("Nuovo pagamento")}
        </Button>}
      </header>
      {puoRegistrare && nuovo && <NuovoPagamento generaleId={generaleId} u={u} ammessi={ammessi}
        residuo={pag.residuo} chiudi={() => setNuovo(false)} />}
      {movimenti.length > 0 ? <div className="overflow-x-auto">
        <table aria-label={t("Registro dei pagamenti")} className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/35 text-xs text-muted-foreground"><tr>
            <th scope="col" className="px-4 py-2 text-left">{t("Data")}</th>
            <th scope="col" className="px-4 py-2 text-left">{t("Movimento")}</th>
            <th scope="col" className="px-4 py-2 text-right">{t("Quota prezzo")}</th>
            <th scope="col" className="px-4 py-2 text-left">{t("Cassa e prima nota")}</th>
            <th scope="col" className="px-4 py-2 text-right">{t("Azioni")}</th>
          </tr></thead>
          <tbody className="divide-y">
            {movimenti.map(m => <tr key={m.id}>
              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{dataBreve(m.data)}</td>
              <td className="px-4 py-2.5">
                <span className="font-medium">{t(NOMI_MOVIMENTO[m.tipo])}</span>
                {m.descrizione && <span className="block break-words text-xs text-muted-foreground">{m.descrizione}</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{euro(m.importo)}</td>
              <td className="px-4 py-2.5 text-xs">
                {m.tipo === "permuta" ? <span className="text-muted-foreground">{t("Permuta")}</span> : m.primaNotaId
                  ? <Link className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:underline dark:text-emerald-300" to="/azienda/prima-nota">
                    {t("In prima nota")}{m.importoCassa != null && <span className="whitespace-nowrap tabular-nums">{euro(m.importoCassa)}</span>}
                  </Link>
                  : gestisci ? <AllineaIncasso generaleId={generaleId} orderId={u.orderId} movimentoId={m.id} />
                    : <span className="text-amber-700 dark:text-amber-300">{t("Prima nota da collegare")}</span>}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1">
                  {m.tipo !== "permuta" && <BottoneFattura generaleId={generaleId} origine="movimento" id={m.id} crea={gestisci} compatto />}
                  {gestisci && <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive"
                    title={t("Storna movimento")} aria-label={t("Storna {tipo} del {data}", { tipo: t(NOMI_MOVIMENTO[m.tipo]).toLowerCase(), data: dataBreve(m.data) })}
                    disabled={elimina.isPending} onClick={() => setDaStornare(m)}>
                    <Undo2 className="size-4" aria-hidden="true" />
                  </Button>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div> : <div className="flex flex-wrap items-center gap-3 px-4 py-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Receipt className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("Nessun pagamento registrato")}</p>
          {u.stato === "libera" && <p className="text-xs text-muted-foreground">{t("Puoi registrare una caparra quando imposti la prenotazione.")}</p>}
        </div>
        {u.stato === "libera" && gestisci && <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={apriVendita}>
          {t("Vai a Vendita")} <ArrowRight className="size-4" aria-hidden="true" />
        </Button>}
      </div>}
      {movimenti.length > 0 && <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        {t("La quota prezzo è al netto dell’IVA. La prima nota riporta l’entrata effettiva con IVA, se dovuta.")}
        {(pag.permute ?? 0) > 0 && ` ${t("La permuta copre una quota del prezzo e rientra nei costi comuni.")}`}
      </p>}
    </section>
    <AlertDialog open={!!daStornare} onOpenChange={aperto => { if (!aperto) setDaStornare(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Stornare il movimento?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {daStornare && `${t("{tipo} di {importo} del {data} · {sigla}.", { tipo: t(NOMI_MOVIMENTO[daStornare.tipo] ?? ""), importo: euro(daStornare.importo), data: dataBreve(daStornare.data), sigla: u.sigla })} `}
            {daStornare?.primaNotaId ? t("Lo storno aggiorna la prima nota collegata e il residuo dell’unità.") : t("Lo storno aggiorna il residuo dell’unità.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={elimina.isPending} onClick={() => { if (daStornare) storna(daStornare.id); }}>{t("Conferma storno")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function NuovoPagamento({ generaleId, u, ammessi, residuo, chiudi }: {
  generaleId: string; u: UnitaGenerale; ammessi: TipoMovimento[]; residuo: number | null; chiudi: () => void;
}) {
  const tr = useT();
  const aggiungi = useAggiungiMovimento(generaleId);
  const [tipo, setTipo] = useState<TipoMovimento>(ammessi.includes("acconto") ? "acconto" : ammessi[0]);
  const [importoTesto, setImportoTesto] = useState("");
  const [cassaTesto, setCassaTesto] = useState("");
  const [data, setData] = useState(oggi());
  const [descrizione, setDescrizione] = useState("");
  const importo = leggiCampo(importoTesto);
  const errore = errorePagamentoUnita(importo, residuo, data, oggi());
  const permuta = tipo === "permuta";
  const cassa = permuta ? 0 : leggiCampo(cassaTesto);
  const cassaValida = cassa !== null && Number.isFinite(cassa) && (permuta || cassa > 0);
  const valido = !errore && cassaValida;
  const id = (n: string) => `pagamento-${u.orderId}-${n}`;

  const salva = () => {
    if (!valido || aggiungi.isPending) return;
    aggiungi.mutate(
      { orderId: u.orderId, tipo, importo: importo!, importoCassa: cassa!, data: data || null, descrizione: descrizione.trim() || null },
      {
        onSuccess: () => {
          toast.success(tr("Pagamento registrato"));
          chiudi();
        },
        onError: (e) => toast.error(messaggioGenerale(e, "il pagamento")),
      },
    );
  };

  return (
    <form aria-label={tr("Registra pagamento")} className="grid grid-cols-2 items-end gap-x-4 gap-y-3 border-b bg-blue-50/40 p-4 dark:bg-blue-950/20 md:grid-cols-3"
      onSubmit={(ev) => { ev.preventDefault(); salva(); }}>
      <div className="space-y-1">
        <Label htmlFor={id("tipo")}>{tr("Tipo")}</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimento)}>
          <SelectTrigger id={id("tipo")} className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ammessi.map((t) => <SelectItem key={t} value={t}>{tr(NOMI_MOVIMENTO[t])}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("importo")}>{tr("Quota prezzo (senza IVA)")}</Label>
        <Input id={id("importo")} inputMode="decimal" value={importoTesto} onChange={(ev) => setImportoTesto(ev.target.value)}
          placeholder={residuo ? String(Math.round(residuo)) : tr("Es. 20.000")} aria-invalid={(importoTesto !== "" && !!errore) || undefined} />
      </div>
      {!permuta && <div className="space-y-1">
        <Label htmlFor={id("cassa")}>{tr("Entrata effettiva in cassa")}</Label>
        <Input id={id("cassa")} inputMode="decimal" value={cassaTesto} onChange={ev => setCassaTesto(ev.target.value)}
          placeholder={tr("IVA inclusa, se dovuta")} aria-invalid={(cassaTesto !== "" && !cassaValida) || undefined} required />
      </div>}
      <div className="space-y-1">
        <Label htmlFor={id("data")}>{tr("Data")}</Label>
        <Input id={id("data")} type="date" max={oggi()} value={data} onChange={(ev) => setData(ev.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("descrizione")}>{tipo === "permuta" ? tr("Cosa viene dato in permuta") : tr("Nota")} <span className="font-normal text-muted-foreground">{tr("(facolt.)")}</span></Label>
        <Input id={id("descrizione")} value={descrizione} onChange={(ev) => setDescrizione(ev.target.value)} placeholder={tipo === "permuta" ? tr("es. terreno foglio 12") : tr("es. bonifico")} />
      </div>
      {importoTesto && errore && <p role="alert" className="col-span-full text-xs text-destructive">{tr(errore)}</p>}
      {cassaTesto && !cassaValida && <p role="alert" className="col-span-full text-xs text-destructive">{tr("Inserisci un’entrata in cassa maggiore di zero.")}</p>}
      <div className="col-span-full flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={aggiungi.isPending} onClick={chiudi}>{tr("Annulla")}</Button>
        <Button type="submit" size="sm" className="gap-1.5" disabled={!valido || aggiungi.isPending}>
          {aggiungi.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          {tr("Registra")}
        </Button>
      </div>
    </form>
  );
}

function AllineaIncasso({generaleId,orderId,movimentoId}:{generaleId:string;orderId:string;movimentoId:string}) {
  const t = useT();
  const [open,setOpen]=useState(false),[cassa,setCassa]=useState(''),[scelta,setScelta]=useState('');
  const salva=useContabilizzaIncassoUnita(generaleId);
  const candidati=useQuery({queryKey:['prima-nota','candidati-unita',orderId],enabled:open,queryFn:async()=>{
    const {data,error}=await supabase.from('prima_nota_entries').select('id,amount,entry_date,description').eq('order_id',orderId).eq('direction','entrata').is('reversal_of',null).is('unita_movimento_id' as never,null).order('entry_date',{ascending:false}).limit(500);
    if(error) throw error;
    return data??[];
  }});
  const n=leggiCampo(cassa);
  return <><Button type="button" size="sm" variant="outline" onClick={()=>setOpen(true)}>{t("Collega prima nota")}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t("Allinea l’incasso storico")}</DialogTitle><DialogDescription>{t("Conferma quanto è entrato realmente. Se esiste già una prima nota, selezionala per riutilizzarla.")}</DialogDescription></DialogHeader>
    <Label htmlFor={`allinea-cassa-${movimentoId}`}>{t("Entrata effettiva (IVA inclusa, se dovuta)")}</Label><Input id={`allinea-cassa-${movimentoId}`} inputMode="decimal" value={cassa} onChange={e=>setCassa(e.target.value)} />
    <Label htmlFor={`allinea-pn-${movimentoId}`}>{t("Prima nota")}</Label><UniformSelect className="w-full rounded border p-2" id={`allinea-pn-${movimentoId}`} value={scelta} onChange={e=>setScelta(e.target.value)}><option value="">{t("Scegli come collegare…")}</option><option value="nuova">{t("Crea una nuova entrata")}</option>{(candidati.data??[]).map(p=><option key={p.id} value={p.id}>{dataBreve(p.entry_date)} · {euro(Number(p.amount))} · {p.description}</option>)}</UniformSelect>
    {candidati.isError && <p role="alert" className="text-sm text-destructive">{t("Prima nota non disponibile.")} <button onClick={()=>void candidati.refetch()}>{t("Riprova")}</button></p>}
    <Button disabled={salva.isPending || candidati.isLoading || candidati.isError || !scelta || !n || !Number.isFinite(n) || n<=0} onClick={()=>salva.mutate({movimentoId,importoCassa:n!,primaNotaId:scelta==='nuova'?null:scelta},{onSuccess:()=>{toast.success(t('Incasso collegato alla prima nota'));setOpen(false);},onError:e=>toast.error(messaggioGenerale(e,'il collegamento alla prima nota'))})}>{t("Conferma collegamento")}</Button>
  </DialogContent></Dialog></>;
}
