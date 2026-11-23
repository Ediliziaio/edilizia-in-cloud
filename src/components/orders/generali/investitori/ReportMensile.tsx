import { useState } from "react";
import { CalendarDays, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useFotografieGenerale,
  useGeneralePianoNumeri,
} from "@/hooks/useGeneralePiano";
import {
  useFontiGenerale,
  useMovimentiFonti,
} from "@/hooks/useGeneraleInvestitori";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { csvReportMensile } from "@/lib/orders/generali/reportMensileCsv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataBreve, euro } from "../piano/formato";
import { dayKey } from "@/lib/finance/forecastLedger";
import { movimentoPrevisto } from "@/lib/orders/generali/movimentiFonti";
import { dataFotografia } from "@/lib/orders/generali/reportMensilePeriodo";
import { meseValido } from "@/lib/orders/rapportiniMese";

/** Closed periods use frozen monthly economic figures; live forecasts cannot be backdated. */
export function ReportMensile({
  riepilogo,
  meseIniziale,
}: {
  riepilogo: RiepilogoGenerale;
  meseIniziale?: string;
}) {
  const { effectiveCompany } = useAuth();
  const foto = useFotografieGenerale(riepilogo.generale.id);
  const piano = useGeneralePianoNumeri(riepilogo, { preferenza: "approvata" });
  const fonti = useFontiGenerale(riepilogo.generale.id);
  const mov = useMovimentiFonti(riepilogo.generale.id);
  const oggi = dayKey(new Date());
  const meseOggi = oggi.slice(0, 7);
  const [mese, setMese] = useState(() =>
    meseValido(meseIniziale) && meseIniziale <= meseOggi
      ? meseIniziale
      : meseOggi,
  );
  const corrente = mese === meseOggi;
  const p = piano.piano;
  const f =
    corrente && p && piano.inVista?.stato === "approvata"
      ? {
          mese,
          aggiornataIl: new Date().toISOString(),
          versioneStato: "approvata",
          versioneNumero: piano.inVista.numero,
          ricaviPrevisti: p.confronto.totali.ricavi.previsto,
          costiPrevisti: p.confronto.totali.costi.previsto,
          ricaviStima: p.confronto.totali.ricavi.stima,
          costiStima: p.confronto.totali.costi.stima,
          capitaleMassimoPrevisto: p.capitale.massimoPrevisto,
          capitaleInvestito: p.capitale.investitoOggi,
        }
      : corrente
        ? null
        : foto.data?.find((f) => f.mese.slice(0, 7) === mese);
  const data =
    corrente && f ? oggi : (dataFotografia(mese, f?.aggiornataIl) ?? "");
  // Il budget fotografato comprende anche gli oneri futuri. La loro presenza
  // non invalida il mese chiuso: restano esclusi dai movimenti pagati al termine.
  const oneriPrevisti =
    Math.round(
      (mov.data ?? [])
        .filter(
          (m) =>
            ["interessi", "spese"].includes(m.tipo) &&
            movimentoPrevisto(m, data),
        )
        .reduce((s, m) => s + m.importo, 0) * 100,
    ) / 100;
  const numeriValidi =
    !!f &&
    [
      f.ricaviPrevisti,
      f.costiPrevisti,
      f.ricaviStima,
      f.costiStima,
      f.capitaleMassimoPrevisto,
      f.capitaleInvestito,
    ].every(Number.isFinite);
  const righe = (fonti.data ?? []).map((fonte) => {
    const m = (mov.data ?? []).filter(
      (m) => m.fonteId === fonte.id && !movimentoPrevisto(m, data),
    );
    const somma = (tipo: string) =>
      Math.round(
        m.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.importo, 0) *
          100,
      ) / 100;
    const versato = somma("versamento"),
      rimborsato = somma("rimborso"),
      accollo = somma("accollo");
    return {
      id: fonte.id,
      nome: fonte.nome,
      versato,
      rimborsato,
      accollo,
      dentro: versato - rimborsato - accollo,
      remunerato: somma("interessi") + somma("distribuzione") + somma("spese"),
    };
  });
  const pronto =
    !!f &&
    numeriValidi &&
    !!data &&
    data <= oggi &&
    f.versioneStato === "approvata" &&
    !(
      corrente &&
      (p?.budgetCompleto === false ||
        p?.calendarioCompleto === false ||
        piano.isError ||
        piano.isLoading)
    ) &&
    !foto.isError &&
    !fonti.isError &&
    !mov.isError &&
    !fonti.isLoading &&
    !mov.isLoading;
  const caricamento = fonti.isLoading || mov.isLoading || (corrente ? piano.isLoading : foto.isLoading);
  const errore = foto.isError || fonti.isError || mov.isError || (corrente && piano.isError);
  const scarica = () => {
    if (!f || !pronto) return;
    const rows = [
      ["Società", effectiveCompany?.name ?? ""],
      ["Operazione", riepilogo.generale.nome],
      ["Periodo", mese],
      ["Data dei movimenti", data],
      [
        "Fonte dei valori",
        corrente
          ? "Piano approvato aggiornato alla data del report"
          : `Fotografia economica ${f.mese}`,
      ],
      ["Versione approvata", f.versioneNumero],
      ["Ricavi budget", f.ricaviPrevisti],
      ["Costi budget", f.costiPrevisti],
      ["Ricavi stima finale", f.ricaviStima],
      ["Costi stima finale", f.costiStima],
      ["Scostamento costi", f.costiStima - f.costiPrevisti],
      ["Capitale massimo previsto", f.capitaleMassimoPrevisto],
      ["Costi registrati meno incassi (base piano)", f.capitaleInvestito],
      ["Oneri previsti esclusi dai pagati alla data del report", oneriPrevisti],
      [],
      [
        "Fonte",
        "Versato",
        "Rimborsato",
        "Accollo senza cassa",
        "Capitale dentro",
        "Interessi, spese e utile pagati",
      ],
      ...righe.map((r) => [
        r.nome,
        r.versato,
        r.rimborsato,
        r.accollo,
        r.dentro,
        r.remunerato,
      ]),
    ];
    const blob = new Blob([csvReportMensile(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `Rendiconto-${riepilogo.generale.codice ?? "operazione"}-${mese}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="generale-panel min-w-0" aria-labelledby="investitori-rendiconto-mensile">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h3 id="investitori-rendiconto-mensile" className="mr-auto flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" aria-hidden="true" /> Rendiconto mensile dell’operazione
        </h3>
        <label className="flex items-center gap-2 text-xs">
          Periodo
          <Input
            aria-label="Periodo rendiconto investitori"
            lang="it"
            type="month"
            max={meseOggi}
            value={mese}
            onChange={(e) => {
              const valore = e.target.value;
              if (meseValido(valore) && valore <= meseOggi) setMese(valore);
            }}
            className="h-8 w-40 text-xs"
          />
        </label>
        <Button type="button" size="sm" className="h-8 gap-1.5" disabled={!pronto} onClick={scarica}>
          <Download className="size-4" aria-hidden="true" /> Scarica CSV
        </Button>
      </header>
      {errore ? <p role="alert" className="border-t p-3 text-sm">Dati del rendiconto non disponibili.</p>
        : caricamento ? <p role="status" className="border-t p-3 text-sm text-muted-foreground">Caricamento del rendiconto…</p>
          : !pronto || !f ? <p role="status" className="border-t p-3 text-sm text-amber-800 dark:text-amber-300">
            {corrente ? "Completa e approva il budget e il calendario per preparare il rendiconto corrente."
              : "Per questo periodo serve una fotografia economica con budget approvato."}
          </p> : <>
            <p className="border-t bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              {corrente ? "Piano approvato" : "Fotografia del periodo"} · Versione {f.versioneNumero} · Capitale riferito al {dataBreve(data)}
            </p>
            <dl className="grid border-t sm:grid-cols-3 sm:divide-x">
              {[
                { titolo: "Budget costi", valore: f.costiPrevisti },
                { titolo: "Stima finale", valore: f.costiStima },
                { titolo: "Scostamento costi", valore: f.costiStima - f.costiPrevisti },
              ].map(c => <div className="px-3 py-2" key={c.titolo}>
                <dt className="text-xs text-muted-foreground">{c.titolo}</dt>
                <dd className="text-sm font-semibold tabular-nums">{euro(c.valore)}</dd>
              </div>)}
            </dl>
            {righe.length ? <div className="overflow-x-auto border-t">
              <table aria-label="Movimenti effettivi per fonte nel rendiconto mensile" className="generale-registro-tabella min-w-[41rem]">
                <thead className="bg-muted/40"><tr>
                  <th scope="col">Fonte</th>
                  {["Versato", "Rimborsato", "Accollo", "Capitale in essere", "Interessi, spese e utile pagati"].map(c =>
                    <th scope="col" key={c} className="text-right">{c}</th>)}
                </tr></thead>
                <tbody>{righe.map(r => <tr key={r.id}>
                  <th scope="row" className="text-left font-medium">{r.nome}</th>
                  {[r.versato, r.rimborsato, r.accollo, r.dentro, r.remunerato].map((v, i) => <td key={i} className="text-right tabular-nums">{euro(v)}</td>)}
                </tr>)}</tbody>
              </table>
            </div> : <p className="border-t px-3 py-2 text-sm text-muted-foreground">Nessuna fonte registrata.</p>}
            {oneriPrevisti > 0 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Oneri finanziari ancora previsti · {euro(oneriPrevisti)}
            </p>}
          </>}
    </section>
  );
}
