import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import {
  AlertTriangle, Banknote, Bell, CalendarClock, Check, CheckCheck, CheckSquare, ChevronDown,
  ChevronRight, FileCheck, HardHat, MessageSquare, Package, Percent, RefreshCw, Settings, Truck, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PannelloNotifiche } from "@/components/notifications/PannelloNotifiche";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { isNative } from "@/lib/mobile/platform";
import { percorsoNotifica } from "@/lib/notifiche/percorsoNotifica";
import { cn } from "@/lib/utils";
// Lingua dell'operaio nell'area campo; fuori dal campo t() restituisce l'italiano (l'ufficio non cambia).
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { traduciTestoNotifica } from "@/lib/campo/lingua/notifiche";

const typeConfig: Record<string, { icon: typeof Bell; bg: string; fg: string }> = {
  ticket_new: { icon: MessageSquare, bg: "bg-blue-50 ring-blue-200", fg: "text-blue-600" },
  ticket_reply: { icon: MessageSquare, bg: "bg-blue-50 ring-blue-200", fg: "text-blue-600" },
  // Messaggio arrivato in Conversazioni (WhatsApp, email, SMS, Messenger…).
  conversazione_messaggio: { icon: MessageSquare, bg: "bg-emerald-50 ring-emerald-200", fg: "text-emerald-600" },
  order_status_changed: { icon: Package, bg: "bg-orange-50 ring-orange-200", fg: "text-orange-600" },
  task_assigned: { icon: CheckSquare, bg: "bg-purple-50 ring-purple-200", fg: "text-purple-600" },
  task_due: { icon: CheckSquare, bg: "bg-purple-50 ring-purple-200", fg: "text-purple-600" },
  installment_due: { icon: Banknote, bg: "bg-emerald-50 ring-emerald-200", fg: "text-emerald-600" },
  quote_approval_requested: { icon: Percent, bg: "bg-orange-50 ring-orange-200", fg: "text-orange-600" },
  quote_approval_approved: { icon: Percent, bg: "bg-emerald-50 ring-emerald-200", fg: "text-emerald-600" },
  quote_approval_rejected: { icon: Percent, bg: "bg-rose-50 ring-rose-200", fg: "text-rose-600" },
  quote_approval_counter_proposed: { icon: Percent, bg: "bg-blue-50 ring-blue-200", fg: "text-blue-600" },
  hr_scadenza: { icon: CalendarClock, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-600" },
  mezzo_scadenza: { icon: Truck, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-600" },
  mezzo_segnalazione: { icon: Wrench, bg: "bg-red-50 ring-red-200", fg: "text-red-600" },
  // Le carte della ditta: ISO, SOA, DURC, visura, polizze, iscrizioni.
  documento_azienda: { icon: FileCheck, bg: "bg-sky-50 ring-sky-200", fg: "text-sky-600" },
  // Sicurezza del cantiere: DURC delle ditte, fascicolo, documenti, adempimenti.
  sicurezza_scadenza: { icon: HardHat, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-700" },
  // Avvisi di vita azienda (cash flow, trial, inattività): erano un banner
  // fisso in cima a ogni pagina, ora vivono qui dentro.
  lifecycle: { icon: AlertTriangle, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-600" },
  generic: { icon: Bell, bg: "bg-slate-50 ring-slate-200", fg: "text-slate-600" },
};

const periodi = ["Oggi", "Ieri", "Questa settimana", "Precedenti"] as const;
type Periodo = typeof periodi[number];

function periodo(iso: string): Periodo {
  const date = new Date(iso);
  if (isToday(date)) return "Oggi";
  if (isYesterday(date)) return "Ieri";
  if (isThisWeek(date, { weekStartsOn: 1 })) return "Questa settimana";
  return "Precedenti";
}

function NotificaRiga({ voce, apri, chiudi, leggi, online }: {
  voce: Notification; apri: (voce: Notification) => void; chiudi: (id: string) => void; leggi: (id: string) => void; online: boolean;
}) {
  const t = useT();
  const titolo = traduciTestoNotifica(voce.title, t);
  const corpo = traduciTestoNotifica(voce.body, t);
  const url = percorsoNotifica(voce.action_url, window.location.origin, isNative);
  const { icon: Icon, bg, fg } = typeConfig[voce.type]
    ?? (url?.startsWith("/azienda/scadenzario") ? typeConfig.installment_due : typeConfig.generic);
  const avviso = voce.type === "lifecycle";
  const nonLetta = !voce.is_read;
  const urlValido = !!url;
  const data = new Date(voce.created_at);
  const apribile = urlValido || (nonLetta && !avviso && online);
  const dettaglio = <>
    <span aria-hidden="true" className={cn("relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1", bg, fg)}>
      <Icon className="size-4" />
      {nonLetta && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-1 ring-background" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className={cn("block break-words text-sm leading-snug", nonLetta ? "font-semibold" : "font-medium")} dir="auto">{titolo}</span>
      {corpo && <span className="mt-0.5 block whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]" dir="auto">{corpo}</span>}
      {!Number.isNaN(data.getTime()) && <time className="mt-1 block text-xs text-muted-foreground" dateTime={voce.created_at}>
        {formatDistanceToNow(data, { addSuffix: true, locale: dateFnsCampo() })}
      </time>}
    </span>
  </>;
  const riga = "flex min-h-14 min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left";
  return <li className={cn("flex min-w-0 items-start border-l-2", nonLetta ? "border-primary bg-primary/5" : "border-transparent")}>
    {apribile ? <button type="button" onClick={() => apri(voce)} className={cn(riga, "hover:bg-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
      {dettaglio}
    </button> : <div className={riga}>{dettaglio}</div>}
    <div className="flex shrink-0 pr-1">
      {nonLetta && !avviso && <Button type="button" variant="ghost" size="icon" className="size-11 md:size-9"
        aria-label={t("Segna come letta · {titolo}", { titolo })} title={t("Segna come letta")} disabled={!online} onClick={() => leggi(voce.id)}>
        <Check className="size-4" aria-hidden="true" />
      </Button>}
      <Button type="button" variant="ghost" size="icon" className="size-11 md:size-9"
        aria-label={t(avviso ? "Chiudi avviso · {titolo}" : "Nascondi notifica · {titolo}", { titolo })} title={t(avviso ? "Chiudi avviso" : "Nascondi notifica")}
        disabled={!online} onClick={() => chiudi(voce.id)}>
        <X className="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
    </div>
  </li>;
}

function RaggruppaNotifiche({ elenco, raggruppa, ...azioni }: {
  elenco: Notification[]; raggruppa: boolean;
} & Omit<Parameters<typeof NotificaRiga>[0], "voce">) {
  const t = useT();
  const gruppi = new Map<string, Notification[]>();
  for (const n of elenco) {
    const chiave = raggruppa && n.entity_type && n.entity_id ? `${n.entity_type}:${n.entity_id}` : n.id;
    const voci = gruppi.get(chiave);
    if (voci) voci.push(n);
    else gruppi.set(chiave, [n]);
  }
  return <ul className="divide-y divide-border/70">
    {[...gruppi].map(([chiave, voci]) => voci.length === 1
      ? <NotificaRiga key={chiave} voce={voci[0]} {...azioni} />
      : <li key={chiave}>
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium" dir="auto">{traduciTestoNotifica(voci[0].title, t)}</span>
              <span className="block text-xs text-muted-foreground">{t("{n} aggiornamenti", { n: voci.length })}</span></span>
          </summary>
          <ul className="ml-3 divide-y border-l">{voci.map(voce => <NotificaRiga key={voce.id} voce={voce} {...azioni} />)}</ul>
        </details>
      </li>)}
  </ul>;
}

export function NotificationsBellPopover({ badgePronti = true, className, avvisiAzienda = true,
  trasformaLink, preferenze = "/azienda/impostazioni/notifiche" }: {
  badgePronti?: boolean; className?: string; avvisiAzienda?: boolean;
  trasformaLink?: (url: string) => string; preferenze?: string | null;
}) {
  const t = useT();
  const navigate = useNavigate();
  const telefono = useIsMobile();
  const online = useNetworkStatus();
  const [open, setOpen] = useState(false);
  const [soloNonLette, setSoloNonLette] = useState(false);
  const { notifications, unreadCount, unreadMessagesCount, isLoading, isError, isRefreshing, isMarkingAll,
    markAsRead, markAllAsRead, dismiss, refresh } = useNotifications(badgePronti || open, { elenco: open, avvisiAzienda });

  const gruppi = useMemo(() => {
    const data = new Map<Periodo, Notification[]>();
    for (const notifica of notifications) {
      if (soloNonLette && notifica.is_read) continue;
      const chiave = periodo(notifica.created_at);
      const elenco = data.get(chiave);
      if (elenco) elenco.push(notifica);
      else data.set(chiave, [notifica]);
    }
    return data;
  }, [notifications, soloNonLette]);

  function apri(voce: Notification) {
    if (!voce.is_read && voce.type !== "lifecycle" && online) markAsRead(voce.id);
    const url = percorsoNotifica(voce.action_url, window.location.origin, isNative);
    if (url) {
      setOpen(false);
      navigate(trasformaLink ? trasformaLink(url) : url);
    }
  }

  const trigger = <Button type="button" variant="ghost" size="icon" title={t("Notifiche")}
    className={cn("relative size-11 shrink-0 md:size-9", className)}
    aria-label={unreadCount ? t("Notifiche, {n} da leggere o gestire", { n: unreadCount }) : t("Notifiche")}>
    <Bell className={cn("size-4", unreadCount > 0 && "text-primary")} aria-hidden="true" />
    {unreadCount > 0 && <span aria-hidden="true"
      className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground ring-2 ring-background">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>}
  </Button>;

  return <PannelloNotifiche aperto={open} onOpenChange={setOpen} trigger={trigger}>
    <div className="shrink-0 space-y-1.5 border-b bg-background px-3 pb-2">
      <div className="flex min-h-9 items-center justify-between gap-1 max-md:pr-11 md:pt-2">
        <h2 className="text-base font-semibold">{t("Notifiche")}</h2>
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={t("Aggiorna notifiche")}
          title={t("Aggiorna notifiche")} disabled={!online || isRefreshing} onClick={() => void refresh()}>
          <RefreshCw className={cn("size-4", isRefreshing && "motion-safe:animate-spin")} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant={soloNonLette ? "ghost" : "secondary"}
          className="min-h-11 px-2.5 md:min-h-8" aria-pressed={!soloNonLette} onClick={() => setSoloNonLette(false)}>{t("Tutte")}</Button>
        <Button type="button" size="sm" variant={soloNonLette ? "secondary" : "ghost"}
          className="min-h-11 px-2.5 md:min-h-8" aria-pressed={soloNonLette} onClick={() => setSoloNonLette(true)}>
          {t("Da leggere")}{unreadCount > 0 && ` · ${unreadCount > 99 ? "99+" : unreadCount}`}
        </Button>
        {unreadMessagesCount > 0 && <Button type="button" size="sm" variant="ghost"
          className="ml-auto min-h-11 gap-1 px-2 text-xs md:min-h-8" disabled={!online || isMarkingAll}
          onClick={() => markAllAsRead()}><CheckCheck className="size-4 shrink-0" aria-hidden="true" /> {t("Tutte lette")}</Button>}
      </div>
      {!online && <p role="status" className="px-1 text-xs text-muted-foreground">{t("Sei offline. Le notifiche si aggiornano al ritorno della rete.")}</p>}
      {isError && <p role="alert" className="px-1 text-xs text-destructive">{t("Non riesco ad aggiornare le notifiche. Tocca Aggiorna per riprovare.")}</p>}
    </div>
    <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain" aria-label={t("Elenco notifiche")}>
      {gruppi.size === 0 && (isLoading && online
        ? <p role="status" className="p-6 text-center text-sm text-muted-foreground">{t("Carico le notifiche…")}</p>
        : online && !isError && <p className="p-6 text-center text-sm text-muted-foreground">
          {soloNonLette ? t("Nessuna notifica da leggere.") : t("Nessuna notifica recente.")}
        </p>)}
      {periodi.map(chiave => {
        const elenco = gruppi.get(chiave);
        return elenco && <section key={chiave} aria-label={t(chiave)}>
          <h3 className="sticky top-0 z-10 border-b bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">{t(chiave)}</h3>
          <RaggruppaNotifiche elenco={elenco} raggruppa={!telefono} apri={apri} chiudi={dismiss} leggi={markAsRead} online={online} />
        </section>;
      })}
    </div>
    {preferenze && <Link to={preferenze} onClick={() => setOpen(false)}
      className="flex min-h-11 shrink-0 items-center gap-2 border-t bg-background px-3 text-sm font-medium hover:bg-muted">
      <Settings className="size-4" aria-hidden="true" /> {t("Preferenze notifiche")} <ChevronRight className="ml-auto size-4" aria-hidden="true" />
    </Link>}
  </PannelloNotifiche>;
}
