/**
 * Le squadre di una commessa, dentro «Lavori e squadre» (26/09/2026).
 *
 * Una riga per squadra: date, responsabile, chi c'è dentro. Un operaio si
 * sposta da una squadra all'altra trascinandolo, oppure toccando il suo nome
 * («Sposta in…»); lo spostamento vale per tutte le commesse della squadra e si
 * può annullare dall'avviso. Aggiungere una squadra alla commessa dà l'app di
 * cantiere a chi ce l'ha; toglierla toglie solo gli accessi dati dalla squadra.
 */
import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Crown, GripVertical, Pencil, Plus, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import { SquadraCommessaDialog } from "@/components/manodopera/SquadraCommessaDialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  messaggioErroreOperai, useSpostaOperaio, useSquadraSuCommessa, useSquadre, useSquadreCommessa, useTogliSquadraDaCommessa,
  type PersonaSquadra, type SquadraInCommessa,
} from "@/hooks/useOperai";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function periodoSquadra(s: { dal: string | null; al: string | null }): string {
  if (s.dal && s.al) return `dal ${formatDateIt(s.dal)} al ${formatDateIt(s.al)}`;
  if (s.dal) return `dal ${formatDateIt(s.dal)}`;
  if (s.al) return `fino al ${formatDateIt(s.al)}`;
  return "senza date";
}

interface Trascinato { persona: PersonaSquadra; da: string }

export function SquadreCommessa({
  orderId,
  modificabile,
  aggiungiAperto,
  onAggiungiAperto,
  soloFinestra = false,
}: {
  orderId: string;
  modificabile: boolean;
  aggiungiAperto: boolean;
  onAggiungiAperto: (v: boolean) => void;
  /** Solo la finestra «Aggiungi squadra», senza elenco (commessa ancora vuota). */
  soloFinestra?: boolean;
}) {
  const perms = usePermissions();
  const vedeOperai = perms.canViewOperai === true || perms.isAdmin;
  const { data: tutte = [], isLoading, error } = useSquadreCommessa(orderId);
  // Qui le squadre su tutta la commessa; quelle su una fase stanno nella fase.
  const data = tutte.filter((s) => !s.phase_id);
  const togli = useTogliSquadraDaCommessa();
  const sposta = useSpostaOperaio();
  const [date, setDate] = useState<SquadraInCommessa | null>(null);
  const [daTogliere, setDaTogliere] = useState<SquadraInCommessa | null>(null);
  const [trascinato, setTrascinato] = useState<Trascinato | null>(null);
  const [sopra, setSopra] = useState<string | null>(null);
  // Il menu del nome si apre al clic, non alla pressione: così si può trascinare.
  const [menu, setMenu] = useState<string | null>(null);

  if (soloFinestra) {
    return <SquadraCommessaDialog aperto={aggiungiAperto} onAperto={onAggiungiAperto} orderId={orderId} />;
  }
  if (error) return null;

  // Si sposta verso qualunque squadra della commessa, anche quelle su una fase.
  const attive = [...new Map(tutte.filter((s) => s.attiva).map((s) => [s.squadra_id, s])).values()];

  const spostaIn = (persona: PersonaSquadra, verso: SquadraInCommessa | null) => {
    const nome = `${persona.nome} ${persona.cognome}`;
    sposta.mutate(
      { profiloId: persona.id, squadraId: verso?.squadra_id ?? null },
      {
        onSuccess: (prima) => {
          toast.success(verso ? `${nome} ora è nella ${verso.nome}` : `${nome} non è più in una squadra`, {
            description: "Vale anche per le altre commesse delle squadre.",
            // Il tempo di accorgersi dello sbaglio e premere «Annulla».
            duration: 10_000,
            action: {
              label: "Annulla",
              onClick: () => sposta.mutate(
                { profiloId: persona.id, squadraId: prima },
                { onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito ad annullare.")) },
              ),
            },
          });
        },
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a spostarlo. Riprova tra qualche secondo.")),
      },
    );
  };

  const suDrop = (e: DragEvent, s: SquadraInCommessa) => {
    e.preventDefault();
    setSopra(null);
    if (trascinato && trascinato.da !== s.squadra_id) spostaIn(trascinato.persona, s);
    setTrascinato(null);
  };

  if (isLoading) return <Skeleton className="h-20 w-full rounded-xl" />;

  if (data.length === 0) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <span>Nessuna squadra su tutta la commessa. Puoi anche mettere una squadra solo su una fase, dentro la fase.</span>
          {modificabile && (
            <Button size="sm" variant="outline" onClick={() => onAggiungiAperto(true)}>Aggiungi squadra</Button>
          )}
        </div>
        <SquadraCommessaDialog aperto={aggiungiAperto} onAperto={onAggiungiAperto} orderId={orderId} />
      </>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {data.map((s) => {
          const bersaglio = !!trascinato && trascinato.da !== s.squadra_id && s.attiva;
          return (
            <li
              key={s.squadra_id}
              onDragOver={(e) => { if (bersaglio) { e.preventDefault(); setSopra(s.squadra_id); } }}
              onDragLeave={() => setSopra((x) => (x === s.squadra_id ? null : x))}
              onDrop={(e) => suDrop(e, s)}
              className={cn(
                "overflow-hidden rounded-xl border bg-white transition",
                s.finita && "opacity-60",
                bersaglio && "border-dashed border-orange-300",
                sopra === s.squadra_id && "bg-orange-50 ring-2 ring-orange-400",
              )}
              style={{ borderLeftWidth: 4, borderLeftColor: s.colore ?? "#94A3B8" }}
              aria-label={s.nome}
            >
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {s.nome}
                    {!s.attiva && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(sciolta)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {periodoSquadra(s)}{s.finita && " · finita"}
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
                <ul className="flex flex-wrap gap-1.5 border-t bg-slate-50/60 px-3 py-2">
                  {s.componenti.map((p) => {
                    const chip = (
                      <span className="flex items-center gap-1.5">
                        {modificabile && attive.length > 0 && <GripVertical className="h-3.5 w-3.5 text-slate-300 max-sm:hidden" aria-hidden="true" />}
                        <AvatarOperaio nome={p.nome} cognome={p.cognome} colore={p.colore_avatar} />
                        <span>{p.nome} {p.cognome}</span>
                        {p.ha_accesso_app && <Smartphone className="h-3.5 w-3.5 text-emerald-600" aria-label="ha l'app di cantiere" />}
                      </span>
                    );
                    return (
                      <li
                        key={p.id}
                        draggable={modificabile && s.attiva}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", p.id);
                          e.dataTransfer.effectAllowed = "move";
                          setTrascinato({ persona: p, da: s.squadra_id });
                        }}
                        onDragEnd={() => { setTrascinato(null); setSopra(null); }}
                        className={cn(modificabile && s.attiva && "cursor-grab active:cursor-grabbing")}
                      >
                        {modificabile ? (
                          <DropdownMenu open={menu === `${s.squadra_id}:${p.id}`} onOpenChange={(o) => setMenu(o ? `${s.squadra_id}:${p.id}` : null)}>
                            <DropdownMenuTrigger
                              asChild
                              onPointerDown={(e) => e.preventDefault()}
                              onClick={() => setMenu(`${s.squadra_id}:${p.id}`)}
                            >
                              <button
                                type="button"
                                className="tap-compact rounded-full border border-transparent bg-white py-0.5 pl-1 pr-2.5 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 hover:ring-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                                aria-label={`${p.nome} ${p.cognome}: sposta o togli`}
                              >
                                {chip}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{p.nome} {p.cognome}</DropdownMenuLabel>
                              {attive.filter((x) => x.squadra_id !== s.squadra_id).map((x) => (
                                <DropdownMenuItem key={x.squadra_id} onSelect={() => spostaIn(p, x)}>
                                  <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.colore ?? "#94A3B8" }} aria-hidden="true" />
                                  Sposta in {x.nome}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem onSelect={() => spostaIn(p, null)}>Togli dalla squadra</DropdownMenuItem>
                              {vedeOperai && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link to={`/azienda/manodopera/operai/${p.id}`}>Apri la scheda</Link>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="inline-flex rounded-full bg-white py-0.5 pl-1 pr-2.5 text-sm text-slate-700 ring-1 ring-slate-200">{chip}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="border-t bg-slate-50/60 px-3 py-2 text-xs text-muted-foreground">
                  {bersaglio ? "Rilascia qui per metterlo in questa squadra." : "La squadra non ha ancora operai."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {modificabile && attive.length > 1 && (
        <p className="text-xs text-muted-foreground max-sm:hidden">
          Per spostare un operaio trascinalo sull'altra squadra, oppure toccalo e scegli «Sposta in…».
        </p>
      )}

      <SquadraCommessaDialog aperto={aggiungiAperto} onAperto={onAggiungiAperto} orderId={orderId} />
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
    </div>
  );
}

/** Una riga per la Panoramica: quali squadre lavorano qui e da quando. */
export function SquadreInBreve({ orderId }: { orderId: string }) {
  const { data = [], error } = useSquadreCommessa(orderId);
  // Una squadra una volta sola, anche se è su più fasi.
  const attive = [...new Map(data.filter((s) => s.attiva && !s.finita).map((s) => [s.squadra_id, s])).values()];
  if (error || attive.length === 0) return null;
  return (
    <p className="text-sm text-slate-700">
      <span className="text-muted-foreground">Squadre: </span>
      {attive.map((s, i) => (
        <span key={s.squadra_id}>
          {i > 0 && ", "}
          <span className="font-medium">{s.nome}</span>{" "}
          <span className="text-muted-foreground">({s.phase_id ? `fase ${s.fase ?? ""}`.trim() : periodoSquadra(s)})</span>
        </span>
      ))}
    </p>
  );
}

/**
 * «Chi la fa», dentro una fase: le squadre che fanno quella fase. Una squadra
 * messa qui segue le date della fase; i suoi operai si trovano il cantiere
 * nell'app per quei giorni.
 */
export function SquadreFase({
  orderId,
  fase,
  modificabile,
}: {
  orderId: string;
  fase: { id: string; name: string };
  modificabile: boolean;
}) {
  const { data = [] } = useSquadreCommessa(orderId);
  const { data: tutte = [] } = useSquadre();
  const metti = useSquadraSuCommessa();
  const togli = useTogliSquadraDaCommessa();
  const qui = data.filter((s) => s.phase_id === fase.id);
  const giaQui = new Set(qui.map((s) => s.squadra_id));
  const scegliibili = tutte.filter((s) => !giaQui.has(s.id));

  const aggiungi = (id: string, nome: string) =>
    metti.mutate(
      { orderId, squadraId: id, dal: null, al: null, capocantiere: false, phaseId: fase.id },
      {
        onSuccess: () => toast.success(`${nome} fa «${fase.name}»`, { description: "Segue le date della fase." }),
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito ad aggiungerla. Riprova tra qualche secondo.")),
      },
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {qui.map((s) => (
        <Tooltip key={s.squadra_id}>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-2.5 pr-1 text-sm ring-1 ring-slate-200">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colore ?? "#94A3B8" }} aria-hidden="true" />
              <span className="font-medium text-slate-800">{s.nome}</span>
              {!s.segue_fase && (s.dal || s.al) && <span className="text-xs text-muted-foreground">({periodoSquadra(s)})</span>}
              {modificabile ? (
                <button
                  type="button"
                  className="tap-compact ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Togli ${s.nome} da ${fase.name}`}
                  onClick={() => togli.mutate(
                    { orderId, squadraId: s.squadra_id, phaseId: fase.id },
                    { onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a toglierla.")) },
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : <span className="w-1" />}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {s.componenti.length ? s.componenti.map((c) => `${c.nome} ${c.cognome}`).join(", ") : "Squadra senza operai"}
            {s.responsabile && ` · resp. ${s.responsabile.nome} ${s.responsabile.cognome}`}
          </TooltipContent>
        </Tooltip>
      ))}
      {modificabile && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full border-dashed px-3" disabled={metti.isPending}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />Squadra
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {scegliibili.length === 0 ? (
              <DropdownMenuItem asChild>
                <Link to="/azienda/manodopera?tab=operai&vista=squadre">{tutte.length === 0 ? "Crea la prima squadra" : "Tutte le squadre sono già qui"}</Link>
              </DropdownMenuItem>
            ) : scegliibili.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => aggiungi(s.id, s.nome)}>
                <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colore ?? "#94A3B8" }} aria-hidden="true" />
                {s.nome}
                <span className="ml-2 text-xs text-muted-foreground">{s.componenti.length} operai</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!modificabile && qui.length === 0 && <span className="text-sm text-muted-foreground">Nessuna squadra</span>}
    </div>
  );
}

