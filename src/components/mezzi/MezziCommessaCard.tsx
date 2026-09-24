/**
 * Mezzi sul cantiere, dentro la commessa: quali mezzi ci sono adesso, quali ci
 * sono stati e per quanti giorni, con una stima di quanto sono costati. La
 * stima è informativa: non entra nel margine della commessa.
 *
 * Si vede solo a chi vede il magazzino e solo se l'azienda ha almeno un mezzo:
 * a chi non gestisce un parco la commessa resta com'era.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useAssegnaMezzoACommessa, useCostiParco, useMezzi, useMezziDellaCommessa } from "@/hooks/useMezzi";
import { formatCurrency } from "@/lib/formatters";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { costoAnnuoMezzo, formatData, giornoItaliano, giorniSovrapposti, oggiIso } from "@/types/mezzi";

interface Props {
  orderId: string;
}

function descriviPeriodi(periodi: Array<{ dal: string; al: string | null }>): string {
  return periodi
    .map((p) => (p.al ? `dal ${formatData(giornoItaliano(p.dal))} al ${formatData(giornoItaliano(p.al))}` : `dal ${formatData(giornoItaliano(p.dal))}`))
    .join(", ");
}

export function MezziCommessaCard({ orderId }: Props) {
  const perms = usePermissions();
  const puoVedere = perms.canViewWarehouse || perms.isAdmin;
  const puoModificare = (perms.canEditWarehouse || perms.isAdmin) && !perms.solaLettura;

  const { data: mezzi = [] } = useMezzi();
  const { data: sulCantiere = [], isLoading, error, refetch } = useMezziDellaCommessa(puoVedere ? orderId : undefined);
  const { data: costiParco } = useCostiParco();
  const assegna = useAssegnaMezzoACommessa();

  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState<string>("");

  const oggi = oggiIso();
  const righe = useMemo(() => {
    return sulCantiere.map((m) => {
      const giorni = m.periodi.reduce((t, p) => t + giorniSovrapposti(p.dal, p.al, "2000-01-01", oggi), 0);
      const costo = costiParco
        ? costoAnnuoMezzo(
            { rata_mensile: m.rata_mensile },
            costiParco.documenti.filter((d) => d.mezzo_id === m.mezzo_id),
            costiParco.manutenzioni.filter((x) => x.mezzo_id === m.mezzo_id),
            oggi,
          )
        : null;
      // Dal totale annuo, arrotondando una volta sola alla fine.
      const stima = costo && costo.totale > 0 ? Math.round(((costo.totale * giorni) / 365) * 100) / 100 : null;
      return { ...m, giorni, stima };
    });
  }, [sulCantiere, costiParco, oggi]);

  const stimaTotale = righe.reduce((t, r) => t + (r.stima ?? 0), 0);
  const giaQui = new Set(righe.filter((r) => r.adesso).map((r) => r.mezzo_id));
  // Si mettono sul cantiere i mezzi che lavorano; un attrezzo a bordo di un
  // furgone segue il furgone e non si sposta da solo.
  const disponibili = mezzi.filter((m) => !giaQui.has(m.id) && m.stato !== "fuori_servizio" && !m.su_mezzo_id);
  const sceltoInfo = mezzi.find((m) => m.id === scelto);

  if (!puoVedere || mezzi.length === 0) return null;

  const conferma = async () => {
    if (!scelto) return;
    try {
      await assegna.mutateAsync({ mezzoId: scelto, orderId });
      setAperto(false);
      setScelto("");
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
          <Truck className="h-4 w-4 shrink-0 text-slate-600" />
          <span className="truncate">Mezzi sul cantiere</span>
          {righe.length > 0 && <span className="shrink-0 text-xs font-normal text-muted-foreground">({righe.length})</span>}
        </CardTitle>
        {puoModificare && (
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setAperto(true)} disabled={disponibili.length === 0}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Metti un mezzo</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="text-sm text-red-700">
            Non riesco a caricare i mezzi.{" "}
            <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
          </p>
        ) : righe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun mezzo è ancora passato da questo cantiere.</p>
        ) : (
          <ul className="divide-y">
            {righe.map((r) => (
              <li key={r.mezzo_id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <IconaMezzo tipo={r.tipo} className="h-4 w-4 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/azienda/mezzi/${r.mezzo_id}`} className="truncate text-sm font-medium hover:underline">
                      {r.nome}
                    </Link>
                    {r.targa && <span className="font-mono text-xs text-muted-foreground">{r.targa}</span>}
                    {r.adesso && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">Qui adesso</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {descriviPeriodi(r.periodi)} · {r.giorni === 1 ? "1 giorno" : `${r.giorni} giorni`}
                    {r.stima != null && <> · circa {formatCurrency(r.stima)}</>}
                  </p>
                </div>
                {puoModificare && r.adesso && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    onClick={() => assegna.mutate({ mezzoId: r.mezzo_id, orderId: null })}
                    disabled={assegna.isPending}
                    aria-label={`Togli ${r.nome} dal cantiere`}
                    title="Togli dal cantiere"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {stimaTotale > 0 && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Costo stimato dei mezzi su questo cantiere: <span className="font-medium text-foreground">{formatCurrency(stimaTotale)}</span>.
            Viene da assicurazione, bollo, rate e interventi dell'ultimo anno, divisi per i giorni sul cantiere. Non entra nel margine della commessa.
          </p>
        )}
      </CardContent>

      <Dialog open={aperto} onOpenChange={(o) => { setAperto(o); if (!o) setScelto(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Metti un mezzo sul cantiere</DialogTitle>
            <DialogDescription>Da oggi il mezzo risulta su questa commessa. Lo storico lo segna da solo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mezzo-commessa">Mezzo</Label>
            <Select value={scelto} onValueChange={setScelto}>
              <SelectTrigger id="mezzo-commessa"><SelectValue placeholder="Scegli un mezzo" /></SelectTrigger>
              <SelectContent>
                {disponibili.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}{m.targa ? ` · ${m.targa}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sceltoInfo?.assegnato_commessa && (
              <p className="text-xs text-amber-800">Adesso è su {sceltoInfo.assegnato_commessa}: lo sposto qui.</p>
            )}
            {sceltoInfo?.stato === "in_officina" && (
              <p className="text-xs text-amber-800">Risulta in officina.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
            <Button onClick={conferma} disabled={!scelto || assegna.isPending}>
              {assegna.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Metti sul cantiere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
