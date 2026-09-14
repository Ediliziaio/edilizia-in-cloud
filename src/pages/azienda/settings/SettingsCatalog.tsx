/**
 * Preventivatore Verticalizzato Serramentisti — Catalogo listino.
 *
 * Area → tipologia → linea → prodotti (vedi FamilyCatalog e
 * lib/listino/lineeListino). Qui solo l'intestazione, la guida e il dialog
 * delle tipologie; barra, navigazione e azioni stanno nel catalogo.
 *
 * Permission gating: solo `company_admin` / `super_admin` possono accedere
 * (stesso pattern di WarehouseManager). Un commerciale non deve poter
 * modificare il listino prezzi dell'azienda.
 */

import { useState } from "react";
import { FamilyCatalog } from "@/components/listino/FamilyCatalog";
import { MacroCategorieManager } from "@/components/listino/MacroCategorieManager";
import { ListinoGuide } from "@/components/listino/ListinoGuide";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FolderTree, ShieldAlert, Package } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export default function SettingsCatalog() {
  const [showCategorieDialog, setShowCategorieDialog] = useState(false);
  const { role } = useAuth();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const canView = isAdmin || permissions.canViewSettingsPricing;
  // Crea e cancella tipologie solo l'amministratore: è la regola del database, e
  // con il solo permesso sui prezzi i bottoni del dialog davano un errore.
  const gestoreTipologie = role === "company_admin" || role === "super_admin";

  if (!canView) {
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
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 shadow-sm">
          <Package className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">Listino prodotti</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Area, tipologia, linea: i prodotti con il prezzo di ogni linea.
          </p>
        </div>
        <div className="ml-auto">
          <ListinoGuide />
        </div>
      </div>

      <ErrorBoundary title="Errore nel listino">
        <FamilyCatalog onGestisciTipologie={gestoreTipologie ? () => setShowCategorieDialog(true) : undefined} />
      </ErrorBoundary>

      <Dialog open={showCategorieDialog} onOpenChange={setShowCategorieDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                <FolderTree className="h-4.5 w-4.5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle>Tipologie del listino</DialogTitle>
                <DialogDescription>
                  Ogni tipologia (serramenti, tapparelle, inverter…) appartiene a un'area, e l'area decide in
                  quale preventivatore compaiono i suoi prodotti.
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
