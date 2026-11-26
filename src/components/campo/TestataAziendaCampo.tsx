/**
 * Logo e area in alto nell'app di cantiere, su telefono (26/11/2026, richiesta del founder).
 *
 * In alto solo «AREA OPERAIO» (o Subappaltatore): il nome dell'azienda occupava la riga e chi lavora per una sola
 * azienda non ne ha bisogno. Il logo è quello dell'azienda, se l'ha caricato; se no quello di Edilizia in Cloud.
 * Chi ha più aziende collegate, o passa anche dall'area ufficio, tocca il logo (c'è una linguetta accanto) e sceglie
 * da lì. Chi non ha niente da scegliere tocca il logo e torna alla Home, come prima.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Check, ChevronDown, HardHat } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCompanyAccessRoleLabel } from "@/lib/auth/multiCompany";
import { COMPANY_APP_HOME } from "@/lib/auth/appHome";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";

function iniziali(nome?: string | null) {
  return (nome ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "AZ";
}

export function TestataAziendaCampo({ home, area }: { home: string; area: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { effectiveCompany, company, multiCompanyAccesses, selectedMultiCompanyId, switchMultiCompany, puoCambiareArea } = useAuth();
  const [aperto, setAperto] = useState(false);
  const attiva = effectiveCompany ?? company;
  const logoAzienda = attiva?.logo_url || null;
  const piuAziende = multiCompanyAccesses.length > 1;
  const scelta = piuAziende || !!puoCambiareArea;

  const logo = (
    <img src={logoAzienda ?? ediliziaLogo} alt={logoAzienda ? (attiva?.name ?? "") : "Edilizia in Cloud"}
      className={cn("h-7 w-auto object-contain", logoAzienda ? "max-w-[96px]" : "max-w-[120px]")} />
  );
  const etichetta = (
    <span className="min-w-0 truncate border-l border-border/60 pl-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{area}</span>
  );

  if (!scelta) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link to={home} aria-label={t("Home Edilizia in Cloud")} className="shrink-0">{logo}</Link>
        {etichetta}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={t("Cambia azienda o area")}
            className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-1 active:bg-muted">
            {logo}
            <span className="flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
              <ChevronDown className="size-3.5" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-1.5rem))] p-1.5">
          {piuAziende && <>
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("Le tue aziende")}</p>
            <ul className="max-h-[50vh] overflow-y-auto">
              {multiCompanyAccesses.map(a => {
                const sel = a.company_id === selectedMultiCompanyId;
                const nome = a.company?.name ?? t("Azienda");
                return (
                  <li key={a.company_id}>
                    <button type="button" aria-current={sel ? "true" : undefined}
                      onClick={() => { setAperto(false); if (!sel) { void switchMultiCompany(a.company_id); navigate(home); } }}
                      className={cn("flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left", sel ? "bg-primary/10" : "active:bg-muted")}>
                      {a.company?.logo_url
                        ? <img src={a.company.logo_url} alt="" className="size-8 shrink-0 rounded-md border bg-background object-contain" />
                        : <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold" aria-hidden="true">{iniziali(nome)}</span>}
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-sm font-semibold">{nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t(getCompanyAccessRoleLabel(a.access_role))}</span>
                      </span>
                      {sel && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>}
          {puoCambiareArea && (
            <button type="button" onClick={() => { setAperto(false); navigate(COMPANY_APP_HOME); }}
              className={cn("flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm font-semibold active:bg-muted", piuAziende && "mt-1 border-t pt-1")}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted" aria-hidden="true"><Building2 className="size-4" /></span>
              {t("Torna al gestionale")}
            </button>
          )}
          <button type="button" onClick={() => { setAperto(false); navigate(home); }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm text-muted-foreground active:bg-muted">
            <span className="flex size-8 shrink-0 items-center justify-center" aria-hidden="true"><HardHat className="size-4" /></span>
            {t("Vai alla Home")}
          </button>
        </PopoverContent>
      </Popover>
      {etichetta}
    </div>
  );
}
