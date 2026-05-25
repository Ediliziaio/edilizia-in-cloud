/**
 * AdminPortaleDistributionBar — UI per concedere/revocare accesso ai corsi
 * Superadmin verso le aziende clienti.
 *
 * Modello: il corso vive UN SOLO posto (PLATFORM_ADMIN). Concediamo access
 * READ-ONLY alle aziende. Niente clonazione. Modifiche al corso si
 * propagano live a tutte le aziende che hanno accesso.
 *
 * Workflow:
 *   1. Crea corso in /admin/portale-formazione (proprietà platform admin).
 *   2. Apri questo dialog → tab "Concedi": seleziona aziende destinatarie.
 *   3. Insert in portal_course_grants → le aziende vedono il corso flaggato
 *      "Piattaforma" nel proprio portale (read-only).
 *   4. Tab "Già concessi": rimuovi/revoca accesso ad aziende.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Send,
  Search,
  CheckCircle2,
  BookOpen,
  Building2,
  Loader2,
  Users2,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { logAdminAuditAction } from "@/lib/admin/auditLog";
import {
  listPortalCourseGrants,
  grantPortalCourseToCompanies,
  revokePortalCourseFromCompanies,
  type PortalCourseGrant,
} from "@/lib/portalLearningApi";

interface AdminPortalCourseLite {
  id: string;
  title: string;
  area: string;
  status: string;
}

interface CompanyLite {
  id: string;
  name: string;
  logo_url: string | null;
}

export function AdminPortaleDistributionBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-orange-50/40 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md ring-1 ring-blue-700/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
              Concedi accesso alle aziende clienti
            </h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              Il corso resta uno solo qui. Le aziende ricevono accesso read-only:
              modifiche si propagano in tempo reale, niente duplicati.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="shrink-0 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Send className="h-4 w-4" />
          Gestisci accessi
        </Button>
      </div>
      <AdminPortaleGrantsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

interface AdminPortaleGrantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AdminPortaleGrantsDialog({ open, onOpenChange }: AdminPortaleGrantsDialogProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"grant" | "current">("grant");
  const [search, setSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());

  // ── Lista corsi Superadmin ──────────────────────────────────────────
  const coursesQuery = useQuery({
    queryKey: ["admin-portale-courses"],
    enabled: open,
    queryFn: async (): Promise<AdminPortalCourseLite[]> => {
      const { data, error } = await supabase
        .from("portal_courses")
        .select("id,title,area,status")
        .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminPortalCourseLite[];
    },
    staleTime: 60_000,
  });

  // ── Aziende clienti ─────────────────────────────────────────────────
  const companiesQuery = useQuery({
    queryKey: ["admin-portale-target-companies"],
    enabled: open,
    queryFn: async (): Promise<CompanyLite[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,logo_url")
        .eq("is_platform_admin_company", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyLite[];
    },
    staleTime: 5 * 60_000,
  });

  // ── Grants del corso selezionato (per tab "Già concessi") ──────────
  const grantsQuery = useQuery({
    queryKey: ["admin-portale-grants", selectedCourseId],
    enabled: open && !!selectedCourseId,
    queryFn: () => listPortalCourseGrants(selectedCourseId!),
    staleTime: 30_000,
  });

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = companiesQuery.data ?? [];
    if (!term) return all;
    return all.filter((c) => c.name.toLowerCase().includes(term));
  }, [companiesQuery.data, search]);

  // Aziende già concesse → escludile dalla selezione "Concedi" (no double-grant)
  const alreadyGrantedIds = useMemo(() => {
    const set = new Set<string>();
    (grantsQuery.data ?? [])
      .filter((g) => g.status === "granted")
      .forEach((g) => set.add(g.targetCompanyId));
    return set;
  }, [grantsQuery.data]);

  const grantedCompanies = useMemo(
    () => (grantsQuery.data ?? []).filter((g) => g.status === "granted"),
    [grantsQuery.data],
  );

  // ── Mutations ──────────────────────────────────────────────────────
  const grantMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourseId) throw new Error("Seleziona un corso");
      if (selectedCompanyIds.size === 0) throw new Error("Seleziona almeno un'azienda");
      return grantPortalCourseToCompanies(selectedCourseId, Array.from(selectedCompanyIds));
    },
    onSuccess: (result) => {
      void logAdminAuditAction({
        action: "portal_course.grant.bulk",
        targetType: "portal_course",
        targetId: selectedCourseId ?? undefined,
        details: {
          granted_count: result.grantedCount,
          skipped_count: result.skippedCount,
          target_company_ids: Array.from(selectedCompanyIds),
        },
      });
      toast.success(
        result.grantedCount > 0
          ? `Accesso concesso a ${result.grantedCount} aziende`
          : "Nessun nuovo accesso (tutte già autorizzate)",
        result.skippedCount > 0
          ? { description: `${result.skippedCount} skippate (auto-grant o errori)` }
          : undefined,
      );
      setSelectedCompanyIds(new Set());
      qc.invalidateQueries({ queryKey: ["admin-portale-grants", selectedCourseId] });
    },
    onError: (error) => {
      const message = (error as Error).message ?? String(error);
      if (
        message.toLowerCase().includes("function") &&
        message.toLowerCase().includes("grant_admin_portal_course")
      ) {
        toast.error("RPC non disponibile", {
          description:
            "Applica la migration 20270527000000_portal_admin_grants.sql per abilitare i grants.",
        });
        return;
      }
      toast.error("Concessione fallita", { description: message });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (targetCompanyId: string) => {
      if (!selectedCourseId) throw new Error("Seleziona un corso");
      return revokePortalCourseFromCompanies(selectedCourseId, [targetCompanyId]);
    },
    onSuccess: (result, targetCompanyId) => {
      void logAdminAuditAction({
        action: "portal_course.grant.revoke",
        targetType: "portal_course",
        targetId: selectedCourseId ?? undefined,
        details: {
          revoked_count: result.revokedCount,
          target_company_id: targetCompanyId,
        },
      });
      toast.success(
        result.revokedCount > 0
          ? "Accesso revocato"
          : "Nessuna revoca (forse già revocato)",
      );
      qc.invalidateQueries({ queryKey: ["admin-portale-grants", selectedCourseId] });
    },
    onError: (error) => {
      toast.error("Revoca fallita", { description: (error as Error).message });
    },
  });

  const toggleCompany = (id: string) => {
    if (alreadyGrantedIds.has(id)) return; // no-op se già grant attivo
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableCompanies = filteredCompanies.filter((c) => !alreadyGrantedIds.has(c.id));
  const toggleAllSelectable = () => {
    if (selectedCompanyIds.size === selectableCompanies.length) {
      setSelectedCompanyIds(new Set());
    } else {
      setSelectedCompanyIds(new Set(selectableCompanies.map((c) => c.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-500" />
            Gestisci accessi corso platform
          </DialogTitle>
          <DialogDescription>
            Concedi o revoca accesso read-only ai corsi del portale Superadmin.
            Le aziende beneficiarie vedono il corso flaggato &quot;Piattaforma&quot; nel
            loro portale formazione.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Step 1: scegli corso ─────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Corso platform
          </p>
          {coursesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (coursesQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
              <BookOpen className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              Nessun corso ancora creato. Crea un corso prima di gestirne gli accessi.
            </div>
          ) : (
            <ScrollArea className="max-h-32 rounded-lg border border-slate-200 bg-white">
              <div className="space-y-1 p-1">
                {(coursesQuery.data ?? []).map((course) => {
                  const isSelected = selectedCourseId === course.id;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
                        isSelected ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-slate-50"
                      }`}
                    >
                      <BookOpen
                        className={`h-4 w-4 shrink-0 ${isSelected ? "text-orange-500" : "text-slate-400"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {course.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                          <span>{course.area}</span>
                          <span>·</span>
                          <Badge
                            variant="outline"
                            className={
                              course.status === "pubblicato"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }
                          >
                            {course.status}
                          </Badge>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-500" />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {selectedCourseId && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "grant" | "current")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="grant" className="gap-2">
                <Send className="h-4 w-4" />
                Concedi accesso
              </TabsTrigger>
              <TabsTrigger value="current" className="gap-2">
                <Users2 className="h-4 w-4" />
                Già autorizzate
                {grantedCompanies.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {grantedCompanies.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ─── Tab: concedi nuovi accessi ────────────────────── */}
            <TabsContent value="grant" className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Aziende destinatarie
                  {selectedCompanyIds.size > 0 && (
                    <span className="ml-2 text-orange-600">({selectedCompanyIds.size} selezionate)</span>
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllSelectable}
                  disabled={selectableCompanies.length === 0}
                  className="h-6 text-xs"
                >
                  {selectedCompanyIds.size === selectableCompanies.length &&
                  selectableCompanies.length > 0
                    ? "Deseleziona tutte"
                    : "Seleziona tutte"}
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Cerca azienda..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="max-h-56 rounded-lg border border-slate-200 bg-white">
                <div className="space-y-1 p-1">
                  {companiesQuery.isLoading ? (
                    <>
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </>
                  ) : filteredCompanies.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">
                      Nessuna azienda {search.trim() ? "trovata" : "disponibile"}
                    </p>
                  ) : (
                    filteredCompanies.map((company) => {
                      const isChecked = selectedCompanyIds.has(company.id);
                      const isAlreadyGranted = alreadyGrantedIds.has(company.id);
                      return (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => toggleCompany(company.id)}
                          disabled={isAlreadyGranted}
                          className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                            isAlreadyGranted ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
                          }`}
                        >
                          <Checkbox
                            checked={isChecked || isAlreadyGranted}
                            disabled={isAlreadyGranted}
                            className="pointer-events-none"
                          />
                          <Avatar className="h-7 w-7 shrink-0">
                            {company.logo_url ? (
                              <AvatarImage src={company.logo_url} alt={company.name} />
                            ) : null}
                            <AvatarFallback className="bg-blue-100 text-[10px] font-semibold text-blue-700">
                              {company.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                            {company.name}
                          </span>
                          {isAlreadyGranted ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                            >
                              Già autorizzata
                            </Badge>
                          ) : (
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* ─── Tab: aziende già autorizzate (revoca) ─────────── */}
            <TabsContent value="current" className="space-y-2">
              {grantsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : grantedCompanies.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  <Users2 className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                  Nessuna azienda ha ancora accesso a questo corso.
                  <br />
                  Vai sulla tab &quot;Concedi accesso&quot; per autorizzarne le prime.
                </div>
              ) : (
                <ScrollArea className="max-h-72 rounded-lg border border-slate-200 bg-white">
                  <div className="space-y-1 p-1">
                    {grantedCompanies.map((grant: PortalCourseGrant) => (
                      <div
                        key={grant.id}
                        className="flex items-center gap-3 rounded-md px-3 py-2"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          {grant.targetCompanyLogo ? (
                            <AvatarImage
                              src={grant.targetCompanyLogo}
                              alt={grant.targetCompanyName ?? ""}
                            />
                          ) : null}
                          <AvatarFallback className="bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                            {(grant.targetCompanyName ?? "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {grant.targetCompanyName ?? grant.targetCompanyId}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Autorizzata{" "}
                            {new Date(grant.grantedAt).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeMutation.mutate(grant.targetCompanyId)}
                          disabled={revokeMutation.isPending}
                          className="shrink-0 gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          {revokeMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          Revoca
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          {activeTab === "grant" && (
            <Button
              type="button"
              onClick={() => grantMutation.mutate()}
              disabled={
                !selectedCourseId ||
                selectedCompanyIds.size === 0 ||
                grantMutation.isPending
              }
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {grantMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Concedi a {selectedCompanyIds.size || 0}{" "}
              {selectedCompanyIds.size === 1 ? "azienda" : "aziende"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
