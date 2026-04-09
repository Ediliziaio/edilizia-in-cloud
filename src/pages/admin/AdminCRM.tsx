import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, Search, ChevronLeft, ChevronRight, RefreshCw,
  Mail, Phone, Star, Tag, Send, PlusCircle, Loader2, Megaphone,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  score: number;
  source: string | null;
  contact_type: string;
  tags: string[];
  unsubscribed: boolean;
  created_at: string;
  last_activity_at: string | null;
  companies?: { name: string } | null;
}

interface CrmCampaign {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  contact_filter: Record<string, unknown>;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduled_at: string | null;
  sent_at: string | null;
  total_contacts: number;
  sent_count: number;
  error_count: number;
  error_message: string | null;
  created_at: string;
}

type SortField = "created_at" | "score" | "last_activity_at" | "first_name";

const PAGE_SIZE = 50;

// ─── Contacts Hooks ───────────────────────────────────────

function useAdminCRM(params: {
  page: number;
  search: string;
  contactType: string;
  sortField: SortField;
  sortDesc: boolean;
}) {
  return useQuery({
    queryKey: ["admin", "crm", params],
    queryFn: async () => {
      const from = params.page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone, company_name, score, source, contact_type, tags, unsubscribed, created_at, last_activity_at, companies(name)", { count: "exact" })
        .order(params.sortField, { ascending: !params.sortDesc })
        .range(from, to);

      if (params.contactType !== "all") {
        query = query.eq("contact_type", params.contactType);
      }

      if (params.search.trim()) {
        const s = `%${params.search.trim()}%`;
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s},company_name.ilike.${s}`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { contacts: (data ?? []) as unknown as Contact[], total: count ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

function useCRMStats() {
  return useQuery({
    queryKey: ["admin", "crm-stats"],
    queryFn: async () => {
      const { count: total } = await supabase
        .from("marketing_contacts")
        .select("*", { count: "exact", head: true });
      const { count: leads } = await supabase
        .from("marketing_contacts")
        .select("*", { count: "exact", head: true })
        .eq("contact_type", "lead");
      const { count: customers } = await supabase
        .from("marketing_contacts")
        .select("*", { count: "exact", head: true })
        .eq("contact_type", "customer");
      const { count: unsub } = await supabase
        .from("marketing_contacts")
        .select("*", { count: "exact", head: true })
        .eq("unsubscribed", true);
      return {
        total: total ?? 0,
        leads: leads ?? 0,
        customers: customers ?? 0,
        unsub: unsub ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

// ─── Campaign Hooks ───────────────────────────────────────

function useCrmCampaigns() {
  return useQuery({
    queryKey: ["admin", "crm-campaigns"],
    queryFn: async (): Promise<CrmCampaign[]> => {
      const { data, error } = await (supabase
        .from("crm_campaigns" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(50) as unknown as Promise<{ data: CrmCampaign[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; subject: string; html_body: string; contact_filter: Record<string, unknown> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await (supabase
        .from("crm_campaigns" as never)
        .insert({ ...payload, created_by: user?.id } as never)
        .select("id")
        .single() as unknown as Promise<{ data: { id: string } | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data!;
    },
    onSuccess: () => {
      toast.success("Campagna creata");
      void qc.invalidateQueries({ queryKey: ["admin", "crm-campaigns"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-crm-campaign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ sent: number; errors: number; total: number }>;
    },
    onSuccess: (r) => {
      toast.success(`Campagna inviata: ${r.sent}/${r.total} email`);
      void qc.invalidateQueries({ queryKey: ["admin", "crm-campaigns"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Helpers ─────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500/15 text-emerald-700 border-emerald-300" :
    score >= 50 ? "bg-yellow-500/15 text-yellow-700 border-yellow-300" :
    "bg-muted text-muted-foreground";
  return (
    <Badge className={`${color} font-mono text-xs`}>{score}</Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  switch (type) {
    case "lead": return <Badge variant="secondary">Lead</Badge>;
    case "customer": return <Badge className="bg-emerald-500/15 text-emerald-700">Cliente</Badge>;
    case "prospect": return <Badge className="bg-blue-500/15 text-blue-700">Prospect</Badge>;
    default: return <Badge variant="outline">{type}</Badge>;
  }
}

function CampaignStatusBadge({ status }: { status: CrmCampaign["status"] }) {
  switch (status) {
    case "draft":     return <Badge variant="secondary">Bozza</Badge>;
    case "scheduled": return <Badge className="bg-blue-500/15 text-blue-700">Schedulata</Badge>;
    case "sending":   return <Badge className="bg-yellow-500/15 text-yellow-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Invio...</Badge>;
    case "sent":      return <Badge className="bg-emerald-500/15 text-emerald-700">Inviata</Badge>;
    case "failed":    return <Badge variant="destructive">Fallita</Badge>;
  }
}

// ─── Campaign Create Form ─────────────────────────────────

function CreateCampaignForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const createMutation = useCreateCampaign();

  const handleCreate = () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error("Nome, oggetto e testo obbligatori");
      return;
    }
    const filter: Record<string, unknown> = {};
    if (filterType !== "all") filter.contact_type = filterType;
    if (filterScoreMin) filter.score_min = parseInt(filterScoreMin);

    createMutation.mutate(
      { name, subject, html_body: body, contact_filter: filter },
      { onSuccess: () => { onDone(); setName(""); setSubject(""); setBody(""); setFilterType("all"); setFilterScoreMin(""); } }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PlusCircle className="h-4 w-4" />
          Nuova Campagna
        </CardTitle>
        <CardDescription>
          Crea una campagna email outbound per i tuoi contatti marketing.
          Usa <code>{"{{nome}}"}</code>, <code>{"{{cognome}}"}</code>, <code>{"{{email}}"}</code> per personalizzare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-1 block">Nome campagna</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Offerta estate 2026" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Oggetto email</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Es. Scopri le novità di EdiliziaInCloud" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-1 block">Tipo contatto</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti i tipi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i contatti</SelectItem>
                <SelectItem value="lead">Solo Lead</SelectItem>
                <SelectItem value="customer">Solo Clienti</SelectItem>
                <SelectItem value="prospect">Solo Prospect</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Score minimo (0-100)</Label>
            <Input
              type="number"
              value={filterScoreMin}
              onChange={e => setFilterScoreMin(e.target.value)}
              placeholder="Nessun filtro score"
              min={0} max={100}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs mb-1 block">Corpo email (HTML supportato)</Label>
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={`<h2>Ciao {{nome}},</h2>\n<p>Abbiamo novità per te!</p>`}
            rows={8}
            className="font-mono text-sm"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onDone}>Annulla</Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Crea Campagna
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Campaigns Tab ────────────────────────────────────────

function CampaigneTab() {
  const { data: campaigns = [], isLoading, refetch, isFetching } = useCrmCampaigns();
  const sendMutation = useSendCampaign();
  const [showForm, setShowForm] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleSend = (id: string) => {
    setSendingId(id);
    sendMutation.mutate(id, { onSettled: () => setSendingId(null) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gestisci e lancia campagne email verso i tuoi contatti marketing
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Nuova Campagna
            </Button>
          )}
        </div>
      </div>

      {showForm && <CreateCampaignForm onDone={() => setShowForm(false)} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Campagne
            <Badge variant="secondary" className="ml-auto text-xs">{campaigns.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessuna campagna creata</p>
              <p className="text-xs mt-1">Clicca "Nuova Campagna" per iniziare</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium">Nome</th>
                  <th className="text-left px-4 py-2 font-medium">Oggetto</th>
                  <th className="text-center px-4 py-2 font-medium">Stato</th>
                  <th className="text-right px-4 py-2 font-medium">Inviati</th>
                  <th className="text-right px-4 py-2 font-medium">Errori</th>
                  <th className="text-right px-4 py-2 font-medium">Creata</th>
                  <th className="text-right px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/20">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[200px]">{c.subject}</td>
                    <td className="px-4 py-2 text-center">
                      <CampaignStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.status === "sent" || c.status === "sending" ? `${c.sent_count}/${c.total_contacts}` : "—"}
                    </td>
                    <td className={`px-4 py-2 text-right ${c.error_count > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {c.status === "sent" || c.status === "sending" ? c.error_count : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(c.created_at), "dd/MM/yy HH:mm", { locale: it })}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {(c.status === "draft" || c.status === "scheduled") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleSend(c.id)}
                          disabled={sendingId === c.id || sendMutation.isPending}
                        >
                          {sendingId === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" />
                          )}
                          Invia
                        </Button>
                      )}
                      {c.error_message && (
                        <span className="text-xs text-destructive ml-2 truncate max-w-[120px]" title={c.error_message}>
                          {c.error_message.slice(0, 40)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────

export default function AdminCRM() {
  const { permissions } = useSuperAdminPermissions();

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [contactType, setContactType] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDesc, setSortDesc] = useState(true);

  const { data: stats } = useCRMStats();
  const { data, isLoading, isFetching, refetch } = useAdminCRM({
    page, search, contactType, sortField, sortDesc,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  // Guard DOPO tutti gli hooks (Rules of Hooks)
  if (!permissions.can_view_platform_stats && !permissions.can_manage_admins) {
    return <AccessDenied />;
  }

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc((d) => !d);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            CRM Proprietario AEDIX
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Database contatti marketing globale della piattaforma
          </p>
        </div>
      </div>

      <Tabs defaultValue="contatti">
        <TabsList>
          <TabsTrigger value="contatti" className="gap-2">
            <Users className="h-4 w-4" />
            Contatti
          </TabsTrigger>
          <TabsTrigger value="campagne" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Campagne Outbound
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contatti" className="mt-4 space-y-4">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Contatti totali", value: stats?.total.toLocaleString("it-IT") ?? "—", icon: Users },
              { label: "Lead", value: stats?.leads.toLocaleString("it-IT") ?? "—", icon: Star },
              { label: "Clienti", value: stats?.customers.toLocaleString("it-IT") ?? "—", icon: Users },
              { label: "Disiscritti", value: stats?.unsub.toLocaleString("it-IT") ?? "—", icon: Mail },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-3 flex-wrap">
                <div className="flex gap-2 flex-1 min-w-[240px]">
                  <Input
                    placeholder="Cerca per nome, email, telefono, azienda..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} size="sm">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                <Select
                  value={contactType}
                  onValueChange={(v) => { setContactType(v); setPage(0); }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i tipi</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="customer">Cliente</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={sortField}
                  onValueChange={(v) => { setSortField(v as SortField); setPage(0); }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Ordina per" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Data creazione</SelectItem>
                    <SelectItem value="score">Score</SelectItem>
                    <SelectItem value="last_activity_at">Ultima attività</SelectItem>
                    <SelectItem value="first_name">Nome</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                  Aggiorna
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm text-muted-foreground">
                {data?.total.toLocaleString("it-IT") ?? "…"} contatti
                {search && ` · ricerca: "${search}"`}
                {contactType !== "all" && ` · tipo: ${contactType}`}
                <span className="ml-2">
                  (pagina {page + 1}/{Math.max(totalPages, 1)})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("first_name")}
                      >
                        Nome<SortIcon field="first_name" />
                      </TableHead>
                      <TableHead>Contatti</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead
                        className="cursor-pointer select-none text-right"
                        onClick={() => handleSort("score")}
                      >
                        Score<SortIcon field="score" />
                      </TableHead>
                      <TableHead>Sorgente</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("created_at")}
                      >
                        Creato<SortIcon field="created_at" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("last_activity_at")}
                      >
                        Ultima attività<SortIcon field="last_activity_at" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.contacts ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                          Nessun contatto trovato
                        </TableCell>
                      </TableRow>
                    ) : (
                      (data?.contacts ?? []).map((c) => (
                        <TableRow key={c.id} className={c.unsubscribed ? "opacity-50" : ""}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {c.first_name} {c.last_name ?? ""}
                                {c.unsubscribed && (
                                  <Badge variant="outline" className="ml-1 text-[10px]">disiscritto</Badge>
                                )}
                              </p>
                              {c.company_name && (
                                <p className="text-xs text-muted-foreground">{c.company_name}</p>
                              )}
                              {!c.company_name && c.companies?.name && (
                                <p className="text-xs text-muted-foreground">{c.companies.name}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {c.email && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate max-w-[160px]">{c.email}</span>
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  {c.phone}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell><TypeBadge type={c.contact_type} /></TableCell>
                          <TableCell className="text-right">
                            <ScoreBadge score={c.score} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.source ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap max-w-[150px]">
                              {(c.tags ?? []).slice(0, 3).map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px]">
                                  <Tag className="h-2.5 w-2.5 mr-0.5" />
                                  {t}
                                </Badge>
                              ))}
                              {(c.tags ?? []).length > 3 && (
                                <Badge variant="outline" className="text-[10px]">+{c.tags.length - 3}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(c.created_at), "dd/MM/yy", { locale: it })}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {c.last_activity_at
                              ? format(new Date(c.last_activity_at), "dd/MM/yy HH:mm", { locale: it })
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {(data?.total ?? 0) > PAGE_SIZE && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} di{" "}
                    {data?.total.toLocaleString("it-IT")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || isFetching}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm self-center px-2">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || isFetching}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campagne" className="mt-4">
          <CampaigneTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
