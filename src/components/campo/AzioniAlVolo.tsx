/**
 * Le cose che si fanno al volo in cantiere (24/11/2026, richiesta del founder): prendere un mezzo col QR,
 * mandare lo scontrino di una spesa, dire che manca materiale, segnalare un problema. Una riga sola di
 * pillole piccole: la Home resta «timbra, dove vai, cosa aspetta te», queste sono a un tocco senza aprire Altro.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Package, ScanLine, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { PILLOLA_PICCOLA } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const AZIONI = [
  { to: "/campo/mezzi?scansiona=1", label: "Prendi un mezzo", icona: ScanLine },
  { to: "/campo/spese", label: "Spesa", icona: Wallet },
  { to: "/campo/ticket/nuovo?tipo=materiale", label: "Manca materiale", icona: Package },
  { to: "/campo/ticket/nuovo", label: "Problema", icona: AlertTriangle },
] as const;

export function AzioniAlVolo() {
  const t = useT();
  return (
    <nav aria-label={t("Al volo")} className="-mx-1 flex min-h-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {AZIONI.map(a => (
        <Link key={a.to} to={a.to} className={cn(PILLOLA_PICCOLA, "shrink-0 min-h-11")}>
          <a.icona className="size-4 shrink-0" aria-hidden="true" />{t(a.label)}
        </Link>
      ))}
    </nav>
  );
}
