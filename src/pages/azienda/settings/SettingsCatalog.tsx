/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.7
 *
 * Pagina catalogo listino con tab switcher:
 *  - Famiglie (default, nuovo preventivatore verticalizzato)
 *  - Articoli singoli (legacy, ArticleCatalog)
 *
 * Lo switch tra le due viste è gestito tramite query string ?tab=famiglie|articoli
 * così il tab sopravvive a refresh + è condivisibile.
 */

import { Link, useSearchParams } from "react-router-dom";
import { ArticleCatalog } from "@/components/settings/ArticleCatalog";
import { FamilyCatalog } from "@/components/listino/FamilyCatalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, Sparkles } from "lucide-react";

export default function SettingsCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "famiglie";

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/azienda/impostazioni/listino/import">
            <Upload className="h-4 w-4 mr-2" />
            Import Excel/CSV
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/azienda/impostazioni/listino/import">
            <Sparkles className="h-4 w-4 mr-2" />
            Import AI da PDF
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={handleChange}>
        <TabsList>
          <TabsTrigger value="famiglie">Famiglie</TabsTrigger>
          <TabsTrigger value="articoli">Articoli singoli</TabsTrigger>
        </TabsList>
        <TabsContent value="famiglie" className="mt-4">
          <FamilyCatalog />
        </TabsContent>
        <TabsContent value="articoli" className="mt-4">
          <ArticleCatalog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
