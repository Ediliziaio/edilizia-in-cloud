/**
 * Scheda Indici avanzati: imposte stimate, giorni di incasso/pagamento/magazzino
 * (DSO/DPO/DSI) e ciclo del circolante, Z-score di Altman, copertura delle rate
 * (DSCR). Sono i numeri che la banca chiede per un fido o un mutuo.
 *
 * Gli indici legati al tempo si ricalcolano qui sui giorni del periodo
 * (anno in corso = giorni trascorsi): prima si moltiplicavano per 365 i ricavi
 * di 10 mesi. Z-score e DSCR sono «provvisori» finché lo Stato patrimoniale
 * non quadra, come il Rating.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useIndiciAvanzati } from "@/hooks/controlloGestione/useIndiciAvanzati";
import { useImposte } from "@/hooks/controlloGestione/useImposte";
import { useStatoPatrimoniale } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import {
  calcolaDscr,
  calcolaRotazione,
  ETICHETTA_DSCR,
  formatEuro,
  formatGiorni,
  formatNumero,
  formatPct,
  formatVolte,
  giorniPeriodo,
  giudizioCcc,
  giudizioDpo,
  giudizioDsi,
  giudizioDso,
  type Giudizio,
} from "@/lib/controlloGestione/indiciBanca";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Calendar, Shield, Banknote, Clock, TrendingUp, AlertTriangle, Receipt, Package } from "lucide-react";

interface Props {
  anno: number;
}

const TONO: Record<Giudizio, string> = {
  buono: "bg-emerald-50",
  medio: "bg-amber-50",
  critico: "bg-rose-50",
  na: "bg-muted/40",
};

const TESTO_GIUDIZIO: Record<Giudizio, string> = {
  buono: "Buono",
  medio: "Da migliorare",
  critico: "Critico",
  na: "Non calcolabile",
};

export function TabIndiciAvanzati({ anno }: Props) {
  const q = useIndiciAvanzati(anno);
  const imp = useImposte(anno);
  const sp = useStatoPatrimoniale(anno);
  const { effectiveCompany } = useAuth();

  // Giorni di installazione REALI dalle commesse chiuse: è la leva sul ciclo
  // che non si compra, si organizza (ordine partito subito, rilievo fatto,
  // posa programmata).
  const giorniPosa = useQuery({
    queryKey: ["giorni-installazione", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ media: number; n: number } | null> => {
      const unAnnoFa = new Date();
      unAnnoFa.setFullYear(unAnnoFa.getFullYear() - 1);
      const { data, error } = await supabase
        .from("orders")
        .select("work_start_date, work_end_date")
        .eq("company_id", effectiveCompany!.id)
        .eq("status", "completato")
        .not("work_start_date", "is", null)
        .not("work_end_date", "is", null)
        .gte("work_end_date", unAnnoFa.toLocaleDateString("en-CA"))
        .limit(300);
      if (error) throw error;
      const giorni = (data ?? [])
        .map((o) => (new Date(o.work_end_date!).getTime() - new Date(o.work_start_date!).getTime()) / 86400000)
        .filter((g) => g >= 0 && g <= 730);
      if (giorni.length === 0) return null;
      return {
        media: Math.round(giorni.reduce((s, g) => s + g, 0) / giorni.length),
        n: giorni.length,
      };
    },
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { rotazione: rotRpc, altman, dscr: dscrRpc } = q.data;
  const giorni = rotRpc.giorni_periodo !== undefined ? rotRpc.giorni_periodo : giorniPeriodo(anno);
  const annoInCorso = anno === new Date().getFullYear();

  const rot = calcolaRotazione(
    {
      crediti_clienti: Number(rotRpc.crediti_clienti ?? 0),
      debiti_fornitori: Number(rotRpc.debiti_fornitori ?? 0),
      rimanenze: Number(rotRpc.rimanenze ?? 0),
      ricavi: Number(rotRpc.ricavi ?? 0),
      acquisti: Number(rotRpc.acquisti ?? 0),
      costo_venduto: Number(rotRpc.costo_venduto ?? 0),
    },
    giorni,
  );

  const flusso = dscrRpc.flusso_disponibile ?? (Number(dscrRpc.ebitda ?? 0) - Number(dscrRpc.imposte_ce ?? 0));
  const imposteDscr = dscrRpc.imposte_ce ?? Number(dscrRpc.ebitda ?? 0) - flusso;
  const dscr = calcolaDscr(flusso, Number(dscrRpc.rate_anno ?? 0), giorni);

  // Provvisori finché attivo e passivo non coincidono (come il Rating).
  const spNonQuadra =
    q.data.attendibile === false || (sp.data ? sp.data.quadratura.quadrato === false : false);
  const differenzaSp = sp.data?.quadratura.differenza;
  const zProvvisorio = altman.provvisorio ?? spNonQuadra;

  const personaleInIrap = imp.data?.aliquote.base_irap_include_personale === true;

  return (
    <div className="space-y-4">
      {spNonQuadra && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Indici provvisori</p>
            <p className="mt-1">
              Lo Stato patrimoniale non quadra
              {differenzaSp !== undefined ? <> (differenza di {formatEuro(differenzaSp)})</> : null}: Z-score,
              giorni di incasso e di pagamento usano crediti e debiti ancora da riconciliare. Non usarli con la banca
              prima di aver sistemato i dati.
            </p>
            <Link className="mt-2 inline-block font-medium underline" to="/azienda/controllo-gestione/health">
              Apri Health-check
            </Link>
          </div>
        </div>
      )}

      {annoInCorso && giorni !== null && (
        <p className="text-xs text-muted-foreground">
          Anno in corso: gli indici usano i {giorni} giorni trascorsi dal 1° gennaio, non l'anno intero.
        </p>
      )}

      {/* Imposte IRES + IRAP */}
      {imp.data && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" /> Imposte stimate (IRES e IRAP)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              IRES {formatPct(imp.data.aliquote.ires_pct)} sull'utile prima delle imposte · IRAP{" "}
              {formatPct(imp.data.aliquote.irap_pct, 2)} sul risultato operativo (EBIT)
              {personaleInIrap ? " più il costo del personale" : ""}. Il personale a tempo indeterminato è
              deducibile dall'IRAP dal 2015: includilo solo se hai soprattutto tempo determinato o collaboratori.
              L'opzione e l'aliquota regionale si impostano in Configurazione.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <BoxImposta titolo="IRES" valore={imp.data.ires.imposta} tono="bg-blue-50"
                nota={`Base ${formatCurrency(imp.data.ires.base_imponibile)} × ${formatPct(imp.data.ires.aliquota)}`} />
              <BoxImposta titolo="IRAP" valore={imp.data.irap.imposta} tono="bg-violet-50"
                nota={`Base ${formatCurrency(imp.data.irap.base_imponibile)} × ${formatPct(imp.data.irap.aliquota, 2)}`} />
              <BoxImposta titolo="Imposte totali" valore={imp.data.totali.imposte_totali} tono="bg-rose-50"
                testo="text-rose-700"
                nota={`Peso sull'utile: ${formatPct(imp.data.totali.tax_rate_eff_pct)}`} />
              <BoxImposta titolo="Utile dopo le imposte" valore={imp.data.totali.utile_post} tono="bg-emerald-50"
                testo={imp.data.totali.utile_post < 0 ? "text-rose-700" : "text-emerald-700"}
                nota={`Prima delle imposte: ${formatCurrency(imp.data.totali.utile_ante)}`} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Giorni di incasso, pagamento, magazzino */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Quanto restano fermi i soldi
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Giorni medi per incassare dai clienti, per pagare i fornitori e per usare il materiale in magazzino.
            Meno giorni passano tra quando paghi e quando incassi, meno capitale ti serve.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BoxGiorni
              titolo="Giorni medi di incasso"
              sigla="DSO"
              giorni={rot.dso}
              giudizio={giudizioDso(rot.dso)}
              icona={<Calendar className="h-4 w-4" />}
              righe={[
                ["Crediti verso clienti", rotRpc.crediti_clienti],
                ["Ricavi del periodo", rotRpc.ricavi],
              ]}
              soglie="Fino a 60 giorni bene · oltre 90 critico"
            />
            <BoxGiorni
              titolo="Giorni medi di pagamento"
              sigla="DPO"
              giorni={rot.dpo}
              giudizio={giudizioDpo(rot.dpo)}
              icona={<Banknote className="h-4 w-4" />}
              righe={[
                [rotRpc.debiti_fornitori_fonte === "scadenzario" ? "Debiti fornitori (scadenzario)" : "Debiti verso fornitori", rotRpc.debiti_fornitori],
                ["Acquisti del periodo", rotRpc.acquisti],
              ]}
              soglie="Da 60 giorni in su bene · sotto 30 paghi troppo presto"
              motivo={rot.motivoDpo}
            />
            <BoxGiorni
              titolo="Giorni medi di magazzino"
              sigla="DSI"
              giorni={rot.dsi}
              giudizio={giudizioDsi(rot.dsi)}
              icona={<Package className="h-4 w-4" />}
              righe={[
                ["Rimanenze", rotRpc.rimanenze],
                ["Costo del venduto", rotRpc.costo_venduto],
              ]}
              soglie="Fino a 60 giorni bene · oltre 120 materiale fermo"
              motivo={rot.dsi === null ? "Nessun costo del venduto nel periodo." : null}
            />
            <Card className={cn("rounded-2xl border-0", TONO[giudizioCcc(rot.ccc)])}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Ciclo del circolante (CCC)</p>
                  <TrendingUp className="h-4 w-4" />
                </div>
                <p className="mt-1 text-3xl font-bold tabular-nums">{formatGiorni(rot.ccc)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Incasso + magazzino − pagamento: i giorni in cui anticipi tu i soldi.
                </p>
                {rot.ccc !== null && rot.ccc > 0 && (
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    Il capitale gira {formatNumero(365 / rot.ccc, 1)} volte l'anno.
                  </p>
                )}
                {rot.ccc === null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Non calcolabile senza i giorni di pagamento.
                  </p>
                )}
                {giorniPosa.data && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Durata media dei lavori: {giorniPosa.data.media} giorni su {giorniPosa.data.n} commesse chiuse.
                    È la parte del ciclo che si accorcia organizzandosi.
                  </p>
                )}
                <p className="mt-2 text-xs font-medium">{TESTO_GIUDIZIO[giudizioCcc(rot.ccc)]}</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Z-score di Altman */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Z-score di Altman: rischio di insolvenza
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Un voto unico che combina liquidità, utili accumulati, redditività, patrimonio e fatturato rispetto
            alla dimensione dell'azienda. Più è alto, più l'azienda è solida.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div
              className={cn(
                "rounded-2xl p-6",
                zProvvisorio && "ring-2 ring-amber-300",
                altman.classe === "safe" && "bg-emerald-50",
                altman.classe === "grey" && "bg-amber-50",
                altman.classe === "distress" && "bg-rose-50",
                !altman.classe && "bg-muted/40",
              )}
            >
              <p className="text-xs text-muted-foreground">Z-score{zProvvisorio ? " · provvisorio" : ""}</p>
              <p
                className={cn(
                  "mt-1 text-4xl font-bold tabular-nums",
                  altman.classe === "safe" && "text-emerald-700",
                  altman.classe === "grey" && "text-amber-700",
                  altman.classe === "distress" && "text-rose-700",
                )}
              >
                {formatNumero(altman.z_score)}
              </p>
              <p className="mt-2 text-sm font-medium">{altman.descrizione}</p>
              {zProvvisorio && altman.z_score !== null && (
                <p className="mt-2 text-xs text-amber-800">
                  Calcolato su uno Stato patrimoniale che non quadra: non è un giudizio affidabile.
                </p>
              )}
            </div>

            <div className="rounded-2xl border p-4 text-sm lg:col-span-2">
              <p className="font-semibold">Come si legge</p>
              <ul className="mt-2 space-y-1.5">
                <SogliaRiga colore="bg-emerald-500" testo="Area di sicurezza" soglia="da 2,90 in su" />
                <SogliaRiga colore="bg-amber-500" testo="Area grigia: da tenere d'occhio" soglia="tra 1,23 e 2,90" />
                <SogliaRiga colore="bg-rose-500" testo="Area di rischio" soglia="sotto 1,23" />
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Modello di Altman per società non quotate (1983): 0,717 × capitale circolante netto + 0,847 × utili
                accumulati + 3,107 × risultato operativo + 0,420 × patrimonio / debiti + 0,998 × fatturato, ognuno
                diviso per il totale attivo.
                {annoInCorso ? " Risultato operativo e fatturato sono riportati all'anno intero." : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DSCR */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4" /> Copertura delle rate dei mutui (DSCR)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Quante volte la cassa prodotta dall'attività paga le rate dei mutui nello stesso periodo. La banca
            vuole almeno 1,20: sotto 1 le rate si pagano con altri soldi.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div
              className={cn(
                "rounded-2xl p-6",
                dscr.classe === "eccellente" && "bg-emerald-50",
                dscr.classe === "buono" && "bg-blue-50",
                dscr.classe === "critico" && "bg-amber-50",
                dscr.classe === "insufficiente" && "bg-rose-50",
                dscr.classe === "na" && "bg-muted/40",
              )}
            >
              <p className="text-xs text-muted-foreground">DSCR{spNonQuadra && dscr.valore !== null ? " · provvisorio" : ""}</p>
              <p
                className={cn(
                  "mt-1 text-4xl font-bold tabular-nums",
                  dscr.classe === "eccellente" && "text-emerald-700",
                  dscr.classe === "buono" && "text-blue-700",
                  dscr.classe === "critico" && "text-amber-700",
                  dscr.classe === "insufficiente" && "text-rose-700",
                )}
              >
                {formatVolte(dscr.valore)}
              </p>
              <p className="mt-2 text-sm font-medium">{ETICHETTA_DSCR[dscr.classe]}</p>
            </div>

            <div className="rounded-2xl border p-4 text-sm lg:col-span-2">
              <p className="font-semibold">Da dove viene</p>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-xs">
                  <tbody>
                    <RigaDscr label="Margine operativo lordo (EBITDA)" valore={dscrRpc.ebitda} />
                    <RigaDscr label="− Imposte stimate (le stesse del Conto economico)" valore={imposteDscr} />
                    <RigaDscr label="= Cassa prodotta dall'attività" valore={flusso} forte />
                    <RigaDscr
                      label={annoInCorso && giorni ? `Rate dei mutui nei ${giorni} giorni trascorsi` : "Rate dei mutui dell'anno (capitale + interessi)"}
                      valore={dscr.ratePeriodo}
                    />
                    <RigaDscr label="Rate dei mutui in un anno intero" valore={dscrRpc.rate_anno} tenue />
                    <RigaDscr label="di cui interessi (stima annua)" valore={dscrRpc.interessi_anno} tenue ultima />
                  </tbody>
                </table>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Soglie della banca: da 1,50 ampio margine · da 1,20 coperte · da 1,00 a fatica · sotto 1,00 non coperte.
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BoxImposta({ titolo, valore, nota, tono, testo }: {
  titolo: string; valore: number; nota: string; tono: string; testo?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border-0", tono)}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{titolo}</p>
        <p className={cn("mt-1 text-xl font-bold tabular-nums sm:text-2xl", testo)}>{formatCurrency(valore)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

function BoxGiorni({
  titolo, sigla, giorni, giudizio, icona, righe, soglie, motivo,
}: {
  titolo: string;
  sigla: string;
  giorni: number | null;
  giudizio: Giudizio;
  icona: React.ReactNode;
  righe: [string, number | null | undefined][];
  soglie: string;
  motivo?: string | null;
}) {
  return (
    <Card className={cn("rounded-2xl border-0", TONO[giudizio])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {titolo} <span className="text-muted-foreground">({sigla})</span>
          </p>
          {icona}
        </div>
        <p className="mt-1 text-3xl font-bold tabular-nums">{giorni === null ? "—" : formatGiorni(giorni)}</p>
        {giorni === null && motivo && <p className="mt-1 text-[11px] text-muted-foreground">{motivo}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {righe.map(([l, v]) => (
            <span key={l} className="block">
              {l}: <span className="font-medium tabular-nums">{formatCurrency(Number(v ?? 0))}</span>
            </span>
          ))}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{soglie}</p>
        <p className="mt-1 text-xs font-medium">{TESTO_GIUDIZIO[giudizio]}</p>
      </CardContent>
    </Card>
  );
}

function SogliaRiga({ colore, testo, soglia }: { colore: string; testo: string; soglia: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <span className={cn("inline-block h-2 w-2 rounded-full", colore)} />
        {testo}
      </span>
      <span className="text-xs text-muted-foreground">{soglia}</span>
    </li>
  );
}

function RigaDscr({ label, valore, forte, tenue, ultima }: {
  label: string; valore: number | null | undefined; forte?: boolean; tenue?: boolean; ultima?: boolean;
}) {
  return (
    <tr className={cn(!ultima && "border-b", forte && "font-medium")}>
      <td className={cn("py-1.5 pr-3", tenue && "text-muted-foreground")}>{label}</td>
      <td className={cn("py-1.5 text-right tabular-nums", tenue && "text-muted-foreground")}>
        {valore === null || valore === undefined ? "—" : formatCurrency(valore)}
      </td>
    </tr>
  );
}
