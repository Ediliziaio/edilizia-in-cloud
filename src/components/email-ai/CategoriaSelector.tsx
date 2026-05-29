/**
 * CategoriaSelector — MP-EMAIL-AI-01 · Feedback loop manuale
 *
 * Dropdown che permette all'utente di spostare un'email in altra categoria.
 * Chiama `useReclassifyEmail` che:
 *   1. Aggiorna email_inbox.categoria (+ classificato_da='manuale', confidenza=1.0)
 *   2. Upsert mittenti_noti per il from_email → future email di quel mittente
 *      verranno classificate da L1 a costo zero.
 */

import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Check } from "lucide-react";
import { useRegistraCorrezione } from "@/lib/email-ai/hooks";
import type { EmailCategoria } from "@/lib/email-ai/types";
import { CategoriaBadge, resolveCategoria } from "./CategoriaBadge";

const CATEGORIE_ORDINATE: EmailCategoria[] = [
  "cliente", "fornitore", "operaio", "preventivo",
  "fattura", "opportunita", "supporto", "pratica",
  "newsletter", "social", "notifica", "spam", "altro",
];

export interface CategoriaSelectorProps {
  email_id: string;
  categoria?: string | null;
  ai_category?: string | null;
  /** Disabilita interazione */
  disabled?: boolean;
  /** Compact button (icon only) */
  compact?: boolean;
}

export function CategoriaSelector({
  email_id,
  categoria,
  ai_category,
  disabled = false,
  compact = false,
}: CategoriaSelectorProps) {
  // MP-EMAIL-AI-03: usa il feedback loop (audit + apprendimento mittente)
  const registra = useRegistraCorrezione();
  const current = resolveCategoria(categoria, ai_category);

  const handleSelect = (cat: EmailCategoria) => {
    if (cat === current) return;
    // 'spam' → evento spam (blacklist). Altre → evento sposta.
    registra.mutate(
      cat === "spam"
        ? { email_id, evento: "spam" }
        : { email_id, evento: "sposta", categoria: cat },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || reclassify.isPending}
          className="gap-1.5 h-7"
          aria-label="Cambia categoria email"
        >
          {current ? (
            <CategoriaBadge
              categoria={categoria}
              ai_category={ai_category}
              showLabel={!compact}
              compact={compact}
              className="border-transparent bg-transparent"
            />
          ) : (
            <span className="text-xs text-muted-foreground">Categorizza</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Sposta in categoria
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CATEGORIE_ORDINATE.map((cat) => (
          <DropdownMenuItem
            key={cat}
            onClick={() => handleSelect(cat)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <CategoriaBadge
              categoria={cat}
              showLabel={true}
              className="border-transparent bg-transparent px-0"
            />
            {current === cat && <Check className="h-3.5 w-3.5 text-emerald-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
