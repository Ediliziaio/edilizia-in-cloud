import { useState } from "react";
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
import { euro } from "../piano/formato";
import { dayKey } from "@/lib/finance/forecastLedger";
import { movimentoPrevisto } from "@/lib/orders/generali/movimentiFonti";
import { dataFotografia } from "@/lib/orders/generali/reportMensilePeriodo";

/** Closed periods use frozen monthly economic figures; live forecasts cannot be backdated. */
export function ReportMensile({
  riepilogo,
  meseIniziale,
  apertoInizialmente = false,
}: {
  riepilogo: RiepilogoGenerale;
  meseIniziale?: string;
  apertoInizialmente?: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const foto = useFotografieGenerale(riepilogo.generale.id);
  const piano = useGeneralePianoNumeri(riepilogo, { preferenza: "approvata" });
  const fonti = useFontiGenerale(riepilogo.generale.id);
  const mov = useMovimentiFonti(riepilogo.generale.id);
  const oggi = dayKey(new Date());
  const [mese, setMese] = useState(() =>
    meseIniziale &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(meseIniziale) &&
    meseIniziale <= oggi.slice(0, 7)
      ? meseIniziale
      : oggi.slice(0, 7),
  );
  const [aperto, setAperto] = useState(apertoInizialmente);
  const corrente = mese === oggi.slice(0, 7);
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
    <details
      className="rounded-lg border bg-card p-4"
      open={aperto}
      onToggle={(e) => setAperto(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">
        Rendiconto mensile dell'operazione
      </summary>
      <div className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          Periodo{" "}
          <input
            aria-label="Periodo rendiconto investitori"
            type="month"
            max={oggi.slice(0, 7)}
            value={mese}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) setMese(e.target.value);
            }}
            className="rounded border bg-background px-2 py-1"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {effectiveCompany?.name} · Capitale riferito al{" "}
          {data || "periodo selezionato"}.{" "}
          {corrente
            ? "Mese corrente: budget approvato e stima aggiornati alla data del report."
            : "Budget e stima finale dalla fotografia del periodo; i mesi chiusi non usano valori correnti retrodatati."}
        </p>
        {foto.isError || fonti.isError || mov.isError ? (
          <p role="alert">Dati del rendiconto non disponibili.</p>
        ) : !pronto ? (
          <p role="status" className="text-sm text-amber-800">
            {corrente
              ? "Completa e approva il budget e il calendario prima di scaricare il rendiconto corrente."
              : "Manca una fotografia valida con budget approvato per il periodo. Il rendiconto storico completo resta bloccato."}
          </p>
        ) : (
          <p className="text-sm">
            Budget costi {euro(f!.costiPrevisti)} · stima finale{" "}
            {euro(f!.costiStima)} · scostamento{" "}
            {euro(f!.costiStima - f!.costiPrevisti)}
          </p>
        )}
        {oneriPrevisti > 0 && (
          <p className="text-xs text-muted-foreground">
            Oneri finanziari ancora previsti: {euro(oneriPrevisti)}, esclusi dai
            pagati alla data del report.{" "}
            {corrente
              ? "Budget e stima provengono dal piano approvato."
              : "Budget e stima restano quelli della fotografia."}
          </p>
        )}
        {righe.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"
          >
            <span>{r.nome}</span>
            <span>
              Versato {euro(r.versato)} · rimborsato {euro(r.rimborsato)} ·
              capitale dentro {euro(r.dentro)}
            </span>
          </div>
        ))}
        <Button variant="outline" disabled={!pronto} onClick={scarica}>
          Scarica rendiconto del periodo
        </Button>
      </div>
    </details>
  );
}
