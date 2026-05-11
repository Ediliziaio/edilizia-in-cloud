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
import { ListinoGuide } from "@/components/listino/ListinoGuide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Upload, Sparkles, FolderTree, ShieldAlert, ChevronDown, Package } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <div className="space-y-6">
      {/* Header coerente con SettingsQuoteTemplates — palette arancione */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Listino Prodotti</h1>
            <p className="text-sm text-muted-foreground">
              Catalogo articoli organizzato per macrocategoria e categoria con prezzi,
              griglia L×H e variabili (colore, apertura…).
            </p>
          </div>
        </div>
      </div>

      <ListinoGuide />

      <FamilyCatalog
        headerActions={
          <>
            <Button
              size="sm"
              onClick={() => setShowCategorieDialog(true)}
              className="h-10 bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
            >
              <FolderTree className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Categorie
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 border-orange-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 dark:border-orange-900/50 dark:hover:bg-orange-950/40">
                  <Upload className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Importa
                  <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/azienda/impostazioni/listino/import" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                    <div className="flex flex-col">
                      <span>Excel / CSV</span>
                      <span className="text-[10px] text-muted-foreground">Foglio di calcolo</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/azienda/impostazioni/listino/import" className="cursor-pointer">
                    <Sparkles className="h-4 w-4 mr-2 text-orange-500" aria-hidden="true" />
                    <div className="flex flex-col">
                      <span>AI da PDF</span>
                      <span className="text-[10px] text-muted-foreground">Listino fornitore</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Dialog open={showCategorieDialog} onOpenChange={setShowCategorieDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                <FolderTree className="h-4.5 w-4.5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle>Gestione categorie</DialogTitle>
                <DialogDescription>
                  Organizza il listino in macrocategorie e categorie. Gli articoli
                  saranno raggruppati automaticamente.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <MacroCategorieManager />
        </DialogContent>
      </Dialog>
    </div>
  );
}
