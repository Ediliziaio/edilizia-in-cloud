/**
 * Sprint C — Catalogo Esteso
 * Pagina «Importa» del Listino — combina wizard Excel/CSV e PDF con l'AI.
 *
 * Rotta: /azienda/impostazioni/listino/import
 *
 * Il titolo della pagina («Listino») lo mette il layout: qui il titolo è un `<h2>`. Le voci del primo menu dicono dove
 * vanno i dati (catalogo articoli, prodotti del Listino, manodopera e servizi: vedi `destinazioniImport.ts`).
 */
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ListinoImportWizard } from "@/components/listino-import/ListinoImportWizard";
import { ListinoAIImport } from "@/components/listino-import/ListinoAIImport";

export default function SettingsCatalogImport() {
  // ?tab=ai: dal listino, «Listino fornitore in PDF» apriva la scheda dell'Excel.
  const [parametri] = useSearchParams();
  const [tab, setTab] = useState<"manual" | "ai">(() => (parametri.get("tab") === "ai" ? "ai" : "manual"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Importa da Excel, CSV o PDF</h2>
          <p className="text-sm text-muted-foreground">
            Scegli cosa stai importando: dove finiscono i dati dipende da questa scelta.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link to="/azienda/impostazioni/listino">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" /> Torna al listino
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "manual" | "ai")}>
        <TabsList>
          <TabsTrigger value="manual">
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" /> Excel o CSV
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" /> PDF con l'AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <ListinoImportWizard />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <ListinoAIImport />
        </TabsContent>
      </Tabs>

      <p className="max-w-5xl text-xs text-muted-foreground">
        Excel o CSV: scarica il modello e compila le colonne con l'asterisco; i campi personalizzati si configurano in
        Impostazioni → Campi personalizzati. PDF: funziona meglio con listini a tabelle; l'AI mostra sempre un'anteprima
        che puoi correggere prima di importare.
      </p>
    </div>
  );
}
