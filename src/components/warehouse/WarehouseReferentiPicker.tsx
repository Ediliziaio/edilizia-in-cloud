import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  HardHat,
  Building2,
  Plus,
  Star,
  Trash2,
  Phone,
  Mail,
  Check,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReferentePerson } from "@/hooks/useWarehouseReferenti";

export interface PickerReferente {
  /** presente se la riga esiste già sul DB (id warehouse_referenti.id) */
  id?: string;
  kind: "employee" | "subcontractor";
  /** id di employees o subappaltatori */
  targetId: string;
  displayName: string;
  subtitle: string | null;
  phone: string | null;
  email: string | null;
  role_label: string;
  is_primary: boolean;
}

interface WarehouseReferentiPickerProps {
  value: PickerReferente[];
  onChange: (next: PickerReferente[]) => void;
  employees: ReferentePerson[];
  subcontractors: ReferentePerson[];
  isLoading?: boolean;
  disabled?: boolean;
}

const ROLE_SUGGESTIONS = [
  "Magazziniere",
  "Responsabile magazzino",
  "Caposquadra",
  "Responsabile spedizioni",
  "Addetto magazzino",
];

export function WarehouseReferentiPicker({
  value,
  onChange,
  employees,
  subcontractors,
  isLoading = false,
  disabled = false,
}: WarehouseReferentiPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedKeys = useMemo(
    () => new Set(value.map((v) => `${v.kind}:${v.targetId}`)),
    [value]
  );

  const availableEmployees = useMemo(
    () => employees.filter((e) => !selectedKeys.has(`employee:${e.id}`)),
    [employees, selectedKeys]
  );
  const availableSubcontractors = useMemo(
    () => subcontractors.filter((s) => !selectedKeys.has(`subcontractor:${s.id}`)),
    [subcontractors, selectedKeys]
  );

  const addPerson = (p: ReferentePerson) => {
    const newItem: PickerReferente = {
      kind: p.kind,
      targetId: p.id,
      displayName: p.displayName,
      subtitle: p.subtitle,
      phone: p.phone,
      email: p.email,
      role_label: "Magazziniere",
      is_primary: value.length === 0, // primo aggiunto = primary
    };
    onChange([...value, newItem]);
    setPickerOpen(false);
  };

  const removeAt = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    // se ho rimosso il primary e ne resta almeno uno, promuovo il primo
    if (value[idx].is_primary && next.length > 0 && !next.some((r) => r.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    onChange(next);
  };

  const setPrimary = (idx: number) => {
    onChange(
      value.map((r, i) => ({
        ...r,
        is_primary: i === idx,
      }))
    );
  };

  const updateRoleLabel = (idx: number, label: string) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, role_label: label } : r)));
  };

  return (
    <div className="space-y-2">
      {/* Chips referenti selezionati */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((r, idx) => (
            <div
              key={`${r.kind}:${r.targetId}`}
              className={cn(
                "flex items-start gap-2 p-2.5 rounded-md border bg-card",
                r.is_primary && "border-primary/40 bg-primary/5"
              )}
            >
              {/* Avatar icon */}
              <div
                className={cn(
                  "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
                  r.kind === "employee"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                )}
                aria-hidden
              >
                {r.kind === "employee" ? (
                  <HardHat className="h-5 w-5" />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </div>

              {/* Info + role input */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold truncate">{r.displayName}</span>
                      {r.is_primary && (
                        <Badge className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/15 text-[10px] h-4 px-1.5">
                          <Star className="h-2.5 w-2.5 mr-0.5 fill-primary" />
                          Principale
                        </Badge>
                      )}
                    </div>
                    {r.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {r.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {r.phone}
                        </span>
                      )}
                      {r.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {!r.is_primary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPrimary(idx)}
                        disabled={disabled}
                        title="Imposta come principale"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeAt(idx)}
                      disabled={disabled}
                      title="Rimuovi referente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Role label input con suggerimenti */}
                <div className="relative">
                  <Input
                    value={r.role_label}
                    onChange={(e) => updateRoleLabel(idx, e.target.value)}
                    placeholder="Ruolo (es. Magazziniere)"
                    className="h-7 text-xs"
                    list={`role-suggestions-${idx}`}
                    disabled={disabled}
                  />
                  <datalist id={`role-suggestions-${idx}`}>
                    {ROLE_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trigger aggiungi referente */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 h-9 border-dashed"
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
            {value.length === 0 ? "Aggiungi referente" : "Aggiungi altro referente"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] min-w-[340px] max-w-[90vw]"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          // Radix dialog-in-popover: assicurati che wheel/touch scroll restino
          // dentro la popover e non vengano mangiati dal focus trap del Dialog
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          // Impedisci al Dialog-parent di rubare il focus quando l'utente
          // clicca sulla scrollbar della lista
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest("[data-radix-popper-content-wrapper]")) {
              e.preventDefault();
            }
          }}
        >
          <Command
            // Filtra in locale: cmdk usa "value" come stringa da matchare con l'input
            filter={(value, search) => {
              if (!search) return 1;
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Cerca dipendente o subappaltatore…" />
            <CommandList
              className="max-h-[min(60vh,320px)] overflow-y-auto overscroll-contain"
              onWheel={(e) => e.stopPropagation()}
            >
              <CommandEmpty>
                {isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Caricamento candidati…
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground space-y-2">
                    <UserPlus className="h-8 w-8 mx-auto opacity-50" />
                    <p>Nessun candidato trovato.</p>
                    <p className="text-xs">
                      Aggiungi dipendenti da{" "}
                      <a href="/azienda/personale" className="underline font-medium">
                        Personale
                      </a>{" "}
                      o subappaltatori da{" "}
                      <a href="/azienda/subappaltatori" className="underline font-medium">
                        Subappaltatori
                      </a>
                      .
                    </p>
                  </div>
                )}
              </CommandEmpty>

              {availableEmployees.length > 0 && (
                <CommandGroup heading="Dipendenti / Operai">
                  {availableEmployees.map((e) => (
                    <CommandItem
                      key={`employee:${e.id}`}
                      value={`${e.displayName} ${e.email ?? ""} ${e.phone ?? ""}`}
                      onSelect={() => addPerson(e)}
                      className="gap-2"
                    >
                      <div className="h-7 w-7 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <HardHat className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {e.subtitle}
                          {e.phone ? ` · ${e.phone}` : ""}
                        </p>
                      </div>
                      <Check className="h-4 w-4 opacity-0 data-[selected=true]:opacity-100" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {availableEmployees.length > 0 && availableSubcontractors.length > 0 && (
                <CommandSeparator />
              )}

              {availableSubcontractors.length > 0 && (
                <CommandGroup heading="Subappaltatori">
                  {availableSubcontractors.map((s) => (
                    <CommandItem
                      key={`subcontractor:${s.id}`}
                      value={`${s.displayName} ${s.email ?? ""} ${s.phone ?? ""}`}
                      onSelect={() => addPerson(s)}
                      className="gap-2"
                    >
                      <div className="h-7 w-7 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.subtitle}
                          {s.phone ? ` · ${s.phone}` : ""}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Assegna uno o più referenti: operai, staff interno o subappaltatori. I clienti non sono
        selezionabili. Il referente <strong>Principale</strong> viene mostrato nelle anteprime.
      </p>
    </div>
  );
}
