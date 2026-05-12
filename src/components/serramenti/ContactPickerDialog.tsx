/**
 * ContactPickerDialog — seleziona un contatto CRM esistente da
 * marketing_contacts e ritorna i suoi dati per popolare il form
 * dello Step 1 del wizard Serramenti.
 *
 * Cerca per nome/cognome/email/telefono/azienda con debounce 300ms.
 */
import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, User, Mail, Phone, MapPin } from "lucide-react";
import { useCrmContacts } from "@/lib/serramenti/queries";
import type { CrmContactMinimal } from "@/lib/serramenti/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: CrmContactMinimal) => void;
}

export function ContactPickerDialog({ open, onOpenChange, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset search quando il dialog si chiude
  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
    }
  }, [open]);

  const { data: contacts = [], isLoading } = useCrmContacts(debounced);

  const filtered = useMemo(() => contacts, [contacts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seleziona contatto dal CRM</DialogTitle>
          <DialogDescription>
            Trova un contatto esistente: i suoi dati (telefono, email, indirizzo) popolano il form.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, email, telefono o azienda... (min 2 caratteri)"
            className="pl-9 h-10"
            autoFocus
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2 space-y-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Caricamento contatti…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <User className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {debounced.length < 2
                  ? "Inizia a digitare per cercare un contatto."
                  : "Nessun contatto trovato con questi criteri."}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Puoi sempre compilare i dati a mano nello Step 1.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => {
                const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");
                const labelName = fullName || c.email || c.company_name || "—";
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        onSelect(c);
                        onOpenChange(false);
                      }}
                      className="w-full text-left p-3 rounded-md hover:bg-orange-50/60 focus:bg-orange-50 focus:outline-none transition"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {labelName}
                        {c.company_name && fullName && (
                          <span className="font-normal text-muted-foreground"> · {c.company_name}</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                        {c.email && (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                        )}
                        {(c.city || c.province) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[c.city, c.province].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
