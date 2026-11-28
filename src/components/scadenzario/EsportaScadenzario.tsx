import { useCallback, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, RotateCcw } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ElencoColonne } from "@/components/tabelle/SceltaColonne";
import { useAuth } from "@/contexts/AuthContext";
import { exportToCSV } from "@/lib/csvExport";
import type { Scadenza } from "@/hooks/useScadenzario";
import type { ColonnaTabella } from "@/lib/tabelle/colonneTabella";
import {
  COLONNE_EXPORT, MIME_PDF, MIME_XLSX, colonneExportDaTabella, colonneValide, costruisciRighe, generaPdf, generaXlsx,
  intestazioniCsv, ordinaRighe, righeCsv, scaricaBuffer,
  type ChiaveExport, type FormatoExport, type MetaExport, type OrdineExport,
} from "@/lib/scadenzario/esportaScadenzario";

export interface EsportaScadenzarioProps {
  /** Legge TUTTE le scadenze che rispettano i filtri (stessa lettura del vecchio CSV, con la select di esportaScadenzario.ts). */
  carica: () => Promise<Scadenza[]>;
  titolo?: string;
  azienda?: string;
  /** Periodo in chiaro, es. «01/11/2026 – 30/11/2026». */
  periodo?: string;
  /** Un testo per filtro attivo, es. ["Solo uscite", "Metodo: Ri.Ba."]. */
  descrizioneFiltri: string[];
  /** Senza estensione, es. «scadenzario_2026». */
  nomeFile: string;
  disabilitato?: boolean;
  compatto?: boolean;
  /**
   * Le colonne che la tabella ha in vista adesso, nell'ordine (chiavi di `DEF_SCADENZE`):
   * «Come la tabella» riparte da qui, e sono le colonne iniziali se non c'è una scelta salvata.
   */
  colonneTabella?: string[];
}

const ETICHETTE = new Map<string, string>(COLONNE_EXPORT.map((c) => [c.key, c.label]));

function chiaveSalvataggio(companyId: string, userId: string) {
  return `colonne-export-scadenzario-v1:${userId}:${companyId}`;
}

/** L'ultima scelta fatta su questo computer, letta con diffidenza: l'ha scritta una versione passata di noi. */
function leggiScelta(chiave: string): ChiaveExport[] | null {
  try {
    const grezzo = localStorage.getItem(chiave);
    if (!grezzo) return null;
    const letta = JSON.parse(grezzo) as { colonne?: unknown };
    if (!Array.isArray(letta?.colonne)) return null;
    const buone = letta.colonne.filter((k): k is string => typeof k === "string" && ETICHETTE.has(k));
    return buone.length ? colonneValide(buone, "xlsx") : null;
  } catch {
    return null;
  }
}

export function EsportaScadenzario({ carica, titolo = "Scadenzario", azienda, periodo, descrizioneFiltri, nomeFile, disabilitato, compatto, colonneTabella }: EsportaScadenzarioProps) {
  const [ordine, setOrdine] = useState<OrdineExport>("data");
  const tr = useT();
  const { effectiveCompany, user } = useAuth();
  const chiave = chiaveSalvataggio(effectiveCompany?.id || "nessuna", user?.id || "sessione");
  const [inCorso, setInCorso] = useState<FormatoExport | null>(null);
  const [aperto, setAperto] = useState(false);
  // La scelta viaggia con la chiave con cui è stata letta: cambiando azienda o persona si rilegge.
  const [salvata, setSalvata] = useState<{ chiave: string; colonne: ChiaveExport[] | null }>(() => ({ chiave, colonne: leggiScelta(chiave) }));
  const daTabella = useMemo(() => colonneExportDaTabella(colonneTabella), [colonneTabella]);
  const colonne = (salvata.chiave === chiave ? salvata.colonne : leggiScelta(chiave)) ?? daTabella;

  const scegli = useCallback((nuove: ChiaveExport[]) => {
    setSalvata({ chiave, colonne: nuove });
    try { localStorage.setItem(chiave, JSON.stringify({ colonne: nuove })); } catch { /* navigazione privata: vale per questa visita */ }
  }, [chiave]);

  const pannello = useMemo(() => {
    const tutte: ChiaveExport[] = COLONNE_EXPORT.map((c) => c.key);
    const spente = tutte.filter((k) => !colonne.includes(k));
    const def = (k: string): ColonnaTabella => ({ chiave: k, etichetta: ETICHETTE.get(k) ?? k });
    return {
      stato: [...colonne, ...spente].map((k) => ({ colonna: def(k), accesa: colonne.includes(k as ChiaveExport) })),
      accendi: (k: string, accesa: boolean) => {
        const c = k as ChiaveExport;
        if (accesa) { if (!colonne.includes(c)) scegli([...colonne, c]); }
        else if (colonne.length > 1) scegli(colonne.filter((x) => x !== c)); // almeno una colonna
      },
      sposta: (k: string, a: number) => {
        const da = colonne.indexOf(k as ChiaveExport);
        if (da < 0) return;
        const nuove = colonne.filter((x) => x !== k);
        nuove.splice(Math.max(0, Math.min(a, nuove.length)), 0, k as ChiaveExport);
        scegli(nuove);
      },
      ripristina: () => scegli(daTabella),
      toccata: false,
    };
  }, [colonne, scegli, daTabella]);

  const esporta = async (formato: FormatoExport) => {
    if (inCorso) return;
    setInCorso(formato);
    try {
      const righe = costruisciRighe(await carica());
      if (righe.length === 0) { toast.info(tr("Nessuna scadenza da esportare")); return; }
      const meta: MetaExport = { titolo, azienda, periodo, filtri: descrizioneFiltri, ordine, dataStampa: new Date() };
      if (formato === "xlsx") scaricaBuffer(await generaXlsx(righe, meta, colonne), `${nomeFile}.xlsx`, MIME_XLSX);
      else if (formato === "pdf") scaricaBuffer(await generaPdf(righe, meta, colonne), `${nomeFile}.pdf`, MIME_PDF);
      else exportToCSV(righeCsv(ordinaRighe(righe, ordine), colonne), intestazioniCsv(colonne), `${nomeFile}.csv`);
      toast.success(`${righe.length} ${tr("scadenze esportate")}`);
      setAperto(false);
    } catch {
      toast.error(tr("Errore durante l'export"));
    } finally {
      setInCorso(null);
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compatto ? "sm" : "default"} disabled={disabilitato || !!inCorso} className={compatto ? "h-8 gap-1.5 px-2.5 text-xs" : "gap-1.5"}>
          {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {tr("Esporta")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Esporta scadenzario")}</DialogTitle>
          <DialogDescription>{tr("Scegli le colonne e l'ordine, poi il formato.")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{tr("Ordina per")}</p>
          <RadioGroup value={ordine} onValueChange={(v) => setOrdine(v as OrdineExport)} className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5"><RadioGroupItem value="data" id="esporta-ordine-data" /><Label htmlFor="esporta-ordine-data" className="font-normal">{tr("Data di scadenza")}</Label></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="controparte" id="esporta-ordine-controparte" /><Label htmlFor="esporta-ordine-controparte" className="font-normal">{tr("Fornitore / cliente")}</Label></div>
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{tr("Colonne")}</p>
            <span className="text-xs text-muted-foreground" data-testid="esporta-conteggio-colonne">
              {colonne.length} {colonne.length === 1 ? tr("colonna su") : tr("colonne su")} {COLONNE_EXPORT.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => scegli(daTabella)}>
              <RotateCcw className="h-3 w-3" />{tr("Come la tabella")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => scegli(COLONNE_EXPORT.map((c) => c.key))}>
              {tr("Tutte")}
            </Button>
          </div>
          <div className="max-h-[40vh] overflow-y-auto rounded-md border p-1">
            <ElencoColonne colonne={pannello} />
          </div>
          {colonne.length === 1 ? <p className="text-xs text-muted-foreground">{tr("Serve almeno una colonna.")}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" disabled={!!inCorso} onClick={() => void esporta("xlsx")} className="gap-1.5">
            {inCorso === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}{tr("Excel (.xlsx)")}
          </Button>
          <Button type="button" variant="secondary" disabled={!!inCorso} onClick={() => void esporta("pdf")} className="gap-1.5">
            {inCorso === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{tr("PDF")}
          </Button>
          <Button type="button" variant="secondary" disabled={!!inCorso} onClick={() => void esporta("csv")} className="gap-1.5">
            {inCorso === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{tr("CSV")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EsportaScadenzario;
