import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import {
  useStatoPatrimoniale,
  useSPMultiAnno,
  type SPResult,
} from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { SPColumns } from "@/components/controllo-gestione/ui/SPColumns";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";

interface TabStatoPatrimonialeProps {
  anno: number;
}

type Vista = "anno" | "confronto";

export function TabStatoPatrimoniale({ anno }: TabStatoPatrimonialeProps) {
  const [vista, setVista] = useState<Vista>("anno");

  const ViewSwitcher = (
    <ToggleGroup
      type="single"
      value={vista}
      onValueChange={(v) => v && setVista(v as Vista)}
      className="justify-start"
    >
      <ToggleGroupItem value="anno" variant="outline" size="sm">
        Bilancio anno
      </ToggleGroupItem>
      <ToggleGroupItem value="confronto" variant="outline" size="sm">
        Confronto multi-anno
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {ViewSwitcher}
        <SPExportButton anno={anno} />
      </div>
      {vista === "anno" ? (
        <SPSingleAnnoView anno={anno} />
      ) : (
        <SPConfrontoView anno={anno} />
      )}
    </div>
  );
}

function SPExportButton({ anno }: { anno: number }) {
  const sp = useStatoPatrimoniale(anno);
  if (!sp.data) return null;
  const { attivo, passivo } = sp.data;

  const formatRows = () => {
    const rows: { codice: string; label: string; valore: number; tipo: string }[] = [];
    // ATTIVO
    rows.push({ codice: "A", label: "ATTIVO", valore: 0, tipo: "subtot_grasso" });
    rows.push({ codice: "01", label: "Imm. immateriali", valore: attivo.imm_immateriali, tipo: "voce" });
    rows.push({ codice: "02", label: "Imm. materiali", valore: attivo.imm_materiali, tipo: "voce" });
    rows.push({ codice: "03", label: "Imm. finanziarie", valore: attivo.imm_finanziarie, tipo: "voce" });
    rows.push({ codice: "AF", label: "Attivo fisso TOT", valore: attivo.attivo_fisso, tipo: "subtot" });
    rows.push({ codice: "04", label: "Rimanenze", valore: attivo.rimanenze, tipo: "voce" });
    rows.push({ codice: "05", label: "Crediti clienti", valore: attivo.crediti_clienti, tipo: "voce" });
    rows.push({ codice: "06", label: "Crediti tributari", valore: attivo.crediti_tributari, tipo: "voce" });
    rows.push({ codice: "07", label: "Anticipi fornitori", valore: attivo.anticipi_fornitori, tipo: "voce" });
    rows.push({ codice: "LD", label: "Liq. differite TOT", valore: attivo.liquidita_differite, tipo: "subtot" });
    rows.push({ codice: "08", label: "Cassa", valore: attivo.cassa, tipo: "voce" });
    rows.push({ codice: "09", label: "Banche +", valore: attivo.banche_positive, tipo: "voce" });
    rows.push({ codice: "LI", label: "Liq. immediate TOT", valore: attivo.liquidita_immediate, tipo: "subtot" });
    rows.push({ codice: "AC", label: "Attivo Circ. TOT", valore: attivo.attivo_circolante, tipo: "subtot" });
    rows.push({ codice: "TA", label: "TOTALE ATTIVO", valore: attivo.totale, tipo: "subtot_grasso" });
    // PASSIVO
    rows.push({ codice: "P", label: "PASSIVO", valore: 0, tipo: "subtot_grasso" });
    rows.push({ codice: "10", label: "Capitale", valore: passivo.capitale_sociale, tipo: "voce" });
    rows.push({ codice: "11", label: "Riserve", valore: passivo.riserve, tipo: "voce" });
    rows.push({ codice: "12", label: "Utile esercizio", valore: passivo.utile_esercizio, tipo: "voce" });
    rows.push({ codice: "12b", label: "Riserve/rettifiche di raccordo", valore: passivo.rettifica_patrimoniale ?? 0, tipo: "voce" });
    rows.push({ codice: "MP", label: "Mezzi propri TOT", valore: passivo.mezzi_propri, tipo: "subtot" });
    rows.push({ codice: "13", label: "TFR", valore: passivo.fondo_tfr, tipo: "voce" });
    rows.push({ codice: "14", label: "Fondi rischi", valore: passivo.fondi_rischi, tipo: "voce" });
    rows.push({ codice: "15", label: "Mutui MLT", valore: passivo.mutui_mlt, tipo: "voce" });
    rows.push({ codice: "PC", label: "Pas. Consol. TOT", valore: passivo.pas_consolidato, tipo: "subtot" });
    rows.push({ codice: "16", label: "Banche -", valore: passivo.banche_negative, tipo: "voce" });
    rows.push({ codice: "17", label: "Debiti forn.", valore: passivo.debiti_fornitori, tipo: "voce" });
    rows.push({ codice: "18", label: "Debiti trib.", valore: passivo.debiti_tributari, tipo: "voce" });
    rows.push({ codice: "19", label: "Debiti pers.", valore: passivo.debiti_personale, tipo: "voce" });
    rows.push({ codice: "20", label: "Debiti prev.", valore: passivo.debiti_previdenziali, tipo: "voce" });
    rows.push({ codice: "PR", label: "Pas. Corrente TOT", valore: passivo.pas_corrente, tipo: "subtot" });
    rows.push({ codice: "TP", label: "TOTALE PASSIVO", valore: passivo.totale, tipo: "subtot_grasso" });
    return rows;
  };

  return (
    <ExportButton
      onExport={async () => {
        await exportXlsx({
          filename: `stato_patrimoniale_${anno}.xlsx`,
          brand: { title: "Stato Patrimoniale Riclassificato", subtitle: `Esercizio ${anno}` },
          sheets: [{
            name: `SP ${anno}`,
            columns: [
              { header: "Cod", key: "codice", width: 6 },
              { header: "Voce", key: "label", width: 30 },
              { header: "Importo", key: "valore", width: 18, type: "number" },
            ],
            rows: formatRows(),
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
  );
}

function SPSingleAnnoView({ anno }: { anno: number }) {
  const sp = useStatoPatrimoniale(anno);

  if (sp.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[500px] rounded-2xl" />
        <Skeleton className="h-[500px] rounded-2xl" />
      </div>
    );
  }
  if (sp.isError) return <ErrorBlock onRetry={() => sp.refetch()} />;
  if (!sp.data) return null;

  const { attivo, passivo, quadratura } = sp.data;

  if (attivo.totale === 0 && passivo.totale === 0) {
    return (
      <EmptyState
        title="Stato patrimoniale vuoto"
        description={`Non ho dati patrimoniali per il ${anno}. Carica i cespiti e il patrimonio netto per popolare l'attivo fisso e i mezzi propri.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!quadratura.quadrato && (
        <Alert className="rounded-2xl border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900">Bilancio non quadrato</AlertTitle>
          <AlertDescription className="space-y-1 text-amber-800">
            <p>
              Differenza Attivo − Passivo: <strong>{formatCurrency(quadratura.differenza)}</strong>.
              Verifica le voci di patrimonio netto, cespiti e mutui MLT — sono i campi
              che vanno alimentati a mano.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <SPColumns attivo={attivo} passivo={passivo} />
    </div>
  );
}

// ── Vista Confronto Multi-Anno ─────────────────────────────────────────────

type LivelloRiga = "voce" | "subtot" | "totale";

interface RigaConfronto {
  label: string;
  livello: LivelloRiga;
  /** Estrae il valore dal SPResult per la sezione interessata. */
  pick: (sp: SPResult) => number;
  /**
   * Per le voci di DEBITO/passività un aumento è NEGATIVO: il delta va colorato
   * al contrario (aumento = rosso, calo = verde). Il patrimonio netto e l'attivo
   * seguono la logica normale (aumento = verde). Prima ogni aumento era verde
   * anche sui debiti → un mutuo che cresce sembrava "buono".
   */
  higherIsWorse?: boolean;
}

const RIGHE_ATTIVO: RigaConfronto[] = [
  { label: "Imm. immateriali", livello: "voce", pick: (sp) => sp.attivo.imm_immateriali },
  { label: "Imm. materiali", livello: "voce", pick: (sp) => sp.attivo.imm_materiali },
  { label: "Imm. finanziarie", livello: "voce", pick: (sp) => sp.attivo.imm_finanziarie },
  { label: "Attivo fisso TOT", livello: "subtot", pick: (sp) => sp.attivo.attivo_fisso },
  { label: "Rimanenze", livello: "voce", pick: (sp) => sp.attivo.rimanenze },
  { label: "Crediti clienti", livello: "voce", pick: (sp) => sp.attivo.crediti_clienti },
  { label: "Crediti tributari", livello: "voce", pick: (sp) => sp.attivo.crediti_tributari },
  { label: "Anticipi fornitori", livello: "voce", pick: (sp) => sp.attivo.anticipi_fornitori },
  { label: "Liq. differite TOT", livello: "subtot", pick: (sp) => sp.attivo.liquidita_differite },
  { label: "Cassa", livello: "voce", pick: (sp) => sp.attivo.cassa },
  { label: "Banche +", livello: "voce", pick: (sp) => sp.attivo.banche_positive },
  { label: "Liq. immediate TOT", livello: "subtot", pick: (sp) => sp.attivo.liquidita_immediate },
  { label: "Attivo Circ. TOT", livello: "subtot", pick: (sp) => sp.attivo.attivo_circolante },
  { label: "TOTALE ATTIVO", livello: "totale", pick: (sp) => sp.attivo.totale },
];

const RIGHE_PASSIVO: RigaConfronto[] = [
  // Patrimonio netto: aumento = buono (verde).
  { label: "Capitale", livello: "voce", pick: (sp) => sp.passivo.capitale_sociale },
  { label: "Riserve", livello: "voce", pick: (sp) => sp.passivo.riserve },
  { label: "Utile esercizio", livello: "voce", pick: (sp) => sp.passivo.utile_esercizio },
  { label: "Riserve/rettifiche di raccordo", livello: "voce", pick: (sp) => sp.passivo.rettifica_patrimoniale ?? 0 },
  { label: "Mezzi propri TOT", livello: "subtot", pick: (sp) => sp.passivo.mezzi_propri },
  // Debiti/passività: aumento = negativo (rosso).
  { label: "TFR", livello: "voce", pick: (sp) => sp.passivo.fondo_tfr, higherIsWorse: true },
  { label: "Fondi rischi", livello: "voce", pick: (sp) => sp.passivo.fondi_rischi, higherIsWorse: true },
  { label: "Mutui MLT", livello: "voce", pick: (sp) => sp.passivo.mutui_mlt, higherIsWorse: true },
  { label: "Pas. Consol. TOT", livello: "subtot", pick: (sp) => sp.passivo.pas_consolidato, higherIsWorse: true },
  { label: "Banche -", livello: "voce", pick: (sp) => sp.passivo.banche_negative, higherIsWorse: true },
  { label: "Debiti forn.", livello: "voce", pick: (sp) => sp.passivo.debiti_fornitori, higherIsWorse: true },
  { label: "Debiti trib.", livello: "voce", pick: (sp) => sp.passivo.debiti_tributari, higherIsWorse: true },
  { label: "Debiti pers.", livello: "voce", pick: (sp) => sp.passivo.debiti_personale, higherIsWorse: true },
  { label: "Debiti prev.", livello: "voce", pick: (sp) => sp.passivo.debiti_previdenziali, higherIsWorse: true },
  { label: "Pas. Corrente TOT", livello: "subtot", pick: (sp) => sp.passivo.pas_corrente, higherIsWorse: true },
  // Totale passivo = totale attivo per costruzione: neutro, nessun segnale buono/cattivo.
  { label: "TOTALE PASSIVO", livello: "totale", pick: (sp) => sp.passivo.totale },
];

function calcDeltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function formatPctDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(delta)}%`;
}

function SPConfrontoView({ anno }: { anno: number }) {
  const anni = useMemo(() => [anno - 2, anno - 1, anno], [anno]);
  const q = useSPMultiAnno(anni);

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

  const dataMap = new Map<number, SPResult | null>();
  for (const r of q.data) dataMap.set(r.anno, r.data);

  const tutteVuote = q.data.every((r) => r.data === null);
  if (tutteVuote) {
    return (
      <EmptyState
        title="Nessun dato di confronto"
        description={`Non ho stato patrimoniale per gli anni ${anni.join(", ")}.`}
      />
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Confronto Stato Patrimoniale · {anni[0]} → {anni[2]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
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
                  Δ% YoY
                </th>
              </tr>
            </thead>
            <tbody>
              <SezioneHeader titolo="ATTIVO" colSpan={anni.length + 2} />
              {RIGHE_ATTIVO.map((r) => (
                <RigaConfrontoRow
                  key={`a-${r.label}`}
                  riga={r}
                  anni={anni}
                  dataMap={dataMap}
                />
              ))}
              <SezioneHeader titolo="PASSIVO" colSpan={anni.length + 2} />
              {RIGHE_PASSIVO.map((r) => (
                <RigaConfrontoRow
                  key={`p-${r.label}`}
                  riga={r}
                  anni={anni}
                  dataMap={dataMap}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SezioneHeader({ titolo, colSpan }: { titolo: string; colSpan: number }) {
  return (
    <tr className="border-t bg-muted/70">
      <td
        colSpan={colSpan}
        className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
      >
        {titolo}
      </td>
    </tr>
  );
}

function RigaConfrontoRow({
  riga,
  anni,
  dataMap,
}: {
  riga: RigaConfronto;
  anni: number[];
  dataMap: Map<number, SPResult | null>;
}) {
  const valori = anni.map((a) => {
    const sp = dataMap.get(a);
    return sp ? riga.pick(sp) : null;
  });
  const corr = valori[2];
  const prec = valori[1];
  const delta =
    corr !== null && prec !== null ? calcDeltaPct(corr, prec) : null;

  // Colore del delta: sui debiti/passività un aumento è NEGATIVO → invertiamo
  // (aumento rosso, calo verde). Attivo e patrimonio netto: logica normale
  // (aumento verde). Variazione nulla = neutro (né verde né rosso).
  const deltaColorClass =
    delta === null || delta === 0
      ? "text-muted-foreground"
      : (riga.higherIsWorse ? delta < 0 : delta > 0)
        ? "text-emerald-600"
        : "text-rose-600";

  const isSub = riga.livello === "subtot";
  const isTot = riga.livello === "totale";

  return (
    <tr
      className={cn(
        "border-t",
        isSub && "bg-muted/50 font-semibold",
        isTot && "bg-primary/5 font-bold",
      )}
    >
      <td className="px-3 py-2">{riga.label}</td>
      {valori.map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-3 py-2 text-right tabular-nums",
            v !== null && v < 0 && "text-destructive",
          )}
        >
          {v === null ? "—" : formatCurrency(v)}
        </td>
      ))}
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums text-xs font-medium",
          deltaColorClass,
        )}
      >
        {delta === null ? "—" : formatPctDelta(delta)}
      </td>
    </tr>
  );
}

