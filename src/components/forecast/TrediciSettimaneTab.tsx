// ============================================================================
// TrediciSettimaneTab — il piano di cassa a 13 settimane (Previsionale)
// ============================================================================
// Una colonna per settimana, un trimestre di respiro: la settimana rossa si
// vede con settimane di anticipo, non il venerdì di panico. Gli ACCONTI sono
// separati dai SALDI (una cassa che sale di soli acconti sta salendo con
// lavoro ancora da fare) e gli STIPENDI cadono nel giorno di paga VERO
// dell'azienda, imparato dai pagamenti registrati in Prima Nota — non in un
// giorno deciso da noi.
//
// Tutto arriva dalle stesse fonti del resto della pagina (useCashFlowData):
// niente numeri nuovi, solo il tempo messo in colonna.
// ============================================================================
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { AlertTriangle, CalendarRange, PiggyBank, HandCoins, ArrowRight } from "lucide-react";
import type {
  ExpectedPayment, ExpectedExpense, ExpectedCommission,
  ExpectedSupplierPayment, CompanyCostEntry,
} from "@/lib/forecastTypes";
import { buildEmployeeCosts } from "@/lib/costsUtils";
import {
  costruisciPianoTredici, applicaGiornoStipendi, sedicesimoDelMeseSuccessivo,
  type MovimentoPrevisto,
} from "@/lib/finanza/trediciSettimane";
import { useGiornoStipendi } from "@/hooks/useGiornoStipendi";
import { useFiscoPrevisto } from "@/hooks/useFiscoPrevisto";
import { useCommesseBonus, fattoreNettoRitenuta } from "@/hooks/useCommesseBonus";

interface ScadenzaForecast {
  id: string;
  amount: number;
  expectedDate: Date | null;
  direction: "entrata" | "uscita";
  orderId?: string | null;
}

interface Props {
  companyId: string | null | undefined;
  expectedPayments: ExpectedPayment[];
  scadenzeForForecast: ScadenzaForecast[];
  expectedCompanyCosts: CompanyCostEntry[];
  expectedExpenses: ExpectedExpense[];
  expectedCommissions: ExpectedCommission[];
  expectedSupplierPayments: ExpectedSupplierPayment[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeEmployees: any[];
  primaNotaSaldo: { saldo: number; entry_count: number };
  /** Somma dei saldi dei conti bancari attivi: partenza di riserva quando la Prima Nota è vuota. */
  bankBalance: number | null;
}

/** Sotto questa riga il saldo previsto è "rosso". Diventerà configurabile per azienda. */
const SOGLIA_GUARDIA = 0;

const RIGHE_ENTRATE = [
  { chiave: "acconti" as const, label: "Acconti alla firma", nota: "denaro per lavoro futuro" },
  { chiave: "saldi" as const, label: "SAL e saldi", nota: "lavoro eseguito" },
  { chiave: "fatture" as const, label: "Fatture clienti", nota: "scadenze attive" },
];
const RIGHE_USCITE = [
  { chiave: "fornitori" as const, label: "Fornitori" },
  { chiave: "stipendi" as const, label: "Stipendi (netto in busta + lordo)" },
  { chiave: "fisco" as const, label: "F24, IVA e contributi" },
  { chiave: "squadreProvvigioni" as const, label: "Squadre e provvigioni" },
  { chiave: "altriCosti" as const, label: "Altri costi" },
];

export function TrediciSettimaneTab({
  companyId,
  expectedPayments,
  scadenzeForForecast,
  expectedCompanyCosts,
  expectedExpenses,
  expectedCommissions,
  expectedSupplierPayments,
  activeEmployees,
  primaNotaSaldo,
  bankBalance,
}: Props) {
  // Punto di partenza del piano: la Prima Nota quando è alimentata (è il
  // libro cassa dell'app), altrimenti il saldo REALE dei conti bancari.
  // Mai uno zero finto se esiste un saldo vero da qualche parte.
  const partenza =
    primaNotaSaldo.entry_count > 0
      ? { valore: primaNotaSaldo.saldo, fonte: "prima-nota" as const }
      : bankBalance !== null
        ? { valore: bankBalance, fonte: "banca" as const }
        : { valore: 0, fonte: "nessuna" as const };
  const giornoQ = useGiornoStipendi(companyId ?? undefined);
  const giornoStipendi = giornoQ.data?.giorno ?? null;
  const oggi = giornoQ.data?.oggi;
  const fiscoQ = useFiscoPrevisto(companyId);
  const fisco = fiscoQ.data;
  const bonusQ = useCommesseBonus(companyId);
  const commesseBonus = bonusQ.data;

  const piano = useMemo(() => {
    if (!oggi) return null;
    const movimenti: MovimentoPrevisto[] = [];

    // Ritenuta 11% sui bonifici parlanti: sulle commesse marcate col bonus
    // edilizio (flag scelto alla creazione della commessa) il cliente paga con
    // bonifico parlante e la banca trattiene l'11% sull'imponibile PRIMA di
    // accreditare. L'incasso previsto qui è il netto — quello che arriva
    // davvero — e la trattenuta si somma a parte per dirla nel footer.
    // Il finanziamento (erogazione della finanziaria) non è un bonifico
    // parlante del privato: resta lordo.
    let ritenutaOrizzonte = 0;
    let commesseBonusToccate = 0;
    const idsBonusToccati = new Set<string>();
    const orizzonteMs = oggi.getTime() + 92 * 86400_000;
    const nettoSe = (orderId: string | null | undefined, importo: number, data: Date | null): number => {
      if (!orderId || !commesseBonus?.has(orderId)) return importo;
      const netto = importo * fattoreNettoRitenuta(commesseBonus.get(orderId));
      if (data && data.getTime() < orizzonteMs) ritenutaOrizzonte += importo - netto;
      if (!idsBonusToccati.has(orderId)) {
        idsBonusToccati.add(orderId);
        commesseBonusToccate += 1;
      }
      return netto;
    };

    // Entrate: rate delle commesse, con l'acconto SEPARATO dal saldo.
    // financing (erogazione finanziaria) arriva a lavoro concluso → con i saldi.
    for (const p of expectedPayments) {
      movimenti.push({
        data: p.expectedDate,
        importo: p.rawType === "financing" ? p.amount : nettoSe(p.orderId, p.amount, p.expectedDate),
        direzione: "in",
        categoria: p.rawType === "deposit" ? "acconti" : "saldi",
      });
    }
    // Entrate: scadenze attive (fatture) — già dedupate a monte dalle rate.
    for (const s of scadenzeForForecast) {
      if (s.direction === "entrata") {
        movimenti.push({
          data: s.expectedDate,
          importo: nettoSe(s.orderId, s.amount, s.expectedDate),
          direzione: "in",
          categoria: "fatture",
        });
      } else {
        movimenti.push({ data: s.expectedDate, importo: s.amount, direzione: "out", categoria: "fornitori" });
      }
    }
    // Uscite: fornitori da ODA/articoli.
    for (const f of expectedSupplierPayments) {
      if (f.isPaid) continue;
      movimenti.push({ data: f.expectedDate, importo: f.amount, direzione: "out", categoria: "fornitori" });
    }
    // Uscite: squadre esterne e provvigioni.
    for (const e of expectedExpenses) {
      if (e.isPaid) continue;
      movimenti.push({ data: e.expectedDate, importo: e.amount, direzione: "out", categoria: "squadreProvvigioni" });
    }
    for (const c of expectedCommissions) {
      movimenti.push({ data: c.expectedDate, importo: c.amount, direzione: "out", categoria: "squadreProvvigioni" });
    }
    // Uscite: costi aziendali registrati (non pagati). Il "Personale" inserito
    // a mano viaggia con gli stipendi, il resto negli altri costi.
    for (const c of expectedCompanyCosts) {
      movimenti.push({
        data: c.expectedDate,
        importo: c.amount,
        direzione: "out",
        categoria: c.category === "Personale" ? "stipendi" : "altriCosti",
      });
    }
    // Uscite: stipendi PROIETTATI dal personale attivo. Il LORDO esce al
    // giorno di paga vero; gli ONERI INPS (righe `_inps_` della proiezione)
    // si versano in F24 il 16 del mese successivo — due momenti di cassa
    // diversi, come nella realtà.
    const stipendi = buildEmployeeCosts(activeEmployees, 4);
    for (const r of stipendi) {
      if (r.is_paid || !r.due_date) continue;
      const fineMese = new Date(r.due_date);
      if (Number.isNaN(fineMese.getTime())) continue;
      const eOneri = String(r.id).includes("_inps_");
      movimenti.push({
        data: eOneri
          ? sedicesimoDelMeseSuccessivo(fineMese)
          : applicaGiornoStipendi(fineMese, giornoStipendi),
        importo: Number(r.amount) || 0,
        direzione: "out",
        categoria: eOneri ? "fisco" : "stipendi",
      });
    }
    // Uscite: F24 registrati (importi e date VERI) + stima IVA dal Registro
    // per i mesi non ancora coperti da un F24 reale.
    for (const u of fisco?.uscite ?? []) {
      movimenti.push({ data: u.data, importo: u.importo, direzione: "out", categoria: "fisco" });
    }

    return {
      ...costruisciPianoTredici(movimenti, partenza.valore, oggi, SOGLIA_GUARDIA),
      ritenutaOrizzonte,
      commesseBonusToccate,
    };
  }, [
    oggi, giornoStipendi, expectedPayments, scadenzeForForecast, expectedCompanyCosts,
    expectedExpenses, expectedCommissions, expectedSupplierPayments, activeEmployees,
    partenza.valore, fisco, commesseBonus,
  ]);

  if (!piano) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  const { settimane, primaSettimanaRossa, senzaData, ritenutaOrizzonte, commesseBonusToccate } = piano;
  const mostraSquadre = settimane.some((s) => s.uscite.squadreProvvigioni > 0);

  return (
    <div className="space-y-4">
      {/* Testata: i quattro numeri che inquadrano il piano */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi
          icona={PiggyBank}
          label="Saldo di partenza"
          valore={formatCurrency(partenza.valore)}
          sub={
            partenza.fonte === "prima-nota"
              ? "dalla Prima Nota"
              : partenza.fonte === "banca"
                ? "dai conti bancari (Prima Nota vuota)"
                : "nessun saldo registrato — collega la banca o la Prima Nota"
          }
          tono={
            partenza.fonte === "nessuna"
              ? "neutro"
              : partenza.valore >= 0 ? "verde" : "rosso"
          }
        />
        <MiniKpi
          icona={AlertTriangle}
          label="Prima settimana rossa"
          valore={
            primaSettimanaRossa === null
              ? "nessuna"
              : primaSettimanaRossa === 0
                ? "questa settimana"
                : `tra ${primaSettimanaRossa} settiman${primaSettimanaRossa === 1 ? "a" : "e"}`
          }
          sub={
            primaSettimanaRossa === null
              ? "saldo previsto sempre sopra la soglia"
              : settimane[primaSettimanaRossa].label
          }
          tono={primaSettimanaRossa === null ? "verde" : primaSettimanaRossa <= 2 ? "rosso" : "ambra"}
        />
        <MiniKpi
          icona={HandCoins}
          label="Giorno stipendi"
          valore={giornoStipendi !== null ? `il ${giornoStipendi} del mese` : "fine mese"}
          sub={
            giornoStipendi !== null
              ? `imparato da ${giornoQ.data?.campioni ?? 0} pagamenti reali`
              : "registra i pagamenti stipendi in Prima Nota e lo imparo"
          }
          tono={giornoStipendi !== null ? "verde" : "neutro"}
        />
        <MiniKpi
          icona={CalendarRange}
          label="Senza data"
          valore={senzaData.conteggio === 0 ? "niente" : String(senzaData.conteggio)}
          sub={
            senzaData.conteggio === 0
              ? "tutti i movimenti hanno una scadenza"
              : `${formatCurrency(senzaData.entrate)} in · ${formatCurrency(senzaData.uscite)} out fuori piano`
          }
          tono={senzaData.conteggio === 0 ? "verde" : "ambra"}
        />
      </div>

      {/* La tabella delle tredici settimane */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Le tredici settimane</CardTitle>
          <p className="text-xs text-muted-foreground">
            Un trimestre di cassa, colonna per colonna. Gli acconti sono separati dai saldi:
            l'acconto è denaro per lavoro ancora da fare. I movimenti già scaduti confluiscono
            nella settimana corrente.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 min-w-[170px] bg-muted px-3 py-2 text-left font-medium text-muted-foreground">
                    Settimana
                  </th>
                  {settimane.map((s, i) => (
                    <th
                      key={s.label}
                      className={cn(
                        "min-w-[104px] px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap",
                        i === 0 && "bg-primary/5",
                        primaSettimanaRossa === i && "bg-rose-50 dark:bg-rose-950/30",
                      )}
                    >
                      {i === 0 ? "questa" : `+${i}`}
                      <span className="block text-[10px] font-normal">{s.label}</span>
                      {i === 0 && s.scadutiAssorbiti > 0 && (
                        <span className="block text-[9px] font-normal text-amber-600">
                          +{s.scadutiAssorbiti} scaduti
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <RigaSezione titolo="Entrate previste" colonne={settimane.length} />
                {RIGHE_ENTRATE.map((r) => (
                  <tr key={r.chiave} className="border-t">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                      {r.label}
                      <span className="block text-[10px] text-muted-foreground">{r.nota}</span>
                    </td>
                    {settimane.map((s) => (
                      <CellaImporto key={s.label} valore={s.entrate[r.chiave]} segno="in" />
                    ))}
                  </tr>
                ))}
                <RigaSezione titolo="Uscite previste" colonne={settimane.length} />
                {RIGHE_USCITE.filter((r) => r.chiave !== "squadreProvvigioni" || mostraSquadre).map((r) => (
                  <tr key={r.chiave} className="border-t">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5">{r.label}</td>
                    {settimane.map((s) => (
                      <CellaImporto key={s.label} valore={s.uscite[r.chiave]} segno="out" />
                    ))}
                  </tr>
                ))}
                <tr className="border-t bg-muted/20">
                  <td className="sticky left-0 z-10 bg-muted/60 px-3 py-1.5 font-medium">Saldo settimana</td>
                  {settimane.map((s) => (
                    <td
                      key={s.label}
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        s.saldoSettimana > 0 && "text-emerald-700 dark:text-emerald-400",
                        s.saldoSettimana < 0 && "text-rose-700 dark:text-rose-400",
                      )}
                    >
                      {s.saldoSettimana === 0 ? "—" : formatCurrency(s.saldoSettimana)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t-2">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 font-bold">
                    Saldo previsto
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      la riga che comanda
                    </span>
                  </td>
                  {settimane.map((s) => (
                    <td
                      key={s.label}
                      className={cn(
                        "px-2 py-2 text-right font-bold tabular-nums",
                        s.saldoProgressivo < SOGLIA_GUARDIA
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "text-foreground",
                      )}
                    >
                      {formatCurrency(s.saldoProgressivo)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            <p>
              · Gli stipendi sono il costo pieno (lordo + oneri) del personale attivo, collocati al
              giorno di paga {giornoStipendi !== null ? `reale (il ${giornoStipendi})` : "di fine mese"}.
              {giornoStipendi === null && (
                <>
                  {" "}Per insegnare al piano il tuo giorno,{" "}
                  <Link to="/azienda/prima-nota" className="font-medium text-primary hover:underline">
                    registra i pagamenti stipendi in Prima Nota <ArrowRight className="inline h-3 w-3" />
                  </Link>
                </>
              )}
            </p>
            {commesseBonusToccate > 0 && (
              <p>
                · {commesseBonusToccate} commess{commesseBonusToccate === 1 ? "a" : "e"} col bonus
                edilizio: gli incassi previsti sono già al NETTO della ritenuta 11% sull'imponibile
                che la banca trattiene sul bonifico parlante
                ({formatCurrency(ritenutaOrizzonte)} trattenuti nell'orizzonte — tornano come
                credito d'imposta, non sono persi).
              </p>
            )}
            <p>
              · La riga F24 somma i versamenti REGISTRATI in Gestione IVA/F24
              {fisco && fisco.nReali > 0 ? ` (${fisco.nReali} da pagare)` : " (nessuno registrato)"},
              i contributi INPS della proiezione stipendi al 16 del mese successivo
              {fisco && fisco.nStime > 0
                ? ` e ${fisco.nStime} stim${fisco.nStime === 1 ? "a" : "e"} IVA dal Registro (regime mensile ipotizzato)`
                : ""}. Lo stipendio resta il lordo al giorno di paga.
            </p>
            {senzaData.conteggio > 0 && (
              <p>
                · {senzaData.conteggio} movimenti senza data restano fuori dalle colonne
                ({formatCurrency(senzaData.entrate)} entrate, {formatCurrency(senzaData.uscite)} uscite):
                assegna le scadenze per un piano completo.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RigaSezione({ titolo, colonne }: { titolo: string; colonne: number }) {
  return (
    <tr className="border-t bg-muted/40">
      <td className="sticky left-0 z-10 bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {titolo}
      </td>
      <td colSpan={colonne} className="bg-muted/40" />
    </tr>
  );
}

function CellaImporto({ valore, segno }: { valore: number; segno: "in" | "out" }) {
  if (valore <= 0) {
    return <td className="px-2 py-1.5 text-right text-muted-foreground/50">—</td>;
  }
  return (
    <td
      className={cn(
        "px-2 py-1.5 text-right tabular-nums",
        segno === "in" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
      )}
    >
      {segno === "out" && "−"}
      {formatCurrency(valore)}
    </td>
  );
}

function MiniKpi({
  icona: Icona, label, valore, sub, tono,
}: {
  icona: typeof PiggyBank;
  label: string;
  valore: string;
  sub: string;
  tono: "verde" | "ambra" | "rosso" | "neutro";
}) {
  const toni = {
    verde: "text-emerald-700 dark:text-emerald-400",
    ambra: "text-amber-700 dark:text-amber-400",
    rosso: "text-rose-700 dark:text-rose-400",
    neutro: "text-foreground",
  } as const;
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-3">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Icona className="h-3.5 w-3.5" /> {label}
        </p>
        <p className={cn("mt-0.5 text-lg font-bold tabular-nums", toni[tono])}>{valore}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
