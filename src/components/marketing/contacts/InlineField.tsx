import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ComuneAutocomplete } from "@/components/shared/ComuneAutocomplete";
import type { Comune } from "@/lib/comuni/useComuni";

export function InlineField({ label, value, onSave, type = "text", options, disabled = false, comuneMode, onSelectComune, validate }: {
  label: string; value: string; onSave: (v: string) => void; type?: string; options?: string[]; disabled?: boolean;
  /** Se impostato, in modifica usa l'autocomplete comuni (per Città / CAP). */
  comuneMode?: "comune" | "cap";
  /** Selezione di un comune dall'autocomplete: il padre riempie tutti i campi indirizzo. */
  onSelectComune?: (c: Comune) => void;
  /**
   * Controllo di forma sul valore digitato: restituisce il messaggio d'errore
   * oppure null se va bene. Se fallisce il campo NON si salva e resta aperto
   * col messaggio sotto: meglio dirlo subito che accettare una P.IVA sbagliata
   * e ritrovarsela in fattura.
   */
  validate?: (v: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => { setDraft(value || ""); setErrore(null); }, [value]);

  const [saved, setSaved] = useState(false);

  const commit = () => {
    if (draft === (value || "")) {
      setEditing(false);
      setErrore(null);
      return;
    }
    const problema = validate ? validate(draft) : null;
    if (problema) {
      setErrore(problema);
      return; // resta in modifica: il valore non è ancora salvato
    }
    setEditing(false);
    setErrore(null);
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (comuneMode) {
    return (
      <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground truncate">{label}</Label>
        {editing ? (
          <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(); }}>
            <ComuneAutocomplete
              mode={comuneMode}
              value={draft}
              onValueChange={setDraft}
              onSelect={(c) => {
                onSelectComune?.(c);
                setEditing(false);
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              }}
              className="[&_input]:h-7 [&_input]:px-1 [&_input]:text-xs"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p
              className={`text-xs min-h-[32px] flex items-center rounded px-1 flex-1 ${
                disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/50"
              }`}
              onClick={() => !disabled && setEditing(true)}
            >
              {value || <span className="text-muted-foreground">—</span>}
            </p>
            {saved && <Check className="h-3 w-3 text-emerald-500 animate-in fade-in duration-200" />}
          </div>
        )}
      </div>
    );
  }

  if (type === "select" && options) {
    return (
      <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
        <Label className="text-xs text-muted-foreground truncate">{label}</Label>
        <Select value={value || ""} onValueChange={onSave} disabled={disabled}>
          <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none px-1 hover:bg-muted/50"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-1 py-0.5">
      <Label className="text-xs text-muted-foreground truncate">{label}</Label>
      {editing ? (
        <div className="space-y-0.5">
          <Input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (errore) setErrore(null); }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(value || ""); setErrore(null); setEditing(false); }
            }}
            aria-invalid={!!errore}
            className={`h-7 text-xs px-1 ${errore ? "border-destructive focus-visible:ring-destructive" : ""}`}
          />
          {errore && <p className="text-[11px] leading-4 text-destructive">{errore}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <p
            className={`text-xs min-h-[32px] flex items-center rounded px-1 flex-1 ${
              disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/50"
            }`}
            onClick={() => !disabled && setEditing(true)}
          >
            {value || <span className="text-muted-foreground">—</span>}
          </p>
          {saved && <Check className="h-3 w-3 text-emerald-500 animate-in fade-in duration-200" />}
        </div>
      )}
    </div>
  );
}
