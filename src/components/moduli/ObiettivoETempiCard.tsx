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
import { useMemo, useState } from "react";
import { Gauge, Timer } from "lucide-react";
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

function Campo({ id, label, value, onChange, suffisso, className }: {
  id: string; label: string; value: string; onChange: (v: string) => void; suffisso?: string; className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
        {suffisso && <span className="text-xs text-muted-foreground">{suffisso}</span>}
      </div>
    </div>
  );
}

export function ObiettivoETempiCard({ righe, base }: Props) {
  const puoVedere = usePuoVedereImpresa();
  const [margine, setMargine] = useState("30");
  const [prezzo, setPrezzo] = useState("");
  const [ass, setAss] = useState({
    costoOrario: String(ASSUNZIONI_TEMPI_PREDEFINITE.costoOrario), operai: String(ASSUNZIONI_TEMPI_PREDEFINITE.operai),
    oreGiorno: String(ASSUNZIONI_TEMPI_PREDEFINITE.oreGiorno), resaPct: String(ASSUNZIONI_TEMPI_PREDEFINITE.resaPct),
  });
  const [giorni, setGiorni] = useState("");
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
  const dataIt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

  if (!puoVedere || righe.length === 0) return null;
  const setA = (k: keyof typeof ass) => (v: string) => setAss((s) => ({ ...s, [k]: v }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4" aria-hidden /> Obiettivo di margine e tempi</CardTitle>
        <p className="text-xs text-muted-foreground">Calcoli sui costi del computo. Solo per chi vede costi e margini: il cliente non lo vede.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3" aria-label="Margine a ritroso">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] gap-3">
            <Campo id="ob-margine" label="Margine che voglio" value={margine} onChange={setMargine} suffisso="%" />
            <Campo id="ob-prezzo" label="Prezzo al cliente (IVA inclusa)" value={prezzo} onChange={setPrezzo} suffisso="€" />
          </div>
          <p className="text-[11px] text-muted-foreground">Prezzo vuoto = quello attuale del preventivo ({formatCurrency(base.totale)}).</p>
          {esito.stato === "non_valido" && <p className="text-sm text-amber-700" role="status">{esito.motivo}</p>}
          {esito.stato === "costi_incompleti" && (
            <p className="text-sm" role="status">
              Per questo prezzo e margine puoi spendere al massimo <strong>{formatCurrency(esito.tettoCosto)}</strong>. Non so di quanto sfori:
              {" "}{esito.righeSenzaCosto === 1 ? "una riga venduta non ha" : `${esito.righeSenzaCosto} righe vendute non hanno`} il costo.
            </p>
          )}
          {(esito.stato === "ok" || esito.stato === "sforo") && (
            <div className="space-y-2 text-sm" role="status">
              <p>
                Per avere il <strong>{margine.replace(".", ",")}%</strong> su {formatCurrency(esito.prezzoIvato)} (netto {formatCurrency(esito.prezzoNetto)})
                puoi spendere al massimo <strong>{formatCurrency(esito.tettoCosto)}</strong>. Oggi i costi sono {formatCurrency(esito.costoAttuale)}.
              </p>
              {esito.stato === "ok" ? (
                <p className="rounded-md bg-emerald-50 p-2 text-emerald-900">
                  Ci stai dentro, con {formatCurrency(Math.abs(esito.scarto))} di spazio. Margine reale a questo prezzo: {esito.margineAlPrezzoPct.toLocaleString("it-IT")}%.
                </p>
              ) : (
                <div className="space-y-2 rounded-md bg-amber-50 p-2 text-amber-950">
                  <p>
                    Sfori di <strong>{formatCurrency(esito.scarto)}</strong> ({esito.scartoPct.toLocaleString("it-IT")}% dei costi): il margine reale a questo prezzo è {esito.margineAlPrezzoPct.toLocaleString("it-IT")}%.
                    Per tenere il margine senza toccare i costi il prezzo deve essere almeno <strong>{formatCurrency(esito.prezzoMinimoIvato)}</strong> IVA inclusa.
                  </p>
                  {esito.voci.length > 0 && (
                    <div>
                      <p className="text-xs font-medium">Se vuoi ridurre i costi, dove pesano di più (taglio in proporzione):</p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {esito.voci.map((v, i) => (
                          <li key={`${v.descrizione}-${i}`} className="flex justify-between gap-3">
                            <span className="truncate">{v.descrizione} <span className="text-muted-foreground">· {v.capitolo}</span></span>
                            <span className="shrink-0 tabular-nums">{formatCurrency(v.costo)} ({v.quotaPct.toLocaleString("it-IT")}%) → −{formatCurrency(v.taglio)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Costi: materiali {formatCurrency(esito.materiali)} ({esito.quotaMaterialiPct.toLocaleString("it-IT")}%), manodopera {formatCurrency(esito.manodopera)} ({esito.quotaManodoperaPct.toLocaleString("it-IT")}%).
              </p>
            </div>
          )}
          {prezzi.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">E se ritocco il prezzo? (a parità di costi)</p>
              <table className="w-full text-xs tabular-nums">
                <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Prezzo</th><th className="font-normal">IVA inclusa</th><th className="text-right font-normal">Margine</th></tr></thead>
                <tbody>
                  {prezzi.map((p) => (
                    <tr key={p.variazionePct} className={p.variazionePct === 0 ? "font-medium" : undefined}>
                      <td>{p.variazionePct === 0 ? "Oggi" : `${p.variazionePct > 0 ? "+" : "−"}${Math.abs(p.variazionePct)}%`}</td>
                      <td>{formatCurrency(p.prezzoIvato)}</td>
                      <td className="text-right">{p.margineEur == null ? "costi incompleti" : `${formatCurrency(p.margineEur)} (${p.marginePct?.toLocaleString("it-IT")}%)`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3 border-t pt-4" aria-label="Tempi e personale">
          <h4 className="flex items-center gap-2 text-sm font-medium"><Timer className="h-4 w-4" aria-hidden /> Tempi e personale (ipotesi)</h4>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-3">
            <Campo id="tm-costo" label="Costo orario operaio" value={ass.costoOrario} onChange={setA("costoOrario")} suffisso="€/h" />
            <Campo id="tm-operai" label="Operai in squadra" value={ass.operai} onChange={setA("operai")} />
            <Campo id="tm-ore" label="Ore al giorno" value={ass.oreGiorno} onChange={setA("oreGiorno")} suffisso="h" />
            <Campo id="tm-resa" label="Resa (ore davvero di lavoro)" value={ass.resaPct} onChange={setA("resaPct")} suffisso="%" />
            <Campo id="tm-target" label="Voglio finire in (giorni)" value={giorni} onChange={setGiorni} />
            <Campo id="tm-consegna" label="Consegna materiali (giorni lav.)" value={consegna} onChange={setConsegna} />
            <div className="space-y-1">
              <Label htmlFor="tm-inizio" className="text-xs">Inizio lavori</Label>
              <Input id="tm-inizio" type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} className="h-9" />
            </div>
          </div>
          {tempi.stato === "non_valido" && <p className="text-sm text-amber-700" role="status">{tempi.motivo}</p>}
          {tempi.stato === "senza_manodopera" && <p className="text-sm" role="status">Le voci non hanno costo di manodopera: non posso stimare le ore.</p>}
          {tempi.stato === "ok" && (
            <div className="space-y-2 text-sm" role="status">
              <p>
                Sono circa <strong>{ore(tempi.orePersona)} ore-persona</strong>. Con {assunzioni.operai} {assunzioni.operai === 1 ? "operaio" : "operai"}:
                {" "}<strong>{tempi.giorniLavorativi} {tempi.giorniLavorativi === 1 ? "giorno lavorativo" : "giorni lavorativi"}</strong> (circa {tempi.settimane.toLocaleString("it-IT")} settimane).
              </p>
              {tempi.operaiPerTarget && (
                <p className="rounded-md bg-sky-50 p-2 text-sky-950">
                  Per chiudere in {tempi.operaiPerTarget.giorni} {tempi.operaiPerTarget.giorni === 1 ? "giorno" : "giorni"} servono <strong>{tempi.operaiPerTarget.operai} {tempi.operaiPerTarget.operai === 1 ? "operaio" : "operai"}</strong>.
                </p>
              )}
              {tempi.perCapitolo.length > 1 && (
                <ul className="space-y-0.5 text-xs">
                  {tempi.perCapitolo.slice(0, 6).map((c) => (
                    <li key={c.nome} className="flex justify-between gap-3"><span className="truncate">{c.nome}</span><span className="shrink-0 tabular-nums">{ore(c.ore)} h ({c.quotaPct.toLocaleString("it-IT")}%)</span></li>
                  ))}
                </ul>
              )}
              {squadre.length > 1 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">E se cambio la squadra?</p>
                  <table className="w-full text-xs tabular-nums">
                    <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Operai</th><th className="font-normal">Giorni</th><th className="font-normal">Rispetto a oggi</th>{inizio && <th className="text-right font-normal">Fine</th>}</tr></thead>
                    <tbody>
                      {squadre.map((q) => (
                        <tr key={q.operai} className={q.operai === assunzioni.operai ? "font-medium" : undefined}>
                          <td>{q.operai}{q.operai === assunzioni.operai ? " (oggi)" : ""}</td>
                          <td>{q.giorniLavorativi}</td>
                          <td>{q.giorniRispettoAOggi === 0 ? "—" : `${q.giorniRispettoAOggi > 0 ? "+" : "−"}${Math.abs(q.giorniRispettoAOggi)} g`}</td>
                          {inizio && <td className="text-right">{dataIt(dataFine(inizio, q.giorniLavorativi, ASSUNZIONI_TEMPI_PREDEFINITE.giorniSettimana))}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-muted-foreground">Il costo del lavoro non cambia (le ore sono le stesse): cambia il calendario. Festivi e ferie non sono contati.</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Ore = costo di manodopera delle voci ÷ costo orario. È una stima, non una misura: controllala con la tua squadra.
                {tempi.vociSenzaManodopera > 0 && ` ${tempi.vociSenzaManodopera} ${tempi.vociSenzaManodopera === 1 ? "voce" : "voci"} senza manodopera (solo fornitura) non ${tempi.vociSenzaManodopera === 1 ? "ha" : "hanno"} ore.`}
              </p>
            </div>
          )}
        </section>
        {consigli.length > 0 && (
          <section className="space-y-2 border-t pt-4" aria-label="Cosa ti consiglio">
            <h4 className="text-sm font-medium">Cosa ti consiglio</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {consigli.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="text-[11px] text-muted-foreground">Consigli ricavati dai numeri sopra, non da un giudizio: se cambi un dato, cambiano anche loro.</p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default ObiettivoETempiCard;
