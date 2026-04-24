import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListOrdered, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderStatusConfig } from "@/components/settings/OrderStatusConfig";

export default function SettingsOrderStatus() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";

  useEffect(() => {
    if (!isAdmin) {
      navigate("/azienda", { replace: true });
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ListOrdered className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Stati Ordine</h1>
            <p className="text-sm text-muted-foreground">
              Definisci le fasi di lavorazione degli ordini. Trascina per riordinare e
              personalizza icona, colore e nome di ogni stato.
            </p>
          </div>
        </div>
      </div>

      <Alert className="border-blue-300 bg-blue-50/50 dark:bg-blue-900/10">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-sm text-blue-900 dark:text-blue-200">Come vengono usati gli stati</AlertTitle>
        <AlertDescription className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
          <p>· La <strong>Anteprima Progress Tracker</strong> qui sotto mostra esattamente ciò che vedranno i clienti sul portale privato.</p>
          <p>· Ogni nuovo ordine parte dal <strong>primo stato</strong> della lista e avanza secondo la posizione.</p>
          <p>· Per gestire le <strong>automazioni fra stati</strong> (azioni post-cambio stato) apri{" "}
            <Link to="/azienda/impostazioni/automazioni-finanza" className="underline font-medium">/automazioni-finanza</Link>.
          </p>
        </AlertDescription>
      </Alert>

      <OrderStatusConfig />
    </div>
  );
}
