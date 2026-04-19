import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { FamilyEditor } from "@/components/listino/FamilyEditor";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Editor famiglia articoli — pagina admin-only.
 *
 * Crea/modifica famiglie con assi, valori e griglia prezzi. Solo
 * company_admin / super_admin può accedervi. Altri ruoli vedono un
 * access-denied card e vengono rimandati al catalogo in sola lettura.
 */
export default function SettingsFamilyEditor() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";

  if (!isAdmin) {
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
              Solo l&apos;amministratore dell&apos;azienda può creare o
              modificare le famiglie articoli. Contatta il tuo amministratore
              per richiedere l&apos;accesso.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/azienda/impostazioni/listino?tab=famiglie">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              Torna al catalogo
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <FamilyEditor />;
}
