import { Link, useLocation } from "react-router-dom";
import { Archive, ArrowLeft, Calculator, ReceiptText, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fiscalitaLinks = [
  {
    href: "/azienda/documenti/registro-iva",
    label: "Registro IVA",
    icon: ReceiptText,
  },
  {
    href: "/azienda/contabilita-fiscale",
    label: "Contabilita fiscale",
    icon: Calculator,
  },
  {
    href: "/azienda/ritenute-garanzia",
    label: "Ritenute",
    icon: ShieldCheck,
  },
  {
    href: "/azienda/archivio-sostitutivo",
    label: "Archivio",
    icon: Archive,
  },
];

export function FiscalitaNavigation() {
  const { pathname } = useLocation();

  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Link
          to="/azienda/documenti?tab=fiscalita"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "w-fit shrink-0 justify-start px-2 text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Fatture / Fiscalita
        </Link>

        <nav
          aria-label="Navigazione area fiscale"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:pb-0"
        >
          {fiscalitaLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                to={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                  "shrink-0 justify-start",
                  active && "border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
