/**
 * «Scarica»: le sezioni del Controllo di gestione in Excel, CSV, PDF o JSON.
 * Le sezioni si leggono dal database al momento (stessi dati delle schede); `tabelleExtra`
 * aggiunge tabelle già calcolate nella pagina (per esempio il rendiconto di cassa).
 * Funziona anche da telefono.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, FileJson, FileArchive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import {
  caricaSezioni, htmlEsportazione, nomeFile, scaricaCsv, scaricaJson, scaricaXlsx,
  type FormatoEsportazione, type SezioneEsportata, type Tabella,
} from "@/lib/controlloGestione/esportaTutto";

interface Props {
  anno: number;
  /** Chiavi di SEZIONI da leggere dal database. */
  sezioni: string[];
  /** Titolo del documento e del file. */
  titolo: string;
  /** Tabelle già pronte nella pagina, aggiunte in testa. */
  tabelleExtra?: () => Tabella[];
  label?: string;
  size?: "sm" | "default";
}

export function EsportaMenu({ anno, sezioni, titolo, tabelleExtra, label = "Scarica", size = "sm" }: Props) {
  const anagrafica = useAnagraficaAzienda();
  const [occupato, setOccupato] = useState<FormatoEsportazione | null>(null);
  const [anteprima, setAnteprima] = useState<{ html: string; nome: string } | null>(null);

  const esporta = async (formato: FormatoEsportazione) => {
    setOccupato(formato);
    try {
      const lette = sezioni.length ? await caricaSezioni(sezioni, anno) : [];
      const extra = tabelleExtra?.() ?? [];
      const tutte: SezioneEsportata[] = [
        ...(extra.length ? [{ chiave: "pagina", titolo, tabelle: extra, dati: extra }] : []),
        ...lette,
      ];
      const intestazione = {
        azienda: (anagrafica.data as { ragione_sociale?: string | null } | null | undefined)?.ragione_sociale ?? null,
        titolo,
        anno,
      };
      if (tutte.every((s) => s.tabelle.length === 0 && !s.errore)) {
        toast.info("Niente da scaricare per quest'anno");
        return;
      }
      if (formato === "xlsx") await scaricaXlsx(tutte, intestazione);
      else if (formato === "csv") await scaricaCsv(tutte, intestazione);
      else if (formato === "json") scaricaJson(tutte, intestazione);
      else setAnteprima({ html: htmlEsportazione(tutte, intestazione), nome: nomeFile(intestazione, "pdf") });
      const mancanti = tutte.filter((s) => s.errore);
      if (mancanti.length) {
        toast.warning(`${mancanti.length} sezioni non disponibili`, { description: mancanti.map((s) => s.titolo).join(", ") });
      } else if (formato !== "pdf") {
        toast.success("File scaricato");
      }
    } catch (e) {
      toast.error("Esportazione non riuscita", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      setOccupato(null);
    }
  };

  const voce = (formato: FormatoEsportazione, Icona: typeof FileText, testo: string, nota: string) => (
    <DropdownMenuItem disabled={occupato !== null} onSelect={(ev) => { ev.preventDefault(); void esporta(formato); }}>
      <Icona className="mr-2 h-4 w-4" />
      <div className="flex flex-col">
        <span>{testo}</span>
        <span className="text-[11px] text-muted-foreground">{nota}</span>
      </div>
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size} className="gap-1.5" disabled={occupato !== null} aria-label={label || "Scarica"} title={label || "Scarica"}>
            {occupato ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{titolo} · {anno}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {voce("xlsx", FileSpreadsheet, "Excel (.xlsx)", "Un foglio per tabella, con indice")}
          {voce("pdf", FileText, "PDF", "Documento A4 da salvare o stampare")}
          {voce("csv", FileArchive, "CSV", "Per Excel italiano; più tabelle in uno ZIP")}
          {voce("json", FileJson, "JSON", "I dati completi, per altri programmi")}
        </DropdownMenuContent>
      </DropdownMenu>
      {anteprima && (
        <PrintPreviewModal
          open
          onOpenChange={(o) => { if (!o) setAnteprima(null); }}
          htmlContent={anteprima.html}
          fileName={anteprima.nome}
          title={`${titolo} · ${anno}`}
          soloPdf
        />
      )}
    </>
  );
}
