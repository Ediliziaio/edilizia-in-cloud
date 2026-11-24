/**
 * Dashboard Call Center: la pagina da cui l'operatore lavora.
 * In alto chi chiamare adesso, sotto la giornata, in fondo i numeri del periodo.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Headphones, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { LogCallButton, CALL_OUTCOMES } from "@/components/marketing/LogCallButton";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAppuntamentiCallCenter,
  useCodaCallCenter,
  useNumeriCallCenter,
  useOperatoriCallCenter,
  type CategoriaCoda,
  type NumeriCallCenter,
  type RigaCoda,
} from "@/hooks/useCallCenterDashboard";
import { formattaMinuti, indicatori } from "@/lib/reporting/callCenterNumeri";
import { AnelloPercentuale, PillolaVariazione } from "@/components/charts/grafici/comune";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import type { Traduttore } from "@/lib/campo/lingua/traduttore";

const GRUPPI: { id: CategoriaCoda; titolo: string; descrizione: string }[] = [
  { id: "richiamo", titolo: "Richiami", descrizione: "Scaduti o fissati per oggi" },
  { id: "nuovo", titolo: "Lead nuovi", descrizione: "Mai chiamati, arrivati negli ultimi 30 giorni" },
  { id: "ritentare", titolo: "Da ritentare", descrizione: "Non hanno risposto: ultimo tentativo da almeno 4 ore" },
  { id: "arretrato", titolo: "Arretrato", descrizione: "Mai chiamati, arrivati da più di 30 giorni" },
];

const PERIODI = [
  { id: "7", label: "Ultimi 7 giorni", giorni: 7 },
  { id: "30", label: "Ultimi 30 giorni", giorni: 30 },
  { id: "90", label: "Ultimi 90 giorni", giorni: 90 },
];

const TUTTI = "tutti";

/** YYYY-MM-DD nel fuso dell'Italia, come le funzioni sul database. */
function giornoItalia(indietro = 0): string {
  const d = new Date(Date.now() - indietro * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

const dataIt = (valore: string) =>
  new Date(valore.length === 10 ? `${valore}T12:00:00` : valore).toLocaleDateString(intlCampo(), {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Rome",
  });

const percento = (v: number | null) => (v == null ? "—" : `${v.toLocaleString(intlCampo())}%`);
const numero = (v: number | null) => (v == null ? "—" : v.toLocaleString(intlCampo()));

function nomeRiga(r: { nome: string | null; azienda: string | null; telefono: string }) {
  return r.nome || r.azienda || r.telefono;
}

function dettaglioRiga(r: RigaCoda, t: Traduttore): string {
  const esito = CALL_OUTCOMES.find((o) => o.value === r.ultimo_esito)?.label;
  const parti = [
    r.categoria === "richiamo" && r.richiamo_il ? t("Richiamo del {data}", { data: dataIt(r.richiamo_il) }) : null,
    r.categoria === "richiamo" && !r.richiamo_il ? t("Da richiamare, senza data") : null,
    r.tentativi > 0 ? t(r.tentativi === 1 ? "{n} tentativo" : "{n} tentativi", { n: r.tentativi }) : null,
    esito && r.ultima_chiamata_at ? t("{esito} il {data}", { esito: t(esito), data: dataIt(r.ultima_chiamata_at) }) : null,
    r.tentativi === 0 ? t("Arrivato il {data}", { data: dataIt(r.arrivato_il) }) : null,
    r.fase,
  ];
  return parti.filter(Boolean).join(" · ");
}

interface Variazione {
  valore: number | null;
  piuEMeglio?: boolean;
  unita?: string;
}

/** Differenza fra due valori: in punti per le percentuali, relativa per i conteggi. */
function differenza(ora: number | null, prima: number | null, punti: boolean): number | null {
  if (ora == null || prima == null) return null;
  if (punti) return ora - prima;
  return prima === 0 ? null : ((ora - prima) / Math.abs(prima)) * 100;
}

function Riquadro({
  etichetta, valore, nota, variazione, anello,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  variazione?: Variazione;
  /** Percentuale da disegnare nell'anello accanto al numero. */
  anello?: number | null;
}) {
  const t = useT();
  return (
    <div className="flex h-full min-w-0 items-start justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-sm sm:p-3 transition-shadow hover:shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:fill-mode-both">
      <div className="min-w-0">
        <p className="break-words text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground sm:text-[11px]">{etichetta}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-xl font-bold tabular-nums tracking-tight">{valore}</p>
          {variazione && (
            <PillolaVariazione
              pct={variazione.valore}
              piuEMeglio={variazione.piuEMeglio ?? true}
              unita={variazione.unita}
              titolo={t("Rispetto al periodo precedente, della stessa durata")}
            />
          )}
        </div>
        {nota && <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{nota}</p>}
      </div>
      {anello != null && <span className="hidden sm:block"><AnelloPercentuale pct={anello} /></span>}
    </div>
  );
}

/**
 * Dalla chiamata all'appuntamento: una barra per passaggio, larga quanto il
 * numero rispetto alle chiamate, con la percentuale sul passaggio prima.
 */
function PercorsoChiamate({ numeri }: { numeri: NumeriCallCenter }) {
  const t = useT();
  const passi = [
    { nome: "Chiamate fatte", n: numeri.chiamate, colore: "from-blue-500 to-sky-400" },
    { nome: "Contatti chiamati", n: numeri.contatti_chiamati, colore: "from-sky-500 to-cyan-400" },
    { nome: "Contatti raggiunti", n: numeri.contatti_raggiunti, colore: "from-teal-500 to-emerald-400" },
    { nome: "Appuntamenti fissati", n: numeri.appuntamenti_fissati, colore: "from-emerald-500 to-lime-400" },
    { nome: "Presentati", n: numeri.svolti_presentati, colore: "from-amber-500 to-yellow-400" },
  ];
  const max = Math.max(1, ...passi.map((p) => p.n));
  return (
    <ol className="space-y-1.5">
      {passi.map((p, i) => {
        const prima = i > 0 ? passi[i - 1].n : null;
        const quota = prima ? Math.round((p.n / prima) * 100) : null;
        return (
          <li key={p.nome} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:gap-3">
            <span className="truncate text-muted-foreground">{t(p.nome)}</span>
            <span className="h-5 overflow-hidden rounded-md bg-muted">
              <span
                className={cn("cg-barra-cresce block h-full rounded-md bg-gradient-to-r", p.colore)}
                style={{ width: `${Math.max(p.n > 0 ? 2 : 0, (p.n / max) * 100)}%`, animationDelay: `${250 + i * 90}ms` }}
              />
            </span>
            <span className="text-right tabular-nums sm:w-24">
              <strong className="text-sm text-foreground">{p.n.toLocaleString(intlCampo())}</strong>
              {quota != null && <span className="ml-1.5 text-muted-foreground">{quota}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RigaContatto({
  riga,
  onChiamataRegistrata,
  onFissa,
  companyId,
  userId,
}: {
  riga: RigaCoda;
  onChiamataRegistrata: () => void;
  onFissa: (riga: RigaCoda) => void;
  companyId: string | null | undefined;
  userId: string | undefined;
}) {
  const t = useT();
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          to={`/azienda/marketing/contatti/${riga.contact_id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {nomeRiga(riga)}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{dettaglioRiga(riga, t)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <a href={`tel:${riga.telefono.replace(/\s+/g, "")}`} aria-label={t("Chiama {nome}", { nome: nomeRiga(riga) })}>
            <Phone className="mr-1.5 h-4 w-4" />
            {riga.telefono}
          </a>
        </Button>
        <LogCallButton
          companyId={companyId}
          contactId={riga.contact_id}
          userId={userId}
          opportunityId={riga.opportunita_id}
          onLogged={onChiamataRegistrata}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => onFissa(riga)}>
          <CalendarPlus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">{t("Fissa appuntamento")}</span>
          <span className="sr-only sm:hidden">{t("Fissa appuntamento")}</span>
        </Button>
      </div>
    </li>
  );
}

function NumeriPeriodo({ numeri, prima }: { numeri: NumeriCallCenter; prima?: NumeriCallCenter }) {
  const t = useT();
  const i = indicatori(numeri);
  const p = prima ? indicatori(prima) : null;
  const conEsito = numeri.svolti_presentati + numeri.svolti_assenti;
  const v = (ora: number | null, prec: number | null | undefined, punti = true, piuEMeglio = true): Variazione | undefined =>
    p ? { valore: differenza(ora, prec ?? null, punti), unita: punti ? " pt" : "%", piuEMeglio } : undefined;
  return (
    <div className="space-y-4">
    {numeri.chiamate > 0 && (
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Dalla chiamata all'appuntamento")}</p>
        <PercorsoChiamate numeri={numeri} />
      </div>
    )}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Riquadro
        etichetta={t("Conversione sui raggiunti")}
        valore={percento(i.appSuRaggiunti)}
        anello={i.appSuRaggiunti}
        variazione={v(i.appSuRaggiunti, p?.appSuRaggiunti)}
        nota={t("{appuntamenti_fissati} appuntamenti, {contatti_raggiunti} contatti raggiunti", { appuntamenti_fissati: String(numeri.appuntamenti_fissati ?? ""), contatti_raggiunti: String(numeri.contatti_raggiunti ?? "") })}
      />
      <Riquadro
        etichetta={t("Conversione sui lead assegnati")}
        valore={percento(i.appSuAssegnati)}
        anello={i.appSuAssegnati}
        variazione={v(i.appSuAssegnati, p?.appSuAssegnati)}
        nota={t("{lead_con_appuntamento} su {lead_assegnati} lead arrivati nel periodo", { lead_con_appuntamento: String(numeri.lead_con_appuntamento ?? ""), lead_assegnati: String(numeri.lead_assegnati ?? "") })}
      />
      <Riquadro
        etichetta={t("Prima chiamata (mediana)")}
        valore={formattaMinuti(numeri.mediana_minuti)}
        variazione={v(numeri.mediana_minuti, prima?.mediana_minuti, false, false)}
        nota={
          numeri.lead_assegnati
            ? t("{lead_chiamati} chiamati su {lead_assegnati} lead arrivati", { lead_chiamati: String(numeri.lead_chiamati ?? ""), lead_assegnati: String(numeri.lead_assegnati ?? "") })
            : t("Nessun lead arrivato nel periodo")
        }
      />
      <Riquadro
        etichetta={t("Chiamati entro 5 minuti")}
        valore={percento(i.entro5Min)}
        anello={i.entro5Min}
        variazione={v(i.entro5Min, p?.entro5Min)}
        nota={numeri.lead_chiamati ? t("{entro_5_min} su {lead_chiamati} lead chiamati", { entro_5_min: String(numeri.entro_5_min ?? ""), lead_chiamati: String(numeri.lead_chiamati ?? "") }) : t("Nessun lead chiamato")}
      />
      <Riquadro
        etichetta={t("Chiamate al giorno")}
        valore={numero(i.chiamateAlGiorno)}
        variazione={v(i.chiamateAlGiorno, p?.chiamateAlGiorno, false)}
        nota={t("{chiamate} chiamate in {giorni_attivi} giorni di lavoro", { chiamate: String(numeri.chiamate ?? ""), giorni_attivi: String(numeri.giorni_attivi ?? "") })}
      />
      <Riquadro
        etichetta={t("Tentativi per contatto")}
        valore={numero(i.tentativiPerContatto)}
        nota={t("{contatti_chiamati} contatti chiamati", { contatti_chiamati: String(numeri.contatti_chiamati ?? "") })}
      />
      <Riquadro
        etichetta={t("Contatti raggiunti")}
        valore={percento(i.contatto)}
        anello={i.contatto}
        variazione={v(i.contatto, p?.contatto)}
        nota={t("{contatti_raggiunti} su {contatti_chiamati} chiamati", { contatti_raggiunti: String(numeri.contatti_raggiunti ?? ""), contatti_chiamati: String(numeri.contatti_chiamati ?? "") })}
      />
      <Riquadro
        etichetta={t("Presenza agli appuntamenti")}
        valore={percento(i.presenza)}
        anello={i.presenza}
        variazione={v(i.presenza, p?.presenza)}
        nota={
          numeri.svolti_totale
            ? t("Esito segnato su {conEsito} appuntamenti di {svolti_totale}", { conEsito: String(conEsito ?? ""), svolti_totale: String(numeri.svolti_totale ?? "") })
            : t("Nessun appuntamento a calendario nel periodo")
        }
      />
    </div>
    </div>
  );
}

export default function CallCenterDashboard() {
  const t = useT();
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();
  const permissions = usePermissions();
  const queryClient = useQueryClient();

  const [operatore, setOperatore] = useState<string>(TUTTI);
  const [periodo, setPeriodo] = useState("30");
  const [perAppuntamento, setPerAppuntamento] = useState<RigaCoda | null>(null);

  const operatori = useOperatoriCallCenter();
  const puoScegliere = permissions.isAdmin || (operatori.data?.length ?? 0) > 1;
  const operatoreId = operatore === TUTTI ? null : operatore;

  const oggi = giornoItalia();
  const giorniPeriodo = PERIODI.find((p) => p.id === periodo)?.giorni ?? 30;
  const inizioPeriodo = giornoItalia(giorniPeriodo - 1);

  const coda = useCodaCallCenter(operatoreId);
  const numeriOggi = useNumeriCallCenter(operatoreId, oggi, oggi);
  const numeriPeriodo = useNumeriCallCenter(operatoreId, inizioPeriodo, oggi);
  // Lo stesso numero di giorni subito prima, per la variazione sui riquadri.
  const numeriPrima = useNumeriCallCenter(operatoreId, giornoItalia(2 * giorniPeriodo - 1), giornoItalia(giorniPeriodo));
  const appuntamenti = useAppuntamentiCallCenter(operatoreId);

  const righePerGruppo = useMemo(() => {
    const mappa = new Map<CategoriaCoda, RigaCoda[]>();
    for (const r of coda.data?.righe ?? []) mappa.set(r.categoria, [...(mappa.get(r.categoria) ?? []), r]);
    return mappa;
  }, [coda.data]);

  const totaleUrgenti =
    (coda.data?.conteggi.richiamo ?? 0) + (coda.data?.conteggi.nuovo ?? 0) + (coda.data?.conteggi.ritentare ?? 0);

  const aggiorna = () => {
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("callcenter-"),
    });
  };

  const appuntamentoIniziale: AppointmentData | null = perAppuntamento
    ? {
        title: t("Appuntamento {nome}", { nome: nomeRiga(perAppuntamento) }),
        description: null,
        appointment_date: "",
        appointment_time: null,
        appointment_type: "generico",
        assigned_to: null,
        order_id: null,
        is_completed: false,
        contact_id: perAppuntamento.contact_id,
      }
    : null;

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <DashboardSelectorBar title={t("Dashboard Call Center")} />

      <DashboardPageHeader
        title={t("Dashboard Call Center")}
        subtitle={t("Chi chiamare adesso, gli appuntamenti fissati e i numeri del tuo lavoro")}
        icon={Headphones}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {puoScegliere && (
              <Select value={operatore} onValueChange={setOperatore}>
                <SelectTrigger className="w-[200px]" aria-label={t("Operatore")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>{permissions.isAdmin ? t("Tutto il team") : t("I miei numeri")}</SelectItem>
                  {(operatori.data ?? []).map((o) => (
                    <SelectItem key={o.operatore_id} value={o.operatore_id}>
                      {o.nome || t("Senza nome")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("Da chiamare adesso")}{coda.data ? ` (${totaleUrgenti.toLocaleString(intlCampo())})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {coda.isLoading && <Skeleton className="h-32 w-full" />}
          {coda.isError && (
            <p className="text-sm text-destructive">
              {t("Non riesco a caricare la lista. Ricarica la pagina; se capita ancora, avvisa l'amministratore.")}
            </p>
          )}
          {coda.data && coda.data.righe.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("Nessun contatto da chiamare: non ci sono contatti assegnati in attesa di una chiamata.")}
            </p>
          )}
          {GRUPPI.map((gruppo) => {
            const righe = righePerGruppo.get(gruppo.id) ?? [];
            const totale = coda.data?.conteggi[gruppo.id] ?? 0;
            if (!totale) return null;
            return (
              <section key={gruppo.id} aria-label={t(gruppo.titolo)}>
                <h3 className="text-sm font-semibold">
                  {t(gruppo.titolo)} <span className="font-normal text-muted-foreground">({totale.toLocaleString(intlCampo())})</span>
                </h3>
                <p className="text-xs text-muted-foreground">{t(gruppo.descrizione)}</p>
                <ul className="mt-1 divide-y">
                  {righe.map((r) => (
                    <RigaContatto
                      key={r.contact_id}
                      riga={r}
                      companyId={companyId}
                      userId={user?.id}
                      onChiamataRegistrata={aggiorna}
                      onFissa={setPerAppuntamento}
                    />
                  ))}
                </ul>
                {totale > righe.length && (
                  <p className="mt-1 text-xs text-muted-foreground">{t("Mostrati i primi {n} su {totale}.", { n: righe.length, totale: totale.toLocaleString(intlCampo()) })}</p>
                )}
              </section>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("Oggi")}</CardTitle>
          </CardHeader>
          <CardContent>
            {numeriOggi.isLoading && <Skeleton className="h-20 w-full" />}
            {numeriOggi.isError && <p className="text-sm text-destructive">{t("Non riesco a caricare i numeri di oggi.")}</p>}
            {numeriOggi.data && (
              <div className="grid grid-cols-3 gap-3">
                <Riquadro etichetta={t("Chiamate")} valore={numero(numeriOggi.data.chiamate)} />
                <Riquadro etichetta={t("Raggiunti")} valore={numero(numeriOggi.data.contatti_raggiunti)} />
                <Riquadro etichetta={t("Fissati")} valore={numero(numeriOggi.data.appuntamenti_fissati)} nota={t("appuntamenti")} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("Appuntamenti in arrivo")}</CardTitle>
          </CardHeader>
          <CardContent>
            {appuntamenti.isLoading && <Skeleton className="h-20 w-full" />}
            {appuntamenti.isError && <p className="text-sm text-destructive">{t("Non riesco a caricare gli appuntamenti.")}</p>}
            {appuntamenti.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("Nessun appuntamento a calendario fissato da te.")}</p>
            )}
            <ul className="divide-y">
              {(appuntamenti.data ?? []).map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <p className="font-medium">
                    {dataIt(a.data)}
                    {a.ora ? ` ${t("alle {ora}", { ora: a.ora.slice(0, 5) })}` : ""} · {a.contatto || a.titolo || t("Appuntamento")}
                  </p>
                  {a.assegnato_a && <p className="text-xs text-muted-foreground">{t("Con {nome}", { nome: String(a.assegnato_a ?? "") })}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">{t("I numeri del periodo")}</CardTitle>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[170px]" aria-label={t("Periodo")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODI.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {t(p.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {numeriPeriodo.isLoading && <Skeleton className="h-40 w-full" />}
          {numeriPeriodo.isError && <p className="text-sm text-destructive">{t("Non riesco a caricare i numeri del periodo.")}</p>}
          {numeriPeriodo.data && <NumeriPeriodo numeri={numeriPeriodo.data} prima={numeriPrima.data} />}
          {numeriPeriodo.data?.chiamate === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">{t("Nessuna chiamata registrata in questo periodo.")}</p>
          )}
        </CardContent>
      </Card>

      <AppointmentDialog
        open={!!perAppuntamento}
        onOpenChange={(aperto) => !aperto && setPerAppuntamento(null)}
        initialData={appuntamentoIniziale}
        onSaved={() => {
          setPerAppuntamento(null);
          aggiorna();
        }}
      />
    </div>
  );
}
