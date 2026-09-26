/**
 * Commessa → «Squadre al lavoro» (26/09/2026, richiesta di Florin: la squadra
 * creata in Manodopera «poi la trovo nelle commesse»).
 *
 * Le squadre sulla commessa con le date, il responsabile e chi c'è dentro.
 * «Aggiungi squadra» la mette al lavoro: chi ha l'app si trova il cantiere sul
 * telefono. Togliere la squadra toglie solo gli accessi dati dalla squadra.
 */
import { useState } from "react";
import { Crown, HardHat, Pencil, Plus, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import { SquadraCommessaDialog } from "@/components/manodopera/SquadraCommessaDialog";
import { messaggioErroreOperai, useSquadreCommessa, useTogliSquadraDaCommessa, type SquadraInCommessa } from "@/hooks/useOperai";
import { formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";

function periodo(s: { dal: string | null; al: string | null }): string {
  if (s.dal && s.al) return `dal ${formatDateIt(s.dal)} al ${formatDateIt(s.al)}`;
  if (s.dal) return `dal ${formatDateIt(s.dal)}`;
  if (s.al) return `fino al ${formatDateIt(s.al)}`;
  return "senza date";
}

export function SquadreCommessaCard({ orderId, modificabile }: { orderId: string; modificabile: boolean }) {
  const { data = [], isLoading, error } = useSquadreCommessa(orderId);
  const togli = useTogliSquadraDaCommessa();
  const [aggiungi, setAggiungi] = useState(false);
  const [date, setDate] = useState<SquadraInCommessa | null>(null);
  const [daTogliere, setDaTogliere] = useState<SquadraInCommessa | null>(null);

  // Chi non vede gli operai né le commesse non riceve i dati: niente riquadro.
  if (error) return null;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" aria-labelledby="squadre-commessa">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="squadre-commessa" className="flex min-w-0 items-center gap-2 whitespace-nowrap text-base font-semibold text-slate-900">
          <HardHat className="h-4 w-4 text-orange-600" aria-hidden="true" />Squadre al lavoro
        </h2>
        {modificabile && (
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setAggiungi(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /><span className="max-sm:hidden">Aggiungi squadra</span><span className="sm:hidden">Aggiungi</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna squadra su questa commessa.{modificabile && " Aggiungine una: i suoi operai si trovano il cantiere nell'app."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((s) => (
            <li
              key={s.squadra_id}
              className={cn("overflow-hidden rounded-xl border", s.finita && "opacity-60")}
              style={{ borderLeftWidth: 4, borderLeftColor: s.colore ?? "#94A3B8" }}
            >
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {s.nome}
                    {!s.attiva && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(sciolta)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {periodo(s)}{s.finita && " · finita"}
                    {s.responsabile && (
                      <> · <Crown className="inline h-3 w-3 text-orange-600" aria-hidden="true" /> {s.responsabile.nome} {s.responsabile.cognome}{s.capocantiere && ", capocantiere"}</>
                    )}
                  </p>
                </div>
                {modificabile && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" className="tap-compact h-8 w-8" aria-label={`Cambia le date di ${s.nome}`} onClick={() => setDate(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="tap-compact h-8 w-8" aria-label={`Togli ${s.nome} dalla commessa`} onClick={() => setDaTogliere(s)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {s.componenti.length > 0 ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t bg-slate-50/60 px-3 py-2">
                  {s.componenti.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                      <AvatarOperaio nome={p.nome} cognome={p.cognome} colore={p.colore_avatar} />
                      <span>{p.nome} {p.cognome}</span>
                      {p.ha_accesso_app && <Smartphone className="h-3.5 w-3.5 text-emerald-600" aria-label="ha l'app di cantiere" />}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t bg-slate-50/60 px-3 py-2 text-xs text-muted-foreground">La squadra non ha ancora operai.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <SquadraCommessaDialog aperto={aggiungi} onAperto={setAggiungi} orderId={orderId} />
      {date && (
        <SquadraCommessaDialog
          aperto={!!date}
          onAperto={(v) => { if (!v) setDate(null); }}
          orderId={orderId}
          squadraId={date.squadra_id}
          iniziale={{ dal: date.dal, al: date.al, capocantiere: date.capocantiere }}
        />
      )}

      <AlertDialog open={!!daTogliere} onOpenChange={(o) => { if (!o) setDaTogliere(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togli {daTogliere?.nome} dalla commessa?</AlertDialogTitle>
            <AlertDialogDescription>
              I suoi operai non vedranno più questo cantiere nell'app, se non ce li hai messi anche a mano. Le ore già timbrate restano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!daTogliere) return;
                const nome = daTogliere.nome;
                togli.mutate(
                  { orderId, squadraId: daTogliere.squadra_id },
                  {
                    onSuccess: () => toast.success(`${nome} tolta dalla commessa`),
                    onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a togliere la squadra. Riprova tra qualche secondo.")),
                  },
                );
                setDaTogliere(null);
              }}
            >
              Togli la squadra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
