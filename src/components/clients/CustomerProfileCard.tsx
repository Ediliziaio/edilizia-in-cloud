/**
 * CustomerProfileCard — sidebar dettaglio cliente.
 *
 * 2026-05-27 (richiesta utente "coerente con pagina contatti marketing"):
 * REFACTOR COMPLETO. Prima era una card "passport-style" (avatar grande
 * centrato + righe info + form modale edit). Ora segue la struttura
 * IDENTICA alla sidebar di MarketingContactDetail.tsx:
 *   - Header "Anagrafica completa"
 *   - Block top: Titolare (salesperson) select dropdown
 *   - Tabs "Tutti i campi | Azioni"
 *   - Search box
 *   - Collapsible Anagrafica: Nome, Cognome, Email, Telefono, CF, Tipo
 *   - Collapsible Indirizzi: residenza/sede legale + cantiere
 *   - Collapsible Marketing (se linkedContact)
 *
 * Edit inline via InlineField → mutation singolo campo, no più modale
 * "modifica tutto". Pattern marketing standard.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown, Search, User, ExternalLink, Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { InlineField } from "@/components/marketing/contacts/InlineField";
import { queryKeys } from "@/lib/queryKeys";

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

export function CustomerProfileCard({ customer, linkedContact, onSaved }: CustomerProfileCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [fieldSearch, setFieldSearch] = useState("");

  // Lista salespeople per Titolare select
  const { data: salespeople = [] } = useQuery({
    queryKey: ["company-salespeople", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .in("role" as never, ["admin", "salesperson", "office"] as never)
        .order("first_name", { ascending: true });
      if (error) {
        // soft fail — schema può variare
        return [] as Array<{ id: string; first_name: string | null; last_name: string | null }>;
      }
      return data as Array<{ id: string; first_name: string | null; last_name: string | null }>;
    },
  });

  // Update singolo campo (pattern marketing updateField)
  const updateField = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value } as never)
        .eq("id", customer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-customer-detail", customer.id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.customersList.all });
      onSaved?.();
    },
    onError: (e) => {
      toast({
        title: "Errore salvataggio",
        description: e instanceof Error ? e.message : "Riprova",
        variant: "destructive",
      });
    },
  });

  // Filtro sezioni per search box
  const matchesSearch = (label: string): boolean => {
    if (!fieldSearch.trim()) return true;
    return label.toLowerCase().includes(fieldSearch.toLowerCase());
  };

  return (
    <div className="rounded-2xl border bg-card shadow-sm flex flex-col h-full">
      {/* Header sticky */}
      <div className="px-3 py-2.5 border-b sticky top-0 bg-card z-10 rounded-t-2xl">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <User className="h-3 w-3" />
          Anagrafica completa
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* ─── Block top: Titolare ─── */}
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <User className="h-3 w-3 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground">Titolare</Label>
            </div>
            <Select
              value={customer.salesperson_id || ""}
              onValueChange={(v) => updateField.mutate({ field: "salesperson_id", value: v || null })}
            >
              <SelectTrigger className="h-7 text-xs border-dashed">
                <SelectValue placeholder="Non assegnato" />
              </SelectTrigger>
              <SelectContent>
                {salespeople.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessun commerciale</div>
                )}
                {salespeople.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {[s.first_name, s.last_name].filter(Boolean).join(" ") || "Senza nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ─── Data cliente badge ─── */}
          <div>
            <Label className="text-xs text-muted-foreground block mb-1">Cliente dal</Label>
            <Badge variant="outline" className="text-[11px] gap-1 font-normal">
              <Calendar className="h-3 w-3" />
              {format(new Date(customer.created_at), "dd MMM yyyy", { locale: it })}
            </Badge>
          </div>

          {/* ─── Tabs Tutti i campi | Azioni ─── */}
          <Tabs defaultValue="all_fields" className="w-full">
            <TabsList className="w-full h-8 p-0.5">
              <TabsTrigger value="all_fields" className="flex-1 text-xs h-7">Tutti i campi</TabsTrigger>
              <TabsTrigger value="actions" className="flex-1 text-xs h-7">Azioni</TabsTrigger>
            </TabsList>

            <TabsContent value="all_fields" className="mt-2 space-y-2">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Cerca campi"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  className="h-7 text-[11px] pl-7"
                />
              </div>

              {/* Collapsible: Anagrafica */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                  Anagrafica
                </CollapsibleTrigger>
                <CollapsibleContent className="px-1 space-y-0">
                  {customer.is_business && matchesSearch("Ragione sociale") && (
                    <InlineField
                      label="Ragione sociale"
                      value={customer.business_name || ""}
                      onSave={(v) => updateField.mutate({ field: "business_name", value: v || null })}
                    />
                  )}
                  {matchesSearch("Nome") && (
                    <InlineField
                      label="Nome"
                      value={customer.first_name === "—" ? "" : customer.first_name || ""}
                      onSave={(v) => updateField.mutate({ field: "first_name", value: v || null })}
                    />
                  )}
                  {matchesSearch("Cognome") && (
                    <InlineField
                      label="Cognome"
                      value={customer.last_name === "—" ? "" : customer.last_name || ""}
                      onSave={(v) => updateField.mutate({ field: "last_name", value: v || null })}
                    />
                  )}
                  {matchesSearch("Email") && (
                    <InlineField
                      label="Email"
                      value={customer.email || ""}
                      onSave={(v) => updateField.mutate({ field: "email", value: v || null })}
                      type="email"
                    />
                  )}
                  {matchesSearch("Telefono") && (
                    <InlineField
                      label="Telefono"
                      value={customer.phone || ""}
                      onSave={(v) => updateField.mutate({ field: "phone", value: v || null })}
                      type="tel"
                    />
                  )}
                  {matchesSearch(customer.is_business ? "Partita IVA" : "Codice fiscale") && (
                    <InlineField
                      label={customer.is_business ? "Partita IVA / CF" : "Codice fiscale"}
                      value={customer.fiscal_code || ""}
                      onSave={(v) => updateField.mutate({ field: "fiscal_code", value: v ? v.toUpperCase() : null })}
                    />
                  )}
                  {matchesSearch("Tipo cliente") && (
                    <InlineField
                      label="Tipo cliente"
                      value={customer.is_business ? "azienda" : "persona"}
                      onSave={(v) => updateField.mutate({ field: "is_business", value: (v === "azienda") as never })}
                      type="select"
                      options={["persona", "azienda"]}
                    />
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Collapsible: Indirizzo residenza / sede legale */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                  {customer.is_business ? "Sede legale" : "Indirizzo residenza"}
                </CollapsibleTrigger>
                <CollapsibleContent className="px-1 space-y-0">
                  {matchesSearch("Indirizzo") && (
                    <InlineField
                      label="Indirizzo"
                      value={customer.address || ""}
                      onSave={(v) => updateField.mutate({ field: "address", value: v || null })}
                    />
                  )}
                  {matchesSearch("Città") && (
                    <InlineField
                      label="Città"
                      value={customer.city || ""}
                      onSave={(v) => updateField.mutate({ field: "city", value: v || null })}
                      comuneMode="comune"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "city", value: c.comune });
                        updateField.mutate({ field: "province", value: c.provinciaSigla });
                        if (!customer.postal_code) updateField.mutate({ field: "postal_code", value: c.cap });
                      }}
                    />
                  )}
                  {matchesSearch("CAP") && (
                    <InlineField
                      label="CAP"
                      value={customer.postal_code || ""}
                      onSave={(v) => updateField.mutate({ field: "postal_code", value: v || null })}
                      comuneMode="cap"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "postal_code", value: c.cap });
                        updateField.mutate({ field: "city", value: c.comune });
                        updateField.mutate({ field: "province", value: c.provinciaSigla });
                      }}
                    />
                  )}
                  {matchesSearch("Provincia") && (
                    <InlineField
                      label="Provincia"
                      value={customer.province || ""}
                      onSave={(v) => updateField.mutate({ field: "province", value: v ? v.toUpperCase() : null })}
                    />
                  )}
                  {matchesSearch("Paese") && (
                    <InlineField
                      label="Paese"
                      value={customer.country || ""}
                      onSave={(v) => updateField.mutate({ field: "country", value: v || null })}
                    />
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Collapsible: Indirizzo cantiere */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                  Indirizzo cantiere
                </CollapsibleTrigger>
                <CollapsibleContent className="px-1 space-y-0">
                  {matchesSearch("Indirizzo cantiere") && (
                    <InlineField
                      label="Indirizzo"
                      value={customer.site_address || ""}
                      onSave={(v) => updateField.mutate({ field: "site_address", value: v || null })}
                    />
                  )}
                  {matchesSearch("Città cantiere") && (
                    <InlineField
                      label="Città"
                      value={customer.site_city || ""}
                      onSave={(v) => updateField.mutate({ field: "site_city", value: v || null })}
                      comuneMode="comune"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "site_city", value: c.comune });
                        updateField.mutate({ field: "site_province", value: c.provinciaSigla });
                        if (!customer.site_postal_code) updateField.mutate({ field: "site_postal_code", value: c.cap });
                      }}
                    />
                  )}
                  {matchesSearch("CAP cantiere") && (
                    <InlineField
                      label="CAP"
                      value={customer.site_postal_code || ""}
                      onSave={(v) => updateField.mutate({ field: "site_postal_code", value: v || null })}
                      comuneMode="cap"
                      onSelectComune={(c) => {
                        updateField.mutate({ field: "site_postal_code", value: c.cap });
                        updateField.mutate({ field: "site_city", value: c.comune });
                        updateField.mutate({ field: "site_province", value: c.provinciaSigla });
                      }}
                    />
                  )}
                  {matchesSearch("Provincia cantiere") && (
                    <InlineField
                      label="Provincia"
                      value={customer.site_province || ""}
                      onSave={(v) => updateField.mutate({ field: "site_province", value: v ? v.toUpperCase() : null })}
                    />
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Collapsible: Note */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                  Note interne
                </CollapsibleTrigger>
                <CollapsibleContent className="px-1 space-y-0">
                  <InlineField
                    label="Note"
                    value={customer.notes || ""}
                    onSave={(v) => updateField.mutate({ field: "notes", value: v || null })}
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Collapsible: Origine Marketing (se linkedContact) */}
              {linkedContact && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold w-full group py-1 hover:bg-muted/50 rounded px-1">
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                    Origine Marketing
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-1 space-y-1.5 pt-1.5">
                    {linkedContact.source && (
                      <div className="grid grid-cols-[100px_1fr] items-center gap-1 py-0.5">
                        <Label className="text-xs text-muted-foreground truncate">Fonte</Label>
                        <Badge variant="secondary" className="text-[11px] w-fit">{linkedContact.source}</Badge>
                      </div>
                    )}
                    {linkedContact.lead_score != null && (
                      <div className="grid grid-cols-[100px_1fr] items-center gap-1 py-0.5">
                        <Label className="text-xs text-muted-foreground truncate">Lead score</Label>
                        <span className="text-xs font-semibold">{linkedContact.lead_score}/100</span>
                      </div>
                    )}
                    {linkedContact.attr_campaign && (
                      <div className="grid grid-cols-[100px_1fr] items-center gap-1 py-0.5">
                        <Label className="text-xs text-muted-foreground truncate">Campagna</Label>
                        <span className="text-xs truncate">{linkedContact.attr_campaign}</span>
                      </div>
                    )}
                    {linkedContact.tags && linkedContact.tags.length > 0 && (
                      <div className="grid grid-cols-[100px_1fr] items-start gap-1 py-0.5">
                        <Label className="text-xs text-muted-foreground truncate mt-0.5">Tag</Label>
                        <div className="flex flex-wrap gap-1">
                          {linkedContact.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {customer.marketing_contact_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] w-full justify-start"
                        onClick={() => navigate(`/azienda/marketing/contatti/${customer.marketing_contact_id}`)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Apri contatto marketing
                      </Button>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </TabsContent>

            <TabsContent value="actions" className="mt-2 space-y-1">
              <Button
                variant="outline" size="sm" className="w-full justify-start h-8 text-xs"
                onClick={() => navigate(`/azienda/ordini/nuovo?customer_id=${customer.id}`)}
              >
                Crea ordine
              </Button>
              <Button
                variant="outline" size="sm" className="w-full justify-start h-8 text-xs"
                onClick={() => navigate(`/azienda/marketing/preventivi/nuovo?customer_id=${customer.id}`)}
              >
                Crea preventivo
              </Button>
              <Button
                variant="outline" size="sm" className="w-full justify-start h-8 text-xs"
                onClick={() => navigate(`/azienda/assistenza/nuovo?customer_id=${customer.id}`)}
              >
                Apri ticket assistenza
              </Button>
              <Button
                variant="outline" size="sm" className="w-full justify-start h-8 text-xs"
                onClick={() => navigate(`/azienda/calendario?customer_id=${customer.id}`)}
              >
                Nuovo appuntamento
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
