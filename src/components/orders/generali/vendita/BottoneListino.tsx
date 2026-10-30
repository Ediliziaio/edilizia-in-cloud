// src/components/orders/generali/vendita/BottoneListino.tsx
// «Listino» nella barra del tabellone: il listino disponibilità di tutta l'operazione in PDF o
// in Excel (unità, m², prezzo di listino delle libere, stato), senza acquirenti né incassi.
// Il prezzo c'è solo se chi lo prepara vede gli importi e lo sceglie. Solo da tablet e computer.
import { useState } from "react";
import { FileSpreadsheet, FileText, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { scaricaBlob } from "@/components/orders/generali/vendita/scarica";
import { useAziendaDossier } from "@/hooks/useGeneraleRendiconto";
import { oggiLocale } from "@/lib/orders/generali/documenti";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import { aziendaVendita, componiListino, nomeFileListino } from "@/lib/orders/generali/vendita";

interface Props {
  generaleId: string;
  operazione: string;
  unita: UnitaGenerale[];
  vedeImporti: boolean;
}

export function BottoneListino({ generaleId, operazione, unita, vedeImporti }: Props) {
  const azienda = useAziendaDossier();
  const [aperto, setAperto] = useState(false);
  const [conPrezzi, setConPrezzi] = useState(vedeImporti);
  const [preparo, setPreparo] = useState<"pdf" | "xlsx" | null>(null);

  const genera = async (formato: "pdf" | "xlsx") => {
    if (!azienda.data || preparo) return;
    setPreparo(formato);
    try {
      const d = componiListino({ azienda: aziendaVendita(azienda.data), operazione, unita, conPrezzi: vedeImporti && conPrezzi, data: oggiLocale() });
      if (formato === "pdf") {
        const [{ pdf }, { ListinoPDF }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/components/orders/generali/vendita/VenditaPDF"),
        ]);
        scaricaBlob(await pdf(<ListinoPDF d={d} />).toBlob(), nomeFileListino(d));
      } else {
        const { creaExcelListino, TIPO_XLSX } = await import("@/lib/orders/generali/venditaExcel");
        scaricaBlob(new Blob([await creaExcelListino(d)], { type: TIPO_XLSX }), nomeFileListino(d, "xlsx"));
      }
      setAperto(false);
    } catch {
      toast.error(formato === "pdf" ? "Non sono riuscito a preparare il PDF. Riprova." : "Non sono riuscito a preparare l'Excel. Riprova.");
    } finally {
      setPreparo(null);
    }
  };

  const idPrezzi = `listino-prezzi-${generaleId}`;
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline"><ListChecks className="mr-1.5 h-3.5 w-3.5" /> Listino</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-medium">Listino disponibilità</p>
          <p className="text-xs text-muted-foreground">Tutte le unità con m² e stato, da dare ad agenzie e clienti. Senza acquirenti né incassi.</p>
        </div>
        {vedeImporti && (
          <div className="flex items-center gap-2">
            <Checkbox id={idPrezzi} checked={conPrezzi} onCheckedChange={(v) => setConPrezzi(v === true)} />
            <Label htmlFor={idPrezzi} className="text-sm font-normal">Con i prezzi delle unità libere</Label>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={!azienda.data || !!preparo} onClick={() => void genera("pdf")}>
            {preparo === "pdf" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />} PDF
          </Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={!azienda.data || !!preparo} onClick={() => void genera("xlsx")}>
            {preparo === "xlsx" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />} Excel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
