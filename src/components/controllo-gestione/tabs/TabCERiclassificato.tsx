import { useMemo, useState } from "react";
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
  return `${sign}${new Intl.NumberFormat("it-IT", {
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
        Consuntivo
      </ToggleGroupItem>
      <ToggleGroupItem value="mensile" variant="outline" size="sm">
        Mensile
      </ToggleGroupItem>
      <ToggleGroupItem value="confronto" variant="outline" size="sm">
        Confronto
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
            title="Nessun dato di conto economico"
            description={`Per il periodo selezionato (${anno}) non ci sono movimenti registrati. Inserisci le scritture in Prima Nota per popolare il CE riclassificato.`}
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
    const qualityChecks = buildQualityChecks({
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
    });
    const spiegazioni: Record<string, string | null> = {
      ...SPIEGAZIONI_MARGINI,
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
            title="Conto economico — anteprima di stampa"
            fileName={`conto-economico-${anno}`}
            soloPdf
          />
        )}
        <div className="flex items-center justify-between">
          {ViewSwitcher}
          <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStampaCE(htmlCE())}>
            <Printer className="mr-2 h-4 w-4" />Stampa
          </Button>
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
          qualityChecks={qualityChecks}
        />
        {/* La voce 02 si capisce col lavoro in corso dietro: a portata, ma chiuso. */}
        <details className="rounded-2xl border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">Lavori in corso (voce 02)</summary>
          <div className="mt-3"><LavoriInCorsoCard anno={anno} /></div>
        </details>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conto Economico Riclassificato</CardTitle>
              {!canDrillConsuntivo && (
                <p className="text-xs text-muted-foreground">Le fonti di ogni voce: vista Mensile.</p>
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
              label="EBIT (risultato operativo)"
              value={formatCurrency(ebit)}
              sub={ebitPctPil != null ? `${formatPct(ebitPctPil)} dei ricavi` : "% n.d.: nessun ricavo"}
              tone="neutral"
              spiegazione={SPIEGAZIONI_MARGINI.F}
            />
            <KPIBox
              label="Leva operativa"
              spiegazione="Quanto si muove l'utile operativo quando si muovono i ricavi: più costi fissi hai, più è alta."
              value={dol !== null ? `×${dol.toLocaleString("it-IT", { maximumFractionDigits: 1 })}` : "—"}
              sub={dol !== null ? `ricavi −10% → EBIT −${Math.round(dol * 10)}%` : "n.d. con EBIT a zero o negativo"}
              tone="blue"
            />
            <KPIBox
              label="Punto di pareggio"
              spiegazione="Il giorno in cui i ricavi dell'anno coprono tutti i costi fissi: da lì in avanti ogni vendita porta utile."
              value={
                bep.isLoading
                  ? "…"
                  : bep.data?.bep_data
                    ? formatDate(bep.data.bep_data)
                    : "Non raggiunto"
              }
              sub={
                bep.data?.gia_raggiunto
                  ? "Già raggiunto: i costi fissi dell'anno sono coperti"
                  : bep.data?.giorni_residui != null
                    ? `Mancano ${bep.data.giorni_residui} giorni`
                    : undefined
              }
              tone={bep.data?.gia_raggiunto ? "green" : "neutral"}
            />
            {costiNonClassificati > 0 && (
              <KPIBox
                label="Costi da classificare"
                value={formatCurrency(costiNonClassificati)}
                sub={<Link className="underline underline-offset-2" to="/azienda/controllo-gestione/configurazione">Assegnali a una voce</Link>}
                tone="neutral"
                spiegazione={SPIEGAZIONI_MARGINI["08b"]}
              />
            )}
          </div>

          <Card className="rounded-2xl lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ricavi e costi progressivi: quando si va in utile</CardTitle>
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
  const daControllare = qualityChecks.filter((c) => c.tone !== "ok");
  // Le fatture ricevute non registrate cambiano l'utile: si vedono subito, non nel riquadro chiuso.
  const inEvidenza = daControllare.find((c) => c.id === "da-registrare");
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {periodoLabel} · IVA esclusa{notaAnnoInCorso ? " · costi programmati fino a dicembre compresi" : ""}
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
            {daControllare.length ? `Da controllare: ${daControllare.length}` : "Dati completi"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniMetric label="Ricavi" value={formatCurrency(ricavi)} />
          <MiniMetric label="EBITDA" value={formatCurrency(ebitda)} />
          <MiniMetric
            label="Margine EBITDA"
            value={ebitdaPctPil == null ? "n.d." : formatPct(ebitdaPctPil)}
            title={ebitdaPctPil == null ? "Non disponibile: nel periodo non ci sono ricavi." : "EBITDA diviso valore della produzione."}
          />
          <MiniMetric label="Utile" value={formatCurrency(utile)} />
        </div>
        {inEvidenza && (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-medium">{inEvidenza.label}.</span> {inEvidenza.description}{" "}
            {inEvidenza.href && <Link to={inEvidenza.href} className="font-medium underline underline-offset-2">{inEvidenza.cta}</Link>}
          </p>
        )}
        {daControllare.length > 0 && (
          <details className="rounded-lg border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium">Cosa controllare ({daControllare.length})</summary>
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
}: {
  hasCedolini: boolean;
  periodoLabel: string;
  ebitdaPctPil: number | null;
  costoMaterie: number;
  costoPersonale: number;
  costiNonClassificati?: number;
  commesseInPerdita?: number | null;
  daRegistrare?: { righe: number; imponibile: number } | null;
}): QualityCheck[] {
  const checks: QualityCheck[] = [];
  // I costi arrivano dalle fatture ricevute solo dopo la registrazione: quelle
  // ancora da registrare non ci sono, e l'utile risulta più alto del vero.
  if (daRegistrare && daRegistrare.righe > 0)
    checks.push({
      id: "da-registrare",
      label: `${daRegistrare.righe} ${daRegistrare.righe === 1 ? "fattura ricevuta" : "fatture ricevute"} da registrare (${formatCurrency(daRegistrare.imponibile)})`,
      description: "Non sono tra i costi: se non le hai inserite a mano, l'utile è più alto del vero.",
      tone: "danger",
      href: "/azienda/documenti/fatture-ricevute?filtro=da_contabilizzare",
      cta: "Registrale",
    });
  if (periodoLabel !== "Anno completo")
    checks.push({ id: "periodo", label: "Periodo parziale", description: "Confrontalo con lo stesso periodo dell'anno prima, non con un anno intero.", tone: "warning" });
  if (!hasCedolini)
    checks.push({ id: "cedolini", label: "Cedolini non caricati", description: "Il costo del personale viene dai costi registrati e può essere incompleto.", tone: "warning", href: "/azienda/personale", cta: "Apri il personale" });
  if (ebitdaPctPil == null)
    checks.push({ id: "ricavi", label: "Nessun ricavo nel periodo", description: "Le percentuali non sono disponibili.", tone: "warning" });
  else if (ebitdaPctPil > 45)
    checks.push({
      id: "margine",
      label: `Margine EBITDA al ${formatPct(ebitdaPctPil)}`,
      description: "Molto alto per l'edilizia: controlla che costi, paghe e ammortamenti ci siano tutti.",
      tone: ebitdaPctPil > 60 ? "danger" : "warning",
    });
  if (costoMaterie === 0 || costoPersonale === 0)
    checks.push({
      id: "costi",
      label: costoMaterie === 0 ? "Materiali a zero" : "Personale a zero",
      description: "Una voce di costo principale manca: controlla le classificazioni.",
      tone: "warning",
      href: "/azienda/controllo-gestione/configurazione",
      cta: "Configura le voci",
    });
  if (commesseInPerdita != null && commesseInPerdita > 0)
    checks.push({
      id: "commesse-perdita",
      label: `${commesseInPerdita} ${commesseInPerdita === 1 ? "commessa" : "commesse"} in perdita`,
      description: "Margine atteso a fine lavori sotto zero.",
      tone: "warning",
      href: "/azienda/controllo-gestione/commesse",
      cta: "Vedi le commesse",
    });
  if (costiNonClassificati > 0)
    checks.push({
      id: "non-classificati",
      label: `${formatCurrency(costiNonClassificati)} di costi senza voce`,
      description: "Contano tra i costi generali e abbassano l'EBITDA.",
      tone: "warning",
      href: "/azienda/controllo-gestione/configurazione",
      cta: "Assegnali a una voce",
    });
  return checks;
}

// ── Vista Mensile ──────────────────────────────────────────────────────────
function CEMensileView({ anno }: { anno: number }) {
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
        title="Nessun dato mensile"
        description={`Per il ${anno} non ci sono movimenti distribuiti per mese.`}
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
          <CardTitle className="text-base">CE Mensile · {anno}</CardTitle>
          <p className="text-xs text-muted-foreground">Clicca un importo per vedere da cosa è fatto.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="sticky left-0 z-10 w-12 bg-muted/40 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    Cod
                  </th>
                  <th className="sticky left-12 z-10 min-w-[200px] bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Voce
                  </th>
                  {MESI_LABELS.map((m) => (
                    <th
                      key={m}
                      className="w-[80px] px-2 py-2 text-right text-xs font-medium text-muted-foreground"
                    >
                      {m}
                    </th>
                  ))}
                  <th className="w-[100px] bg-primary/5 px-2 py-2 text-right text-xs font-semibold text-foreground">
                    Totale
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
                                aria-label={`Apri il dettaglio di ${etichettaVoce(v.codice, v.label)} · ${MESI_LABELS[i]} ${anno}`}
                                title={`Apri il dettaglio di ${etichettaVoce(v.codice, v.label)} · ${MESI_LABELS[i]}`}
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

  // Schema dalle voci dell'anno corrente (l'ultimo).
  const annoCorrenteRow = q.data.find((r) => r.anno === anno);
  const schema: VoceCE[] = annoCorrenteRow?.voci ?? q.data[0]?.voci ?? [];

  if (schema.length === 0) {
    return (
      <EmptyState
        title="Nessun dato di confronto"
        description={`Non ho voci di CE per gli anni ${anni.join(", ")}.`}
      />
    );
  }

  const mappa = new Map<number, Map<string, number>>();
  for (const r of q.data) {
    const m = new Map<string, number>();
    for (const v of r.voci) m.set(v.codice, v.valore);
    mappa.set(r.anno, m);
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Confronto multi-anno · {anni[0]} → {anni[2]}
        </CardTitle>
        {periodoLabel !== "Anno completo" && (
          <p className="text-xs text-muted-foreground">Anni interi, anche se in alto hai scelto {periodoLabel.toLowerCase()}.</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="w-12 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Cod
                </th>
                <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Voce
                </th>
                {anni.map((a) => (
                  <th
                    key={a}
                    className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                  >
                    {a}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Variazione sull'anno prima
                </th>
                <th className="w-12 px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {schema.map((v) => {
                const isGrasso = v.tipo === "subtot_grasso";
                const isSub = v.tipo === "subtot";
                const valori = anni.map((a) => mappa.get(a)?.get(v.codice) ?? 0);
                const corr = valori[2];
                const prec = valori[1];
                const delta = calcDeltaPct(corr, prec);
                const isCosto = CODICI_COSTO.has(v.codice);

                let deltaColor = "text-muted-foreground";
                let trendIcon = <ArrowRight className="mx-auto h-3.5 w-3.5 text-muted-foreground" />;
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
                        key={i}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          val < 0 && "font-medium",
                        )}
                      >
                        {val !== 0 ? formatCurrency(val) : "—"}
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
      </CardContent>
    </Card>
  );
}
