/**
 * «Nell'app»: chi vede la commessa sul telefono, quando, e il capocantiere
 * (26/09/2026). Non è più una sezione a parte: chi lavora sulla commessa —
 * squadra, persona o ditta su una fase — ci entra da solo con le date delle
 * sue fasi (il database tiene in pari gli accessi). Qui si guarda chi e
 * quando, e si sceglie il capocantiere fra chi lavora qui.
 */
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fonteAccesso, nomeAccesso, useAccessiCommessa, useScegliCapocantiere, useTogliAccessoAMano,
  type AccessoCommessa,
} from "@/hooks/useAccessiCommessa";

const giorno = (d: string) => format(parseISO(d), "d MMM", { locale: it });

/** «dal 15 ott al 30 ott», «dal 15 ott», «fino al 30 ott», «tutta la commessa». */
export function periodoAccesso(a: Pick<AccessoCommessa, "data_inizio" | "data_fine_prevista">): string {
  const { data_inizio: dal, data_fine_prevista: al } = a;
  if (dal && al) return dal === al ? `il ${giorno(dal)}` : `dal ${giorno(dal)} al ${giorno(al)}`;
  if (dal) return `dal ${giorno(dal)}`;
  if (al) return `fino al ${giorno(al)}`;
  return "per tutta la commessa";
}

function descriviFonte(a: AccessoCommessa, nomiSquadre: Map<string, string>): string {
  switch (fonteAccesso(a)) {
    case "squadra":
      return `con ${nomiSquadre.get(a.da_squadra_id!) ?? "la sua squadra"}`;
    case "fasi":
      return a.role_type === "subcontractor" ? "ditta sulle fasi" : "sulle fasi";
    default:
      return "aggiunto a mano";
  }
}

export function AppCantiere({
  orderId,
  modificabile,
  nomiSquadre,
}: {
  orderId: string;
  modificabile: boolean;
  nomiSquadre: Map<string, string>;
}) {
  const { data: accessi = [], isLoading, isError, refetch } = useAccessiCommessa(orderId);
  const scegli = useScegliCapocantiere(orderId);
  const togli = useTogliAccessoAMano(orderId);
  const [aperto, setAperto] = useState(false);
  const [daTogliere, setDaTogliere] = useState<AccessoCommessa | null>(null);

  if (isLoading) return <Skeleton className="h-14 w-full rounded-xl" />;
  if (isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
        Non riesco a leggere chi vede il cantiere nell'app.
        <Button size="sm" variant="outline" className="h-7" onClick={() => refetch()}>Riprova</Button>
      </div>
    );
  }

  const capo = accessi.find((a) => a.is_capocantiere) ?? null;
  const candidati = accessi.filter((a) => a.role_type === "employee");
  const ordinati = [...accessi].sort(
    (a, b) => Number(!!b.is_capocantiere) - Number(!!a.is_capocantiere) || nomeAccesso(a).localeCompare(nomeAccesso(b), "it"),
  );
  const n = accessi.length;

  return (
    // Verde solo quando c'è qualcuno che la vede. «Nessuno la vede ancora» è un
    // dato neutro, non un esito positivo: grigio, come le altre note di sezione.
    <section
      aria-labelledby={`app-cantiere-${orderId}`}
      className={cn(
        "rounded-xl border p-3",
        n === 0
          ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"
          : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3
            id={`app-cantiere-${orderId}`}
            className={cn("text-sm font-semibold", n === 0 ? "text-slate-800 dark:text-slate-100" : "text-emerald-900 dark:text-emerald-100")}
          >
            {n === 0 ? "Nell'app non la vede ancora nessuno" : `Nell'app la ${n === 1 ? "vede 1 persona" : `vedono ${n} persone`}`}
          </h3>
          <p className={cn("text-xs", n === 0 ? "text-slate-600 dark:text-slate-300/80" : "text-emerald-800/90 dark:text-emerald-200/80")}>
            {n === 0
              ? "Chi metti al lavoro su una fase la trova da solo sul telefono, nei giorni della fase."
              : "Ognuno nei giorni del suo lavoro. Cambi una fase o una squadra e si aggiorna da solo."}
          </p>
        </div>

        {candidati.length > 0 && (
          <div className="flex items-center gap-2 max-sm:w-full">
            <Label htmlFor={`capocantiere-${orderId}`} className="shrink-0 text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              Capocantiere
            </Label>
            <Select
              value={capo?.user_id ?? "nessuno"}
              onValueChange={(v) => scegli.mutate(v === "nessuno" ? null : v)}
              disabled={!modificabile || scegli.isPending}
            >
              <SelectTrigger id={`capocantiere-${orderId}`} className="h-8 bg-background max-sm:flex-1 sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nessuno">Nessuno</SelectItem>
                {candidati.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>{nomeAccesso(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {n > 0 && (
          <Button
            size="sm"
            variant="outline"
            aria-expanded={aperto}
            className="h-8 border-emerald-300 bg-background text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 max-sm:w-full"
            onClick={() => setAperto((v) => !v)}
          >
            {aperto ? "Nascondi" : "Chi e quando"}
          </Button>
        )}
      </div>

      {aperto && n > 0 && (
        <ul className="mt-3 divide-y divide-emerald-100 overflow-hidden rounded-lg border border-emerald-100 bg-background dark:divide-emerald-900 dark:border-emerald-900">
          {ordinati.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-medium">
                {nomeAccesso(a)}
                {a.is_capocantiere && (
                  <Badge variant="outline" className="ml-2 border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800">Capocantiere</Badge>
                )}
              </span>
              <span className="text-xs tabular-nums text-foreground/80">{periodoAccesso(a)}</span>
              <span className="text-xs text-muted-foreground">{descriviFonte(a, nomiSquadre)}</span>
              {modificabile && fonteAccesso(a) === "a_mano" && (
                <Button size="sm" variant="ghost" className="tap-compact h-7 px-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => setDaTogliere(a)}>
                  Togli
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!daTogliere} onOpenChange={(o) => { if (!o && !togli.isPending) setDaTogliere(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Togliere {daTogliere ? nomeAccesso(daTogliere) : ""} dall'app?</AlertDialogTitle>
            <AlertDialogDescription>
              Non vedrà più questa commessa sul telefono. Quello che ha già registrato resta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togli.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={togli.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                if (daTogliere) togli.mutate(daTogliere.id, { onSettled: () => setDaTogliere(null) });
              }}
            >
              Togli
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
