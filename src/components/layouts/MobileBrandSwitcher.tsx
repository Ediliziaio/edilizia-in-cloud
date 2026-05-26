/**
 * MobileBrandSwitcher — Brand header per mobile.
 *
 * Mostra:
 *   - Logo Edilizia in Cloud piccolo in alto
 *   - Nome azienda corrente sotto (con truncate)
 *
 * Comportamento al tap:
 *   - 1 azienda  → niente (è solo un'etichetta)
 *   - N aziende → Popover con lista aziende cliccabili per switch contesto
 *
 * Sostituisce il vecchio `<span>{page || area || effectiveCompany?.name}</span>`
 * mobile dell'header CompanyLayout.
 */
import { useMemo, useState } from "react";
import { ChevronsUpDown, Check, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getCompanyAccessRoleLabel } from "@/lib/auth/multiCompany";
import { cn } from "@/lib/utils";
import ediliziaLogoSmall from "@/assets/edilizia-in-cloud-logo-small.webp";

function getCompanyInitials(name?: string | null) {
  const words = (name ?? "Azienda").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "AZ";
}

export function MobileBrandSwitcher() {
  const {
    effectiveCompany,
    multiCompanyAccesses,
    selectedMultiCompanyId,
    switchMultiCompany,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const hasMultiple = multiCompanyAccesses.length > 1;
  const activeName = effectiveCompany?.name ?? "Azienda";

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return multiCompanyAccesses;
    return multiCompanyAccesses.filter((a) => {
      const companyName = a.company?.name ?? a.company_id;
      const roleLabel = getCompanyAccessRoleLabel(a.access_role);
      return `${companyName} ${roleLabel}`.toLowerCase().includes(term);
    });
  }, [multiCompanyAccesses, query]);

  /**
   * Stack visivo: logo EiC sopra + nome azienda sotto, entrambi flush a sx.
   * Compatto per stare in header h-14, ma logo grande e leggibile.
   */
  const brandStack = (
    <span className="flex flex-col items-start min-w-0 flex-1 leading-none">
      <img
        src={ediliziaLogoSmall}
        alt="EdiliziaInCloud"
        className="h-8 w-auto block select-none pointer-events-none"
        loading="eager"
      />
      <span className="block text-left font-semibold text-[11px] truncate w-full text-foreground leading-none mt-1">
        {activeName}
      </span>
    </span>
  );

  // Se solo 1 azienda → label statica, no popover
  if (!hasMultiple) {
    return (
      <div className="flex items-start min-w-0 flex-1 md:hidden -ml-1">
        {brandStack}
      </div>
    );
  }

  // Multi-azienda → popover switcher
  const handleSwitch = (companyId: string) => {
    switchMultiCompany(companyId);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-start gap-1 min-w-0 flex-1 rounded-md py-1 -ml-1 pl-1 hover:bg-muted/60 active:bg-muted transition-colors md:hidden"
          aria-label={`Cambia azienda — attualmente ${activeName}`}
        >
          {brandStack}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-1.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[calc(100vw-1rem)] max-w-sm p-2"
      >
        <div className="px-2 py-1.5">
          <p className="text-sm font-semibold">Cambia azienda</p>
          <p className="text-xs text-muted-foreground">
            Dati, permessi e moduli si aggiornano sull'azienda scelta.
          </p>
        </div>
        {multiCompanyAccesses.length > 4 && (
          <div className="relative my-2 px-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca azienda…"
              className="h-9 pl-8 text-sm"
              aria-label="Cerca azienda"
            />
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto pr-1 mt-1">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nessuna azienda trovata
            </div>
          ) : (
            filtered.map((access) => {
              const selected = access.company_id === selectedMultiCompanyId;
              const companyName = access.company?.name ?? access.company_id;
              const roleLabel = getCompanyAccessRoleLabel(access.access_role);
              return (
                <button
                  key={access.company_id}
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent",
                    selected && "bg-accent",
                  )}
                  onClick={() => handleSwitch(access.company_id)}
                >
                  <Avatar className="h-9 w-9 rounded-lg border shrink-0">
                    <AvatarImage src={access.company?.logo_url ?? undefined} alt={companyName} />
                    <AvatarFallback className="rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
                      {getCompanyInitials(companyName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {companyName}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {roleLabel}
                    </span>
                  </span>
                  {selected && (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Azienda attiva" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
