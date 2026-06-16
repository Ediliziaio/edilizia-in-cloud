import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Mailbox, Send, Loader2, Sparkles, PenSquare, ChevronsUpDown, Check, User2, Building2, Mail, X,
} from "lucide-react";
import { useComposeEmail, contactName, type ComposeContact } from "./useOutreachConversations";

/**
 * OutreachNewMailDialog — compositore "Nuova email" a freddo (manuale) per la
 * Posta, in stile Instantly: pannello laterale pulito con Da/A/Oggetto/Corpo,
 * chip variabili e "Scrivi con AI". Invia via outreach-send-single (DRY: tutta
 * la logica vive in useComposeEmail). Al successo l'inviata compare nell'inbox
 * (il hook invalida le query conversazioni) e il pannello si chiude.
 *
 * Niente regressioni con OutreachComposeDialog (header del dashboard): qui è un
 * trigger dedicato alla Posta, stesso edge, presentazione coerente col redesign.
 */
export function OutreachNewMailDialog({
  companyId,
  trigger,
}: {
  companyId: string;
  /** Trigger custom (es. bottone nell'header del client). Default: bottone "Nuova email". */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const compose = useComposeEmail(companyId, open);

  const [senderId, setSenderId] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const selectedContact = useMemo(
    () => compose.contacts.find((c) => c.id === contactId) ?? null,
    [compose.contacts, contactId],
  );

  // Reset completo alla chiusura (handler, niente setState-in-effect).
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setSenderId(""); setContactId(null); setTo(""); setSubject(""); setBody("");
      setPickerOpen(false);
    }
  };

  // Sceglie un contatto dalla rubrica: precompila il destinatario con la sua email.
  const pickContact = (c: ComposeContact) => {
    setContactId(c.id);
    if (c.email) setTo(c.email);
    setPickerOpen(false);
  };

  const clearContact = () => { setContactId(null); };

  // Inserisce una variabile/testo alla posizione del cursore nel corpo.
  const insertAtCursor = (text: string) => {
    const el = bodyRef.current;
    if (!el) { setBody((b) => (b ? `${b} ${text}` : text)); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const runAi = async () => {
    const res = await compose.generateWithAi({ contactId, email: to });
    if (res) {
      if (res.subject) setSubject(res.subject);
      setBody(res.body);
    }
  };

  const submit = async () => {
    const ok = await compose.send({ senderId, to, subject, html: body, contactId });
    if (ok) handleOpenChange(false);
  };

  const busy = compose.sending || compose.aiBusy;
  const canSend = !!senderId && !!to.trim() && !!body.trim() && !busy;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button className="gap-2"><PenSquare className="h-4 w-4" /> Nuova email</Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PenSquare className="h-4 w-4" />
            </span>
            Nuova email a freddo
          </SheetTitle>
          <SheetDescription className="text-xs">
            Invia una singola email da una casella del pool. Comparirà nell'inbox come conversazione.
          </SheetDescription>
        </SheetHeader>

        {compose.gated ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Configura prima almeno una casella mittente nella scheda <strong>Deliverability</strong> (richiede la
              migrazione del motore applicata).
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* ── Da: casella mittente ── */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Da · casella</Label>
                <Select value={senderId} onValueChange={setSenderId}>
                  <SelectTrigger className="h-10 rounded-lg">
                    <span className="flex items-center gap-2 truncate">
                      <Mailbox className="h-4 w-4 shrink-0 text-primary" />
                      <SelectValue placeholder={compose.sendersLoading ? "Carico caselle…" : "Scegli la casella mittente"} />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {compose.senders.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground">Nessuna casella attiva nel pool.</div>
                    ) : (
                      compose.senders.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.display_name ? `${s.display_name} · ${s.email}` : s.email}
                          {s.status === "warming" && <span className="ml-1 text-[10px] text-amber-600">(warming)</span>}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* ── A: contatto dalla rubrica OPPURE email libera ── */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">A · destinatario</Label>
                {selectedContact ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.05] px-3 py-2">
                    <User2 className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{contactName(selectedContact, selectedContact.email)}</div>
                      <div className="flex items-center gap-2 truncate text-[11px] text-muted-foreground">
                        {selectedContact.company_name && (
                          <span className="inline-flex min-w-0 items-center gap-1"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{selectedContact.company_name}</span></span>
                        )}
                        {selectedContact.email && (
                          <span className="inline-flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate font-mono">{selectedContact.email}</span></span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clearContact} aria-label="Rimuovi contatto">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="destinatario@azienda.it"
                      className="h-10 flex-1 rounded-lg font-mono text-sm"
                      type="email"
                    />
                    <ContactPicker
                      contacts={compose.contacts}
                      open={pickerOpen}
                      onOpenChange={setPickerOpen}
                      onPick={pickContact}
                    />
                  </div>
                )}
              </div>

              {/* ── Oggetto ── */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Oggetto</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Oggetto della email"
                  className="h-10 rounded-lg text-sm"
                />
              </div>

              {/* ── Corpo + variabili + AI ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Corpo</Label>
                  <Button
                    type="button" size="sm" variant="ghost"
                    className="h-7 gap-1.5 px-2 text-[11px] text-primary hover:text-primary"
                    disabled={busy}
                    onClick={() => void runAi()}
                    title="L'AI genera oggetto e corpo dai dati del lead (best-effort)"
                  >
                    {compose.aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {compose.aiBusy ? "Scrivo…" : "Scrivi con AI"}
                  </Button>
                </div>
                {/* Chip variabili: utili soprattutto con un contatto collegato (il merge avviene a valle). */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertAtCursor(v.token)}
                      className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      title={`Inserisci ${v.token}`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  placeholder="Ciao {{first_name}}, …"
                  className="resize-none rounded-lg text-sm"
                  disabled={busy}
                />
              </div>
            </div>

            {/* ── Footer azioni ── */}
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={compose.sending}>Annulla</Button>
              <Button onClick={() => void submit()} disabled={!canSend} className="gap-2">
                {compose.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {compose.sending ? "Invio…" : "Invia email"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Variabili merge supportate nei corpi cold (label visibile + token inserito). */
const VARIABLES: { label: string; token: string }[] = [
  { label: "Nome", token: "{{first_name}}" },
  { label: "Azienda", token: "{{company_name}}" },
];

/* ──────────────────────────────────────────────────────────────────────────
   ContactPicker — popover con ricerca (Command) sui contatti del CRM admin.
   Sceglie un destinatario dalla rubrica; in alternativa si scrive l'email a mano.
   ────────────────────────────────────────────────────────────────────────── */
function ContactPicker({
  contacts, open, onOpenChange, onPick,
}: {
  contacts: ComposeContact[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (c: ComposeContact) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline"
          className="h-10 shrink-0 justify-between gap-2 rounded-lg text-sm font-normal text-muted-foreground sm:w-[180px]"
        >
          <span className="inline-flex items-center gap-1.5"><User2 className="h-4 w-4" /> Dalla rubrica</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command
          filter={(value, search) => {
            // value = stringa ricca per ogni item; match case-insensitive a sottostringa.
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Cerca nome, azienda o email…" className="text-sm" />
          <CommandList>
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
              {contacts.length === 0 ? "Nessun contatto in rubrica." : "Nessun contatto trovato."}
            </CommandEmpty>
            <CommandGroup>
              {contacts.map((c) => {
                const name = contactName(c, c.email);
                const value = [name, c.company_name, c.email].filter(Boolean).join(" ");
                return (
                  <CommandItem
                    key={c.id}
                    value={value}
                    onSelect={() => onPick(c)}
                    className="flex items-center gap-2"
                    disabled={!c.email}
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0 opacity-0")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[c.company_name, c.email].filter(Boolean).join(" · ") || "senza email"}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
