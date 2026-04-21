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
 *
 * Permission gating: solo `company_admin` / `super_admin` possono accedere
 * (stesso pattern di WarehouseManager). Un commerciale non deve poter
 * modificare il listino prezzi dell'azienda.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { FamilyCatalog } from "@/components/listino/FamilyCatalog";
import { MacroCategorieManager } from "@/components/listino/MacroCategorieManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, Sparkles, FolderTree, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsCatalog() {
  const [showCategorieDialog, setShowCategorieDialog] = useState(false);
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";

  if (!isAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent
          className="py-10 flex flex-col items-center gap-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-medium">Accesso riservato</p>
            <p className="text-sm text-muted-foreground mt-1">
              Solo l&apos;amministratore dell&apos;azienda può modificare il
              catalogo articoli e le categorie. Contatta il titolare se hai
              bisogno di aggiungere nuove voci.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
