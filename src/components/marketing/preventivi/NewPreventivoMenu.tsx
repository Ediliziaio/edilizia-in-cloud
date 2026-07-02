/**
 * NewPreventivoMenu — dropdown "Nuovo preventivo" che mostra solo i tipi
 * effettivamente disponibili per l'azienda corrente.
 *
 * Logica:
 *  - "Classico" sempre disponibile
 *  - Per ogni modulo vendita (Serramenti, Fotovoltaico, ecc.) compare la
 *    voce SOLO se il super admin l'ha sbloccato per la company corrente
 *    via feature flag (vedi useModuliVendita / useFeatureAccess).
 *  - Se nessun modulo è sbloccato → si comporta come un button singolo
 *    che porta al classico (no dropdown inutile).
 *
 * Riusabile su:
 *  - /azienda/marketing/preventivi (header pagina)
 *  - Dashboard quick actions
 *  - Opportunity dialog (futuro)
 */
import { Link, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, ChevronDown, FileText, Sparkles } from "lucide-react";
import { useModuliVendita, useModuliVisibilita } from "@/lib/moduli-vendita";
import { cn } from "@/lib/utils";

export interface NewPreventivoMenuProps {
  /** className aggiuntiva per il button trigger. */
  className?: string;
  /** Variante size del bottone. */
  size?: "sm" | "default" | "lg";
  /** Quando precompilare con un contatto. */
  contactId?: string | null;
  /** Quando precompilare con un'opportunità. */
  opportunityId?: string | null;
  /** Label del bottone (default "Nuovo preventivo"). */
  label?: string;
  /**
   * Se passata, in cima al menu compare "Crea con AI" (foto, vocale o
   * descrizione). La pagina host deve montare il dialog relativo
   * (QuoteFromCaptureDialog) — per questo è opt-in e non un default.
   */
  onCreaConAI?: () => void;
}

export function NewPreventivoMenu({
  className,
  size = "sm",
  contactId,
  opportunityId,
  label = "Nuovo preventivo",
  onCreaConAI,
}: NewPreventivoMenuProps) {
  const navigate = useNavigate();
  const { moduli } = useModuliVendita();
  const { isModuloVisibile } = useModuliVisibilita();

  // Query string riusabile per pre-linking CRM
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (contactId) p.set("contact_id", contactId);
    if (opportunityId) p.set("opportunity_id", opportunityId);
    return p.toString();
  }, [contactId, opportunityId]);

  // Moduli attivi (sbloccati dal super admin) E non nascosti dall'azienda nelle
  // impostazioni. La visibilità è una preferenza per-azienda cosmetica.
  const enabledModuli = useMemo(
    () =>
      moduli.filter(
        (m) =>
          m.isEnabled &&
          m.modulo.availability === "available" &&
          isModuloVisibile(m.modulo.slug),
      ),
    [moduli, isModuloVisibile],
  );

  const classicoHref = `/azienda/marketing/preventivi/nuovo${qs ? `?${qs}` : ""}`;

  // Se nessun modulo verticale è abilitato (e non c'è la voce AI) → niente
  // dropdown, solo button diretto al classico.
  if (enabledModuli.length === 0 && !onCreaConAI) {
    return (
      <Button asChild size={size} className={cn(triggerClass(size), className)}>
        <Link to={classicoHref}>
          <Plus className="h-4 w-4 mr-1.5" />
          {label}
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} className={cn(triggerClass(size), className)}>
          <Plus className="h-4 w-4 mr-1.5" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Scegli il tipo di preventivo
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Crea con AI — vetrina in cima: foto, vocale o descrizione */}
        {onCreaConAI && (
          <>
            <DropdownMenuItem
              onClick={onCreaConAI}
              className="flex items-start gap-2.5 py-2.5 cursor-pointer"
            >
              <div className="h-8 w-8 rounded-md bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-violet-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Crea con AI ✨</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Da una foto, un vocale o una descrizione dei lavori.
                </p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Preventivo classico — sempre presente */}
        <DropdownMenuItem
          onClick={() => navigate(classicoHref)}
          className="flex items-start gap-2.5 py-2.5 cursor-pointer"
        >
          <div className="h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="h-4 w-4 text-slate-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Classico</p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Preventivo libero con righe prodotto/servizio.
            </p>
          </div>
        </DropdownMenuItem>

        {/* Moduli verticali abilitati */}
        {enabledModuli.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-orange-600">
              Preventivatori specialistici
            </DropdownMenuLabel>
            {enabledModuli.map((m) => {
              const Icon = m.modulo.icon;
              const href = `${m.modulo.href}/nuovo${qs ? `?${qs}` : ""}`;
              return (
                <DropdownMenuItem
                  key={m.modulo.slug}
                  onClick={() => navigate(href)}
                  className="flex items-start gap-2.5 py-2.5 cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-md bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{m.modulo.nome}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {m.modulo.tagline}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function triggerClass(size: "sm" | "default" | "lg") {
  const base = "bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)] hover:-translate-y-px transition-all border-0";
  if (size === "lg") return `${base} h-11`;
  if (size === "default") return `${base} h-10`;
  return `${base} h-9`;
}
