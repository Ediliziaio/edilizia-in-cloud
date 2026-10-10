import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { FamilyEditor } from "@/components/listino/FamilyEditor";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Editor del prodotto del listino.
 *
 * Crea e modifica i prodotti con le loro opzioni e la griglia dei prezzi. Lo apre chi ha «Listino & Prezzi»
 * in visualizzazione e lo cambia chi ce l'ha in modifica (gli amministratori hanno tutto). Chi può solo vedere apre il
 * prodotto in sola lettura: campi spenti, nessun pulsante di salvataggio (`soloLettura`).
 */
export default function SettingsFamilyEditor() {
  const { role } = useAuth();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const canView = isAdmin || permissions.canViewSettingsPricing;

  if (!canView) {
    return (
      <Card className="max-w-xl mx-auto mt-10">
        <CardContent
          className="py-10 flex flex-col items-center gap-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <ShieldAlert
            className="h-12 w-12 text-amber-500"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">Accesso riservato</p>
            <p className="text-sm text-muted-foreground mt-1">
              Per aprire i prodotti serve il permesso «Listino &amp; Prezzi».
              Chiedilo al titolare.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/azienda/impostazioni/listino">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              Torna al listino
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Chi vede il listino senza poterlo modificare apre il prodotto per consultarlo: dal 26/09/2026 il database non gli
  // salva nessuna modifica. L'editor lo dice in testa e spegne i campi, invece di lasciargli credere di aver salvato.
  return <FamilyEditor soloLettura={!isAdmin} />;
}
