/**
 * Mettere una squadra su una commessa (26/09/2026). Dalla commessa si sceglie
 * la squadra, dalla squadra si sceglie la commessa; poi le date e, se si vuole,
 * il responsabile come capocantiere. I componenti con l'app si trovano il
 * cantiere sul telefono; chi l'app non ce l'ha risulta comunque previsto lì.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { messaggioErroreOperai, oggiRoma, useSquadraSuCommessa, useSquadre } from "@/hooks/useOperai";

export function SquadraCommessaDialog({
  aperto,
  onAperto,
  orderId,
  squadraId,
  iniziale,
}: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  /** Dalla commessa: la commessa è fissa, si sceglie la squadra. */
  orderId?: string;
  /** Dalla squadra: la squadra è fissa, si sceglie la commessa. */
  squadraId?: string;
  /** Per cambiare date e capocantiere di una squadra già sulla commessa. */
  iniziale?: { dal: string | null; al: string | null; capocantiere: boolean };
}) {
  const { data: squadre = [] } = useSquadre();
  const metti = useSquadraSuCommessa();
  const [squadra, setSquadra] = useState<string>("");
  const [commessa, setCommessa] = useState<string | null>(null);
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [capo, setCapo] = useState(false);

  useEffect(() => {
    if (!aperto) return;
    setSquadra(squadraId ?? "");
    setCommessa(orderId ?? null);
    setDal(iniziale?.dal ?? oggiRoma());
    setAl(iniziale?.al ?? "");
    setCapo(iniziale?.capocantiere ?? false);
  }, [aperto, squadraId, orderId, iniziale]);

  const scelta = squadre.find((s) => s.id === squadra);
  const modifica = !!iniziale;

  const invia = () => {
    if (!squadra) { toast.error("Scegli la squadra."); return; }
    if (!commessa) { toast.error("Scegli la commessa."); return; }
    if (dal && al && al < dal) { toast.error("La fine viene prima dell'inizio: controlla le date."); return; }
    metti.mutate(
      { orderId: commessa, squadraId: squadra, dal: dal || null, al: al || null, capocantiere: capo },
      {
        onSuccess: () => {
          toast.success(modifica ? "Date aggiornate" : `${scelta?.nome ?? "La squadra"} è sulla commessa`);
          onAperto(false);
        },
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a mettere la squadra sulla commessa. Riprova tra qualche secondo.")),
      },
    );
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !metti.isPending && onAperto(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modifica ? "Date della squadra" : "Metti una squadra al lavoro"}</DialogTitle>
          <DialogDescription>
            Chi ha l'app si trova il cantiere sul telefono; gli altri risultano previsti lì nella giornata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!squadraId && (
            <div className="space-y-1.5">
              <Label htmlFor="sc-squadra">Squadra</Label>
              {squadre.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  Non ci sono ancora squadre. Le crei in Manodopera e Mezzi, scheda Operai.
                </p>
              ) : (
                <Select value={squadra} onValueChange={setSquadra}>
                  <SelectTrigger id="sc-squadra"><SelectValue placeholder="Scegli la squadra" /></SelectTrigger>
                  <SelectContent>
                    {squadre.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colore ?? "#94A3B8" }} aria-hidden="true" />
                          {s.nome} · {s.componenti.length === 1 ? "1 operaio" : `${s.componenti.length} operai`}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {!orderId && (
            <div className="space-y-1.5">
              <Label>Commessa</Label>
              <CommessaCombobox value={commessa} onChange={setCommessa} nessunaLabel="Scegli la commessa" className="w-full" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-dal">Dal</Label>
              <Input id="sc-dal" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-al">Al</Label>
              <Input id="sc-al" type="date" value={al} min={dal || undefined} onChange={(e) => setAl(e.target.value)} />
              <p className="text-xs text-muted-foreground">Vuoto: finché non la togli.</p>
            </div>
          </div>

          {(scelta?.responsabile || squadraId) && (
            <label htmlFor="sc-capo" className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
              <Checkbox id="sc-capo" checked={capo} onCheckedChange={(v) => setCapo(v === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium">Il responsabile fa da capocantiere</span>
                <span className="block text-xs text-muted-foreground">
                  {scelta?.responsabile
                    ? `${scelta.responsabile.nome} ${scelta.responsabile.cognome} vede il cantiere nell'app come capocantiere, se la commessa non ne ha già uno.`
                    : "Vale se la squadra ha un responsabile con l'app e la commessa non ha già un capocantiere."}
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onAperto(false)} disabled={metti.isPending}>Annulla</Button>
          <Button onClick={invia} disabled={metti.isPending} className="gap-1.5">
            {metti.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {modifica ? "Salva" : "Metti al lavoro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
