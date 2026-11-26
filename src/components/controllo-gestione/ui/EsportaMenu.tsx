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
import { supabase } from "@/integrations/supabase/client";
import {
  caricaSezioni, htmlEsportazione, nomeFile, scaricaCsv, scaricaJson, scaricaXlsx,
  type FormatoEsportazione, type SezioneEsportata, type Tabella,
} from "@/lib/controlloGestione/esportaTutto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";

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

/**
 * Nome dell'azienda per l'intestazione, letto solo al momento di scaricare: l'azienda è quella
 * che vede il database (get_my_company_id, come le RPC delle sezioni). Senza, il file resta senza nome.
 */
async function ragioneSociale(): Promise<string | null> {
  try {
    const { data: azienda } = await supabase.rpc("get_my_company_id");
    if (!azienda) return null;
    const { data } = await supabase
      .from("anagrafica_azienda" as never)
      .select("ragione_sociale")
      .eq("company_id", azienda as string)
      .maybeSingle();
    return (data as { ragione_sociale?: string | null } | null)?.ragione_sociale ?? null;
  } catch {
    return null;
  }
}

export function EsportaMenu({ anno, sezioni, titolo, tabelleExtra, label = "Scarica", size = "sm" }: Props) {
  const t = useT();
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
      const intestazione = { azienda: await ragioneSociale(), titolo, anno };
      if (tutte.every((s) => s.tabelle.length === 0 && !s.errore)) {
        toast.info(t("Niente da scaricare per quest'anno"));
        return;
      }
      if (formato === "xlsx") await scaricaXlsx(tutte, intestazione);
      else if (formato === "csv") await scaricaCsv(tutte, intestazione);
      else if (formato === "json") scaricaJson(tutte, intestazione);
      else setAnteprima({ html: htmlEsportazione(tutte, intestazione), nome: nomeFile(intestazione, "pdf") });
      const mancanti = tutte.filter((s) => s.errore);
      if (mancanti.length) {
        toast.warning(t("{n} sezioni non disponibili", { n: mancanti.length }), { description: mancanti.map((s) => s.titolo).join(", ") });
      } else if (formato !== "pdf") {
        toast.success(t("File scaricato"));
      }
    } catch (e) {
      toast.error(t("Esportazione non riuscita"), { description: e instanceof Error ? e.message : t("Riprova.") });
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
          <Button variant="outline" size={size} className={BOTTONE_SECONDARIO} disabled={occupato !== null} aria-label={t(label || "Scarica")} title={t(label || "Scarica")}>
            {occupato ? <Loader2 className="animate-spin" /> : <Download />}
            {label ? t(label) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{t(titolo)} · {anno}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {voce("xlsx", FileSpreadsheet, "Excel (.xlsx)", t("Un foglio per tabella, con indice"))}
          {voce("pdf", FileText, "PDF", t("Documento A4 da salvare o stampare"))}
          {voce("csv", FileArchive, "CSV", t("Per Excel italiano; più tabelle in uno ZIP"))}
          {voce("json", FileJson, "JSON", t("I dati completi, per altri programmi"))}
        </DropdownMenuContent>
      </DropdownMenu>
      {anteprima && (
        <PrintPreviewModal
          open
          onOpenChange={(o) => { if (!o) setAnteprima(null); }}
          htmlContent={anteprima.html}
          fileName={anteprima.nome}
          title={`${t(titolo)} · ${anno}`}
          soloPdf
        />
      )}
    </>
  );
}
