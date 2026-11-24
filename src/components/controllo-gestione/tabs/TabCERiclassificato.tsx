import { useMemo, useState } from "react";
import { EsportaMenu } from "@/components/controllo-gestione/ui/EsportaMenu";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useCEriclassificato,
  useBEP,
  useCEMensileDettaglio,
  useCEMultiAnno,
  useRicaviProvenienza,
  type VoceCE,
} from "@/hooks/controlloGestione/useCEriclassificato";
import {
  AvvisoRicaviCommesse,
  serveAvvisoRicavi,
} from "@/components/controllo-gestione/ui/AvvisoRicaviCommesse";
import { LavoriInCorsoCard } from "@/components/controllo-gestione/ui/LavoriInCorsoCard";
import { CETable } from "@/components/controllo-gestione/ui/CETable";
import { BEPChart } from "@/components/controllo-gestione/ui/BEPChart";
import { KPIBox } from "@/components/controllo-gestione/ui/KPIBox";
import { CESkeleton } from "@/components/controllo-gestione/skeletons/CESkeleton";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/formatters";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  FileSearch,
} from "lucide-react";
import { DettaglioVoceMeseSheet } from "@/components/controllo-gestione/ui/DettaglioVoceMeseSheet";
import { isDrillDownEnabled } from "@/hooks/controlloGestione/useDettaglioVoceMese";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { Printer } from "lucide-react";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { htmlContoEconomico } from "@/lib/contabilita/stampaBilancio";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";
import { formatPct } from "@/lib/controlloGestione/formatCG";
import { etichettaVoce, spiegazioneImposte } from "@/lib/controlloGestione/contoEconomico";
import { useImposte } from "@/hooks/controlloGestione/useImposte";
import { useMarginalitaCommesse } from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { useT, intlCampo, sostituisci } from "@/lib/campo/lingua/LinguaCampo";

interface TabCERiclassificatoProps {
  anno: number;
  meseDa: number;
  meseA: number;
}

type Vista = "consuntivo" | "mensile" | "confronto";
type QualityTone = "ok" | "warning" | "danger";

interface QualityCheck {
  id: string;
  label: string;
  description: string;
  tone: QualityTone;
  href?: string;
  cta?: string;
}

const MESI_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

// Codici di voci di costo: per queste un delta positivo è "negativo" (rosso).
const CODICI_COSTO = new Set([
  "03", "04", "05", "06", "07", "08", "09", "10", "11", "14", "15",
]);

const VISTE: Vista[] = ["consuntivo", "mensile", "confronto"];

function parseVista(value: string | null): Vista {
  return VISTE.includes(value as Vista) ? (value as Vista) : "consuntivo";
}

function findVoce(voci: { codice: string; valore: number }[], codice: string) {
  return voci.find((v) => v.codice === codice)?.valore ?? 0;
}

function formatPctDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(intlCampo(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(delta)}%`;
}

function calcDeltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** Spiegazioni brevi dei margini per chi non fa il commercialista. */
const SPIEGAZIONI_MARGINI: Record<string, string> = {
  A: "Ricavi delle vendite più la variazione dei lavori in corso: quanto ha prodotto l'azienda nel periodo.",
  D: "Ricavi meno materiali e lavorazioni (subappalti, noli, trasporti): quanto resta per pagare struttura e personale.",
  E: "EBITDA o MOL: margine dopo personale e spese generali, prima di ammortamenti, interessi e tasse. È il numero che guardano le banche.",
  F: "EBIT: margine operativo dopo gli ammortamenti (il costo dei mezzi e delle attrezzature distribuito negli anni).",
  "08b": "Uscite di banca e costi senza una voce assegnata: vanno classificate in Configurazione. I giroconti tra conti propri non sono costi.",
};

export function TabCERiclassificato({ anno, meseDa, meseA }: TabCERiclassificatoProps) {
  const tr = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const vista = parseVista(searchParams.get("ceView"));
  const [consuntivoDrill, setConsuntivoDrill] = useState<{
    mese: number | null;
    codice: string;
    label: string;
  } | null>(null);
  const ce = useCEriclassificato(anno, meseDa, meseA);
  const bep = useBEP(anno);
  const imposte = useImposte(anno);
  // Stessa fonte della Dashboard («N commesse in perdita»): la qualità dati
  // diceva «nessuna anomalia» mentre sotto comparivano cantieri sotto zero.
  const commesse = useMarginalitaCommesse(anno);
  // Serve a dire «non ci sono fatture» invece di mostrare ricavi a zero senza
  // spiegazione — o, come prima del 09/11/2026, il valore delle commesse
  // spacciato per ricavo.
  const provenienza = useRicaviProvenienza(anno, meseDa, meseA);

  const handleVistaChange = (value: string) => {
    if (!value || !VISTE.includes(value as Vista)) return;
    const next = new URLSearchParams(searchParams);
    if (value === "consuntivo") {
      next.delete("ceView");
    } else {
      next.set("ceView", value);
    }
    setSearchParams(next);
  };

  const allZero = useMemo(() => {
    if (!ce.data) return false;
    return ce.data.voci.every((v) => v.valore === 0);
  }, [ce.data]);

  const periodoLabel = meseDa === 1 && meseA === 12
    ? "Anno completo"
    : meseDa === meseA
      ? MESI_LABELS[meseDa - 1]
      : `${MESI_LABELS[meseDa - 1]}-${MESI_LABELS[meseA - 1]}`;

  // Stampa del conto economico (09/11/2026): prima usciva solo in Excel o
  // dentro il «Pacchetto banca», che è un documento pensato per la banca.
  const [stampaCE, setStampaCE] = useState<string | null>(null);
  const anagraficaCE = useAnagraficaAzienda();
  const htmlCE = () => {
    const a = anagraficaCE.data;
    return htmlContoEconomico({
      azienda: {
        ragione_sociale: a?.ragione_sociale ?? "",
        partita_iva: a?.partita_iva ?? null,
        codice_fiscale: a?.codice_fiscale ?? null,
        indirizzo_via: a?.indirizzo_via ?? null,
        indirizzo_numero_civico: a?.indirizzo_numero_civico ?? null,
        indirizzo_cap: a?.indirizzo_cap ?? null,
        indirizzo_comune: a?.indirizzo_comune ?? null,
        indirizzo_provincia: a?.indirizzo_provincia ?? null,
        logo_url: a?.logo_url ?? null,
      },
      voci: (ce.data?.voci ?? []).map((v) => ({
        codice: v.codice,
        label: etichettaVoce(v.codice, v.label),
        valore: v.valore,
        forte: v.tipo !== "voce",
      })),
      anno,
      mesi: periodoLabel === "Anno completo" ? null : periodoLabel,
      aliquotaImposte: ce.data?.meta?.aliquota_imposte_pct ?? null,
    });
  };

  const ViewSwitcher = (
    <ToggleGroup
      type="single"
      value={vista}
      onValueChange={handleVistaChange}
      className="justify-start overflow-x-auto"
    >
      <ToggleGroupItem value="consuntivo" variant="outline" size="sm">
        {tr("Consuntivo")}
      </ToggleGroupItem>
      <ToggleGroupItem value="mensile" variant="outline" size="sm">
        {tr("Mensile")}
      </ToggleGroupItem>
      <ToggleGroupItem value="confronto" variant="outline" size="sm">
        {tr("Confronto")}
      </ToggleGroupItem>
    </ToggleGroup>
  );

  if (vista === "consuntivo") {
    if (ce.isLoading) {
      return (
        <div className="space-y-4">
          {ViewSwitcher}
          <CESkeleton />
        </div>
      );
    }
    if (ce.isError) {
      return (
        <div className="space-y-4">
          {ViewSwitcher}
          <ErrorBlock onRetry={() => ce.refetch()} />
        </div>
      );
    }
    if (!ce.data) return <div className="space-y-4">{ViewSwitcher}</div>;

    if (allZero) {
      // Tutto a zero perché non ci sono fatture, non perché manchi la prima
      // nota: dirlo è l'unica risposta utile, mandarli in Prima Nota no.
      if (serveAvvisoRicavi(provenienza.data)) {
        return (
          <div className="space-y-4">
            {ViewSwitcher}
            <AvvisoRicaviCommesse
              provenienza={provenienza.data}
              periodoLabel={periodoLabel}
              anno={anno}
            />
          </div>
        );
      }
      return (
        <div className="space-y-4">
          {ViewSwitcher}
          <EmptyState
            title={tr("Nessun dato di conto economico")}
            description={tr("Per il periodo selezionato ({anno}) non ci sono movimenti registrati. Inserisci le scritture in Prima Nota per popolare il CE riclassificato.", { anno: String(anno ?? "") })}
            ctaLabel="Vai a Prima Nota"
            onCta={() => { window.location.href = "/azienda/prima-nota"; }}
          />
        </div>
      );
    }

    const pil = findVoce(ce.data.voci, "A");
    const ricavi = findVoce(ce.data.voci, "01");
    const ebitda = findVoce(ce.data.voci, "E");
    const ebit = findVoce(ce.data.voci, "F");
    const utile = findVoce(ce.data.voci, "L");
    // Leva operativa: DOL = margine di contribuzione ÷ EBIT, sulla stessa
    // scala (voce D) così numeratore e denominatore hanno lo stesso perimetro.
    // Ha senso solo con EBIT positivo.
    const margineOperativo = findVoce(ce.data.voci, "D");
    const dol = ebit > 0 && margineOperativo > 0 ? margineOperativo / ebit : null;
    // Senza ricavi le percentuali non esistono: «n.d.», non uno zero che sembra un risultato.
    const ebitdaPctPil = pil !== 0 ? (ebitda / pil) * 100 : null;
    const ebitPctPil = pil !== 0 ? (ebit / pil) * 100 : null;
    const costoMaterie = findVoce(ce.data.voci, "B");
    const costoPersonale = findVoce(ce.data.voci, "06");
    const costiNonClassificati = findVoce(ce.data.voci, "08b");
    const datiControlli = {
      hasCedolini: ce.data.meta.has_cedolini,
      periodoLabel,
      ebitdaPctPil,
      costoMaterie,
      costoPersonale,
      costiNonClassificati,
      commesseInPerdita: commesse.data?.kpi.n_in_perdita ?? null,
      daRegistrare: provenienza.data?.costi_da_registrare_righe
        ? { righe: provenienza.data.costi_da_registrare_righe, imponibile: Number(provenienza.data.costi_da_registrare_imponibile ?? 0) }
        : null,
      senzaImponibile: provenienza.data?.fatture_senza_imponibile_righe
        ? { righe: provenienza.data.fatture_senza_imponibile_righe, totale: Number(provenienza.data.fatture_senza_imponibile_totale ?? 0) }
        : null,
    };
    // In italiano per i file scaricati; tradotti per lo schermo.
    const qualityChecks = buildQualityChecks(datiControlli);
    const controlliSchermo = buildQualityChecks(datiControlli, tr);
    const spiegazioni: Record<string, string | null> = {
      ...Object.fromEntries(Object.entries(SPIEGAZIONI_MARGINI).map(([k, v]) => [k, tr(v)])),
      "15": spiegazioneImposte(ce.data.voci, imposte.data?.aliquote),
    };
    const annoInCorso = anno === new Date().getFullYear() && meseA === 12;
    const canDrillConsuntivo = meseDa === meseA;

    return (
      <div className="space-y-4">
        {stampaCE && (
          <PrintPreviewModal
            open
            onOpenChange={(v) => { if (!v) setStampaCE(null); }}
            htmlContent={stampaCE}
            title={tr("Conto economico — anteprima di stampa")}
            fileName={`conto-economico-${anno}`}
            soloPdf
          />
        )}
        <div className="flex items-center justify-between">
          {ViewSwitcher}
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStampaCE(htmlCE())}>
            <Printer className="mr-2 h-4 w-4" />{tr("Stampa")}
          </Button>
          <EsportaMenu anno={anno} sezioni={["ce", "ce_mensile", "bep", "imposte", "ricavi", "lavori_in_corso"]} titolo="Conto economico" />
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `ce_riclassificato_${anno}.xlsx`,
                brand: { title: "Conto Economico Riclassificato", subtitle: `Esercizio ${anno}` },
                sheets: [{
                  name: "Sintesi CFO",
                  columns: [
                    { header: "Voce", key: "label", width: 28 },
                    { header: "Valore", key: "value", width: 26 },
                    { header: "Nota", key: "note", width: 60 },
                  ],
                  rows: [
                    { label: "Periodo", value: periodoLabel, note: "Periodo selezionato in pagina" },
                    { label: "Ricavi", value: formatCurrency(ricavi), note: "Ricavi delle vendite" },
                    { label: "EBITDA", value: formatCurrency(ebitda), note: ebitdaPctPil == null ? "% non disponibile: nessun ricavo" : `${formatPct(ebitdaPctPil)} del valore della produzione` },
                    { label: "EBIT", value: formatCurrency(ebit), note: ebitPctPil == null ? "% non disponibile: nessun ricavo" : `${formatPct(ebitPctPil)} del valore della produzione` },
                    { label: "Utile", value: formatCurrency(utile), note: pil !== 0 ? `${formatPct((utile / pil) * 100)} del valore della produzione` : "" },
                    ...qualityChecks.filter((c) => c.tone !== "ok").map((c) => ({
                      label: c.label,
                      value: "Da controllare",
                      note: c.description,
                    })),
                  ],
                }, {
                  name: `CE ${anno}`,
                  columns: [
                    { header: "Cod", key: "codice", width: 6 },
                    { header: "Voce", key: "label", width: 35 },
                    { header: "Importo", key: "valore", width: 16, type: "number" },
                    { header: "% sui ricavi", key: "pct_disp", width: 12 },
                  ],
                  rows: ce.data.voci.map((v) => ({
                    ...v,
                    label: etichettaVoce(v.codice, v.label),
                    pct_disp: pil !== 0 && v.valore !== 0 ? formatPct((v.valore / pil) * 100) : "",
                  })),
                  rowStyle: (row) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const t = (row as any).tipo as string;
                    if (t === "subtot_grasso") return "total";
                    if (t === "subtot") return "subtot";
                    return "normal";
                  },
                }],
              });
            }}
          />
          </div>
        </div>
        <CEExecutiveSummary
          periodoLabel={periodoLabel}
          notaAnnoInCorso={annoInCorso}
          ricavi={ricavi}
          ebitda={ebitda}
          utile={utile}
          ebitdaPctPil={ebitdaPctPil}
          qualityChecks={controlliSchermo}
        />
        {/* La voce 02 si capisce col lavoro in corso dietro: a portata, ma chiuso. */}
        <details className="rounded-2xl border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">{tr("Lavori in corso (voce 02)")}</summary>
          <div className="mt-3"><LavoriInCorsoCard anno={anno} /></div>
        </details>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{tr("Conto Economico Riclassificato")}</CardTitle>
              {!canDrillConsuntivo && (
                <p className="text-xs text-muted-foreground">{tr("Le fonti di ogni voce: vista Mensile.")}</p>
              )}
            </CardHeader>
            <CardContent>
              <CETable
                voci={ce.data.voci}
                spiegazioni={spiegazioni}
                isVoceClickable={(voce) =>
                  canDrillConsuntivo && isDrillDownEnabled(voce.codice) && voce.valore !== 0
                }
                onVoceClick={(voce) => {
                  setConsuntivoDrill({
                    mese: meseDa,
                    codice: voce.codice,
                    label: voce.label,
                  });
                }}
              />
            </CardContent>
          </Card>

          <div className="space-y-3 lg:col-span-1">
            {/* Ricavi, EBITDA e utile stanno nella sintesi in alto: qui solo
                quello che la sintesi non dice. */}
            <KPIBox
              label={tr("EBIT (risultato operativo)")}
              value={formatCurrency(ebit)}
              sub={ebitPctPil != null ? tr("{valore} dei ricavi", { valore: formatPct(ebitPctPil) }) : tr("% n.d.: nessun ricavo")}
              tone="neutral"
              spiegazione={tr(SPIEGAZIONI_MARGINI.F)}
            />
            <KPIBox
              label={tr("Leva operativa")}
              spiegazione={tr("Quanto si muove l'utile operativo quando si muovono i ricavi: più costi fissi hai, più è alta.")}
              value={dol !== null ? `×${dol.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}` : "—"}
              sub={dol !== null ? tr("ricavi −10% → EBIT −{valore}%", { valore: Math.round(dol * 10) }) : tr("n.d. con EBIT a zero o negativo")}
              tone="blue"
            />
            <KPIBox
              label={tr("Punto di pareggio")}
              spiegazione={tr("Il giorno in cui i ricavi dell'anno coprono tutti i costi fissi: da lì in avanti ogni vendita porta utile.")}
              value={
                bep.isLoading
                  ? "…"
                  : bep.data?.bep_data
                    ? formatDate(bep.data.bep_data)
                    : tr("Non raggiunto")
              }
              sub={
                bep.data?.gia_raggiunto
                  ? tr("Già raggiunto: i costi fissi dell'anno sono coperti")
                  : bep.data?.giorni_residui != null
                    ? tr("Mancano {n} giorni", { n: bep.data.giorni_residui })
                    : undefined
              }
              tone={bep.data?.gia_raggiunto ? "green" : "neutral"}
            />
            {costiNonClassificati > 0 && (
              <KPIBox
                label={tr("Costi da classificare")}
                value={formatCurrency(costiNonClassificati)}
                sub={<Link className="underline underline-offset-2" to="/azienda/controllo-gestione/configurazione">{tr("Assegnali a una voce")}</Link>}
                tone="neutral"
                spiegazione={tr(SPIEGAZIONI_MARGINI["08b"])}
              />
            )}
          </div>

          <Card className="rounded-2xl lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{tr("Ricavi e costi progressivi: quando si va in utile")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BEPChart anno={anno} />
            </CardContent>
          </Card>
        </div>
        <DettaglioVoceMeseSheet
          open={consuntivoDrill !== null}
          onOpenChange={(open) => {
            if (!open) setConsuntivoDrill(null);
          }}
          anno={anno}
          mese={consuntivoDrill?.mese ?? null}
          codice={consuntivoDrill?.codice ?? null}
          labelFallback={consuntivoDrill?.label}
        />
      </div>
    );
  }

  if (vista === "mensile") {
    return (
      <div className="space-y-4">
        {ViewSwitcher}
        <CEMensileView anno={anno} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ViewSwitcher}
      <CEConfrontoView anno={anno} periodoLabel={periodoLabel} />
    </div>
  );
}

function CEExecutiveSummary({
  periodoLabel,
  notaAnnoInCorso,
  ricavi,
  ebitda,
  utile,
  ebitdaPctPil,
  qualityChecks,
}: {
  periodoLabel: string;
  notaAnnoInCorso: boolean;
  ricavi: number;
  ebitda: number;
  utile: number;
  ebitdaPctPil: number | null;
  qualityChecks: QualityCheck[];
}) {
  const t = useT();
  const daControllare = qualityChecks.filter((c) => c.tone !== "ok");
  // Le fatture ricevute non registrate cambiano l'utile: si vedono subito, non nel riquadro chiuso.
  const inEvidenza = daControllare.filter((c) => c.id === "da-registrare" || c.id === "senza-imponibile");
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t(periodoLabel)} {t("· IVA esclusa")}{notaAnnoInCorso ? ` ${t("· costi programmati fino a dicembre compresi")}` : ""}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
              daControllare.length
                ? "bg-muted text-foreground ring-border"
                : "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
            )}
          >
            {daControllare.length ? <FileSearch className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            {daControllare.length ? t("Da controllare: {n}", { n: daControllare.length }) : t("Dati completi")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniMetric label={t("Ricavi")} value={formatCurrency(ricavi)} />
          <MiniMetric label="EBITDA" value={formatCurrency(ebitda)} />
          <MiniMetric
            label={t("Margine EBITDA")}
            value={ebitdaPctPil == null ? "n.d." : formatPct(ebitdaPctPil)}
            title={ebitdaPctPil == null ? t("Non disponibile: nel periodo non ci sono ricavi.") : t("EBITDA diviso valore della produzione.")}
          />
          <MiniMetric label={t("Utile")} value={formatCurrency(utile)} />
        </div>
        {inEvidenza.map((c) => (
          <p key={c.id} role="status" className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-medium">{c.label}.</span> {c.description}{" "}
            {c.href && <Link to={c.href} className="font-medium underline underline-offset-2">{c.cta}</Link>}
          </p>
        ))}
        {daControllare.length > 0 && (
          <details className="rounded-lg border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("Cosa controllare ({n})", { n: daControllare.length })}</summary>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {daControllare.map((c) => (
                <li key={c.id}>
                  <span className="font-medium text-foreground">{c.label}.</span> {c.description}
                  {c.href && c.cta && (
                    <>
                      {" "}
                      <Link to={c.href} className="font-medium text-foreground underline underline-offset-2">{c.cta}</Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-xl border bg-background p-3" title={title}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Cosa controllare prima di usare questi numeri. Solo quello che c'è da fare:
 * ciò che va bene non si elenca.
 */
export function buildQualityChecks({
  hasCedolini,
  periodoLabel,
  ebitdaPctPil,
  costoMaterie,
  costoPersonale,
  costiNonClassificati = 0,
  commesseInPerdita = null,
  daRegistrare = null,
  senzaImponibile = null,
}: {
  hasCedolini: boolean;
  periodoLabel: string;
  ebitdaPctPil: number | null;
  costoMaterie: number;
  costoPersonale: number;
  costiNonClassificati?: number;
  commesseInPerdita?: number | null;
  daRegistrare?: { righe: number; imponibile: number } | null;
  senzaImponibile?: { righe: number; totale: number } | null;
}, tr: (testo: string, valori?: Record<string, string | number>) => string = sostituisci): QualityCheck[] {
  const checks: QualityCheck[] = [];
  // I costi arrivano dalle fatture ricevute solo dopo la registrazione: quelle
  // ancora da registrare non ci sono, e l'utile risulta più alto del vero.
  if (daRegistrare && daRegistrare.righe > 0)
    checks.push({
      id: "da-registrare",
      label: (daRegistrare.righe === 1 ? tr("{n} fattura ricevuta da registrare ({importo})", { n: daRegistrare.righe, importo: formatCurrency(daRegistrare.imponibile) }) : tr("{n} fatture ricevute da registrare ({importo})", { n: daRegistrare.righe, importo: formatCurrency(daRegistrare.imponibile) })),
      description: tr("Non sono tra i costi: se non le hai inserite a mano, l'utile è più alto del vero."),
      tone: "danger",
      href: "/azienda/documenti/fatture-ricevute?filtro=da_contabilizzare",
      cta: tr("Registrale"),
    });
  // Fatture emesse arrivate col solo totale: il ricavo comprende l'IVA.
  if (senzaImponibile && senzaImponibile.righe > 0)
    checks.push({
      id: "senza-imponibile",
      label: (senzaImponibile.righe === 1 ? tr("{n} fattura emessa senza imponibile ({importo})", { n: senzaImponibile.righe, importo: formatCurrency(senzaImponibile.totale) }) : tr("{n} fatture emesse senza imponibile ({importo})", { n: senzaImponibile.righe, importo: formatCurrency(senzaImponibile.totale) })),
      description: tr("Hanno solo il totale: i ricavi le contano IVA compresa, quindi sono più alti del vero."),
      tone: "danger",
      href: "/azienda/documenti",
      cta: tr("Correggi le fatture"),
    });
  if (periodoLabel !== "Anno completo")
    checks.push({ id: "periodo", label: tr("Periodo parziale"), description: tr("Confrontalo con lo stesso periodo dell'anno prima, non con un anno intero."), tone: "warning" });
  if (!hasCedolini)
    checks.push({ id: "cedolini", label: tr("Cedolini non caricati"), description: tr("Il costo del personale viene dai costi registrati e può essere incompleto."), tone: "warning", href: "/azienda/personale", cta: tr("Apri il personale") });
  if (ebitdaPctPil == null)
    checks.push({ id: "ricavi", label: tr("Nessun ricavo nel periodo"), description: tr("Le percentuali non sono disponibili."), tone: "warning" });
  else if (ebitdaPctPil > 45)
    checks.push({
      id: "margine",
      label: tr("Margine EBITDA al {valore}", { valore: formatPct(ebitdaPctPil) }),
      description: tr("Molto alto per l'edilizia: controlla che costi, paghe e ammortamenti ci siano tutti."),
      tone: ebitdaPctPil > 60 ? "danger" : "warning",
    });
  if (costoMaterie === 0 || costoPersonale === 0)
    checks.push({
      id: "costi",
      label: costoMaterie === 0 ? tr("Materiali a zero") : tr("Personale a zero"),
      description: tr("Una voce di costo principale manca: controlla le classificazioni."),
      tone: "warning",
      href: "/azienda/controllo-gestione/configurazione",
      cta: tr("Configura le voci"),
    });
  if (commesseInPerdita != null && commesseInPerdita > 0)
    checks.push({
      id: "commesse-perdita",
      label: (commesseInPerdita === 1 ? tr("{n} commessa in perdita", { n: commesseInPerdita }) : tr("{n} commesse in perdita", { n: commesseInPerdita })),
      description: tr("Margine atteso a fine lavori sotto zero."),
      tone: "warning",
      href: "/azienda/controllo-gestione/commesse",
      cta: tr("Vedi le commesse"),
    });
  if (costiNonClassificati > 0)
    checks.push({
      id: "non-classificati",
      label: tr("{importo} di costi senza voce", { importo: formatCurrency(costiNonClassificati) }),
      description: tr("Contano tra i costi generali e abbassano l'EBITDA."),
      tone: "warning",
      href: "/azienda/controllo-gestione/configurazione",
      cta: tr("Assegnali a una voce"),
    });
  return checks;
}

// ── Vista Mensile ──────────────────────────────────────────────────────────
function CEMensileView({ anno }: { anno: number }) {
  const t = useT();
  const q = useCEMensileDettaglio(anno);
  const [drill, setDrill] = useState<{
    mese: number;
    codice: string;
    label: string;
  } | null>(null);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  // Costruisci la matrice: prendi le voci del primo mese disponibile come schema.
  const schema: VoceCE[] =
    q.data.mesi.find((m) => m.voci.length > 0)?.voci ?? [];

  if (schema.length === 0) {
    return (
      <EmptyState
        title={t("Nessun dato mensile")}
        description={t("Per il {anno} non ci sono movimenti distribuiti per mese.", { anno: String(anno ?? "") })}
      />
    );
  }

  // Indicizzazione: per ogni codice voce, mappa mese → valore.
  const valoriPerCodiceMese = new Map<string, Map<number, number>>();
  for (const m of q.data.mesi) {
    for (const v of m.voci) {
      if (!valoriPerCodiceMese.has(v.codice)) {
        valoriPerCodiceMese.set(v.codice, new Map());
      }
      valoriPerCodiceMese.get(v.codice)!.set(m.mese, v.valore);
    }
  }

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("CE Mensile · {anno}", { anno: String(anno ?? "") })}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("Clicca un importo per vedere da cosa è fatto.")}</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="sticky left-0 z-10 w-12 bg-muted/40 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("Cod")}
                  </th>
                  <th className="sticky left-12 z-10 min-w-[200px] bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("Voce")}
                  </th>
                  {MESI_LABELS.map((m) => (
                    <th
                      key={m}
                      className="w-[80px] px-2 py-2 text-right text-xs font-medium text-muted-foreground"
                    >
                      {t(m)}
                    </th>
                  ))}
                  <th className="w-[100px] bg-primary/5 px-2 py-2 text-right text-xs font-semibold text-foreground">
                    {t("Totale")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {schema.map((v) => {
                  const isGrasso = v.tipo === "subtot_grasso";
                  const isSub = v.tipo === "subtot";
                  const valori = valoriPerCodiceMese.get(v.codice);
                  const valoriMese = MESI_LABELS.map((_, i) => valori?.get(i + 1) ?? 0);
                  const totale = valoriMese.reduce((acc, n) => acc + n, 0);
                  const drillEnabled = isDrillDownEnabled(v.codice);

                  return (
                    <tr
                      key={v.codice}
                      className={cn(
                        "border-t",
                        isGrasso && "bg-primary/5 font-bold",
                        isSub && "bg-muted/50 font-semibold",
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-2 py-2 font-mono text-xs text-muted-foreground",
                          isGrasso && "bg-primary/5",
                          isSub && "bg-muted/50",
                          !isGrasso && !isSub && "bg-background",
                        )}
                      >
                        {v.codice}
                      </td>
                      <td
                        className={cn(
                          "sticky left-12 z-10 px-3 py-2 text-left",
                          isGrasso && "bg-primary/5",
                          isSub && "bg-muted/50",
                          !isGrasso && !isSub && "bg-background",
                        )}
                      >
                        {etichettaVoce(v.codice, v.label)}
                      </td>
                      {valoriMese.map((val, i) => {
                        const mese = i + 1;
                        const isClickable = drillEnabled && val !== 0;
                        return (
                          <td
                            key={i}
                            className={cn(
                              "text-right tabular-nums text-xs",
                              isClickable ? "p-0" : "px-2 py-2",
                              val < 0 && "font-medium",
                              isClickable && "hover:bg-primary/10 hover:underline",
                            )}
                          >
                            {isClickable ? (
                              <button
                                type="button"
                                className="block w-full px-2 py-2 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                aria-label={t("Apri il dettaglio di {codice} · {valore} {anno}", { codice: String(etichettaVoce(v.codice, v.label) ?? ""), valore: String(MESI_LABELS[i] ?? ""), anno: String(anno ?? "") })}
                                title={t("Apri il dettaglio di {codice} · {valore}", { codice: String(etichettaVoce(v.codice, v.label) ?? ""), valore: String(MESI_LABELS[i] ?? "") })}
                                onClick={() => setDrill({ mese, codice: v.codice, label: etichettaVoce(v.codice, v.label) })}
                              >
                                {formatCurrencyCompact(val)}
                              </button>
                            ) : val !== 0 ? formatCurrencyCompact(val) : "—"}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "bg-primary/5 px-2 py-2 text-right tabular-nums text-xs font-semibold",
                          totale < 0 && "font-medium",
                        )}
                      >
                        {totale !== 0 ? formatCurrencyCompact(totale) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DettaglioVoceMeseSheet
        open={drill !== null}
        onOpenChange={(v) => {
          if (!v) setDrill(null);
        }}
        anno={anno}
        mese={drill?.mese ?? null}
        codice={drill?.codice ?? null}
        labelFallback={drill?.label}
      />
    </>
  );
}

// ── Vista Confronto ────────────────────────────────────────────────────────
function CEConfrontoView({ anno, periodoLabel }: { anno: number; periodoLabel: string }) {
  const t = useT();
  const anni = useMemo(() => [anno - 2, anno - 1, anno], [anno]);
  const q = useCEMultiAnno(anni);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const anniIndisponibili = q.data.filter((r) => r.stato === "errore").map((r) => r.anno);
  const schema = new Map<string, VoceCE>();
  const mappa = new Map<number, Map<string, number>>();

  // L'anno più recente fornisce l'ordine. Le voci solo storiche restano leggibili.
  for (const r of [...q.data].reverse()) {
    if (r.stato !== "letto") continue;
    const valori = new Map<string, number>();
    for (const voce of r.voci) {
      if (!schema.has(voce.codice)) schema.set(voce.codice, voce);
      valori.set(voce.codice, voce.valore);
    }
    mappa.set(r.anno, valori);
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("Confronto multi-anno · {valore} → {valore2}", { valore: String(anni[0] ?? ""), valore2: String(anni[2] ?? "") })}</CardTitle>
        {periodoLabel !== "Anno completo" && (
          <p className="text-xs text-muted-foreground">{t("Anni interi, anche se in alto hai scelto {periodoLabel}.", { periodoLabel: t(periodoLabel).toLowerCase() })}</p>
        )}
      </CardHeader>
      <CardContent>
        {anniIndisponibili.length > 0 && (
          <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <span>{t("Dati non disponibili per {anniIndisponibili}.", { anniIndisponibili: anniIndisponibili.join(", ") })}</span>
            <Button size="sm" variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>{t("Riprova")}</Button>
          </div>
        )}
        {schema.size === 0 && mappa.size > 0 && (
          <EmptyState title={t("Nessun dato di confronto")} description={t("Gli anni caricati non contengono voci di conto economico.")} />
        )}
        {schema.size > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="w-12 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  {t("Cod")}
                </th>
                <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {t("Voce")}
                </th>
                {anni.map((a) => (
                  <th
                    key={a}
                    className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                  >
                    {a}
                    {anniIndisponibili.includes(a) && <span className="block">{t("Non disponibile")}</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  {t("Variazione sull'anno prima")}
                </th>
                <th className="w-12 px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  {t("Trend")}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...schema.values()].map((v) => {
                const isGrasso = v.tipo === "subtot_grasso";
                const isSub = v.tipo === "subtot";
                const valori = anni.map((a) => mappa.get(a)?.get(v.codice));
                const corr = valori[2];
                const prec = valori[1];
                const delta = corr !== undefined && prec !== undefined ? calcDeltaPct(corr, prec) : null;
                const isCosto = CODICI_COSTO.has(v.codice);

                let deltaColor = "text-muted-foreground";
                let trendIcon = delta === null ? null : <ArrowRight className="mx-auto h-3.5 w-3.5 text-muted-foreground" />;
                if (delta !== null && Math.abs(delta) >= 0.1) {
                  const positivo = delta > 0;
                  // Per voci di costo: positivo = brutto = rosso.
                  const buono = isCosto ? !positivo : positivo;
                  deltaColor = buono ? "text-emerald-600" : "text-rose-600";
                  trendIcon = positivo ? (
                    <ArrowUp className={cn("mx-auto h-3.5 w-3.5", buono ? "text-emerald-600" : "text-rose-600")} />
                  ) : (
                    <ArrowDown className={cn("mx-auto h-3.5 w-3.5", buono ? "text-emerald-600" : "text-rose-600")} />
                  );
                }

                return (
                  <tr
                    key={v.codice}
                    className={cn(
                      "border-t",
                      isGrasso && "bg-primary/5 font-bold",
                      isSub && "bg-muted/50 font-semibold",
                    )}
                  >
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {v.codice}
                    </td>
                    <td className="px-3 py-2">{etichettaVoce(v.codice, v.label)}</td>
                    {valori.map((val, i) => (
                      <td
                        key={anni[i]}
                        aria-label={val === undefined ? t("Dato non disponibile") : val === 0 ? t("Zero euro") : undefined}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          val !== undefined && val < 0 && "font-medium",
                        )}
                      >
                        {val !== undefined && val !== 0 ? formatCurrency(val) : "—"}
                      </td>
                    ))}
                    <td className={cn("px-3 py-2 text-right tabular-nums text-xs font-medium", deltaColor)}>
                      {delta !== null ? formatPctDelta(delta) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center">{trendIcon}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
