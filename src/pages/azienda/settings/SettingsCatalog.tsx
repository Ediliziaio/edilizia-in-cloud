/**
 * Preventivatore Verticalizzato Serramentisti — Catalogo listino.
 *
 * Gerarchia a 3 livelli:
 *   MACROCATEGORIA (es. INFISSO MODELLO 1)
 *     └─ CATEGORIA (es. FINESTRA 1 ANTA)
 *         └─ ARTICOLO (ex "famiglia", con prezzi/assi/varianti)
 *
 * UI:
 *  - Header: pulsanti "Gestisci categorie" + "Import Excel/CSV" + "Import AI da PDF".
 *  - Contenuto: catalogo articoli raggruppato per macrocategoria → categoria.
 *  - Niente più tab "Articoli singoli": creando un articolo puoi già definire
 *    il prezzo puntuale, non serve un'altra vista separata.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { FamilyCatalog } from "@/components/listino/FamilyCatalog";
import { MacroCategorieManager } from "@/components/listino/MacroCategorieManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, Sparkles, FolderTree } from "lucide-react";

export default function SettingsCatalog() {
  const [showCategorieDialog, setShowCategorieDialog] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCategorieDialog(true)}
        >
          <FolderTree className="h-4 w-4 mr-2" aria-hidden="true" />
          Gestisci categorie
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/azienda/impostazioni/listino/import">
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            Import Excel/CSV
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/azienda/impostazioni/listino/import">
            <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
            Import AI da PDF
          </Link>
        </Button>
      </div>

      <FamilyCatalog />

      <Dialog open={showCategorieDialog} onOpenChange={setShowCategorieDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestione categorie</DialogTitle>
            <DialogDescription>
              Organizza il listino in macrocategorie e categorie. Gli articoli
              saranno raggruppati automaticamente in base a questa struttura.
            </DialogDescription>
          </DialogHeader>
          <MacroCategorieManager />
        </DialogContent>
      </Dialog>
    </div>
  );
}
