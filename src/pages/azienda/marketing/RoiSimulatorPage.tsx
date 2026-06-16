/**
 * Pagina CRM — Simulatore ROI di vendita (standalone).
 *
 * Header + RoiSimulator + selettore contatto opzionale + "Salva simulazione".
 * Lo stesso RoiSimulator è riusato nel Dialog lanciato dal deal
 * (OpportunityDetailDialog → RoiSimulatorDialog).
 *
 * Prezzo abbonamento: precompilato col piano reale più economico (useResellerPlans),
 * con fallback al default del modello quando non disponibile.
 */
import { useMemo, useState } from "react";
import { RoiSimulator } from "@/components/marketing/RoiSimulator";
import { RoiSendEmailDialog } from "@/components/marketing/RoiSendEmailDialog";
import { generateRoiPdf } from "@/lib/roiSimulatorPdf";
import { DEFAULT_INPUTS, type RoiInputs, type RoiResults } from "@/lib/roiSimulator";
import { useResellerPlans } from "@/hooks/useResellerPlans";
import { useSaveRoiSimulation } from "@/hooks/useRoiSimulations";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Calculator, UserPlus, Check, X } from "lucide-react";
import { toast } from "sonner";

interface ContactLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

function contactLabel(c: ContactLite): string {
  return `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Senza nome";
}

export default function RoiSimulatorPage() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;

  const { data: plans = [] } = useResellerPlans();
  // Piano reale più economico come default canone; fallback al default modello.
  const defaultMonthly = useMemo(() => {
    const prices = plans.map((p) => p.price_monthly).filter((n) => Number.isFinite(n) && n > 0);
    return prices.length ? Math.min(...prices) : DEFAULT_INPUTS.abbonamentoMensile;
  }, [plans]);

  const [inputs, setInputs] = useState<RoiInputs>(() => ({
    ...structuredClone(DEFAULT_INPUTS),
    abbonamentoMensile: DEFAULT_INPUTS.abbonamentoMensile,
  }));
  const [clientName, setClientName] = useState("");
  const [referente, setReferente] = useState("");
  const [linkedContact, setLinkedContact] = useState<ContactLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Applica il prezzo piano reale una sola volta, senza sovrascrivere edit manuali.
  const [planApplied, setPlanApplied] = useState(false);
  if (!planApplied && defaultMonthly !== DEFAULT_INPUTS.abbonamentoMensile) {
    setInputs((p) => ({ ...p, abbonamentoMensile: defaultMonthly }));
    setPlanApplied(true);
  }

  const saveSim = useSaveRoiSimulation();

  // Round 2 — invio email: payload + apertura dialog.
  const [emailPayload, setEmailPayload] = useState<{
    inputs: RoiInputs;
    results: RoiResults;
    clientName: string;
    referente: string;
  } | null>(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ["roi-contact-picker", companyId, search],
    enabled: !!companyId && pickerOpen,
    queryFn: async (): Promise<ContactLite[]> => {
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .limit(20);
      const safe = search.replace(/[%,]/g, " ").trim();
      if (safe) {
        query = query.or(
          `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`,
        );
      }
      const { data, error } = await query.order("first_name");
      if (error) throw error;
      return (data ?? []) as ContactLite[];
    },
  });

  const handleSave = async (payload: {
    inputs: RoiInputs;
    results: ReturnType<typeof import("@/lib/roiSimulator").computeRoi>;
    clientName: string;
  }) => {
    try {
      await saveSim.mutateAsync({
        clientName: payload.clientName || (linkedContact ? contactLabel(linkedContact) : ""),
        inputs: payload.inputs,
        results: payload.results,
        contactId: linkedContact?.id ?? null,
      });
      toast.success("Simulazione salvata");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Calculator className="h-6 w-6 text-primary" />
            Simulatore ROI
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Mostra al cliente quanto gli costa <strong>non cambiare</strong> e perché
            EdiliziaInCloud non è un costo: si ripaga da solo. Muovi i valori durante la trattativa.
          </p>
        </div>
      </div>

      {/* Collegamento opzionale al contatto CRM */}
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <Label className="text-xs text-muted-foreground">Collega a un contatto (opzionale)</Label>
          {linkedContact ? (
            <Badge variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1">
              {contactLabel(linkedContact)}
              <button
                type="button"
                onClick={() => setLinkedContact(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-background/60"
                aria-label="Rimuovi collegamento"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ) : (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  Scegli contatto
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Cerca contatto..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>Nessun contatto trovato</CommandEmpty>
                    <CommandGroup>
                      {contacts.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setLinkedContact(c);
                            if (!clientName) setClientName(contactLabel(c));
                            setPickerOpen(false);
                          }}
                        >
                          <Check className="mr-2 h-4 w-4 opacity-0" />
                          <span className="truncate">{contactLabel(c)}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </CardContent>
      </Card>

      <RoiSimulator
        value={inputs}
        onChange={setInputs}
        plans={plans}
        clientName={clientName}
        onClientNameChange={setClientName}
        referente={referente}
        onReferenteChange={setReferente}
        onSave={handleSave}
        saving={saveSim.isPending}
        onExportPdf={({ inputs, results, clientName, referente }) =>
          generateRoiPdf(inputs, results, clientName, { referente })
        }
        onSendEmail={(payload) => setEmailPayload(payload)}
      />

      {emailPayload && (
        <RoiSendEmailDialog
          open={!!emailPayload}
          onOpenChange={(v) => !v && setEmailPayload(null)}
          inputs={emailPayload.inputs}
          results={emailPayload.results}
          clientName={emailPayload.clientName}
          referente={emailPayload.referente}
          defaultEmail={linkedContact?.email ?? null}
        />
      )}
    </div>
  );
}
