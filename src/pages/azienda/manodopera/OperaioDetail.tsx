/**
 * /azienda/manodopera/operai/:id — la scheda di un operaio (26/09/2026).
 *
 * Presenze degli ultimi 31 giorni, costo orario per le commesse, cantieri,
 * documenti con le scadenze, mezzi in carico e l'accesso all'app di cantiere.
 * I dati privati del Personale (IBAN, PIN, contatti di emergenza) qui non ci
 * sono: restano nel Personale.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CalendarDays, Crown, FileText, Loader2, Mail, MoreHorizontal, Pencil, Phone,
  RefreshCw, Smartphone, Truck, Wallet, HardHat,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import { OperaioDialog, type ValoriOperaio } from "@/components/manodopera/OperaioDialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  messaggioErroreOperai, useDaiAccessoApp, useSalvaOperaio, useSchedaOperaio, type SchedaOperaio,
} from "@/hooks/useOperai";
import { formatOra, formatOre } from "@/lib/manodopera/giornata";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const CATEGORIE_DOCUMENTO: Record<string, string> = {
  contratto: "Contratto",
  visita_medica: "Visita medica",
  corso_sicurezza: "Corso sicurezza",
  idoneita: "Idoneità",
  patente: "Patente",
  durc: "DURC",
  documento_identita: "Documento d'identità",
  permesso_soggiorno: "Permesso di soggiorno",
  unilav: "UNILAV",
  altro: "Documento",
};

const STATO_GIORNO: Record<string, string> = {
  presente: "Presente",
  assente: "Assente",
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  smart_working: "Da remoto",
  trasferta: "Trasferta",
  festivita: "Festivo",
  infortunio: "Infortunio",
};

const ELENCO = "/azienda/manodopera?tab=operai&vista=elenco";

export default function OperaioDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch, isFetching } = useSchedaOperaio(id);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Caricamento">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-full" /><Skeleton className="h-8 w-64" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    const e = error as { code?: string } | null;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-3 rounded-2xl border bg-white px-6 py-10 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-amber-600" aria-hidden="true" />
        <p className="font-semibold text-slate-900">
          {e?.code === "42501" ? "Questo operaio non c'è o non puoi vederlo." : "Non riesco a caricare la scheda dell'operaio."}
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to={ELENCO}>Torna agli operai</Link></Button>
          {e?.code !== "42501" && (
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />Riprova
            </Button>
          )}
        </div>
      </div>
    );
  }

  return <Scheda s={data} />;
}

function Scheda({ s }: { s: SchedaOperaio }) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoModificare = s.puo_modificare && !perms.solaLettura;
  const salva = useSalvaOperaio();
  const [modificaAperta, setModificaAperta] = useState(false);
  const [togliAperto, setTogliAperto] = useState(false);
  const [appAperta, setAppAperta] = useState(false);
  const p = s.scheda;

  const iniziali: Partial<ValoriOperaio> = useMemo(() => ({
    nome: p.nome ?? "",
    cognome: p.cognome ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    mansione: p.mansione ?? "",
    data_assunzione: p.data_assunzione ?? "",
    tipo_contratto: p.tipo_contratto ?? "indeterminato",
    costo_orario: s.costo.costo_orario_scritto != null ? String(s.costo.costo_orario_scritto).replace(".", ",") : "",
    stipendio_lordo: s.costo.stipendio_lordo != null ? String(s.costo.stipendio_lordo).replace(".", ",") : "",
    ore_mese: s.costo.ore_mese != null ? String(s.costo.ore_mese) : "",
  }), [p, s.costo]);

  const cambia = (dati: { attivo?: boolean; lavora_in_cantiere?: boolean }, fatto: string, poi?: () => void) => {
    salva.mutate(
      { id: p.id, dati },
      {
        onSuccess: () => { toast.success(fatto); poi?.(); },
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a salvare. Riprova tra qualche secondo.")),
      },
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link to={ELENCO} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Operai
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarOperaio nome={p.nome} cognome={p.cognome} colore={p.colore_avatar} grande />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{p.nome} {p.cognome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {p.mansione && <span>{p.mansione}</span>}
              {!p.attivo && <Badge variant="outline" className="border-slate-300 text-slate-600">Non più attivo</Badge>}
              {!p.lavora_in_cantiere && <Badge variant="outline" className="border-slate-300 text-slate-600">Non lavora in cantiere</Badge>}
              {p.ha_accesso_app
                ? <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"><Smartphone className="h-3 w-3" aria-hidden="true" />Ha l'app di cantiere</Badge>
                : <Badge variant="outline" className="border-slate-200 text-slate-500">Senza app</Badge>}
            </div>
          </div>
        </div>

        {puoModificare && (
          <div className="flex shrink-0 items-center gap-2">
            {!p.ha_accesso_app && perms.isAdmin && p.employee_id && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAppAperta(true)}>
                <Smartphone className="h-4 w-4" aria-hidden="true" />Dagli l'app
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModificaAperta(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />Modifica
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Altre azioni" disabled={salva.isPending}>
                  {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {p.attivo ? (
                  <DropdownMenuItem onSelect={() => cambia({ attivo: false }, `${p.nome} non è più attivo`)}>
                    Non lavora più con noi
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => cambia({ attivo: true }, `${p.nome} è di nuovo attivo`)}>
                    È tornato a lavorare con noi
                  </DropdownMenuItem>
                )}
                {p.lavora_in_cantiere && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setTogliAperto(true)}>Non lavora in cantiere</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {(p.telefono || p.email) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {p.telefono && (
            <a href={`tel:${p.telefono}`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-orange-700">
              <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />{p.telefono}
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-slate-700 hover:text-orange-700">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate">{p.email}</span>
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Presenze giornate={s.giornate} />
        <div className="space-y-4">
          <Costo s={s} />
          <Cantieri cantieri={s.cantieri} linkCommesse={perms.canViewOrders === true || perms.isAdmin} />
        </div>
        <Documenti documenti={s.documenti} linkPersonale={perms.canViewPersone === true || perms.isAdmin} />
        <Mezzi mezzi={s.mezzi} linkMezzi={perms.canViewMezzi === true || perms.isAdmin} />
      </div>

      <OperaioDialog
        aperto={modificaAperta}
        onAperto={setModificaAperta}
        operaioId={p.id}
        iniziali={iniziali}
        mostraStipendio={puoModificare}
      />

      <AlertDialog open={togliAperto} onOpenChange={setTogliAperto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{p.nome} non lavora in cantiere?</AlertDialogTitle>
            <AlertDialogDescription>
              Esce dall'elenco degli operai. Resta nel Personale con le sue presenze e i suoi documenti, e lo puoi rimettere quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cambia({ lavora_in_cantiere: false }, `${p.nome} non è più fra gli operai`, () => navigate(ELENCO))}
            >
              Togli dagli operai
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {p.employee_id && (
        <DialogApp
          aperto={appAperta}
          onAperto={setAppAperta}
          employeeId={p.employee_id}
          nome={p.nome}
          emailIniziale={p.email ?? ""}
        />
      )}
    </div>
  );
}

// ── Riquadri ─────────────────────────────────────────────────────────────────

function Riquadro({ titolo, icona: Icona, children, destra }: {
  titolo: string;
  icona: typeof CalendarDays;
  children: ReactNode;
  destra?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" aria-label={titolo}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icona className="h-4 w-4 text-orange-600" aria-hidden="true" />{titolo}
        </h2>
        {destra}
      </div>
      {children}
    </section>
  );
}

function Presenze({ giornate }: { giornate: SchedaOperaio["giornate"] }) {
  const lavorati = giornate.filter((g) => (g.ore_lavorate ?? 0) > 0);
  const ore = lavorati.reduce((t, g) => t + (g.ore_lavorate ?? 0), 0);
  return (
    <Riquadro
      titolo="Presenze degli ultimi 31 giorni"
      icona={CalendarDays}
      destra={lavorati.length > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {lavorati.length === 1 ? "1 giorno" : `${lavorati.length} giorni`} · {formatOre(ore)}
        </span>
      )}
    >
      {giornate.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nessuna timbratura negli ultimi 31 giorni.
        </p>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="py-1.5 pr-2">Giorno</th>
                <th scope="col" className="py-1.5 pr-2">Entrata</th>
                <th scope="col" className="py-1.5 pr-2">Uscita</th>
                <th scope="col" className="py-1.5 text-right">Ore</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {giornate.map((g) => {
                const presente = g.stato === "presente";
                return (
                  <tr key={g.data}>
                    <td className="py-1.5 pr-2">
                      <span className="capitalize">
                        {new Date(`${g.data}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                      </span>
                      {!presente && <span className="ml-1.5 text-xs text-sky-700">{STATO_GIORNO[g.stato] ?? g.stato}</span>}
                      {g.anomalia && (
                        <span className="ml-1.5 text-xs text-amber-700" title={g.anomalia_motivo ?? undefined}>da controllare</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{formatOra(g.prima_entrata)}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{formatOra(g.ultima_uscita)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatOre(g.ore_lavorate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Riquadro>
  );
}

function Costo({ s }: { s: SchedaOperaio }) {
  const c = s.costo;
  return (
    <Riquadro titolo="Costo per le commesse" icona={Wallet}>
      {c.costo_orario ? (
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-950">
            {formatCurrency(c.costo_orario)} <span className="text-sm font-medium text-slate-500">all'ora</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.costo_orario_scritto != null
              ? "Scritto a mano."
              : "Calcolato dallo stipendio lordo, con i contributi."}
            {c.stipendio_lordo != null && c.ore_mese != null && (
              <> Stipendio {formatCurrency(c.stipendio_lordo)} al mese per {c.ore_mese} ore.</>
            )}
          </p>
        </div>
      ) : (
        <p className="text-sm text-amber-800">
          Manca il costo orario: nelle commesse le ore di questo operaio non hanno un costo. Premi «Modifica» e scrivilo.
        </p>
      )}
    </Riquadro>
  );
}

function Cantieri({ cantieri, linkCommesse }: { cantieri: SchedaOperaio["cantieri"]; linkCommesse: boolean }) {
  return (
    <Riquadro titolo="Cantieri" icona={HardHat}>
      {cantieri.length === 0 ? (
        <p className="text-sm text-muted-foreground">Non è ancora assegnato a nessun cantiere. Si assegna dalla scheda della commessa.</p>
      ) : (
        <ul className="divide-y">
          {cantieri.map((c, i) => {
            const testo = [c.codice, c.cliente].filter(Boolean).join(" · ") || "Commessa";
            return (
              <li key={`${c.order_id}-${i}`} className={cn("flex items-start justify-between gap-3 py-2", !c.in_corso && "opacity-60")}>
                <div className="min-w-0">
                  {linkCommesse ? (
                    <Link to={`/azienda/ordini/${c.order_id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-orange-700 hover:underline">{testo}</Link>
                  ) : (
                    <span className="block truncate text-sm font-medium text-slate-900">{testo}</span>
                  )}
                  {c.indirizzo && <span className="block truncate text-xs text-muted-foreground">{c.indirizzo}</span>}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  {c.capocantiere && (
                    <span className="mb-0.5 inline-flex items-center gap-1 font-medium text-orange-700"><Crown className="h-3 w-3" aria-hidden="true" />Capocantiere</span>
                  )}
                  <span className="block tabular-nums">
                    {c.dal ? `dal ${formatDateIt(c.dal)}` : "in corso"}{c.al ? ` al ${formatDateIt(c.al)}` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Riquadro>
  );
}

const TONO_DOC: Record<SchedaOperaio["documenti"][number]["stato"], { testo: string; classe: string }> = {
  scaduto: { testo: "Scaduto", classe: "text-red-600 font-medium" },
  in_scadenza: { testo: "In scadenza", classe: "text-amber-700 font-medium" },
  valido: { testo: "Valido", classe: "text-emerald-700" },
  senza_scadenza: { testo: "Senza scadenza", classe: "text-muted-foreground" },
};

function Documenti({ documenti, linkPersonale }: { documenti: SchedaOperaio["documenti"]; linkPersonale: boolean }) {
  return (
    <Riquadro
      titolo="Documenti e scadenze"
      icona={FileText}
      destra={linkPersonale && (
        <Link to="/azienda/personale?tab=documenti" className="text-xs font-medium text-orange-700 hover:underline">Carica nel Personale</Link>
      )}
    >
      {documenti.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessun documento. Visita medica, corsi di sicurezza e patenti si caricano nel Personale, e l'avviso arriva prima che scadano.
        </p>
      ) : (
        <ul className="divide-y">
          {documenti.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{d.titolo || CATEGORIE_DOCUMENTO[d.categoria] || "Documento"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[CATEGORIE_DOCUMENTO[d.categoria], d.ente].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="shrink-0 text-right text-xs">
                <span className={cn("block", TONO_DOC[d.stato].classe)}>{TONO_DOC[d.stato].testo}</span>
                {d.data_scadenza && <span className="block tabular-nums text-slate-500">{formatDateIt(d.data_scadenza)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

function Mezzi({ mezzi, linkMezzi }: { mezzi: SchedaOperaio["mezzi"]; linkMezzi: boolean }) {
  return (
    <Riquadro titolo="Mezzi in carico" icona={Truck}>
      {mezzi.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun mezzo in carico.</p>
      ) : (
        <ul className="divide-y">
          {mezzi.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              {linkMezzi ? (
                <Link to={`/azienda/mezzi/${m.id}`} className="truncate font-medium text-slate-900 hover:text-orange-700 hover:underline">{m.nome}</Link>
              ) : (
                <span className="truncate font-medium text-slate-900">{m.nome}</span>
              )}
              {m.targa && <span className="shrink-0 font-mono text-xs text-slate-500">{m.targa}</span>}
            </li>
          ))}
        </ul>
      )}
    </Riquadro>
  );
}

// ── Accesso all'app di cantiere ──────────────────────────────────────────────

function DialogApp({ aperto, onAperto, employeeId, nome, emailIniziale }: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  employeeId: string;
  nome: string;
  emailIniziale: string;
}) {
  const dai = useDaiAccessoApp();
  const [email, setEmail] = useState(emailIniziale);
  const [password, setPassword] = useState<string | null>(null);

  const chiudi = (v: boolean) => {
    if (dai.isPending) return;
    onAperto(v);
    if (!v) { setPassword(null); setEmail(emailIniziale); }
  };

  const invia = () => {
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("Scrivi un'email valida: lì arrivano le credenziali.");
      return;
    }
    dai.mutate(
      { employeeId, email: e },
      {
        onSuccess: (r) => {
          if (r.temp_password) setPassword(r.temp_password);
          else { toast.success(`Abbiamo mandato a ${nome} le credenziali per email`); chiudi(false); }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Non sono riuscito a creare l'accesso."),
      },
    );
  };

  return (
    <Dialog open={aperto} onOpenChange={chiudi}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{password ? "Fatto" : `Dai a ${nome} l'app di cantiere`}</DialogTitle>
          <DialogDescription>
            {password
              ? `Abbiamo mandato a ${nome} le credenziali per email. Se non la trova, dagli questa password e digli di cambiarla al primo accesso.`
              : "Con l'app timbra entrata e uscita dal telefono, vede i suoi cantieri e manda il rapportino. Gli arriva un'email per entrare."}
          </DialogDescription>
        </DialogHeader>
        {password ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-center font-mono text-lg tracking-wide">{password}</p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="app-email">Email di {nome}</Label>
            <Input id="app-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          {password ? (
            <Button onClick={() => chiudi(false)}>Chiudi</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => chiudi(false)} disabled={dai.isPending}>Annulla</Button>
              <Button onClick={invia} disabled={dai.isPending} className="gap-1.5">
                {dai.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Manda l'accesso
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
