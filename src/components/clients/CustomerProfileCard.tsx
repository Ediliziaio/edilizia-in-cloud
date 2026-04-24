import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Pencil, X, Loader2, Phone, CreditCard, MapPin, HardHat, Calendar, ExternalLink, AlertTriangle, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getInitials, getAvatarColor } from "@/lib/contactUtils";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { queryKeys } from "@/lib/queryKeys";
import { looksLikePhone, looksLikeFiscalCode } from "@/lib/customerDataSanitizer";

interface LinkedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  lead_score: number | null;
  attr_campaign: string | null;
  tags: string[] | null;
}

interface CustomerProfileCardProps {
  customer: {
    id: string;
    first_name: string | null;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    site_address: string | null;
    fiscal_code: string | null;
    notes: string | null;
    created_at: string;
    salesperson_id: string | null;
    marketing_contact_id?: string | null;
  };
  linkedContact?: LinkedContact | null;
  onSaved?: () => void;
}

function InfoRow({ icon: Icon, value, placeholder }: {
  icon: LucideIcon;
  value: string | null;
  placeholder: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <span className={value ? "text-foreground" : "text-muted-foreground italic"}>
        {value || placeholder}
      </span>
    </div>
  );
}

export function CustomerProfileCard({ customer, linkedContact, onSaved }: CustomerProfileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state — i placeholder "—" non vengono precompilati nel form
  const stripPlaceholder = (v: string | null) => {
    const t = (v ?? "").trim();
    return (t === "—" || t === "-") ? "" : (v ?? "");
  };
  const [firstName, setFirstName] = useState(stripPlaceholder(customer.first_name));
  const [lastName, setLastName] = useState(stripPlaceholder(customer.last_name));
  const [phone, setPhone] = useState(customer.phone || "");
  const [fiscalCode, setFiscalCode] = useState(customer.fiscal_code || "");
  const [address, setAddress] = useState(customer.address || "");
  const [siteAddress, setSiteAddress] = useState(customer.site_address || "");
  const [notes, setNotes] = useState(customer.notes || "");
  const [salespersonId, setSalespersonId] = useState(customer.salesperson_id || "");

  const resetForm = () => {
    setFirstName(stripPlaceholder(customer.first_name));
    setLastName(stripPlaceholder(customer.last_name));
    setPhone(customer.phone || "");
    setFiscalCode(customer.fiscal_code || "");
    setAddress(customer.address || "");
    setSiteAddress(customer.site_address || "");
    setNotes(customer.notes || "");
    setSalespersonId(customer.salesperson_id || "");
  };

  // ── Inline detection: quali fix sono disponibili sui campi attuali? ──
  const inlineFixes = useMemo(() => {
    const fixes: Array<{
      label: string;
      description: string;
      apply: () => void;
    }> = [];

    // Nome è un telefono
    if (firstName && looksLikePhone(firstName)) {
      fixes.push({
        label: phone ? "Nome numerico → Note (telefono già valorizzato)" : "Sposta Nome in Telefono",
        description: phone
          ? `Il campo Nome contiene "${firstName}" che sembra un telefono, ma Telefono è già "${phone}". Sposta il valore nelle Note.`
          : `Il campo Nome contiene "${firstName}" che sembra un numero di telefono.`,
        apply: () => {
          if (phone && phone !== firstName) {
            setNotes((n) => (n ? `${n}\n[Fix] Numero aggiuntivo: ${firstName}` : `[Fix] Numero aggiuntivo: ${firstName}`));
          } else {
            setPhone(firstName);
          }
          setFirstName("");
        },
      });
    }
    // Cognome è un telefono
    if (lastName && looksLikePhone(lastName)) {
      fixes.push({
        label: phone ? "Cognome numerico → Note" : "Sposta Cognome in Telefono",
        description: phone
          ? `Il campo Cognome contiene "${lastName}" che sembra un telefono.`
          : `Il campo Cognome contiene "${lastName}" che sembra un numero di telefono.`,
        apply: () => {
          if (phone && phone !== lastName) {
            setNotes((n) => (n ? `${n}\n[Fix] Numero aggiuntivo: ${lastName}` : `[Fix] Numero aggiuntivo: ${lastName}`));
          } else {
            setPhone(lastName);
          }
          setLastName("");
        },
      });
    }
    // Nome è un CF
    if (firstName && looksLikeFiscalCode(firstName)) {
      fixes.push({
        label: "Sposta Nome in CF / P.IVA",
        description: `Il campo Nome contiene "${firstName}" che sembra un codice fiscale o una partita IVA.`,
        apply: () => {
          if (!fiscalCode) setFiscalCode(firstName.toUpperCase());
          setFirstName("");
        },
      });
    }
    // Cognome è un CF
    if (lastName && looksLikeFiscalCode(lastName)) {
      fixes.push({
        label: "Sposta Cognome in CF / P.IVA",
        description: `Il campo Cognome contiene "${lastName}" che sembra un codice fiscale o una partita IVA.`,
        apply: () => {
          if (!fiscalCode) setFiscalCode(lastName.toUpperCase());
          setLastName("");
        },
      });
    }

    return fixes;
  }, [firstName, lastName, phone, fiscalCode]);

  // Display-safe helpers: i valori "—" o "-" sono placeholder salvati da
  // create-customer quando un nome/cognome era vuoto dopo il sanitize.
  // Non devono uscire in UI come "— —".
  const isPlaceholder = (v: string | null) => {
    const t = (v ?? "").trim();
    return t === "—" || t === "-" || t === "";
  };
  const displayFirst = isPlaceholder(customer.first_name) ? "" : (customer.first_name ?? "");
  const displayLast = isPlaceholder(customer.last_name) ? "" : (customer.last_name ?? "");
  const displayFullName = `${displayFirst} ${displayLast}`.trim() || "(senza nome)";

  const initials = getInitials(displayFirst, displayLast) || "?";
  const avatarColor = getAvatarColor(`${displayFirst}${displayLast}`);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Errore", description: "Nome e cognome sono obbligatori", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          fiscal_code: fiscalCode.trim() || null,
          address: address.trim() || null,
          site_address: siteAddress.trim() || null,
          notes: notes.trim() || null,
          salesperson_id: salespersonId || null,
        })
        .eq("id", customer.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["company-customer-detail", customer.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({ title: "Dati salvati", description: "Le informazioni del cliente sono state aggiornate." });
      setIsEditing(false);
      onSaved?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore durante il salvataggio";
      toast({ title: "Errore", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Modifica dati</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { resetForm(); setIsEditing(false); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pc-fn">Nome *</Label>
                <Input
                  id="pc-fn"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  aria-invalid={looksLikePhone(firstName) || looksLikeFiscalCode(firstName)}
                  className={looksLikePhone(firstName) || looksLikeFiscalCode(firstName) ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-ln">Cognome *</Label>
                <Input
                  id="pc-ln"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  aria-invalid={looksLikePhone(lastName) || looksLikeFiscalCode(lastName)}
                  className={looksLikePhone(lastName) || looksLikeFiscalCode(lastName) ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                />
              </div>
            </div>

            {inlineFixes.length > 0 && (
              <Alert variant="default" className="border-amber-400 bg-amber-50/50 dark:bg-amber-900/10 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs space-y-2 text-amber-800 dark:text-amber-200">
                  <p className="font-semibold">Dati da sistemare rilevati</p>
                  <ul className="space-y-1.5">
                    {inlineFixes.map((fix, i) => (
                      <li key={i} className="space-y-1">
                        <p className="text-[11px] opacity-80">{fix.description}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] bg-white dark:bg-transparent border-amber-400 text-amber-900 dark:text-amber-200 hover:bg-amber-100"
                          onClick={fix.apply}
                        >
                          <ArrowRight className="h-3 w-3 mr-1" />
                          {fix.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              <Label htmlFor="pc-phone">Telefono</Label>
              <Input id="pc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pc-cf">CF / P.IVA</Label>
              <Input id="pc-cf" value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value)} maxLength={16} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pc-addr">Indirizzo Residenza</Label>
              <Textarea id="pc-addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={200} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pc-site">Indirizzo Cantiere</Label>
              <Textarea id="pc-site" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} rows={2} maxLength={200} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pc-notes">Note interne</Label>
              <Textarea id="pc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} />
            </div>

            <SalespersonSelect
              value={salespersonId}
              onChange={(v) => setSalespersonId(v)}
              disabled={isSaving}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { resetForm(); setIsEditing(false); }}
              >
                Annulla
              </Button>
              <Button type="submit" className="flex-1" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salva
              </Button>
            </div>
          </form>
        ) : (
          <>
            {/* Avatar + nome + email */}
            <div className="flex flex-col items-center text-center gap-2 mb-4">
              <Avatar className={`h-16 w-16 ${avatarColor}`}>
                <AvatarFallback className="text-xl font-bold text-white bg-transparent">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-lg leading-tight">
                  {displayFullName}
                </p>
                <p className="text-sm text-muted-foreground">{customer.email}</p>
              </div>
              <Badge variant="outline" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                Cliente dal {format(new Date(customer.created_at), "dd MMM yyyy", { locale: it })}
              </Badge>
            </div>

            <Separator className="mb-4" />

            {/* Header anagrafica + bottone modifica */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Anagrafica
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Righe info */}
            <div className="space-y-2.5 text-sm">
              <InfoRow icon={Phone} value={customer.phone} placeholder="Telefono non inserito" />
              <InfoRow icon={CreditCard} value={customer.fiscal_code} placeholder="CF/P.IVA non inserito" />
              <InfoRow icon={MapPin} value={customer.address} placeholder="Indirizzo non inserito" />
              <InfoRow icon={HardHat} value={customer.site_address} placeholder="Indirizzo cantiere non inserito" />
            </div>

            {/* Note */}
            {customer.notes && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{customer.notes}</p>
                </div>
              </>
            )}

            {/* Origine Marketing — popolato da Sprint 2 */}
            {linkedContact && (
              <>
                <Separator className="my-3" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Origine Marketing
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() =>
                        navigate(
                          `/azienda/marketing/contatti/${customer.marketing_contact_id}`,
                        )
                      }
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Apri
                    </Button>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    {linkedContact.source && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px]">Fonte</span>
                        <Badge variant="secondary" className="text-xs">
                          {linkedContact.source}
                        </Badge>
                      </div>
                    )}
                    {linkedContact.lead_score != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px]">Lead score</span>
                        <span className="text-xs font-semibold">
                          {linkedContact.lead_score}/100
                        </span>
                      </div>
                    )}
                    {linkedContact.attr_campaign && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px]">Campagna</span>
                        <span className="text-xs truncate max-w-[120px]">
                          {linkedContact.attr_campaign}
                        </span>
                      </div>
                    )}
                    {linkedContact.tags && linkedContact.tags.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-muted-foreground min-w-[60px] mt-0.5">Tag</span>
                        <div className="flex flex-wrap gap-1">
                          {linkedContact.tags.slice(0, 3).map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
