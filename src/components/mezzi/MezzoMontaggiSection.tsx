/**
 * Attrezzature a quantità (ponteggi in m², transenne a pezzi, reti in metri):
 * quanto è montato e dove, quanto resta in magazzino. Si monta una parte su un
 * cantiere, la si fa rientrare tutta o in parte; lo storico resta, e i costi
 * per commessa li divide in proporzione a quanto è stato montato e per quanti
 * giorni (vista v_ordine_costi_mezzi_stimati).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import {
  useEliminaAllocazione, useMezzoAllocazioni, useMontaQuantita, useRientroQuantita,
  type AllocazioneConCantiere,
} from "@/hooks/useMezzi";
import { formatData, formatQuantita, numeroLetto, oggiIso, unitaBreve } from "@/types/mezzi";

interface Props {
  mezzoId: string;
  companyId: string;
  unita: string | null;
  totale: number;
  puoModificare: boolean;
}

export function MezzoMontaggiSection({ mezzoId, companyId, unita, totale, puoModificare }: Props) {
  const { data: righe = [], isLoading, error, refetch } = useMezzoAllocazioni(mezzoId);
  const elimina = useEliminaAllocazione();
  const [monta, setMonta] = useState(false);
  const [rientro, setRientro] = useState<AllocazioneConCantiere | null>(null);
  const [daEliminare, setDaEliminare] = useState<AllocazioneConCantiere | null>(null);
  const [storico, setStorico] = useState(false);

  const aperte = righe.filter((r) => r.aperta);
  const chiuse = righe.filter((r) => !r.aperta);
  const montato = aperte.reduce((t, r) => t + r.quantita, 0);
  const disponibile = Math.max(0, totale - montato);
  const percentuale = totale > 0 ? Math.min(100, Math.round((montato / totale) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            <span className="text-base font-semibold">{formatQuantita(montato, unita)}</span>
            <span className="text-muted-foreground"> montati su {formatQuantita(totale, unita)}</span>
          </p>
          <p className="text-sm font-medium text-emerald-700">{formatQuantita(disponibile, unita)} in magazzino</p>
        </div>
        <Progress value={percentuale} className="mt-2 h-2 bg-emerald-100" indicatorClassName="bg-orange-500" aria-label={`${percentuale}% montato`} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Dove è montato adesso</h3>
        {puoModificare && (
          <Button size="sm" onClick={() => setMonta(true)} disabled={disponibile <= 0} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />Monta su un cantiere
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare i montaggi.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : aperte.length === 0 ? (
        <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">Tutto in magazzino.</p>
      ) : (
        <ul className="space-y-2">
          {aperte.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.order_id && r.cantiere ? (
                    <Link to={`/azienda/ordini/${r.order_id}`} className="text-orange-700 hover:underline">{r.cantiere}</Link>
                  ) : (r.luogo ?? "Altro posto")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatQuantita(r.quantita, unita)} dal {formatData(r.dal)}{r.al ? ` · rientra il ${formatData(r.al)}` : ""}{r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              {puoModificare && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setRientro(r)} className="gap-1">
                    <ArrowDownToLine className="h-4 w-4" /><span className="max-sm:hidden">Rientro</span>
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setDaEliminare(r)} aria-label="Elimina il montaggio (era uno sbaglio)">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {chiuse.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setStorico((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={storico}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${storico ? "rotate-180" : ""}`} />
            Già rientrati ({chiuse.length})
          </button>
          {storico && (
            <ul className="mt-2 divide-y rounded-xl border">
              {chiuse.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.cantiere ?? r.luogo ?? "Altro posto"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatQuantita(r.quantita, unita)} · {formatData(r.dal)} → {formatData(r.al)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {monta && (
        <DialogMonta
          mezzoId={mezzoId}
          companyId={companyId}
          unita={unita}
          disponibile={disponibile}
          onClose={() => setMonta(false)}
        />
      )}
      {rientro && <DialogRientro allocazione={rientro} unita={unita} onClose={() => setRientro(null)} />}

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo montaggio?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se era uno sbaglio: sparisce anche dai costi del cantiere. Se il materiale è tornato, usa «Rientro».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DialogMonta({ mezzoId, companyId, unita, disponibile, onClose }: {
  mezzoId: string; companyId: string; unita: string | null; disponibile: number; onClose: () => void;
}) {
  const monta = useMontaQuantita(mezzoId);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [altroPosto, setAltroPosto] = useState(false);
  const [luogo, setLuogo] = useState("");
  const [quantita, setQuantita] = useState("");
  const [dal, setDal] = useState(oggiIso());
  const [note, setNote] = useState("");

  const n = numeroLetto(quantita);
  const troppo = n != null && n > disponibile;
  const valido = n != null && n > 0 && !troppo && (altroPosto ? luogo.trim().length > 0 : !!orderId) && !!dal;

  const salva = async () => {
    if (!valido) return;
    try {
      await monta.mutateAsync({ order_id: altroPosto ? null : orderId, luogo: altroPosto ? luogo : null, quantita: n!, dal, note });
      onClose();
    } catch {
      // l'errore (es. «Non basta») lo mostra la mutation
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Monta su un cantiere</DialogTitle>
          <DialogDescription>In magazzino ce ne sono {formatQuantita(disponibile, unita)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {altroPosto ? (
            <div className="space-y-1.5">
              <Label htmlFor="monta-luogo">Dove</Label>
              <Input id="monta-luogo" value={luogo} onChange={(e) => setLuogo(e.target.value)} placeholder="es. deposito di via Roma, prestito a ditta X" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Cantiere</Label>
              <OrderSelectCombobox companyId={companyId} value={orderId ?? undefined} onChange={(id) => setOrderId(id)} placeholder="Scegli la commessa" />
            </div>
          )}
          <button type="button" className="text-xs font-medium text-orange-700 underline underline-offset-2" onClick={() => setAltroPosto((v) => !v)}>
            {altroPosto ? "È su un cantiere" : "Non è su un cantiere (deposito, prestito…)"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="monta-quantita">Quanti {unitaBreve(unita)}</Label>
              <Input
                id="monta-quantita"
                inputMode="decimal"
                value={quantita}
                onChange={(e) => setQuantita(e.target.value)}
                placeholder={String(disponibile).replace(".", ",")}
                aria-invalid={troppo}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monta-dal">Dal</Label>
              <Input id="monta-dal" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
            </div>
          </div>
          {troppo && <p className="text-xs text-red-700">Ce ne sono solo {formatQuantita(disponibile, unita)} in magazzino.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="monta-note">Note</Label>
            <Textarea id="monta-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="es. facciata nord" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={salva} disabled={!valido || monta.isPending}>
            {monta.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Segna il montaggio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogRientro({ allocazione, unita, onClose }: { allocazione: AllocazioneConCantiere; unita: string | null; onClose: () => void }) {
  const rientro = useRientroQuantita();
  const [quantita, setQuantita] = useState(String(allocazione.quantita).replace(".", ","));
  const [data, setData] = useState(oggiIso());
  const n = numeroLetto(quantita);
  const valido = n != null && n > 0 && n <= allocazione.quantita && !!data && data >= allocazione.dal;

  const salva = async () => {
    if (!valido) return;
    try {
      await rientro.mutateAsync({ allocazioneId: allocazione.id, quantita: n!, data });
      onClose();
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rientro in magazzino</DialogTitle>
          <DialogDescription>
            Da {allocazione.cantiere ?? allocazione.luogo ?? "questo posto"}: montati {formatQuantita(allocazione.quantita, unita)} dal {formatData(allocazione.dal)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rientro-quantita">Quanti {unitaBreve(unita)}</Label>
            <Input id="rientro-quantita" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rientro-data">Il</Label>
            <Input id="rientro-data" type="date" value={data} min={allocazione.dal} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        {n != null && n > allocazione.quantita && (
          <p className="text-xs text-red-700">Ne sono montati solo {formatQuantita(allocazione.quantita, unita)}.</p>
        )}
        {n != null && n > 0 && n < allocazione.quantita && (
          <p className="text-xs text-muted-foreground">Restano montati {formatQuantita(allocazione.quantita - n, unita)}.</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={salva} disabled={!valido || rientro.isPending}>
            {rientro.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Segna il rientro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
