/**
 * NuovoSopralluogo — Wizard 3-step per creare un sopralluogo
 *
 * Step 1: Template (4 system + custom company)
 * Step 2: Cliente + Commessa (opzionali)
 * Step 3: Indirizzo + data + tecnico assegnato
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  listTemplates, createSurvey,
  listCrmContacts, listCrmOpportunities, nomeContatto,
} from "@/lib/api/surveys";
import { categorieConsigliate } from "@/lib/sopralluoghi/verticalTemplate";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, ClipboardList, Check, Loader2, MapPin, Calendar,
  Users, Briefcase, AlertCircle, UserRound, Target, Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

type LinkMode = "cliente" | "prospect";

const CATEGORY_ICON: Record<string, string> = {
  infissi: "🪟",
  bagno: "🛁",
  fotovoltaico: "☀️",
  ristrutturazione: "🏗️",
  cucina: "🍳",
  cappotto: "🏠",
  tetto: "🏘️",
  impianti: "⚡",
  pavimentazioni: "🪜",
  porte_interne: "🚪",
  climatizzazione: "❄️",
  custom: "📋",
};

export default function NuovoSopralluogo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const companyId = useEffectiveCompanyId();
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Pre-popolato da query params (es. da pagina Commessa)
  const [orderId, setOrderId] = useState<string | null>(params.get("order") ?? null);
  const [clientId, setClientId] = useState<string | null>(params.get("client") ?? null);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [address, setAddress] = useState(params.get("address") ?? "");
  const [city, setCity] = useState(params.get("city") ?? "");
  const [zip, setZip] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  // A chi si riferisce: cliente esistente OPPURE contatto/opportunità (prospect).
  // Chi arriva con ?client= parte da "cliente"; se non c'è nulla, si sceglie.
  const [linkMode, setLinkMode] = useState<LinkMode>("cliente");
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [crmSearch, setCrmSearch] = useState("");

  const { data: templates, isLoading: tplLoading, isError: tplError, refetch: tplRefetch } = useQuery({
    queryKey: ["sopralluoghi-templates"],
    queryFn: () => listTemplates(),
  });

  // Settore dell'azienda: per consigliare/pre-selezionare il template giusto.
  const { data: azienda } = useQuery({
    queryKey: ["azienda-vertical", companyId],
    enabled: !!companyId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("companies").select("vertical_key, sector").eq("id", companyId).maybeSingle();
      return (data ?? null) as { vertical_key: string | null; sector: string | null } | null;
    },
  });

  // Categorie consigliate per il settore + template ordinati (consigliati prima).
  const consigliate = useMemo(
    () => categorieConsigliate(azienda?.vertical_key, azienda?.sector),
    [azienda?.vertical_key, azienda?.sector],
  );
  const rango = (cat: string) => {
    const i = consigliate.indexOf(cat);
    return i === -1 ? 999 : i;
  };
  const templatesOrdinati = useMemo(() => {
    const list = [...(templates ?? [])];
    // Stabile: prima i consigliati (nell'ordine della mappa), poi il resto.
    return list.sort((a, b) => rango(a.category) - rango(b.category));
  }, [templates, consigliate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-seleziona il template del settore principale, se non arrivo con uno scelto.
  useEffect(() => {
    if (selectedTemplate || consigliate.length === 0 || !templates?.length) return;
    const preferito = templatesOrdinati.find((t) => consigliate.includes(t.category));
    if (preferito) setSelectedTemplate(preferito.id);
  }, [templates, consigliate]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: members } = useQuery({
    queryKey: ["company-members-for-surveys", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, first_name, last_name, email")
        // Solo QUESTA azienda (il super admin e chi ha più aziende vedevano tutti).
        .eq("company_id", companyId)
        .order("first_name");
      if (error) {
        console.error("[NuovoSopralluogo] query membri fallita", error);
        throw error;
      }
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["company-orders-for-surveys", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, order_code, customer_id, client_name, work_address, indirizzo_lavori, client_address")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("[NuovoSopralluogo] query orders fallita", error);
        throw error;
      }
      return (data ?? []) as Array<{
        id: string; order_code: string | null; customer_id: string | null;
        client_name: string | null; work_address: string | null;
        indirizzo_lavori: string | null; client_address: string | null;
      }>;
    },
  });

  // Clienti dell'azienda (per la modalità «Cliente»), via hook canonico.
  const { data: customers = [] } = useCompanyCustomers(companyId, linkMode === "cliente");

  // Contatti e opportunità del CRM (per la modalità «Contatto/Opportunità»).
  const { data: crmContacts = [] } = useQuery({
    queryKey: ["survey-crm-contacts", companyId, crmSearch],
    enabled: !!companyId && linkMode === "prospect",
    queryFn: () => listCrmContacts(companyId!, crmSearch, 50),
  });
  const { data: crmOpps = [] } = useQuery({
    queryKey: ["survey-crm-opps", companyId, crmSearch],
    enabled: !!companyId && linkMode === "prospect",
    queryFn: () => listCrmOpportunities(companyId!, crmSearch, 50),
  });

  // Cambio modalità: azzera i collegamenti dell'altra modalità (un cliente NON
  // è un contatto: niente combinazioni ambigue).
  const cambiaModalita = (m: LinkMode) => {
    setLinkMode(m);
    if (m === "cliente") { setContactId(null); setOpportunityId(null); }
    else { setClientId(null); }
  };

  // Scelta di un'opportunità: eredita in automatico il suo contatto e
  // precompila l'indirizzo se vuoto.
  const scegliOpportunita = (id: string | null) => {
    setOpportunityId(id);
    const opp = crmOpps.find((o) => o.id === id);
    if (opp?.contact) {
      setContactId(opp.contact.id);
      if (!address && opp.contact.address) setAddress(opp.contact.address);
      if (!city && opp.contact.city) setCity(opp.contact.city);
    }
  };
  const scegliContatto = (id: string | null) => {
    setContactId(id);
    const c = crmContacts.find((x) => x.id === id) ?? crmOpps.find((o) => o.contact?.id === id)?.contact ?? null;
    if (c) {
      if (!address && c.address) setAddress(c.address);
      if (!city && c.city) setCity(c.city);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Seleziona un template");
      return createSurvey({
        template_id: selectedTemplate,
        client_id: linkMode === "cliente" ? clientId : null,
        contact_id: linkMode === "prospect" ? contactId : null,
        opportunity_id: linkMode === "prospect" ? opportunityId : null,
        order_id: orderId,
        technician_id: technicianId,
        scheduled_at: scheduledAt || null,
        address: address || null,
        city: city || null,
        zip: zip || null,
        notes: notes || null,
      }, companyId);
    },
    onSuccess: (survey) => {
      toast.success(`Sopralluogo ${survey.code} creato`);
      navigate(`/azienda/sopralluoghi/${survey.id}`);
    },
    onError: (e) => toast.error("Creazione fallita", { description: String(e) }),
  });

  const canNext1 = !!selectedTemplate;
  const canNext2 = true; // step 2 opzionale
  const canSubmit = !!selectedTemplate;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/sopralluoghi")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Nuovo sopralluogo
          </h1>
          <p className="text-sm text-muted-foreground">Step {step} di 3</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n, i) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
              step >= n ? "bg-orange-600 text-white" : "bg-muted text-muted-foreground",
            )}>
              {step > n ? <Check className="h-4 w-4" /> : n}
            </div>
            <span className={cn("text-xs hidden sm:inline", step >= n ? "font-semibold" : "text-muted-foreground")}>
              {n === 1 ? "Template" : n === 2 ? "Collegamento" : "Dettagli"}
            </span>
            {i < 2 && <div className={cn("flex-1 h-0.5", step > n ? "bg-orange-500" : "bg-muted")} />}
          </div>
        ))}
      </div>

      {/* STEP 1 — Template */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-orange-600" />
              Quale tipo di rilievo?
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tplLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : tplError ? (
              <div className="rounded-xl border border-red-200 dark:border-red-900/40 p-6 text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500/70" />
                <p className="font-semibold text-sm mb-1">Impossibile caricare i modelli</p>
                <p className="text-xs text-muted-foreground mb-3">Controlla la connessione e riprova.</p>
                <Button variant="outline" size="sm" onClick={() => tplRefetch()}>Riprova</Button>
              </div>
            ) : (templates ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="font-semibold text-sm mb-1">Nessun modello disponibile</p>
                <p className="text-xs text-muted-foreground">Contatta l'amministratore per configurare i modelli di sopralluogo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {templatesOrdinati.map((t) => {
                  const consigliato = consigliate.includes(t.category);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplate(t.id)}
                      className={cn(
                        "relative rounded-xl border-2 p-4 text-left transition-all",
                        selectedTemplate === t.id
                          ? "border-orange-500 bg-orange-50 shadow-md"
                          : consigliato
                            ? "border-orange-200 hover:border-orange-400 hover:bg-orange-50/40"
                            : "border-muted hover:border-orange-300 hover:bg-muted/30",
                      )}
                    >
                      {consigliato && (
                        <Badge className="absolute right-2 top-2 bg-orange-100 text-orange-700 text-[9px]">Consigliato</Badge>
                      )}
                      <div className="text-3xl mb-2">{CATEGORY_ICON[t.category] ?? "📋"}</div>
                      <p className="font-semibold text-sm leading-tight">{t.name}</p>
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                      )}
                      {t.is_system && (
                        <Badge variant="outline" className="text-[9px] mt-2">Sistema</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — A chi si riferisce (cliente OPPURE contatto/opportunità) + commessa */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-600" />
              A chi si riferisce
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Modalità: cliente esistente oppure prospect (contatto/opportunità). */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "cliente" as const, label: "Cliente", sub: "già a sistema", icon: UserRound },
                { key: "prospect" as const, label: "Contatto / Opportunità", sub: "prospect dal CRM", icon: Target },
              ]).map((m) => {
                const on = linkMode === m.key;
                const Icona = m.icon;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => cambiaModalita(m.key)}
                    className={cn(
                      "rounded-xl border-2 p-3 text-left transition-all",
                      on ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30" : "border-muted hover:border-orange-300 hover:bg-muted/30",
                    )}
                  >
                    <Icona className={cn("h-4 w-4 mb-1", on ? "text-orange-600" : "text-muted-foreground")} />
                    <p className="text-sm font-semibold leading-tight">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground">{m.sub}</p>
                  </button>
                );
              })}
            </div>

            {linkMode === "cliente" ? (
              <div>
                <Label className="text-xs flex items-center gap-1"><UserRound className="h-3 w-3" /> Cliente (opzionale)</Label>
                <Select value={clientId ?? "none"} onValueChange={(v) => setClientId(v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Nessun cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun cliente</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Oppure lascialo vuoto e collega solo una commessa qui sotto.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={crmSearch} onChange={(e) => setCrmSearch(e.target.value)} placeholder="Cerca contatto o opportunità…" className="pl-9 h-9" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Target className="h-3 w-3" /> Opportunità (opzionale)</Label>
                  <Select value={opportunityId ?? "none"} onValueChange={(v) => scegliOpportunita(v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Nessuna opportunità" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna opportunità</SelectItem>
                      {crmOpps.map((o) => {
                        const nome = o.name || "Opportunità";
                        const contatto = nomeContatto(o.contact);
                        const mostraContatto = contatto && !nome.toLowerCase().includes(contatto.toLowerCase());
                        return (
                          <SelectItem key={o.id} value={o.id}>
                            {nome}{mostraContatto ? ` — ${contatto}` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Scegliendo un'opportunità il suo contatto si collega da solo.</p>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><UserRound className="h-3 w-3" /> Contatto</Label>
                  <Select value={contactId ?? "none"} onValueChange={(v) => scegliContatto(v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Nessun contatto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun contatto</SelectItem>
                      {crmContacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {nomeContatto(c) || c.phone || c.email || c.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Commessa: sempre opzionale, indipendente dalla controparte. */}
            <div className="border-t pt-4">
              <Label className="text-xs flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                Commessa associata (opzionale)
              </Label>
              <Select value={orderId ?? "none"} onValueChange={(v) => {
                if (v === "none") {
                  setOrderId(null);
                } else {
                  setOrderId(v);
                  const order = orders?.find((o) => o.id === v);
                  if (order) {
                    // In modalità «cliente» la commessa può dare il cliente; in
                    // modalità prospect NON tocchiamo la controparte.
                    if (linkMode === "cliente" && order.customer_id) setClientId(order.customer_id);
                    const orderAddr = order.work_address ?? order.indirizzo_lavori ?? order.client_address;
                    if (orderAddr && !address) setAddress(orderAddr);
                  }
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessuna commessa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna commessa</SelectItem>
                  {(orders ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ?? o.id.slice(0, 8)} — {o.client_name ?? "Cliente"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Se associ una commessa, il sopralluogo sarà visibile dalla pagina della commessa.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — Dettagli */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-600" />
              Dettagli sopralluogo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-8">
                <Label className="text-xs">Indirizzo</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Via, n° civico" />
              </div>
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-xs">CAP</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="00100" />
              </div>
              <div className="col-span-12">
                <Label className="text-xs">Città</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Roma" />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Data programmata
                </Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Tecnico assegnato
                </Label>
                <Select value={technicianId ?? "none"} onValueChange={(v) => setTechnicianId(v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nessuno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {(members ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-xs">Note iniziali</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Note rapide, contesto, accessi…"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer navigation */}
      <div className="flex items-center justify-between gap-2">
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Indietro
          </Button>
        ) : <div />}

        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            Avanti
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Crea sopralluogo
          </Button>
        )}
      </div>
    </div>
  );
}
