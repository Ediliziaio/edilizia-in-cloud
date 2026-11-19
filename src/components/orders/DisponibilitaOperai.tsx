import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { riepilogoDisponibilita, type DisponibilitaCantiere } from "@/lib/orders/disponibilitaCantiere";

const fmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const data = (g: string) => g.split("-").reverse().slice(0, 2).join("/");

export function DisponibilitaOperai({ chiave, leggi, persone, nomi, giorni, dal, al, ore }: {
  chiave: readonly unknown[];
  leggi: (dati: { persone: string[]; dal: string; al: string }) => Promise<DisponibilitaCantiere>;
  persone: string[];
  nomi: ReadonlyMap<string, string>;
  giorni: string[];
  dal: string;
  al: string;
  ore: number;
}) {
  const ids = [...persone].sort();
  const ricerca = useQuery({
    queryKey: [...chiave, dal, al, ids],
    queryFn: () => leggi({ persone: ids, dal, al }),
    enabled: ids.length > 0 && giorni.length > 0,
    retry: false,
    staleTime: 10_000,
  });
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label="Disponibilità negli altri cantieri">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Disponibilità negli altri cantieri</h4>
        {ricerca.isSuccess && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void ricerca.refetch()}>Aggiorna</Button>}
      </div>
      {ricerca.isPending ? <p role="status" className="text-sm text-muted-foreground">Controllo gli impegni nel periodo…</p>
        : ricerca.isError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>{ricerca.error.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void ricerca.refetch()}>Riprova</Button>
        </div> : <>
          <p className="text-xs text-muted-foreground">Mostra le commesse accessibili. Usa l’orario della scheda personale oppure 8 h/giorno come riferimento.</p>
          {!ricerca.data.assegnazioniVerificate && <p role="status" className="text-xs text-amber-800">La lettura delle assegnazioni è parziale. Verifica gli impegni prima di confermare.</p>}
          <div className="divide-y rounded-md border">
            {riepilogoDisponibilita(ricerca.data, persone, giorni, ore).map(({ persona, capienza, date }) => {
              const impegni = date.filter((g) => g.cantieri.length || g.eccedenza > 0);
              const eccedenza = date.filter((g) => g.eccedenza > 0).length;
              const daVerificare = date.filter((g) => g.daVerificare).length;
              const residuo = Math.min(...date.map((g) => g.residuo));
              const codici = [...new Set(impegni.flatMap((g) => g.cantieri.map((i) => i.codice)))];
              return <details key={persona} className="px-2.5 py-2">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">{nomi.get(persona) ?? "Operaio"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{fmt.format(capienza)} h/giorno</span>
                  <span className="ml-2 text-xs">
                    {eccedenza ? <strong className="text-rose-700">{eccedenza} {eccedenza === 1 ? "giorno oltre orario" : "giorni oltre orario"}</strong>
                      : daVerificare || !ricerca.data.assegnazioniVerificate ? <strong className="text-amber-800">Disponibilità da verificare</strong>
                      : impegni.length ? `Da ${fmt.format(residuo)} h libere` : "Nessun impegno nel periodo"}
                    {codici.length === 1 && <span className="text-muted-foreground"> · {codici[0]}</span>}
                    {codici.length > 1 && <span className="text-muted-foreground"> · {codici.length} cantieri</span>}
                  </span>
                </summary>
                {impegni.length > 0 ? <ul className="mt-1 space-y-1.5 border-t pt-2 text-xs">
                  {impegni.map((g) => <li key={g.giorno} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <strong className="w-12">{data(g.giorno)}</strong>
                    <span>{g.daVerificare ? `Fino a ${fmt.format(g.residuo)} h libere` : `${fmt.format(g.residuo)} h libere`}</span>
                    {g.eccedenza > 0 && <strong className="text-rose-700">+{fmt.format(g.eccedenza)} h oltre orario</strong>}
                    {g.cantieri.map((i) => <span key={i.commessa} className="rounded bg-muted px-1.5 py-0.5">
                      <a className="font-medium text-primary underline-offset-2 hover:underline" href={`/azienda/ordini/${i.commessa}?tab=cantiere&vista_cantiere=lavorazioni`} target="_blank" rel="noreferrer">{i.codice}</a>
                      {" · "}{i.ore === null ? "assegnato, ore da verificare" : `${fmt.format(i.ore)} h`}
                    </span>)}
                  </li>)}
                </ul> : <p className="mt-1 text-xs text-muted-foreground">{ricerca.data.assegnazioniVerificate ? "Nessun impegno trovato per queste date." : "Verifica il calendario dei cantieri assegnati."}</p>}
              </details>;
            })}
          </div>
        </>}
    </section>
  );
}
