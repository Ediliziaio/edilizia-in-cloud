/**
 * AreaSwitcher — passare da ufficio a cantiere senza rifare login.
 *
 * Compare SOLO a chi porta entrambi i cappelli: chi manda avanti il magazzino
 * di una filiale gestisce commesse e giacenze dal gestionale, ma fa anche
 * rapportini, timbrature e sopralluoghi dal portale lavoratori. Prima l'unica
 * via era un secondo account con un'altra email — e la stessa persona
 * compariva due volte in ogni elenco di assegnazione.
 *
 * Non è un cambio di permessi: i ruoli restano quelli che ha. Cambia solo
 * quale dei due comanda l'interfaccia, e lo decide l'URL (vedi lib/auth/aree).
 */
import { useNavigate } from "react-router-dom";
import { Building2, HardHat } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { COMPANY_APP_HOME } from "@/lib/auth/appHome";
import { cn } from "@/lib/utils";

interface Props {
  /** Sidebar ridotta a icone: mostra solo l'icona, il testo lo dà il title. */
  isCollapsed?: boolean;
  className?: string;
}

export function AreaSwitcher({ isCollapsed = false, className }: Props) {
  const { puoCambiareArea, areaCorrente } = useAuth();
  const navigate = useNavigate();

  if (!puoCambiareArea) return null;

  const versoCampo = areaCorrente === "gestionale";
  const etichetta = versoCampo ? "Vai all'area cantiere" : "Torna al gestionale";
  const Icona = versoCampo ? HardHat : Building2;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title={etichetta}
      aria-label={etichetta}
      className={cn("w-full justify-start gap-2", isCollapsed && "justify-center px-0", className)}
      onClick={() => navigate(versoCampo ? "/campo" : COMPANY_APP_HOME)}
    >
      <Icona className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span className="truncate">{etichetta}</span>}
    </Button>
  );
}
