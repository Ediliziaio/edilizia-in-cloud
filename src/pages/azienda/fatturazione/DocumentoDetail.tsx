import { useParams, useNavigate, Link } from "react-router-dom";
import { useDocumentoFiscale } from "@/hooks/useDocumentiFiscali";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, FileText, FileWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { DocumentoFiscale as Doc, AnagraficaAzienda } from "@/types/fatturazione";

const NC_ALLOWED_STATES = ["emessa", "consegnata", "inviata_sdi", "accettata", "pagata", "parzialmente_pagata"];

const STATO_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  emessa: { label: "Emessa", variant: "default" },
  inviata_sdi: { label: "Inviata SDI", variant: "default" },
  consegnata: { label: "Consegnata", variant: "default" },
  accettata: { label: "Accettata", variant: "default" },
  rifiutata: { label: "Rifiutata", variant: "destructive" },
  pagata: { label: "Pagata", variant: "default" },
  parzialmente_pagata: { label: "Parzialmente pagata", variant: "outline" },
  stornata: { label: "Stornata", variant: "secondary" },
  annullata: { label: "Annullata", variant: "destructive" },
};

const TIPO_LABELS: Record<string, string> = {
  fattura: "Fattura",
  fattura_pa: "Fattura PA",
  nota_credito: "Nota di Credito",
  nota_debito: "Nota di Debito",
  ddt: "DDT",
  proforma: "Proforma",
  preventivo: "Preventivo",
};

export default function DocumentoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: doc, isLoading } = useDocumentoFiscale(id);
  const { data: azienda } = useAnagraficaAzienda();
  const [ncLoading, setNcLoading] = useState(false);

  if (isLoading || !doc) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canCreateNC = NC_ALLOWED_STATES.includes(doc.stato);
  const stato = STATO_LABELS[doc.stato] ?? { label: doc.stato, variant: "secondary" as const };
  const tipoLabel = TIPO_LABELS[doc.tipo] ?? doc.tipo;

  const handleCreaNC = async (modalita: "totale" | "parziale") => {
    try {
      setNcLoading(true);
      const prefilled = await creaNotaCredito(doc.id, modalita);
      // Navigate to create a new document with prefilled data
      navigate("/azienda/documenti/nuovo?tipo=nota_credito", {
        state: { prefilled },
      });
    } catch (err: any) {
      toast.error("Errore nella creazione della NC", { description: err.message });
    } finally {
      setNcLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      await downloadNativePDF(doc.id, doc.numero);
      toast.success("PDF scaricato");
    } catch (err: any) {
      toast.error("Errore nel download PDF", { description: err.message });
    }
  };

  const handleDownloadXML = () => {
    try {
      const xml = generateFatturaPAXML(doc, azienda as AnagraficaAzienda);
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.numero}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("XML scaricato");
    } catch (err: any) {
      toast.error("Errore nella generazione XML", { description: err.message });
    }
  };

  const residuo = doc.totale_da_pagare - doc.importo_pagato;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{tipoLabel} N° {doc.numero}</h1>
              <Badge variant={stato.variant}>{stato.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {doc.cliente_snapshot?.ragione_sociale} — {doc.data_emissione}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          {doc.tipo !== "ddt" && doc.tipo !== "proforma" && doc.tipo !== "preventivo" && (
            <Button variant="outline" size="sm" onClick={handleDownloadXML}>
              <FileText className="h-4 w-4 mr-1" /> XML
            </Button>
          )}

          {canCreateNC && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={ncLoading}>
                  <FileWarning className="h-4 w-4 mr-1" />
                  {ncLoading ? "Creazione..." : "Emetti Nota di Credito"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Crea Nota di Credito</AlertDialogTitle>
                  <AlertDialogDescription>
                    Scegli la modalità di storno per la fattura N° {doc.numero}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3 py-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto py-3"
                    onClick={() => handleCreaNC("totale")}
                  >
                    <div className="text-left">
                      <div className="font-medium">Storno totale automatico</div>
                      <div className="text-xs text-muted-foreground">
                        Tutte le righe vengono copiate con quantità negate
                      </div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto py-3"
                    onClick={() => handleCreaNC("parziale")}
                  >
                    <div className="text-left">
                      <div className="font-medium">Storno parziale</div>
                      <div className="text-xs text-muted-foreground">
                        Apri l'editor per inserire le righe manualmente
                      </div>
                    </div>
                  </Button>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {doc.stato === "bozza" && (
            <Button size="sm" asChild>
              <Link to={`/azienda/documenti/${doc.id}`}>Modifica</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Payment status */}
      {doc.tipo !== "ddt" && doc.tipo !== "preventivo" && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Totale documento</p>
              <p className="text-lg font-semibold">€ {doc.totale_documento.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Netto a pagare</p>
              <p className="text-lg font-semibold">€ {doc.totale_da_pagare.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Incassato</p>
              <p className="text-lg font-semibold text-emerald-600">€ {doc.importo_pagato.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Residuo</p>
              <p className={`text-lg font-semibold ${residuo > 0 ? "text-destructive" : ""}`}>
                € {residuo.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview */}
      <div className="bg-muted/30 rounded-lg p-6 flex justify-center">
        <PreviewFattura documento={doc} azienda={azienda ?? null} scale={0.75} />
      </div>
    </div>
  );
}
