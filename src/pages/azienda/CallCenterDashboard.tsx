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
  new Date(valore.length === 10 ? `${valore}T12:00:00` : valore).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Europe/Rome",
  });

const percento = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("it-IT")}%`);
const numero = (v: number | null) => (v == null ? "—" : v.toLocaleString("it-IT"));

function nomeRiga(r: { nome: string | null; azienda: string | null; telefono: string }) {
  return r.nome || r.azienda || r.telefono;
}

function dettaglioRiga(r: RigaCoda): string {
  const esito = CALL_OUTCOMES.find((o) => o.value === r.ultimo_esito)?.label;
  const parti = [
    r.categoria === "richiamo" && r.richiamo_il ? `Richiamo del ${dataIt(r.richiamo_il)}` : null,
    r.categoria === "richiamo" && !r.richiamo_il ? "Da richiamare, senza data" : null,
    r.tentativi > 0 ? `${r.tentativi} ${r.tentativi === 1 ? "tentativo" : "tentativi"}` : null,
    esito && r.ultima_chiamata_at ? `${esito} il ${dataIt(r.ultima_chiamata_at)}` : null,
    r.tentativi === 0 ? `Arrivato il ${dataIt(r.arrivato_il)}` : null,
    r.fase,
  ];
  return parti.filter(Boolean).join(" · ");
}

function Riquadro({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{etichetta}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valore}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
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
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link
          to={`/azienda/marketing/contatti/${riga.contact_id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {nomeRiga(riga)}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{dettaglioRiga(riga)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <a href={`tel:${riga.telefono.replace(/\s+/g, "")}`} aria-label={`Chiama ${nomeRiga(riga)}`}>
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
          <span className="hidden sm:inline">Fissa appuntamento</span>
          <span className="sr-only sm:hidden">Fissa appuntamento</span>
        </Button>
      </div>
    </li>
  );
}

function NumeriPeriodo({ numeri }: { numeri: NumeriCallCenter }) {
  const i = indicatori(numeri);
  const conEsito = numeri.svolti_presentati + numeri.svolti_assenti;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Riquadro
        etichetta="Conversione sui raggiunti"
        valore={percento(i.appSuRaggiunti)}
        nota={`${numeri.appuntamenti_fissati} appuntamenti, ${numeri.contatti_raggiunti} contatti raggiunti`}
      />
      <Riquadro
        etichetta="Conversione sui lead assegnati"
        valore={percento(i.appSuAssegnati)}
        nota={`${numeri.lead_con_appuntamento} su ${numeri.lead_assegnati} lead arrivati nel periodo`}
      />
      <Riquadro
        etichetta="Prima chiamata (mediana)"
        valore={formattaMinuti(numeri.mediana_minuti)}
        nota={
          numeri.lead_assegnati
            ? `${numeri.lead_chiamati} chiamati su ${numeri.lead_assegnati} lead arrivati`
            : "Nessun lead arrivato nel periodo"
        }
      />
      <Riquadro
        etichetta="Chiamati entro 5 minuti"
        valore={percento(i.entro5Min)}
        nota={numeri.lead_chiamati ? `${numeri.entro_5_min} su ${numeri.lead_chiamati} lead chiamati` : "Nessun lead chiamato"}
      />
      <Riquadro
        etichetta="Chiamate al giorno"
        valore={numero(i.chiamateAlGiorno)}
        nota={`${numeri.chiamate} chiamate in ${numeri.giorni_attivi} giorni di lavoro`}
      />
      <Riquadro
        etichetta="Tentativi per contatto"
        valore={numero(i.tentativiPerContatto)}
        nota={`${numeri.contatti_chiamati} contatti chiamati`}
      />
      <Riquadro
        etichetta="Contatti raggiunti"
        valore={percento(i.contatto)}
        nota={`${numeri.contatti_raggiunti} su ${numeri.contatti_chiamati} chiamati`}
      />
      <Riquadro
        etichetta="Presenza agli appuntamenti"
        valore={percento(i.presenza)}
        nota={
          numeri.svolti_totale
            ? `Esito segnato su ${conEsito} appuntamenti di ${numeri.svolti_totale}`
            : "Nessun appuntamento a calendario nel periodo"
        }
      />
    </div>
  );
}

export default function CallCenterDashboard() {
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
        title: `Appuntamento ${nomeRiga(perAppuntamento)}`,
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
      <DashboardSelectorBar title="Dashboard Call Center" />

      <DashboardPageHeader
        title="Dashboard Call Center"
        subtitle="Chi chiamare adesso, gli appuntamenti fissati e i numeri del tuo lavoro"
        icon={Headphones}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {puoScegliere && (
              <Select value={operatore} onValueChange={setOperatore}>
                <SelectTrigger className="w-[200px]" aria-label="Operatore">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TUTTI}>{permissions.isAdmin ? "Tutto il team" : "I miei numeri"}</SelectItem>
                  {(operatori.data ?? []).map((o) => (
                    <SelectItem key={o.operatore_id} value={o.operatore_id}>
                      {o.nome || "Senza nome"}
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
            Da chiamare adesso{coda.data ? ` (${totaleUrgenti.toLocaleString("it-IT")})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {coda.isLoading && <Skeleton className="h-32 w-full" />}
          {coda.isError && (
            <p className="text-sm text-destructive">
              Non riesco a caricare la lista. Ricarica la pagina; se capita ancora, avvisa l'amministratore.
            </p>
          )}
          {coda.data && coda.data.righe.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nessun contatto da chiamare: non ci sono contatti assegnati in attesa di una chiamata.
            </p>
          )}
          {GRUPPI.map((gruppo) => {
            const righe = righePerGruppo.get(gruppo.id) ?? [];
            const totale = coda.data?.conteggi[gruppo.id] ?? 0;
            if (!totale) return null;
            return (
              <section key={gruppo.id} aria-label={gruppo.titolo}>
                <h3 className="text-sm font-semibold">
                  {gruppo.titolo} <span className="font-normal text-muted-foreground">({totale.toLocaleString("it-IT")})</span>
                </h3>
                <p className="text-xs text-muted-foreground">{gruppo.descrizione}</p>
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mostrati i primi {righe.length} su {totale.toLocaleString("it-IT")}.
                  </p>
                )}
              </section>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Oggi</CardTitle>
          </CardHeader>
          <CardContent>
            {numeriOggi.isLoading && <Skeleton className="h-20 w-full" />}
            {numeriOggi.isError && <p className="text-sm text-destructive">Non riesco a caricare i numeri di oggi.</p>}
            {numeriOggi.data && (
              <div className="grid grid-cols-3 gap-3">
                <Riquadro etichetta="Chiamate" valore={numero(numeriOggi.data.chiamate)} />
                <Riquadro etichetta="Raggiunti" valore={numero(numeriOggi.data.contatti_raggiunti)} />
                <Riquadro etichetta="Appuntamenti" valore={numero(numeriOggi.data.appuntamenti_fissati)} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Appuntamenti in arrivo</CardTitle>
          </CardHeader>
          <CardContent>
            {appuntamenti.isLoading && <Skeleton className="h-20 w-full" />}
            {appuntamenti.isError && <p className="text-sm text-destructive">Non riesco a caricare gli appuntamenti.</p>}
            {appuntamenti.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun appuntamento a calendario fissato da te.</p>
            )}
            <ul className="divide-y">
              {(appuntamenti.data ?? []).map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <p className="font-medium">
                    {dataIt(a.data)}
                    {a.ora ? ` alle ${a.ora.slice(0, 5)}` : ""} · {a.contatto || a.titolo || "Appuntamento"}
                  </p>
                  {a.assegnato_a && <p className="text-xs text-muted-foreground">Con {a.assegnato_a}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">I numeri del periodo</CardTitle>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[170px]" aria-label="Periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODI.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {numeriPeriodo.isLoading && <Skeleton className="h-40 w-full" />}
          {numeriPeriodo.isError && <p className="text-sm text-destructive">Non riesco a caricare i numeri del periodo.</p>}
          {numeriPeriodo.data && <NumeriPeriodo numeri={numeriPeriodo.data} />}
          {numeriPeriodo.data?.chiamate === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">Nessuna chiamata registrata in questo periodo.</p>
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
