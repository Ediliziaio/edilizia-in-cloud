import { MagazzinoCampoPermission } from "@/components/users/MagazzinoCampoPermission";
import type { LivelloMagazzinoCampo } from "../../../../shared/campo-magazzino";
import { AccessoAppInScheda, useStatiAppOperai } from "@/components/manodopera/AccessoAppOperaio";
/**
 * /azienda/manodopera/operai/:id — la scheda di un operaio (26/09/2026).
 *
 * Il mese in un calendario (ore, cantiere, mezzi, rapportino del giorno), cantieri,
 * documenti con le scadenze, mezzi in carico e l'accesso all'app di cantiere.
 * I dati privati del Personale (IBAN, PIN, contatti di emergenza) qui non ci
 * sono: restano nel Personale.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CalendarDays, Crown, FileText, Loader2, Mail, MoreHorizontal, Pencil, Phone,
  RefreshCw, Smartphone, Truck, HardHat,
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PeriodiOperaio } from "@/components/manodopera/PeriodiOperaio";
import { useSpostaOperaio, useSquadre } from "@/hooks/useOperai";
import { AvatarOperaio } from "@/components/manodopera/AvatarOperaio";
import { CalendarioPresenze } from "@/components/manodopera/CalendarioPresenze";
import { LinkAccessoDialog } from "@/components/manodopera/LinkAccessoDialog";
import { OperaioDialog, type ValoriOperaio } from "@/components/manodopera/OperaioDialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  messaggioErroreOperai, useDaiAccessoApp, useSalvaOperaio, useSchedaOperaio, type SchedaOperaio,
} from "@/hooks/useOperai";
import { formatDateIt } from "@/lib/formatters";
import { percorsoSquadra, SQUADRE_OPERAI } from "@/lib/manodopera/collegamentiSquadre";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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

const ELENCO = "/azienda/manodopera?tab=operai&vista=elenco";

export default function OperaioDetail() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch, isFetching } = useSchedaOperaio(id);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("Caricamento")}>
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-full" /><Skeleton className="h-8 w-64" /></div>
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
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
          {e?.code === "42501" ? t("Questo operaio non c'è o non puoi vederlo.") : t("Non riesco a caricare la scheda dell'operaio.")}
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to={ELENCO}>{t("Torna agli operai")}</Link></Button>
          {e?.code !== "42501" && (
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />{t("Riprova")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return <Scheda s={data} />;
}

function Scheda({ s }: { s: SchedaOperaio }) {
  const t = useT();
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoModificare = s.puo_modificare && !perms.solaLettura;
  const salva = useSalvaOperaio();
  const [modificaAperta, setModificaAperta] = useState(false);
  const [togliAperto, setTogliAperto] = useState(false);
  const [appAperta, setAppAperta] = useState(false);
  const [linkAperto, setLinkAperto] = useState(false);
  const p = s.scheda;
  const accesso = useStatiAppOperai().data?.[p.id];
  const [sceltaSquadra, setSceltaSquadra] = useState<string | null>(null);
  const squadre = useSquadre(sceltaSquadra !== null);
  const sposta = useSpostaOperaio();
  const pianificabile = puoModificare && p.attivo && p.lavora_in_cantiere;

  const iniziali: Partial<ValoriOperaio> = useMemo(() => ({
    nome: p.nome ?? "",
    cognome: p.cognome ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    mansione: p.mansione ?? "",
    data_assunzione: p.data_assunzione ?? "",
    tipo_contratto: p.tipo_contratto ?? "indeterminato",
  }), [p]);

  const cambia = (dati: { attivo?: boolean; lavora_in_cantiere?: boolean }, fatto: string, poi?: () => void) => {
    salva.mutate(
      { id: p.id, dati },
      {
        onSuccess: () => {
          toast.success(fatto);
          // Chi esce con un furgone o un attrezzo in carico: lo si dice subito.
          if (dati.attivo === false && s.mezzi.length > 0) {
            toast.warning(t("Ha ancora in carico: {mezzi}. Riassegnali o riportali in magazzino.", { mezzi: s.mezzi.map((m) => m.nome).join(", ") }));
          }
          poi?.();
        },
        onError: (err) => toast.error(messaggioErroreOperai(err, t("Non sono riuscito a salvare. Riprova tra qualche secondo."))),
      },
    );
  };

  return (
    <div className="space-y-3">
      <Link to={ELENCO} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("Operai")}
      </Link>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarOperaio nome={p.nome} cognome={p.cognome} colore={p.colore_avatar} grande />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{p.nome} {p.cognome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {p.mansione && <span>{p.mansione}</span>}
              {!p.attivo && <Badge variant="outline" className="border-slate-300 text-slate-600">{t("Non più attivo")}</Badge>}
              {!p.lavora_in_cantiere && <Badge variant="outline" className="border-slate-300 text-slate-600">{t("Non lavora in cantiere")}</Badge>}
              <AccessoAppInScheda profiloId={p.id} />
            </div>
            {(p.telefono || p.email) && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
          </div>
        </div>

        {puoModificare && (
          <div className="flex shrink-0 items-center gap-2">
            {accesso?.stato === "mai_dato" && perms.isAdmin && p.employee_id && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLinkAperto(true)}>
                <Smartphone className="h-4 w-4" aria-hidden="true" />{t("Dagli l'app")}
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModificaAperta(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />{t("Modifica")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="h-9 w-9" aria-label={t("Altre azioni")} disabled={salva.isPending}>
                  {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {accesso?.stato === "attivo" && perms.isAdmin && p.employee_id && (
                  <DropdownMenuItem onSelect={() => setLinkAperto(true)}>{t("Manda di nuovo il link")}</DropdownMenuItem>
                )}
                {p.attivo ? (
                  <DropdownMenuItem onSelect={() => cambia({ attivo: false }, t("{nome} non è più attivo", { nome: p.nome }))}>
                    {t("Non lavora più con noi")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => cambia({ attivo: true }, t("{nome} è di nuovo attivo", { nome: p.nome }))}>
                    {t("È tornato a lavorare con noi")}
                  </DropdownMenuItem>
                )}
                {p.lavora_in_cantiere && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setTogliAperto(true)}>{t("Non lavora in cantiere")}</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
      {s.squadra ? (
        <Link
          to={percorsoSquadra(SQUADRE_OPERAI, s.squadra.id)}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-white px-4 py-2.5 text-sm shadow-sm hover:border-orange-200"
          style={{ borderLeftWidth: 4, borderLeftColor: s.squadra.colore ?? "#94A3B8" }}
        >
          <span className="font-semibold text-slate-900">{s.squadra.nome}</span>
          {s.squadra.responsabile && (
            <span className="text-slate-600">
              <Crown className="mr-1 inline h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              {s.squadra.responsabile.id === p.id ? t("È il responsabile") : `${s.squadra.responsabile.nome} ${s.squadra.responsabile.cognome}`}
            </span>
          )}
          {s.squadra.compagni.length > 0 && (
            <span className="text-muted-foreground">
              {t("con")} {s.squadra.compagni.map((c) => `${c.nome} ${c.cognome}`).join(", ")}
            </span>
          )}
        </Link>
      ) : p.lavora_in_cantiere && (
        <p className="text-sm text-muted-foreground">
          {t("Non è in nessuna squadra.")} <Link to="/azienda/manodopera?tab=operai&vista=squadre" className="font-medium text-orange-700 hover:underline">{t("Vai alle squadre")}</Link>
        </p>
      )}

      {pianificabile && <Button size="sm" variant="outline" onClick={() => setSceltaSquadra(s.squadra?.id ?? "nessuna")}>{s.squadra ? t("Cambia squadra") : t("Scegli squadra")}</Button>}
      </div>
      <Dialog open={sceltaSquadra !== null} onOpenChange={open => {if (!open && !sposta.isPending) setSceltaSquadra(null);}}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t("Squadra di {nome}", { nome: String(p.nome ?? "") })}</DialogTitle>
          <DialogDescription>{t("La scelta aggiorna anche i cantieri assegnati tramite la squadra.")}</DialogDescription></DialogHeader>
          {squadre.isError ? <Button variant="outline" onClick={() => squadre.refetch()}>{t("Riprova a caricare le squadre")}</Button> :
            <Select value={sceltaSquadra ?? ""} onValueChange={setSceltaSquadra} disabled={!squadre.isSuccess || sposta.isPending}>
              <SelectTrigger aria-label={t("Squadra")}><SelectValue placeholder={t("Scegli la squadra")} /></SelectTrigger>
              <SelectContent><SelectItem value="nessuna">{t("Nessuna squadra")}</SelectItem>{squadre.data?.map(team => <SelectItem key={team.id} value={team.id}>{team.nome}</SelectItem>)}</SelectContent>
            </Select>}
          <DialogFooter><Button variant="outline" disabled={sposta.isPending} onClick={() => setSceltaSquadra(null)}>{t("Annulla")}</Button>
            <Button disabled={!sceltaSquadra || sceltaSquadra === (s.squadra?.id ?? "nessuna") || !squadre.isSuccess || sposta.isPending}
              onClick={() => sposta.mutate({profiloId: p.id, squadraId: sceltaSquadra === "nessuna" ? null : sceltaSquadra}, {
                onSuccess: () => {setSceltaSquadra(null); toast.success(t("Squadra aggiornata"));},
                onError: e => toast.error(messaggioErroreOperai(e, t("Impossibile aggiornare la squadra."))),
              })}>{t("Salva squadra")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {!p.attivo && s.mezzi.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t("Non lavora più con voi ma ha ancora in carico")} {s.mezzi.length === 1 ? t("un mezzo o attrezzo") : t("{n} mezzi o attrezzi", { n: s.mezzi.length })}:
            {" "}{s.mezzi.map((m) => m.nome).join(", ")}{t(". Riassegnali o riportali in magazzino dalla loro scheda.")}
          </span>
        </div>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <CalendarioPresenze profiloId={p.id} />
        <div className="min-w-0 space-y-3">
          <Cantieri cantieri={s.cantieri} linkCommesse={perms.canViewOrders === true || perms.isAdmin}>
            {p.employee_id && <PeriodiOperaio key={p.id} companyId={p.company_id} employeeId={p.employee_id} modificabile={pianificabile} linkCommesse={perms.canViewOrders === true || perms.isAdmin} />}
          </Cantieri>
          <Documenti documenti={s.documenti} linkPersonale={perms.canViewPersone === true || perms.isAdmin} />
          <Mezzi mezzi={s.mezzi} linkMezzi={perms.canViewMezzi === true || perms.isAdmin} />
        </div>
      </div>

      <OperaioDialog
        aperto={modificaAperta}
        onAperto={setModificaAperta}
        operaioId={p.id}
        iniziali={iniziali}
      />

      <AlertDialog open={togliAperto} onOpenChange={setTogliAperto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("{nome} non lavora in cantiere?", { nome: String(p.nome ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Esce dall'elenco degli operai. Resta nel Personale con le sue presenze e i suoi documenti, e lo puoi rimettere quando vuoi.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cambia({ lavora_in_cantiere: false }, t("{nome} non è più fra gli operai", { nome: p.nome }), () => navigate(ELENCO))}
            >
              {t("Togli dagli operai")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {p.employee_id && (
        <LinkAccessoDialog
          aperto={linkAperto}
          onAperto={setLinkAperto}
          employeeIds={[p.employee_id]}
          onUsaEmail={p.ha_accesso_app ? undefined : () => { setLinkAperto(false); setAppAperta(true); }}
        />
      )}
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
    <section className="rounded-xl border bg-white p-3 shadow-sm" aria-label={titolo}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icona className="h-4 w-4 text-orange-600" aria-hidden="true" />{titolo}
        </h2>
        {destra}
      </div>
      {children}
    </section>
  );
}

function Cantieri({ cantieri, linkCommesse, children }: { children: ReactNode; cantieri: SchedaOperaio["cantieri"]; linkCommesse: boolean }) {
  const t = useT();
  return (
    <Riquadro titolo={t("Cantieri")} icona={HardHat}>
      {cantieri.length > 0 && (
        <ul className="divide-y">
          {[...cantieri].sort((a, b) => Number(b.in_corso) - Number(a.in_corso)).map((c, i) => {
            const testo = [c.codice, c.cliente].filter(Boolean).join(" · ") || t("Commessa");
            return (
              <li key={`${c.order_id}-${i}`} className={cn("flex items-start justify-between gap-3 py-2", !c.in_corso && "opacity-60")}>
                <div className="min-w-0">
                  {linkCommesse ? (
                    <Link to={`/azienda/ordini/${c.order_id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-orange-700 hover:underline">{testo}</Link>
                  ) : (
                    <span className="block truncate text-sm font-medium text-slate-900">{testo}</span>
                  )}
                  {(c.indirizzo || c.con_la_squadra) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.con_la_squadra ? "con la squadra" : null, c.indirizzo].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  {c.capocantiere && (
                    <span className="mb-0.5 inline-flex items-center gap-1 font-medium text-orange-700"><Crown className="h-3 w-3" aria-hidden="true" />{t("Capocantiere")}</span>
                  )}
                  <span className="block tabular-nums">
                    {c.dal ? t("dal {data}", { data: formatDateIt(c.dal) }) : c.in_corso ? t("In corso") : ""}{c.al ? t(" al {valore}", { valore: formatDateIt(c.al) }) : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {children}
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
  const t = useT();
  return (
    <Riquadro
      titolo={t("Documenti e scadenze")}
      icona={FileText}
      destra={linkPersonale && (
        <Link to="/azienda/personale?tab=documenti" className="text-xs font-medium text-orange-700 hover:underline">{t("Carica nel Personale")}</Link>
      )}
    >
      {documenti.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nessun documento. Visita medica, corsi di sicurezza e patenti si caricano nel Personale, e l'avviso arriva prima che scadano.")}
        </p>
      ) : (
        <ul className="divide-y">
          {[...documenti].sort((a, b) => {
            const priorita = {scaduto: 0, in_scadenza: 1, valido: 2, senza_scadenza: 3};
            return priorita[a.stato] - priorita[b.stato] || (a.data_scadenza ?? "").localeCompare(b.data_scadenza ?? "");
          }).map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{d.titolo || t(CATEGORIE_DOCUMENTO[d.categoria] || "Documento")}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[CATEGORIE_DOCUMENTO[d.categoria] ? t(CATEGORIE_DOCUMENTO[d.categoria]) : null, d.ente].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="shrink-0 text-right text-xs">
                <span className={cn("block", TONO_DOC[d.stato].classe)}>{t(TONO_DOC[d.stato].testo)}</span>
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
  const t = useT();
  return (
    <Riquadro titolo={t("Mezzi e attrezzi in carico")} icona={Truck}>
      {mezzi.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Niente in carico.")}</p>
      ) : (
        <ul className="divide-y">
          {mezzi.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                {linkMezzi ? (
                  <Link to={`/azienda/mezzi/${m.id}`} className="block truncate font-medium text-slate-900 hover:text-orange-700 hover:underline">{m.nome}</Link>
                ) : (
                  <span className="block truncate font-medium text-slate-900">{m.nome}</span>
                )}
                {m.su_mezzo && <span className="block truncate text-xs text-muted-foreground">{t("a bordo di {su_mezzo}", { su_mezzo: String(m.su_mezzo ?? "") })}</span>}
              </span>
              {(m.targa || m.codice) && <span className="shrink-0 font-mono text-xs text-slate-500">{m.targa ?? m.codice}</span>}
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
  const t = useT();
  const dai = useDaiAccessoApp();
  const [email, setEmail] = useState(emailIniziale);
  const [magazzino, setMagazzino] = useState<LivelloMagazzinoCampo>("nessuno");
  const [password, setPassword] = useState<string | null>(null);

  const chiudi = (v: boolean) => {
    if (dai.isPending) return;
    onAperto(v);
    if (!v) { setPassword(null); setEmail(emailIniziale); setMagazzino("nessuno"); }
  };

  const invia = () => {
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error(t("Scrivi un'email valida: lì arrivano le credenziali."));
      return;
    }
    dai.mutate(
      { employeeId, email: e, magazzino },
      {
        onSuccess: (r) => {
          if (r.temp_password) setPassword(r.temp_password);
          else { toast.success(t("Abbiamo mandato a {nome} le credenziali per email", { nome: String(nome ?? "") })); chiudi(false); }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : t("Non sono riuscito a creare l'accesso.")),
      },
    );
  };

  return (
    <Dialog open={aperto} onOpenChange={chiudi}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{password ? t("Fatto") : t("Dai a {nome} l'app di cantiere", { nome: String(nome ?? "") })}</DialogTitle>
          <DialogDescription>
            {password
              ? t("Abbiamo mandato a {nome} le credenziali per email. Se non la trova, dagli questa password e digli di cambiarla al primo accesso.", { nome: String(nome ?? "") })
              : t("Con l'app timbra entrata e uscita dal telefono, vede i suoi cantieri e manda il rapportino. Gli arriva un'email per entrare.")}
          </DialogDescription>
        </DialogHeader>
        {password ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-center font-mono text-lg tracking-wide">{password}</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="app-email">{t("Email di {nome}", { nome: String(nome ?? "") })}</Label>
              <Input id="app-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <MagazzinoCampoPermission creation value={magazzino} readOnly={dai.isPending}
              onChange={(livello) => setMagazzino(livello ?? "nessuno")} />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          {password ? (
            <Button onClick={() => chiudi(false)}>{t("Chiudi")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => chiudi(false)} disabled={dai.isPending}>{t("Annulla")}</Button>
              <Button onClick={invia} disabled={dai.isPending} className="gap-1.5">
                {dai.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("Manda l'accesso")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
