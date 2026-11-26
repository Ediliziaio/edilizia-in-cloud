import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Anchor as PopoverAnchor } from "@radix-ui/react-popover";
import { useDraggable, useDndMonitor } from "@dnd-kit/core";
import {
  AlertTriangle, ArrowRight, ArrowRightLeft, CalendarDays, ClipboardCheck, Eye, ListTodo, Mail, MapPin,
  PackageCheck, Pencil, Trash2, Users, Wallet, X,
} from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { type OrderWithDetails, getAmountDue, getAmountCollected, getGrossOrderAmount } from "@/lib/orderUtils";
import { isPipelineCardControl } from "@/lib/orders/cardInteraction";
import type { ConteggioPipeline } from "@/lib/orders/conteggiPipeline";
import { orderDetailLocation, type OrderDetailDestination } from "@/lib/orders/detailNavigation";
import { emailVera } from "@/lib/preventivatore/selezionaCliente";
import {
  lavoriCompletati, prossimoPasso, ritardoLavori, statoIncasso, statoMateriali, statoSquadra, type Tono,
} from "@/lib/orders/etichettePipeline";
import type { PipelineTarget } from "./PipelineDrag";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Tr = ReturnType<typeof useT>;

interface OrdersPipelineCardProps {
  order: OrderWithDetails;
  stage: string;
  canEdit?: boolean;
  showAmounts?: boolean;
  isDraggable?: boolean;
  destinazioni?: PipelineTarget[];
  onPhaseChange?: (id: string, fase: string) => void;
  onMove?: (order: OrderWithDetails) => void;
  onDelete?: (order: OrderWithDetails) => void;
}

const SIGLE_SOCIETARIE = /\b(?:S\.?R\.?L|S\.?P\.?A|S\.?A\.?S|S\.?N\.?C|A\.?P\.?S|E\.?T\.?S)\b/u;

function getMaterialSummary(order: OrderWithDetails) {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const total = items.length;
  const ready = items.filter((item) =>
    ["in_magazzino", "prenotato", "installato"].includes(item.status || "")
  ).length;
  const toOrder = items.filter((item) => item.status === "da_ordinare").length;

  return { total, ready, toOrder };
}

function getWorkPeriodLabel(order: OrderWithDetails, t: Tr) {
  if (order.work_start_date && order.work_end_date) {
    return `${formatDateShort(order.work_start_date)} - ${formatDateShort(order.work_end_date)}`;
  }
  if (order.work_start_date) return t("Dal {data}", { data: formatDateShort(order.work_start_date) });
  if (order.work_end_date) return t("Entro {data}", { data: formatDateShort(order.work_end_date) });
  return null;
}

function getPaymentTypeLabel(paymentType?: string | null) {
  const normalized = paymentType || "standard";
  const labels: Record<string, string> = {
    standard: "Standard",
    financing: "Finanziamento",
    finanziamento: "Finanziamento",
    bonus: "Bonus edilizio",
    rateale: "Rateale",
  };
  if (labels[normalized]) return labels[normalized];
  // Codice non in elenco (es. "acconto_saldo"): mai mostrarlo grezzo.
  const leggibile = normalized.replace(/_/g, " ").trim();
  return leggibile.charAt(0).toUpperCase() + leggibile.slice(1);
}

function getCustomerName(order: OrderWithDetails, t: Tr) {
  const nome = formatPersonName(order.customer) || order.client_name?.trim();
  if (!nome) return t("Cliente non indicato");
  return nome.replace(/\p{L}+(?:\.\p{L}+)*/gu, parola => {
    if (parola !== parola.toLocaleUpperCase("it-IT") || SIGLE_SOCIETARIE.test(parola)) return parola;
    return parola[0].toLocaleUpperCase("it-IT") + parola.slice(1).toLocaleLowerCase("it-IT");
  });
}

function getOrderDescription(order: OrderWithDetails, t: Tr) {
  const descrizione = order.description?.trim() || t("Descrizione non indicata");
  const confronta = (valore: string) => valore.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
  const cliente = order.customer;
  const nomi = [
    order.client_name,
    formatPersonName(cliente),
    cliente && formatPersonName({ first_name: cliente.last_name, last_name: cliente.first_name }),
  ];
  const coincide = (parte: string) => nomi.some(nome => nome && confronta(nome) === confronta(parte));
  const prefisso = descrizione.match(/^(.+?)\s+[-–—]\s+([\s\S]+)$/u);
  const senzaPrefisso = prefisso && coincide(prefisso[1]) ? prefisso[2] : descrizione;
  const suffisso = senzaPrefisso.match(/^([\s\S]+)\s+[-–—]\s+(.+)$/u);
  return suffisso && coincide(suffisso[2]) ? suffisso[1] : senzaPrefisso;
}

function formatPersonName(person?: { first_name: string | null; last_name: string | null } | null) {
  if (!person) return null;
  return `${person.first_name || ""} ${person.last_name || ""}`.trim() || null;
}

function getLaborSummary(order: OrderWithDetails) {
  const employees = (order.order_employees || [])
    .map((row) => formatPersonName(row.employee))
    .filter((nome): nome is string => !!nome);
  const teams = (order.order_external_teams || []).flatMap(({ external_team }) => {
    const name = external_team?.name?.trim();
    return name ? [{ name, internal: external_team?.kind === "interna" }] : [];
  });
  const internal = [...new Set(teams.filter(team => team.internal).map(team => team.name))];
  const external = [...new Set(teams.filter(team => !team.internal).map(team => team.name))];
  return { employees: [...new Set(employees)], internal, external, names: [...new Set([...internal, ...external, ...employees])] };
}

const TONO_TESTO: Record<Tono, string> = {
  critico: "text-red-700 dark:text-red-400",
  attenzione: "text-amber-700 dark:text-amber-400",
  ok: "text-emerald-700 dark:text-emerald-400",
  neutro: "text-foreground",
};

const ACTION_CLASS = "grid min-h-9 min-w-0 flex-1 place-items-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-7";
const PIANIFICAZIONE = { tab: "cantiere", cantiereView: "cronoprogramma" } satisfies OrderDetailDestination;
const PAGAMENTI = { tab: "finanza", economiaView: "pagamenti" } satisfies OrderDetailDestination;

function RigaInfo({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: Tono }) {
  const t = useT();
  return (
    <div className="grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-1 text-[11px] leading-4">
      <dt className="text-muted-foreground">{t(label)}</dt>
      <dd className={cn("flex min-w-0 items-center gap-1 font-medium [&>svg]:size-3 [&>svg]:shrink-0", TONO_TESTO[tone])}>
        {icon}
        <span className="truncate">{t(value)}</span>
      </dd>
    </div>
  );
}

function riepilogoConteggio(conteggio: ConteggioPipeline | null | undefined, vuoto: string, conta: (fatti: number, totale: number) => string, t: Tr) {
  if (!conteggio?.total) {
    return { value: conteggio === undefined ? t("Caricamento…") : conteggio === null ? t("Non disponibile") : vuoto, tone: "neutro" as const };
  }
  return {
    value: conta(conteggio.done, conteggio.total),
    tone: conteggio.done === conteggio.total ? "ok" as const : "neutro" as const,
  };
}

export const OrdersPipelineCard = memo(function OrdersPipelineCard({
  order, stage, isDraggable = false, canEdit = false, showAmounts = true,
  destinazioni = [], onMove, onPhaseChange, onDelete,
}: OrdersPipelineCardProps) {
  const navigate = useNavigate();
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const [preview, setPreview] = useState<"hover" | "pinned" | null>(null);
  const cancelTimer = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancelTimer, [cancelTimer]);

  const customerName = getCustomerName(order, t);
  const codice = order.order_code?.trim();
  const emailCliente = [order.customer?.email, order.client_email].map(emailVera)
    .find(email => email && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email));
  const oggettoEmail = codice ? `Commessa ${codice}` : "Aggiornamento commessa";
  const hrefEmail = emailCliente
    ? `mailto:${encodeURIComponent(emailCliente).replace("%40", "@")}?subject=${encodeURIComponent(oggettoEmail)}`
    : null;
  const label = codice || customerName;
  const descrizione = getOrderDescription(order, t);
  const urlCommessa = `/azienda/ordini/${order.id}`;
  const apriSezione = (destination: OrderDetailDestination) => ({
    pathname: urlCommessa,
    ...orderDetailLocation("", destination),
  });

  const labor = getLaborSummary(order);
  const materials = getMaterialSummary(order);
  const ritardo = ritardoLavori(order);
  const ritardoTesto = t(ritardo === 1 ? "1 giorno di ritardo" : "{n} giorni di ritardo", { n: ritardo });
  const periodoLavori = getWorkPeriodLabel(order, t);
  const dataPrevista = periodoLavori ?? (order.expected_date ? formatDateShort(order.expected_date) : null);
  const squadra = statoSquadra(labor.names, labor.employees.length > 0 || labor.internal.length > 0, labor.external.length > 0);
  const materiali = statoMateriali(materials.total, materials.ready, materials.toOrder);
  const fasiRiga = <RigaInfo label="Fasi" {...riepilogoConteggio(order.fasiPipeline, t("Da definire"), (fatti, totale) => t("{fatti}/{totale} completate", { fatti, totale }), t)} icon={<ClipboardCheck aria-hidden />} />;
  const ufficioRiga = <RigaInfo label="Task ufficio" {...riepilogoConteggio(order.taskUfficioPipeline, t("Nessuna attività"), (fatti, totale) => t("{fatti}/{totale} fatti", { fatti, totale }), t)} icon={<ListTodo aria-hidden />} />;
  const due = showAmounts ? getAmountDue(order) : 0;
  const collected = showAmounts ? getAmountCollected(order) : 0;
  const incassabile = collected + due;
  const valore = showAmounts ? formatCurrency(getGrossOrderAmount(order)) : null;
  const aMisura = order.order_type === "appaltatore_lavoro" && order.valorizzazione === "a_misura";
  const pagamento = statoIncasso(incassabile, collected, due);
  const passo = prossimoPasso({
    ritardo, lavoriCompletati: lavoriCompletati(order), daIncassare: due, incassato: collected,
    articoli: materials.total, pronti: materials.ready, daOrdinare: materials.toOrder,
  });
  const linkPasso = passo.destinazione ? apriSezione(passo.destinazione) : urlCommessa;
  const fasi = destinazioni.filter(fase => fase.id !== stage);
  const azioni: Array<{ label: string; icon: typeof Eye; destination: OrderDetailDestination }> = [
    ...(showAmounts ? [{ label: t("Fatture e incassi"), icon: Wallet, destination: PAGAMENTI }] : []),
    { label: t("Materiali"), icon: PackageCheck, destination: { tab: "articoli" } },
    { label: t("Cronoprogramma"), icon: CalendarDays, destination: PIANIFICAZIONE },
    { label: t("Squadra e lavorazioni"), icon: Users, destination: { tab: "cantiere", cantiereView: "lavorazioni" } },
  ];
  const importi = showAmounts && preview && (
    <dl className="grid grid-cols-3 gap-1.5 rounded-lg border bg-muted/15 px-2.5 py-2 text-[11px] tabular-nums">
      <div><dt className="text-muted-foreground">{t("Totale con IVA")}</dt><dd className="mt-0.5 break-words text-xs font-semibold">{valore}</dd></div>
      <div><dt className="text-muted-foreground">{t("Incassato")}</dt><dd className={cn("mt-0.5 break-words text-xs font-semibold", collected > 0 && TONO_TESTO.ok)}>{formatCurrency(collected)}</dd></div>
      <div><dt className="text-muted-foreground">{t("Da incassare")}</dt><dd className={cn("mt-0.5 break-words text-xs font-semibold", due > 0 && TONO_TESTO.attenzione)}>{formatCurrency(due)}</dd></div>
    </dl>
  );

  const dettagli = (
    <div className="space-y-1 px-2.5 pb-1.5 pt-2">
      <div>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <p dir="auto" className="min-w-0 truncate text-xs font-semibold leading-tight">{customerName}</p>
          {codice && <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">{codice}</span>}
        </div>
        <p dir="auto" className="mt-0.5 truncate text-[11px] text-muted-foreground">{descrizione}</p>
      </div>
      {valore && (
        <dl className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-muted-foreground">{aMisura ? t("Fatturato") : t("Importo contratto")}</dt>
          <dd className="text-right text-xs font-bold tabular-nums" title={t("IVA inclusa")}>{valore}</dd>
        </dl>
      )}
      {ritardo > 0 && <div className={cn("flex items-center gap-1 text-[11px]", TONO_TESTO.critico)}><AlertTriangle className="size-3 shrink-0" aria-hidden />{ritardoTesto}</div>}
      <dl className="grid gap-1 border-t pt-1.5">
        {fasiRiga}
        <RigaInfo label="Materiali" value={materiali.testo} tone={materiali.tono} icon={<PackageCheck aria-hidden />} />
        <RigaInfo label="Squadra" value={squadra.testo} tone={squadra.tono} icon={<Users aria-hidden />} />
        {ufficioRiga}
      </dl>
      <Link to={linkPasso} data-no-drag
        className={cn("flex w-fit max-w-full items-center gap-1 rounded-sm text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:underline",
          passo.tipo === "pronto" ? TONO_TESTO.ok : "text-primary")}>
        <ArrowRight className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{t(passo.testo)}</span>
      </Link>
    </div>
  );

  const aspetto = cn("min-w-0 rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm", ritardo > 0 && "border-l-2 border-l-orange-400");
  const anteprimaDrag = (
    <div className={aspetto}>
      {dettagli}
      <div className="flex items-center gap-0.5 border-t bg-muted/20 px-1.5 py-0.5">
        <span className={ACTION_CLASS}><Eye className="size-3.5" /></span>
        {hrefEmail && <span className={ACTION_CLASS}><Mail className="size-3.5" /></span>}
        {azioni.map(({ label: nome, icon: Icon }) => <span key={nome} className={ACTION_CLASS}><Icon className="size-3.5" /></span>)}
        {canEdit && <span className={ACTION_CLASS}><Pencil className="size-3.5" /></span>}
        {(onMove || (onPhaseChange && fasi.length > 0)) && <span className={ACTION_CLASS}><ArrowRightLeft className="size-3.5" /></span>}
        {onDelete && <span className={ACTION_CLASS}><Trash2 className="size-3.5" /></span>}
      </div>
    </div>
  );
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    disabled: !isDraggable,
    data: { stage, label, content: anteprimaDrag, getRect: () => cardRef.current?.getBoundingClientRect() },
  });
  useDndMonitor({
    onDragStart: () => {
      cancelTimer();
      setPreview(null);
    },
  });

  const mostraSpostamento = !!onPhaseChange && fasi.length > 0;
  const spostaProps = {
    "aria-label": t("Sposta commessa {commessa}", { commessa: label }),
    title: t("Sposta commessa"),
    className: ACTION_CLASS,
  };
  const chiudiAnteprima = () => {
    cancelTimer();
    setPreview(null);
  };
  const ritardaChiusura = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || preview === "pinned") return;
    cancelTimer();
    if (preview === "hover") timer.current = window.setTimeout(chiudiAnteprima, 250);
  };

  return (
    <Popover open={preview !== null} onOpenChange={(open) => { if (!open) chiudiAnteprima(); }}>
      <PopoverAnchor asChild>
        <div
          ref={node => { cardRef.current = node; setNodeRef(node); }}
          {...(isDraggable ? attributes : {})}
          role="group"
          tabIndex={0}
          aria-label={t("Apri dettagli commessa {commessa}", { commessa: label })}
          aria-roledescription={isDraggable ? t("scheda trascinabile") : undefined}
          className={cn(aspetto, "transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", isDragging && "opacity-30")}
          onDragStartCapture={event => event.preventDefault()}
          onMouseDown={event => {
            if (!isPipelineCardControl(event.target)) listeners?.onMouseDown?.(event);
          }}
          onTouchStart={event => {
            if (!isPipelineCardControl(event.target)) listeners?.onTouchStart?.(event);
          }}
          onClick={event => {
            if (!isDragging && !event.defaultPrevented && !isPipelineCardControl(event.target)) navigate(urlCommessa);
          }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || (!isDraggable && event.key === " ")) {
              event.preventDefault();
              navigate(urlCommessa);
              return;
            }
            listeners?.onKeyDown?.(event);
          }}
          onPointerLeave={ritardaChiusura}
        >
          <div onPointerEnter={event => {
            if (event.pointerType !== "mouse" || isDragging || preview === "pinned") return;
            cancelTimer();
            if (!preview) timer.current = window.setTimeout(() => setPreview("hover"), 650);
          }}>
            {dettagli}
          </div>
          <div className="flex items-center gap-0.5 rounded-b-xl border-t bg-muted/20 px-1.5 py-0.5" onPointerEnter={ritardaChiusura}>
            <button ref={previewButton} type="button" title={t("Anteprima")} aria-label={t("Anteprima commessa {commessa}", { commessa: label })}
              aria-haspopup="dialog" aria-expanded={preview !== null} className={ACTION_CLASS}
              onClick={() => { cancelTimer(); setPreview(preview === "pinned" ? null : "pinned"); }}>
              <Eye className="size-3.5" aria-hidden />
            </button>
            {hrefEmail && (
              <a href={hrefEmail} data-no-drag title={t("Scrivi al cliente")} aria-label={t("Scrivi al cliente · {commessa}", { commessa: label })} className={ACTION_CLASS}
                onClick={chiudiAnteprima}>
                <Mail className="size-3.5" aria-hidden />
              </a>
            )}
            {azioni.map(({ label: nome, icon: Icon, destination }) => (
              <Link key={nome} to={apriSezione(destination)} data-no-drag title={nome} aria-label={`${nome} · ${label}`} className={ACTION_CLASS}>
                <Icon className="size-3.5" aria-hidden />
              </Link>
            ))}
            {canEdit && (
              <Link to={`${urlCommessa}/modifica`} data-no-drag title={t("Modifica commessa")} aria-label={t("Modifica commessa {commessa}", { commessa: label })} className={ACTION_CLASS}>
                <Pencil className="size-3.5" aria-hidden />
              </Link>
            )}
            {mostraSpostamento ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" {...spostaProps}><ArrowRightLeft className="size-3.5" aria-hidden /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t("Sposta nella fase")}</DropdownMenuLabel>
                  {fasi.map(fase => (
                    <DropdownMenuItem key={fase.id} onClick={() => { chiudiAnteprima(); onPhaseChange?.(order.id, fase.id); }}>
                      {fase.label}
                    </DropdownMenuItem>
                  ))}
                  {onMove && <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { chiudiAnteprima(); onMove(order); }}>{t("Cambia pipeline…")}</DropdownMenuItem>
                  </>}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : onMove && (
              <button type="button" {...spostaProps} onClick={() => { chiudiAnteprima(); onMove(order); }}><ArrowRightLeft className="size-3.5" aria-hidden /></button>
            )}
            {onDelete && <button type="button" data-no-drag className={ACTION_CLASS} title={t("Sposta nel cestino")} aria-label={t("Elimina commessa {commessa}", { commessa: label })} onClick={() => { chiudiAnteprima(); onDelete(order); }}><Trash2 className="size-3.5" aria-hidden /></button>}
          </div>
        </div>
      </PopoverAnchor>

      {preview && (
        <PopoverContent
          aria-label={t("Riepilogo commessa {commessa}", { commessa: label })} side="right" align="start" sideOffset={8} collisionPadding={12}
          className="z-[80] max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-1.5rem))] overflow-auto rounded-xl p-0 shadow-xl"
          onOpenAutoFocus={event => { if (preview === "hover") event.preventDefault(); }}
          onCloseAutoFocus={event => event.preventDefault()}
          onEscapeKeyDown={() => { if (preview === "pinned") previewButton.current?.focus(); }}
          onPointerEnter={cancelTimer} onPointerLeave={ritardaChiusura}
        >
          <div className="relative rounded-t-xl border-b bg-muted/40 px-4 py-3.5 pr-12">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p dir="auto" className="text-sm font-bold">{customerName}</p>
              {codice && <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{codice}</span>}
            </div>
            <p dir="auto" className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground">{descrizione}</p>
            <span className="mt-2 inline-flex rounded-full bg-background px-2 py-0.5 text-[11px] font-medium ring-1 ring-border">
              {order.status?.name || t("Senza stato")}
            </span>
            <button type="button" aria-label={t("Chiudi riepilogo commessa")}
              className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => { chiudiAnteprima(); if (preview === "pinned") previewButton.current?.focus(); }}>
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <div className="space-y-3.5 p-4 text-xs">
            <dl className="grid gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-2">
              {fasiRiga}
              {ufficioRiga}
            </dl>
            {showAmounts && (
              <div className="space-y-1.5">
                {importi}
                <div className="flex justify-between gap-2 px-0.5 text-[11px] text-muted-foreground">
                  <span>{t("Pagamento · {tipo}", { tipo: t(getPaymentTypeLabel(order.payment_type)) })}</span>
                  <span className={cn("font-medium", TONO_TESTO[pagamento.tono])}>{t(pagamento.testo)}</span>
                </div>
              </div>
            )}
            <dl className="space-y-2.5">
              {order.indirizzo_lavori && <div className="flex items-start gap-2 text-muted-foreground"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" /><dt className="sr-only">{t("Indirizzo cantiere")}</dt><dd dir="auto">{order.indirizzo_lavori}</dd></div>}
              {dataPrevista && <div className="flex items-start gap-2">
                <CalendarDays aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div><dt className="font-semibold">{periodoLavori ? t("Lavori previsti") : t("Data prevista")}</dt><dd className="mt-0.5 text-muted-foreground">
                  {dataPrevista}
                  {ritardo > 0 && <span className={cn("ml-1.5", TONO_TESTO.critico)}>{ritardoTesto}</span>}
                </dd></div>
              </div>}
              <div className="flex items-start gap-2">
                <PackageCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div><dt className="font-semibold">{t("Materiali")}</dt><dd className="mt-0.5 text-muted-foreground">
                  <span className={TONO_TESTO[materiali.tono]}>{t(materiali.testo)}</span>
                  {materials.toOrder > 0 && ` · ${t("{n} da ordinare", { n: materials.toOrder })}`}
                  {order.warehouse_arrival_date && <span className="block">{t("Arrivo in magazzino {data}", { data: formatDateShort(order.warehouse_arrival_date) })}</span>}
                </dd></div>
              </div>
              <div className="flex items-start gap-2">
                <Users aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div><dt className="font-semibold">{t("Squadra")}</dt><dd className="mt-0.5 break-words text-muted-foreground">
                  {labor.names.length === 0 && t(squadra.testo)}
                  {labor.employees.length > 0 && <span className="block">{labor.employees.join(", ")}</span>}
                  {labor.internal.length > 0 && <span className="block">{t("Squadre interne · {nomi}", { nomi: labor.internal.join(", ") })}</span>}
                  {labor.external.length > 0 && <span className="block">{t("Subappalto · {nomi}", { nomi: labor.external.join(", ") })}</span>}
                </dd></div>
              </div>
            </dl>
            {passo.destinazione && (
              <Link to={linkPasso} className="flex items-start justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span><span className="block font-semibold text-primary">{t(passo.testo)}</span><span className="mt-0.5 block text-muted-foreground">{t(passo.motivo)}</span></span>
                <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              </Link>
            )}
            <Link to={urlCommessa} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              {t("Apri commessa")}
            </Link>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
});
