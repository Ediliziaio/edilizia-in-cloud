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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pencil, X, Loader2, Phone, CreditCard, MapPin, HardHat, Calendar,
  ExternalLink, AlertTriangle, ArrowRight, Building2, User as UserIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getAvatarColor } from "@/lib/contactUtils";
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
    // Nuovi campi
    is_business?: boolean | null;
    business_name?: string | null;
    city?: string | null;
    postal_code?: string | null;
    province?: string | null;
    country?: string | null;
    site_city?: string | null;
    site_postal_code?: string | null;
    site_province?: string | null;
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

/* Helper display name aware di is_business */
function getDisplayName(c: CustomerProfileCardProps["customer"]): string {
  if (c.is_business && c.business_name && c.business_name.trim()) {
    return c.business_name.trim();
  }
  const f = (c.first_name ?? "").trim();
  const l = (c.last_name ?? "").trim();
  const isPlaceholderF = f === "—" || f === "-";
  const isPlaceholderL = l === "—" || l === "-";
  const joined = `${isPlaceholderF ? "" : f} ${isPlaceholderL ? "" : l}`.trim();
  return joined || "(senza nome)";
}

/* Helper indirizzo compatto */
function formatCompactAddress(
  street: string | null | undefined,
  city: string | null | undefined,
  cap: string | null | undefined,
  province: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (street && street.trim()) parts.push(street.trim());
  const loc = [cap?.trim(), city?.trim(), province?.trim() ? `(${province.trim()})` : null].filter(Boolean).join(" ");
  if (loc) parts.push(loc);
  return parts.length ? parts.join(" — ") : null;
}

export function CustomerProfileCard({ customer, linkedContact, onSaved }: CustomerProfileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Display helpers — Bug fix: evita che il placeholder "—" finisca come
  // iniziale dell'avatar (es. "—A" quando first_name è "—"). I placeholder
  // sono trattati come vuoti per il calcolo delle iniziali.
  const displayName = getDisplayName(customer);
  const initialOf = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (!t || t === "—" || t === "-") return "";
    return t.charAt(0).toUpperCase();
  };
  const initials = customer.is_business && customer.business_name
    ? customer.business_name.trim().charAt(0).toUpperCase() || "A"
    : (`${initialOf(customer.first_name)}${initialOf(customer.last_name)}` || "?");
  const avatarColor = getAvatarColor(displayName);

  // Form state
  const stripPlaceholder = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return (t === "—" || t === "-") ? "" : (v ?? "");
  };
  const [isBusiness, setIsBusiness] = useState<boolean>(!!customer.is_business);
  const [businessName, setBusinessName] = useState(customer.business_name ?? "");
  const [firstName, setFirstName] = useState(stripPlaceholder(customer.first_name));
  const [lastName, setLastName] = useState(stripPlaceholder(customer.last_name));
  const [phone, setPhone] = useState(customer.phone || "");
  const [fiscalCode, setFiscalCode] = useState(customer.fiscal_code || "");
  const [address, setAddress] = useState(customer.address || "");
  const [city, setCity] = useState(customer.city || "");
  const [postalCode, setPostalCode] = useState(customer.postal_code || "");
  const [province, setProvince] = useState(customer.province || "");
  const [siteAddress, setSiteAddress] = useState(customer.site_address || "");
  const [siteCity, setSiteCity] = useState(customer.site_city || "");
  const [sitePostalCode, setSitePostalCode] = useState(customer.site_postal_code || "");
  const [siteProvince, setSiteProvince] = useState(customer.site_province || "");
  const [notes, setNotes] = useState(customer.notes || "");
  const [salespersonId, setSalespersonId] = useState(customer.salesperson_id || "");

  const resetForm = () => {
    setIsBusiness(!!customer.is_business);
    setBusinessName(customer.business_name ?? "");
    setFirstName(stripPlaceholder(customer.first_name));
    setLastName(stripPlaceholder(customer.last_name));
    setPhone(customer.phone || "");
    setFiscalCode(customer.fiscal_code || "");
    setAddress(customer.address || "");
    setCity(customer.city || "");
    setPostalCode(customer.postal_code || "");
    setProvince(customer.province || "");
    setSiteAddress(customer.site_address || "");
    setSiteCity(customer.site_city || "");
    setSitePostalCode(customer.site_postal_code || "");
    setSiteProvince(customer.site_province || "");
    setNotes(customer.notes || "");
    setSalespersonId(customer.salesperson_id || "");
  };

  // Inline auto-fix suggestions
  const inlineFixes = useMemo(() => {
    const fixes: Array<{ label: string; description: string; apply: () => void }> = [];
    if (firstName && looksLikePhone(firstName)) {
      fixes.push({
        label: phone ? "Nome numerico → Note" : "Sposta Nome in Telefono",
        description: phone
          ? `Il Nome "${firstName}" sembra un telefono. Telefono è già "${phone}".`
          : `Il Nome "${firstName}" sembra un numero di telefono.`,
        apply: () => {
          if (phone && phone !== firstName) {
            setNotes((n) => (n ? `${n}\n[Fix] Numero: ${firstName}` : `[Fix] Numero: ${firstName}`));
          } else {
            setPhone(firstName);
          }
          setFirstName("");
        },
      });
    }
    if (lastName && looksLikePhone(lastName)) {
      fixes.push({
        label: phone ? "Cognome numerico → Note" : "Sposta Cognome in Telefono",
        description: `Il Cognome "${lastName}" sembra un numero di telefono.`,
        apply: () => {
          if (phone && phone !== lastName) {
            setNotes((n) => (n ? `${n}\n[Fix] Numero: ${lastName}` : `[Fix] Numero: ${lastName}`));
          } else {
            setPhone(lastName);
          }
          setLastName("");
        },
      });
    }
    if (firstName && looksLikeFiscalCode(firstName)) {
      fixes.push({
        label: "Sposta Nome in CF / P.IVA",
        description: `Il Nome "${firstName}" sembra un codice fiscale o P.IVA.`,
        apply: () => {
          if (!fiscalCode) setFiscalCode(firstName.toUpperCase());
          setFirstName("");
        },
      });
    }
    if (lastName && looksLikeFiscalCode(lastName)) {
      fixes.push({
        label: "Sposta Cognome in CF / P.IVA",
        description: `Il Cognome "${lastName}" sembra un CF/P.IVA.`,
        apply: () => {
          if (!fiscalCode) setFiscalCode(lastName.toUpperCase());
          setLastName("");
        },
      });
    }
    return fixes;
  }, [firstName, lastName, phone, fiscalCode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusiness) {
      if (!businessName.trim()) {
        toast({ title: "Errore", description: "La ragione sociale è obbligatoria", variant: "destructive" });
        return;
      }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        toast({ title: "Errore", description: "Nome e cognome sono obbligatori", variant: "destructive" });
        return;
      }
    }
    setIsSaving(true);
    try {
      const updates = {
        is_business: isBusiness,
        business_name: isBusiness ? businessName.trim().slice(0, 200) : null,
        // Per le aziende senza nome/cognome referente: last_name=business_name (fallback safe per NOT NULL)
        first_name: firstName.trim().slice(0, 100) || (isBusiness ? "" : "—"),
        last_name: lastName.trim().slice(0, 100) || (isBusiness ? businessName.trim().slice(0, 100) : "—"),
        phone: phone.trim() || null,
        fiscal_code: fiscalCode.trim().toUpperCase() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        province: province.trim().toUpperCase() || null,
        site_address: siteAddress.trim() || null,
        site_city: siteCity.trim() || null,
        site_postal_code: sitePostalCode.trim() || null,
        site_province: siteProvince.trim().toUpperCase() || null,
        notes: notes.trim() || null,
        salesperson_id: salespersonId || null,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updates as never)
        .eq("id", customer.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["company-customer-detail", customer.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      toast({ title: "Dati salvati", description: "Le informazioni del cliente sono state aggiornate." });
      setIsEditing(false);
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore durante il salvataggio";
      toast({ title: "Errore", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Compact display addresses
  const displayAddress = formatCompactAddress(customer.address, customer.city, customer.postal_code, customer.province);
  const displaySiteAddress = formatCompactAddress(customer.site_address, customer.site_city, customer.site_postal_code, customer.site_province);

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

            {/* Tipo cliente */}
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo cliente</Label>
              <Tabs value={isBusiness ? "business" : "person"} onValueChange={(v) => setIsBusiness(v === "business")}>
                <TabsList className="grid grid-cols-2 w-full h-9">
                  <TabsTrigger value="person" className="text-xs">
                    <UserIcon className="h-3 w-3 mr-1" />
                    Persona fisica
                  </TabsTrigger>
                  <TabsTrigger value="business" className="text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    Azienda / P. IVA
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Ragione sociale (solo azienda) */}
            {isBusiness && (
              <div className="space-y-1">
                <Label htmlFor="pc-rs">Ragione sociale *</Label>
                <Input
                  id="pc-rs"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Es. Rossi Costruzioni S.r.l."
                  maxLength={200}
                  required
                />
              </div>
            )}

            {/* Nome / Cognome */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pc-fn">
                  {isBusiness ? "Nome referente" : "Nome *"}
                </Label>
                <Input
                  id="pc-fn"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required={!isBusiness}
                  placeholder={isBusiness ? "Opzionale" : ""}
                  aria-invalid={looksLikePhone(firstName) || looksLikeFiscalCode(firstName)}
                  className={looksLikePhone(firstName) || looksLikeFiscalCode(firstName) ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-ln">
                  {isBusiness ? "Cognome referente" : "Cognome *"}
                </Label>
                <Input
                  id="pc-ln"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required={!isBusiness}
                  placeholder={isBusiness ? "Opzionale" : ""}
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

            {/* Contatti */}
            <div className="space-y-1">
              <Label htmlFor="pc-phone">Telefono</Label>
              <Input id="pc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pc-cf">{isBusiness ? "Partita IVA / Codice Fiscale" : "Codice Fiscale"}</Label>
              <Input
                id="pc-cf"
                value={fiscalCode}
                onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                maxLength={16}
                placeholder={isBusiness ? "IT01234567890" : "RSSMRA80A01H501U"}
              />
            </div>

            {/* Indirizzo residenza / sede legale */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {isBusiness ? "Sede legale" : "Indirizzo residenza"}
              </Label>
              <Input
                id="pc-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={200}
                placeholder="Via Roma, 1"
              />
              <div className="grid grid-cols-6 gap-2">
                <Input
                  className="col-span-2"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="CAP"
                  maxLength={10}
                  aria-label="CAP"
                />
                <Input
                  className="col-span-3"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Città"
                  maxLength={100}
                  aria-label="Città"
                />
                <Input
                  className="col-span-1"
                  value={province}
                  onChange={(e) => setProvince(e.target.value.toUpperCase())}
                  placeholder="PR"
                  maxLength={2}
                  aria-label="Provincia"
                />
              </div>
            </div>

            {/* Indirizzo cantiere */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Indirizzo cantiere
              </Label>
              <Input
                id="pc-site"
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                maxLength={200}
                placeholder="Via del Cantiere, 5 (opzionale)"
              />
              <div className="grid grid-cols-6 gap-2">
                <Input
                  className="col-span-2"
                  value={sitePostalCode}
                  onChange={(e) => setSitePostalCode(e.target.value)}
                  placeholder="CAP"
                  maxLength={10}
                  aria-label="CAP cantiere"
                />
                <Input
                  className="col-span-3"
                  value={siteCity}
                  onChange={(e) => setSiteCity(e.target.value)}
                  placeholder="Città"
                  maxLength={100}
                  aria-label="Città cantiere"
                />
                <Input
                  className="col-span-1"
                  value={siteProvince}
                  onChange={(e) => setSiteProvince(e.target.value.toUpperCase())}
                  placeholder="PR"
                  maxLength={2}
                  aria-label="Provincia cantiere"
                />
              </div>
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
                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                  <p className="font-bold text-lg leading-tight">
                    {displayName}
                  </p>
                  {customer.is_business && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
                      <Building2 className="h-2.5 w-2.5" />
                      Azienda
                    </Badge>
                  )}
                </div>
                {customer.is_business && (customer.first_name || customer.last_name) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Referente: {stripPlaceholder(customer.first_name)} {stripPlaceholder(customer.last_name)}
                  </p>
                )}
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
              <InfoRow
                icon={CreditCard}
                value={customer.fiscal_code}
                placeholder={customer.is_business ? "P. IVA / CF non inserita" : "CF non inserito"}
              />
              <InfoRow
                icon={MapPin}
                value={displayAddress}
                placeholder={customer.is_business ? "Sede legale non inserita" : "Indirizzo non inserito"}
              />
              <InfoRow
                icon={HardHat}
                value={displaySiteAddress}
                placeholder="Indirizzo cantiere non inserito"
              />
            </div>

            {customer.notes && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{customer.notes}</p>
                </div>
              </>
            )}

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
