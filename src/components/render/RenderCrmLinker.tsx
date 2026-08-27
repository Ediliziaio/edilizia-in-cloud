import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Check, ChevronsUpDown, Link2, X, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
}

interface OpportunityOption {
  id: string;
  name: string;
  value: number | null;
  status: string | null;
}

interface RenderCrmLinkerProps {
  contactId: string | null;
  opportunityId: string | null;
  onContactChange: (id: string | null) => void;
  onOpportunityChange: (id: string | null) => void;
}

export function RenderCrmLinker({
  contactId,
  opportunityId,
  onContactChange,
  onOpportunityChange,
}: RenderCrmLinkerProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [isOpen, setIsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);

  const { data: contacts = [] } = useQuery({
    queryKey: ["render-crm-contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, company_name, email, phone")
        .eq("company_id", companyId)
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ContactOption[];
    },
    enabled: !!companyId,
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["render-crm-opportunities", companyId, contactId],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("marketing_opportunities")
        .select("id, name, value, status")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(200);
      if (contactId) {
        q = q.eq("contact_id", contactId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OpportunityOption[];
    },
    enabled: !!companyId,
  });

  const selectedContact = contacts.find((c) => c.id === contactId);
  const selectedOpp = opportunities.find((o) => o.id === opportunityId);
  const hasLink = !!contactId || !!opportunityId;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-muted-foreground hover:text-foreground"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{hasLink ? "Collegato a CRM" : "Collega a contatto / opportunità"}</span>
            {hasLink && (
              <Badge variant="secondary" className="ml-1 max-w-[140px] px-1 py-0 text-[10px]">
                {[contactId && "Contatto", opportunityId && "Opportunità"].filter(Boolean).join(" + ")}
              </Badge>
            )}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 pt-2 px-1">
        {/* Contact selector */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Contatto</Label>
          <div className="flex gap-1.5">
            <Popover open={contactOpen} onOpenChange={setContactOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  size="sm"
                  className="flex-1 justify-between font-normal text-xs h-8"
                >
                  {selectedContact
                    ? `${selectedContact.first_name} ${selectedContact.last_name || ""}${selectedContact.company_name ? ` (${selectedContact.company_name})` : ""}`
                    : "Cerca contatto..."}
                  <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-[300px]" align="start">
                <Command>
                  <CommandInput placeholder="Nome, azienda, email..." />
                  <CommandList>
                    <CommandEmpty>Nessun contatto</CommandEmpty>
                    <CommandGroup>
                      {contacts.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.first_name} ${c.last_name || ""} ${c.company_name || ""} ${c.email || ""}`}
                          onSelect={() => {
                            onContactChange(c.id);
                            if (opportunityId) onOpportunityChange(null);
                            setContactOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-3.5 w-3.5 ${contactId === c.id ? "opacity-100" : "opacity-0"}`} />
                          <div>
                            <div className="text-sm font-medium">
                              {c.first_name} {c.last_name}
                            </div>
                            {c.company_name && (
                              <div className="text-[11px] text-muted-foreground">{c.company_name}</div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {contactId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { onContactChange(null); onOpportunityChange(null); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Opportunity selector */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Opportunità{contactId ? " (filtrate per contatto)" : ""}
          </Label>
          <div className="flex gap-1.5">
            <Popover open={oppOpen} onOpenChange={setOppOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  size="sm"
                  className="flex-1 justify-between font-normal text-xs h-8"
                >
                  {selectedOpp ? selectedOpp.name : "Cerca opportunità..."}
                  <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-[300px]" align="start">
                <Command>
                  <CommandInput placeholder="Nome opportunità..." />
                  <CommandList>
                    <CommandEmpty>Nessuna opportunità{contactId ? " per questo contatto" : ""}</CommandEmpty>
                    <CommandGroup>
                      {opportunities.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={o.name}
                          onSelect={() => {
                            onOpportunityChange(o.id);
                            setOppOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-3.5 w-3.5 ${opportunityId === o.id ? "opacity-100" : "opacity-0"}`} />
                          <div>
                            <div className="text-sm font-medium">{o.name}</div>
                            {o.value != null && o.value > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(o.value)}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {opportunityId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onOpportunityChange(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
