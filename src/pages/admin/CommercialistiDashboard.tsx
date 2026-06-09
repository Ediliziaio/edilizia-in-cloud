import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import { CommercialistiAnalytics } from "@/components/admin/commercialisti/CommercialistiAnalytics";
import { AccessControlDialog } from "@/components/admin/AccessControlDialog";
import { EditEntityDialog } from "@/components/admin/EditEntityDialog";
import { LastAccessBadge } from "@/components/admin/LastAccessBadge";
import { useAdminActivity, latestActivity } from "@/hooks/useAdminActivity";
import {
  Calculator, Building2, ChevronDown, ChevronRight, AlertCircle, RefreshCw, Mail, Users, Play, Ban, KeyRound, Search, Pencil,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

interface Member { user_id: string; role: string | null; status: string | null; email: string | null; name: string | null }
interface ManagedCompany { company_id: string; status: string | null; access_mode: string | null; company_name: string | null; company_status: string | null }
interface Studio {
  id: string;
  name: string;
  status: string | null;
  created_at: string | null;
  owner_email: string | null;
  owner_user_id: string | null;
  firm_email: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  members: Member[];
  members_count: number;
  companies: ManagedCompany[];
}

const FIRM_STATUS_LABEL: Record<string, string> = {
  active: "Attivo", suspended: "Sospeso", pending_contract: "Contratto in attesa", archived: "Archiviato",
};
const MODE_LABEL: Record<string, string> = {
  operational: "Operativo", read_only: "Sola lettura", approval_required: "Con approvazione",
};

async function fetchStudi(): Promise<Studio[]> {
  // accountant_* non sempre nei tipi generati → client non tipizzato.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: firms, error: e1 } = await sb
    .from("accountant_firms").select("id, name, status, owner_user_id, email, vat_number, fiscal_code, created_at")
    .order("created_at", { ascending: false });
  if (e1) throw new Error(e1.message);
  const firmIds: string[] = (firms ?? []).map((f: AnyRow) => f.id);
  if (firmIds.length === 0) return [];

  const { data: members } = await sb
    .from("accountant_firm_members").select("firm_id, user_id, role, status").in("firm_id", firmIds);
  const { data: access } = await sb
    .from("accountant_company_access")
    .select("firm_id, company_id, status, access_mode, company:companies!inner(id, name, status)")
    .in("firm_id", firmIds).in("status", ["active", "invited", "suspended"]);

  const userIds: string[] = [...new Set([
    ...(members ?? []).map((m: AnyRow) => m.user_id),
    ...(firms ?? []).map((f: AnyRow) => f.owner_user_id),
  ].filter(Boolean))];
  const { data: profs } = userIds.length
    ? await sb.from("profiles").select("id, email, first_name, last_name").in("id", userIds)
    : { data: [] as AnyRow[] };

  const emailById = new Map<string, string>((profs ?? []).map((p: AnyRow) => [p.id, p.email]));
  const nameById = new Map<string, string>((profs ?? []).map((p: AnyRow) => [
    p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email,
  ]));

  const membersByFirm = new Map<string, Member[]>();
  (members ?? []).forEach((m: AnyRow) => {
    const arr = membersByFirm.get(m.firm_id) ?? [];
    arr.push({ user_id: m.user_id, role: m.role, status: m.status, email: emailById.get(m.user_id) ?? null, name: nameById.get(m.user_id) ?? null });
    membersByFirm.set(m.firm_id, arr);
  });
  const accessByFirm = new Map<string, ManagedCompany[]>();
  (access ?? []).forEach((a: AnyRow) => {
    const arr = accessByFirm.get(a.firm_id) ?? [];
    arr.push({ company_id: a.company_id, status: a.status, access_mode: a.access_mode, company_name: a.company?.name ?? null, company_status: a.company?.status ?? null });
    accessByFirm.set(a.firm_id, arr);
  });

  return (firms ?? []).map((f: AnyRow): Studio => {
    const mem = membersByFirm.get(f.id) ?? [];
    return {
      id: f.id, name: f.name, status: f.status ?? null, created_at: f.created_at ?? null,
      owner_email: emailById.get(f.owner_user_id) ?? f.email ?? null,
      owner_user_id: f.owner_user_id ?? null,
      firm_email: f.email ?? null,
      vat_number: f.vat_number ?? null,
      fiscal_code: f.fiscal_code ?? null,
      members: mem,
      members_count: mem.filter((m) => m.status === "active").length,
      companies: accessByFirm.get(f.id) ?? [],
    };
  });
}

export default function CommercialistiDashboard() {
  const { permissions: saPermissions } = useSuperAdminPermissions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Studio | null>(null);
  const [accessTarget, setAccessTarget] = useState<Studio | null>(null);
  const [editTarget, setEditTarget] = useState<Studio | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("recent");

  const { data: studi = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-commercialisti"],
    queryFn: fetchStudi,
    staleTime: 60_000,
    enabled: saPermissions.can_manage_companies,
  });

  const setFirmStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("accountant_firms").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "suspended" ? "Studio sospeso" : "Studio riattivato");
      setSuspendTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-commercialisti"] });
    },
    onError: (e) => toast.error("Operazione fallita", { description: (e as Error).message }),
  });

  const { activity, isLoading: activityLoading } = useAdminActivity(studi.map((s) => s.owner_user_id));
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = studi.filter((s) => {
      if (statusFilter !== "all" && (s.status ?? "") !== statusFilter) return false;
      if (q) {
        const hay = `${s.name} ${s.owner_email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...arr].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "aziende") return b.companies.length - a.companies.length;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [studi, search, statusFilter, sortKey]);

  const inactiveCount = useMemo(() => {
    if (activityLoading) return undefined;
    const cutoff = nowMs - 30 * 86_400_000;
    return studi.reduce((n, s) => {
      const ts = latestActivity(activity[s.owner_user_id ?? ""]);
      return n + (!ts || Date.parse(ts) < cutoff ? 1 : 0);
    }, 0);
  }, [studi, activity, nowMs, activityLoading]);

  if (!saPermissions.can_manage_companies) return <AccessDenied />;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Commercialisti</h1>
          <p className="text-muted-foreground">
            Studi commercialisti e le aziende clienti che gestiscono in delega.
          </p>
        </div>
      </div>

      {!isLoading && !isError && studi.length > 0 && <CommercialistiAnalytics studi={studi} inactiveCount={inactiveCount} />}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei commercialisti.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !isError && studi.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca studio o email owner…" className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="active">Attivi</SelectItem>
              <SelectItem value="suspended">Sospesi</SelectItem>
              <SelectItem value="pending_contract">Contratto in attesa</SelectItem>
              <SelectItem value="archived">Archiviati</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Ordina" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Più recenti</SelectItem>
              <SelectItem value="name">Nome A-Z</SelectItem>
              <SelectItem value="aziende">Più aziende</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : studi.length === 0 && !isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Calculator className="h-10 w-10 text-muted-foreground opacity-40" />
            <div>
              <p className="font-medium">Nessuno studio ancora</p>
              <p className="mt-1 text-sm text-muted-foreground">Gli studi si registrano da soli o vengono invitati dalle aziende.</p>
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessuno studio corrisponde ai filtri.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => {
            const isOpen = expanded === s.id;
            return (
              <li key={s.id} className="overflow-hidden rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{s.name}</span>
                      <Badge variant={s.status === "active" ? "default" : s.status === "suspended" ? "destructive" : "secondary"} className="shrink-0">
                        {FIRM_STATUS_LABEL[s.status ?? ""] ?? s.status ?? "—"}
                      </Badge>
                    </div>
                    {s.owner_email && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {s.owner_email}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <LastAccessBadge lastSeen={latestActivity(activity[s.owner_user_id ?? ""])} nowMs={nowMs} loading={activityLoading} />
                    <Badge variant="outline" className="gap-1"><Building2 className="h-3.5 w-3.5" /> {s.companies.length} aziende</Badge>
                    <Badge variant="outline" className="hidden gap-1 sm:inline-flex"><Users className="h-3.5 w-3.5" /> {s.members_count} membri</Badge>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    {/* Azioni studio */}
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
                      <span className="text-sm font-medium">Gestione studio</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={!s.owner_email} onClick={() => setAccessTarget(s)}>
                          <KeyRound className="h-3.5 w-3.5" /> Accesso
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditTarget(s)}>
                          <Pencil className="h-3.5 w-3.5" /> Modifica
                        </Button>
                        {s.status === "suspended" ? (
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={setFirmStatus.isPending} onClick={() => setFirmStatus.mutate({ id: s.id, status: "active" })}>
                            <Play className="h-3.5 w-3.5" /> Riattiva
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={setFirmStatus.isPending} onClick={() => setSuspendTarget(s)}>
                            <Ban className="h-3.5 w-3.5" /> Sospendi
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Aziende gestite */}
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Aziende gestite ({s.companies.length})
                    </div>
                    {s.companies.length === 0 ? (
                      <p className="mb-3 text-sm text-muted-foreground">Nessuna azienda in delega.</p>
                    ) : (
                      <ul className="mb-3 divide-y">
                        {s.companies.map((c) => (
                          <li key={c.company_id}>
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/aziende/${c.company_id}`)}
                              title="Apri la scheda azienda"
                              className="-mx-1 flex w-full items-center justify-between gap-2 rounded px-1 py-2 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/50"
                            >
                              <span className="truncate text-sm font-medium">{c.company_name ?? "—"}</span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Badge variant="secondary" className="text-[11px]">{companyStatusLabelIt(c.company_status)}</Badge>
                                <Badge variant="outline" className="hidden text-[11px] sm:inline-flex">{MODE_LABEL[c.access_mode ?? ""] ?? c.access_mode}</Badge>
                                {c.status !== "active" && <Badge variant="outline" className="border-amber-200 text-[11px] text-amber-700">{c.status}</Badge>}
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Membri */}
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Membri ({s.members.length})
                    </div>
                    {s.members.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nessun membro.</p>
                    ) : (
                      <ul className="divide-y">
                        {s.members.map((m) => (
                          <li key={m.user_id} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                            <span className="truncate">{m.name ?? m.email ?? "—"}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Badge variant="outline" className="text-[11px] capitalize">{m.role}</Badge>
                              {m.status !== "active" && <Badge variant="secondary" className="text-[11px]">{m.status}</Badge>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) setSuspendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sospendere {suspendTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              I membri dello studio perderanno l&apos;accesso operativo alle aziende in delega finché non lo riattivi. Nessun dato viene eliminato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={setFirmStatus.isPending}
              onClick={() => { if (suspendTarget) setFirmStatus.mutate({ id: suspendTarget.id, status: "suspended" }); }}
            >
              Sospendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AccessControlDialog
        open={!!accessTarget}
        onOpenChange={(o) => { if (!o) setAccessTarget(null); }}
        email={accessTarget?.owner_email ?? null}
        label={accessTarget?.name}
        onChanged={() => qc.invalidateQueries({ queryKey: ["admin-commercialisti"] })}
      />

      <EditEntityDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title="Modifica studio"
        description="Aggiorna i dati anagrafici dello studio commercialista."
        fields={[
          { key: "name", label: "Ragione sociale", required: true, maxLength: 120 },
          { key: "email", label: "Email", type: "email", placeholder: "studio@esempio.it" },
          { key: "vat_number", label: "P.IVA", maxLength: 20, placeholder: "IT01234567890" },
          { key: "fiscal_code", label: "Codice fiscale", maxLength: 16 },
        ]}
        initial={{
          name: editTarget?.name ?? "",
          email: editTarget?.firm_email ?? "",
          vat_number: editTarget?.vat_number ?? "",
          fiscal_code: editTarget?.fiscal_code ?? "",
        }}
        onSave={async (v) => {
          if (!editTarget) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("accountant_firms").update({
            name: v.name.trim(),
            email: v.email.trim().toLowerCase() || null,
            vat_number: v.vat_number.trim() || null,
            fiscal_code: v.fiscal_code.trim().toUpperCase() || null,
          }).eq("id", editTarget.id);
          if (error) throw new Error(error.message);
          toast.success("Studio aggiornato");
          setEditTarget(null);
          qc.invalidateQueries({ queryKey: ["admin-commercialisti"] });
        }}
      />
    </div>
  );
}
