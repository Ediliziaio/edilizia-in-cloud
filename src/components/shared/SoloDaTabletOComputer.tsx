import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Pagine da scrivania che dal telefono non si usano (decisione del founder, 23/11/2026):
 * fabbisogno materiali, registro incassi, contabilità generale, planimetrie… Dal tablet in su
 * (640px) la pagina c'è com'è; dal telefono, se ci si arriva da un link, si legge dove trovarla.
 * Le voci di menu sono già tolte dal menu «App» del telefono (MobileAppGrid, MOBILE_HIDDEN_URLS).
 */
export function SoloDaTabletOComputer({ titolo, dove, indietro, children }: {
  titolo: string;
  /** Dove si trova da tablet o computer, in parole semplici. */
  dove: ReactNode;
  /** Pagina utile da telefono a cui tornare. */
  indietro?: { url: string; etichetta: string };
  children: ReactNode;
}) {
  const telefono = useIsMobile(640);
  if (!telefono) return <>{children}</>;
  return (
    <div className="space-y-3 p-4" role="region" aria-label={titolo}>
      <h1 className="flex items-center gap-2 text-[17px] font-semibold"><Monitor className="h-5 w-5" aria-hidden /> {titolo}</h1>
      <p className="text-sm text-muted-foreground">Si usa da tablet o computer: {dove}</p>
      {indietro && <Button asChild variant="outline" size="sm"><Link to={indietro.url}>{indietro.etichetta}</Link></Button>}
    </div>
  );
}
