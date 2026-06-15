import { Split } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Chip variabili + spintax cliccabili per gli editor di messaggio outreach
 * (stesso pattern insert-at-cursor di OutreachMessagePlayground / NodeEditorPanel,
 * estratto qui per riuso DRY nell'editor inline degli step). Il chiamante decide
 * dove inserire (campo attivo oggetto/corpo) via `onInsert`.
 */

const OUTREACH_VAR_CHIPS = [
  "{{first_name}}",
  "{{first_name|amico}}",
  "{{company_name}}",
  "{{last_name}}",
  "{{email}}",
];
const OUTREACH_SPINTAX_CHIP = "{Ciao|Salve|Buongiorno}";

export function OutreachVarChips({
  onInsert,
  fieldHint,
  onAddVariant,
  variantCount,
  className,
}: {
  /** Inserisce il token al cursore del campo attivo. */
  onInsert: (token: string) => void;
  /** Etichetta opzionale del campo di destinazione (es. "corpo" / "oggetto"). */
  fieldHint?: string;
  /** Se presente, mostra il bottone "Variante A/Z". */
  onAddVariant?: () => void;
  /** Numero di varianti A/Z correnti (per il badge). */
  variantCount?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <p className="text-[11px] text-muted-foreground">
        Clicca per inserire al cursore{fieldHint ? ` (${fieldHint})` : ""}:
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {OUTREACH_VAR_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onInsert(c)}
            className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40"
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onInsert(OUTREACH_SPINTAX_CHIP)}
          title="Spintax: varia il testo tra destinatari (meno spam)"
          className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40"
        >
          {"{a|b}"}
        </button>
        {onAddVariant && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={onAddVariant}
              title="Aggiungi una variante A/Z (separata da === su una riga): vince quella con più risposte"
            >
              <Split className="h-3 w-3" /> Variante A/Z
            </Button>
            {variantCount != null && variantCount > 1 && (
              <Badge variant="secondary" className="text-[10px]">A/Z ×{variantCount}</Badge>
            )}
          </>
        )}
      </div>
    </div>
  );
}
