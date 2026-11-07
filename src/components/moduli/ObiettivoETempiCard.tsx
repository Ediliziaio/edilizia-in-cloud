/**
 * «Obiettivo e tempi» nello step Economia dei preventivatori edili (26/10/2026).
 *
 * Due domande a cui il preventivo risponde con i numeri che ha già:
 *  1. Margine a ritroso: con questo prezzo e questo margine, quanto posso spendere? Di quanto sforo, e dove taglio?
 *  2. Tempi e personale: quante ore-persona sono, in quanti giorni con questa squadra, quanti operai per chiudere in X giorni?
 *
 * Il calcolo sta in `obiettivoMargine.ts` e `stimaTempi.ts` (funzioni pure, provate). Qui solo i campi e il testo.
 * Costi e margine li vede solo chi ha il permesso: la scheda non compare per gli altri. Le stime di tempo sono
 * ipotesi, e lo dice la scheda: le assunzioni sono sempre a vista e modificabili.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Gauge, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { usePuoVedereImpresa } from "@/components/preventivatore/usePuoVedereImpresa";
import { calcObiettivoMargine, type BaseEconomica, type RigaCosto } from "@/lib/preventivi/obiettivoMargine";
import { ASSUNZIONI_TEMPI_PREDEFINITE, stimaTempiDaComputo, type AssunzioniTempi } from "@/lib/preventivi/stimaTempi";
import { dataFine, scenariPrezzo, scenariSquadra } from "@/lib/preventivi/scenariPreventivo";
import { consigliPreventivo } from "@/lib/preventivi/consigli";

interface Props {
  righe: RigaCosto[];
  /** Totali già calcolati dal modulo (`calcTotaliComputo`). */
  base: BaseEconomica;
}

const num = (raw: string): number => {
  const v = Number(raw.trim().replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const ore = (h: number) => h.toLocaleString("it-IT", { maximumFractionDigits: 1 });

function Campo({ id, label, value, onChange, suffisso, className, tipo }: {
  id: string; label: string; value: string; onChange: (v: string) => void; suffisso?: string; className?: string; tipo?: "date";
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label htmlFor={id} className="block truncate text-xs text-muted-foreground" title={label}>{label}</Label>
      <div className="relative">
        <Input id={id} type={tipo} inputMode={tipo ? undefined : "decimal"} value={value} onChange={(e) => onChange(e.target.value)}
          className={cn("h-9 tabular-nums", suffisso && "pr-10")} />
        {suffisso && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{suffisso}</span>}
      </div>
    </div>
  );
}

/** Un numero che conta, grande, con la sua etichetta: si legge senza cercarlo nella frase. */
function Riquadro({ etichetta, valore, nota, tono = "neutro" }: {
  etichetta: string; valore: string; nota?: string; tono?: "neutro" | "buono" | "attenzione";
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border px-3 py-2",
      tono === "buono" && "border-emerald-200 bg-emerald-50/60", tono === "attenzione" && "border-amber-200 bg-amber-50/60")}>
      <p className="truncate text-[11px] text-muted-foreground">{etichetta}</p>
      <p className={cn("text-base font-semibold tabular-nums",
        tono === "buono" && "text-emerald-800", tono === "attenzione" && "text-amber-800")}>{valore}</p>
      {nota && <p className="truncate text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Una tabella vera: intestazioni allineate alle colonne, numeri a destra, la riga di oggi in evidenza. */
function Tabella({ titolo, colonne, righe, nota }: {
  titolo: string;
  colonne: Array<{ nome: string; numero?: boolean }>;
  righe: Array<{ chiave: string | number; celle: ReactNode[]; evidenzia?: boolean }>;
  nota?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">{titolo}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-muted/40">
            <tr>
              {colonne.map((c) => (
                <th key={c.nome} scope="col" className={cn("whitespace-nowrap px-3 py-1.5 font-medium text-muted-foreground", c.numero ? "text-right" : "text-left")}>{c.nome}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {righe.map((r) => (
              <tr key={r.chiave} className={cn(r.evidenzia && "bg-primary/5 font-semibold")}>
                {r.celle.map((cella, i) => (
                  <td key={i} className={cn("whitespace-nowrap px-3 py-1.5", colonne[i]?.numero ? "text-right" : "text-left")}>{cella}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Materiali e manodopera in una barra: la proporzione si vede prima di leggerla. */
function BarraCosti({ materiali, manodopera, quotaMateriali, quotaManodopera }: {
  materiali: number; manodopera: number; quotaMateriali: number; quotaManodopera: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-sky-500" style={{ width: `${quotaMateriali}%` }} />
        <div className="bg-orange-400" style={{ width: `${quotaManodopera}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 text-[11px] text-muted-foreground tabular-nums">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500 align-middle" />Materiali {formatCurrency(materiali)} ({quotaMateriali.toLocaleString("it-IT")}%)</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-400 align-middle" />Manodopera {formatCurrency(manodopera)} ({quotaManodopera.toLocaleString("it-IT")}%)</span>
      </div>
    </div>
  );
}

const pct = (v: number) => `${v.toLocaleString("it-IT")}%`;

export function ObiettivoETempiCard({ righe, base }: Props) {
  const puoVedere = usePuoVedereImpresa();
  const [margine, setMargine] = useState("30");
  const [prezzo, setPrezzo] = useState("");
  const [ass, setAss] = useState({
    costoOrario: String(ASSUNZIONI_TEMPI_PREDEFINITE.costoOrario), operai: String(ASSUNZIONI_TEMPI_PREDEFINITE.operai),
    oreGiorno: String(ASSUNZIONI_TEMPI_PREDEFINITE.oreGiorno), resaPct: String(ASSUNZIONI_TEMPI_PREDEFINITE.resaPct),
  });
  const [giorni, setGiorni] = useState("");
  const [aperta, setAperta] = useState(false);
  const [inizio, setInizio] = useState("");
  const [consegna, setConsegna] = useState("");

  const esito = useMemo(
    () => calcObiettivoMargine(righe, base, { marginePct: num(margine), prezzo: prezzo.trim() ? num(prezzo) : null, prezzoIvato: true }),
    [righe, base, margine, prezzo],
  );
  const assunzioni: AssunzioniTempi = {
    costoOrario: num(ass.costoOrario), operai: Math.round(num(ass.operai)), oreGiorno: num(ass.oreGiorno),
    resaPct: num(ass.resaPct), giorniSettimana: ASSUNZIONI_TEMPI_PREDEFINITE.giorniSettimana,
  };
  const tempi = useMemo(
    () => stimaTempiDaComputo(righe, assunzioni, giorni.trim() ? Math.round(num(giorni)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [righe, ass.costoOrario, ass.operai, ass.oreGiorno, ass.resaPct, giorni],
  );

  const prezzi = useMemo(() => scenariPrezzo(base), [base]);
  const squadre = useMemo(
    () => scenariSquadra(righe, assunzioni),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [righe, ass.costoOrario, ass.operai, ass.oreGiorno, ass.resaPct],
  );
  const consigli = useMemo(
    () => consigliPreventivo({ margine: esito, tempi, operaiOggi: assunzioni.operai, inizioIso: inizio, consegnaGiorni: Math.max(0, Math.round(num(consegna))), formatEuro: formatCurrency }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esito, tempi, ass.operai, inizio, consegna],
  );
  // Una riga per la scheda chiusa: il margine di oggi e i giorni della squadra, senza aprirla.
  const sintesi = useMemo(() => {
    const parti: string[] = [];
    if (base.imponibile > 0 && base.righeSenzaCosto === 0) parti.push(`margine ${(Math.round(((base.imponibile - base.costoTot) / base.imponibile) * 1000) / 10).toLocaleString("it-IT")}%`);
    else if (base.imponibile > 0) parti.push("costi incompleti");
    if (tempi.stato === "ok") parti.push(`${tempi.giorniLavorativi} ${tempi.giorniLavorativi === 1 ? "giorno" : "giorni"} con ${assunzioni.operai} ${assunzioni.operai === 1 ? "operaio" : "operai"}`);
    return parti.join(" · ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, tempi, ass.operai]);
  const dataIt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

  if (!puoVedere || righe.length === 0) return null;
  const setA = (k: keyof typeof ass) => (v: string) => setAss((s) => ({ ...s, [k]: v }));

  return (
    <Card>
      <CardHeader className="p-0">
        <button type="button" onClick={() => setAperta((v) => !v)} aria-expanded={aperta} aria-controls="obiettivo-tempi-corpo"
          className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <span className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm"><Gauge className="h-4 w-4 shrink-0" aria-hidden /> Obiettivo di margine e tempi</CardTitle>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{aperta ? "Solo per chi vede costi e margini: il cliente non lo vede." : sintesi || "Apri per calcolare margine, squadra e tempi"}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aperta && "rotate-180")} aria-hidden />
        </button>
      </CardHeader>
      {aperta && <CardContent id="obiettivo-tempi-corpo" className="space-y-5">
        <section className="space-y-3" aria-label="Margine a ritroso">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,14rem)_1fr] sm:items-end">
            <Campo id="ob-margine" label="Margine che voglio" value={margine} onChange={setMargine} suffisso="%" />
            <Campo id="ob-prezzo" label="Prezzo al cliente (IVA incl.)" value={prezzo} onChange={setPrezzo} suffisso="€" />
            <p className="pb-2 text-[11px] text-muted-foreground">Prezzo vuoto = quello del preventivo ({formatCurrency(base.totale)}).</p>
          </div>
          {esito.stato === "non_valido" && <p className="text-sm text-amber-700" role="status">{esito.motivo}</p>}
          {esito.stato === "costi_incompleti" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm" role="status">
              Per questo prezzo e margine puoi spendere al massimo <strong>{formatCurrency(esito.tettoCosto)}</strong>. Non so di quanto sfori:
              {" "}{esito.righeSenzaCosto === 1 ? "una riga venduta non ha" : `${esito.righeSenzaCosto} righe vendute non hanno`} il costo.
            </p>
          )}
          {(esito.stato === "ok" || esito.stato === "sforo") && (
            <div className="space-y-3" role="status">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Riquadro etichetta="Spesa massima" valore={formatCurrency(esito.tettoCosto)} nota={`per il ${margine.replace(".", ",")}% su ${formatCurrency(esito.prezzoIvato)}`} />
                <Riquadro etichetta="Costi di oggi" valore={formatCurrency(esito.costoAttuale)}
                  nota={esito.stato === "ok" ? `${formatCurrency(Math.abs(esito.scarto))} di spazio` : `sfori di ${formatCurrency(esito.scarto)}`}
                  tono={esito.stato === "ok" ? "buono" : "attenzione"} />
                <Riquadro etichetta="Margine reale" valore={pct(esito.margineAlPrezzoPct)}
                  nota={`a questo prezzo · obiettivo ${margine.replace(".", ",")}%`} tono={esito.margineAlPrezzoPct >= num(margine) ? "buono" : "attenzione"} />
                <Riquadro etichetta="Prezzo minimo" valore={formatCurrency(esito.prezzoMinimoIvato)} nota={`IVA incl. per il ${margine.replace(".", ",")}%`} />
              </div>
              <p className={cn("rounded-lg p-3 text-sm", esito.stato === "ok" ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950")}>
                {esito.stato === "ok" ? (
                  <>Ci stai dentro: a {formatCurrency(esito.prezzoIvato)} (netto {formatCurrency(esito.prezzoNetto)}) resti sotto il tetto di spesa con {formatCurrency(Math.abs(esito.scarto))} di spazio.</>
                ) : (
                  <>Sfori di <strong>{formatCurrency(esito.scarto)}</strong> ({pct(esito.scartoPct)} dei costi). Per tenere il {margine.replace(".", ",")}% o alzi il prezzo
                    ad almeno <strong>{formatCurrency(esito.prezzoMinimoIvato)}</strong> IVA inclusa, o tagli i costi come qui sotto.</>
                )}
              </p>
              {esito.stato === "sforo" && esito.voci.length > 0 && (
                <Tabella
                  titolo="Dove tagliare: le voci che pesano di più (taglio in proporzione)"
                  colonne={[{ nome: "Voce" }, { nome: "Capitolo" }, { nome: "Costo", numero: true }, { nome: "Peso", numero: true }, { nome: "Taglio", numero: true }]}
                  righe={esito.voci.map((v, i) => ({
                    chiave: `${v.descrizione}-${i}`,
                    celle: [
                      <span key="v" className="block max-w-[16rem] truncate" title={v.descrizione}>{v.descrizione}</span>,
                      <span key="c" className="text-muted-foreground">{v.capitolo}</span>,
                      formatCurrency(v.costo), pct(v.quotaPct),
                      <span key="t" className="text-amber-800">−{formatCurrency(v.taglio)}</span>,
                    ],
                  }))}
                />
              )}
              <BarraCosti materiali={esito.materiali} manodopera={esito.manodopera} quotaMateriali={esito.quotaMaterialiPct} quotaManodopera={esito.quotaManodoperaPct} />
            </div>
          )}
          {prezzi.length > 0 && (
            <Tabella
              titolo="E se ritocco il prezzo? (a parità di costi)"
              colonne={[{ nome: "Prezzo" }, { nome: "IVA inclusa", numero: true }, { nome: "Margine €", numero: true }, { nome: "Margine %", numero: true }]}
              righe={prezzi.map((p) => ({
                chiave: p.variazionePct,
                evidenzia: p.variazionePct === 0,
                celle: [
                  p.variazionePct === 0 ? "Oggi" : `${p.variazionePct > 0 ? "+" : "−"}${Math.abs(p.variazionePct)}%`,
                  formatCurrency(p.prezzoIvato),
                  p.margineEur == null ? "—" : formatCurrency(p.margineEur),
                  p.marginePct == null ? "costi incompleti" : (
                    <span key="m" className={p.marginePct >= num(margine) ? "text-emerald-700" : "text-amber-700"}>{pct(p.marginePct)}</span>
                  ),
                ],
              }))}
              nota={`Verde: raggiunge il ${margine.replace(".", ",")}% che vuoi; ambra: resta sotto.`}
            />
          )}
        </section>

        <section className="space-y-3 border-t pt-4" aria-label="Tempi e personale">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Timer className="h-4 w-4" aria-hidden /> Tempi e personale (ipotesi)</h4>
          <div className="space-y-3">
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Squadra</legend>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Campo id="tm-costo" label="Costo orario operaio" value={ass.costoOrario} onChange={setA("costoOrario")} suffisso="€/h" />
                <Campo id="tm-operai" label="Operai in squadra" value={ass.operai} onChange={setA("operai")} />
                <Campo id="tm-ore" label="Ore al giorno" value={ass.oreGiorno} onChange={setA("oreGiorno")} suffisso="h" />
                <Campo id="tm-resa" label="Resa (ore di lavoro vero)" value={ass.resaPct} onChange={setA("resaPct")} suffisso="%" />
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Calendario</legend>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Campo id="tm-target" label="Voglio finire in" value={giorni} onChange={setGiorni} suffisso="giorni" />
                <Campo id="tm-consegna" label="Consegna materiali" value={consegna} onChange={setConsegna} suffisso="g. lav." />
                <Campo id="tm-inizio" label="Inizio lavori" value={inizio} onChange={setInizio} tipo="date" />
              </div>
            </fieldset>
          </div>
          {tempi.stato === "non_valido" && <p className="text-sm text-amber-700" role="status">{tempi.motivo}</p>}
          {tempi.stato === "senza_manodopera" && <p className="text-sm" role="status">Le voci non hanno costo di manodopera: non posso stimare le ore.</p>}
          {tempi.stato === "ok" && (
            <div className="space-y-3" role="status">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Riquadro etichetta="Ore-persona" valore={`${ore(tempi.orePersona)} h`} />
                <Riquadro etichetta={`Giorni con ${assunzioni.operai} ${assunzioni.operai === 1 ? "operaio" : "operai"}`} valore={`${tempi.giorniLavorativi} ${tempi.giorniLavorativi === 1 ? "giorno" : "giorni"}`} nota="lavorativi" />
                <Riquadro etichetta="Settimane" valore={tempi.settimane.toLocaleString("it-IT")} />
                <Riquadro etichetta="Fine prevista" valore={inizio ? dataIt(dataFine(inizio, tempi.giorniLavorativi, ASSUNZIONI_TEMPI_PREDEFINITE.giorniSettimana)) : "—"}
                  nota={inizio ? "festivi e ferie esclusi" : "scegli l'inizio lavori"} />
              </div>
              {tempi.operaiPerTarget && (
                <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950">
                  Per chiudere in {tempi.operaiPerTarget.giorni} {tempi.operaiPerTarget.giorni === 1 ? "giorno" : "giorni"} servono <strong>{tempi.operaiPerTarget.operai} {tempi.operaiPerTarget.operai === 1 ? "operaio" : "operai"}</strong>.
                </p>
              )}
              {tempi.perCapitolo.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold">Dove vanno le ore</p>
                  <ul className="space-y-1.5">
                    {tempi.perCapitolo.slice(0, 6).map((c) => (
                      <li key={c.nome} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-xs">
                        <span className="truncate" title={c.nome}>{c.nome}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-orange-400" style={{ width: `${c.quotaPct}%` }} /></span>
                        <span className="w-24 text-right tabular-nums">{ore(c.ore)} h · {pct(c.quotaPct)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {squadre.length > 1 && (
                <Tabella
                  titolo="E se cambio la squadra?"
                  colonne={[{ nome: "Operai" }, { nome: "Giorni lavorativi", numero: true }, { nome: "Rispetto a oggi", numero: true }, ...(inizio ? [{ nome: "Fine", numero: true }] : [])]}
                  righe={squadre.map((q) => ({
                    chiave: q.operai,
                    evidenzia: q.operai === assunzioni.operai,
                    celle: [
                      `${q.operai}${q.operai === assunzioni.operai ? " (oggi)" : ""}`,
                      q.giorniLavorativi,
                      q.giorniRispettoAOggi === 0 ? "—" : (
                        <span key="d" className={q.giorniRispettoAOggi < 0 ? "text-emerald-700" : "text-amber-700"}>{`${q.giorniRispettoAOggi > 0 ? "+" : "−"}${Math.abs(q.giorniRispettoAOggi)} g`}</span>
                      ),
                      ...(inizio ? [dataIt(dataFine(inizio, q.giorniLavorativi, ASSUNZIONI_TEMPI_PREDEFINITE.giorniSettimana))] : []),
                    ],
                  }))}
                  nota="Il costo del lavoro non cambia (le ore sono le stesse): cambia il calendario. Festivi e ferie non sono contati."
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                {tempi.vociConOreScritte > 0 ? `${tempi.vociConOreScritte} ${tempi.vociConOreScritte === 1 ? "voce ha" : "voci hanno"} le ore scritte da te; per le altre, ` : ""}Ore = costo di manodopera delle voci ÷ costo orario. È una stima, non una misura: controllala con la tua squadra.
                {tempi.vociSenzaManodopera > 0 && ` ${tempi.vociSenzaManodopera} ${tempi.vociSenzaManodopera === 1 ? "voce" : "voci"} senza manodopera (solo fornitura) non ${tempi.vociSenzaManodopera === 1 ? "ha" : "hanno"} ore.`}
              </p>
            </div>
          )}
        </section>
        {consigli.length > 0 && (
          <section className="space-y-2 border-t pt-4" aria-label="Cosa ti consiglio">
            <h4 className="text-sm font-semibold">Cosa ti consiglio</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {consigli.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="text-[11px] text-muted-foreground">Consigli ricavati dai numeri sopra, non da un giudizio: se cambi un dato, cambiano anche loro.</p>
          </section>
        )}
      </CardContent>}
    </Card>
  );
}

export default ObiettivoETempiCard;
