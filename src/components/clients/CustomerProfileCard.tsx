import { useState } from "react";
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
import { Pencil, X, Loader2, Phone, CreditCard, MapPin, HardHat, Calendar } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getInitials, getAvatarColor } from "@/lib/contactUtils";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { queryKeys } from "@/lib/queryKeys";

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

export function CustomerProfileCard({ customer, onSaved }: CustomerProfileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState(customer.first_name || "");
  const [lastName, setLastName] = useState(customer.last_name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [fiscalCode, setFiscalCode] = useState(customer.fiscal_code || "");
  const [address, setAddress] = useState(customer.address || "");
  const [siteAddress, setSiteAddress] = useState(customer.site_address || "");
  const [notes, setNotes] = useState(customer.notes || "");
  const [salespersonId, setSalespersonId] = useState(customer.salesperson_id || "");

  const resetForm = () => {
    setFirstName(customer.first_name || "");
    setLastName(customer.last_name || "");
    setPhone(customer.phone || "");
    setFiscalCode(customer.fiscal_code || "");
    setAddress(customer.address || "");
    setSiteAddress(customer.site_address || "");
    setNotes(customer.notes || "");
    setSalespersonId(customer.salesperson_id || "");
  };

  const initials = getInitials(customer.first_name || "", customer.last_name);
  const avatarColor = getAvatarColor(`${customer.first_name}${customer.last_name}`);

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
                <Input id="pc-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pc-ln">Cognome *</Label>
                <Input id="pc-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>

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
                  {customer.first_name} {customer.last_name}
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

            {/* PLACEHOLDER per Sprint 2 — Origine Marketing */}
            {/* TODO Sprint 2: aggiungere qui <OrigineMarketingSection contactId={customer.marketing_contact_id} /> */}
          </>
        )}
      </CardContent>
    </Card>
  );
}
