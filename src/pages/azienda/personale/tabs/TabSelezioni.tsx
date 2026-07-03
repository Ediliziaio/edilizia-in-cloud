import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { DOMANDE } from "@/features/talent-profile/data/questionario";
import { ROLE_PROFILES_V5 } from "@/features/talent-profile/lib/roleMatchingV5";
import { buildTalentReportDecision, buildTalentReportPayload, buildTalentReportPrintHtml, type TalentReportPayload } from "@/features/talent-profile/lib/reporting";
import { PremiumReportButton } from "@/features/talent-profile/components/PremiumReportButton";
import { RichReportSections } from "@/features/talent-profile/components/RichReportSections";
import { HeroReportVisual } from "@/features/talent-profile/components/HeroReportVisual";
import { CACHE_VERSION as REPORT_CACHE_VERSION, computeDerivedReport, type CachedDerivedReport } from "@/features/talent-profile/lib/reportCache";
import { TRAIT_LABELS, type TraitCode } from "@/features/talent-profile/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, BarChart3, BrainCircuit, CheckCircle2, ClipboardCheck, Clock3, Copy, ExternalLink, FileText, Link2, Plus, Printer, RefreshCcw, ShieldCheck, Sparkles, Target, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TalentCandidateStatus = "draft" | "invited" | "in_progress" | "completed" | "archived";

type TalentCandidate = {
  id: string;
  nome: string;
  cognome: string;
  email: string | null;
  telefono: string | null;
  ruolo_richiesto: string;
  status: TalentCandidateStatus;
  completed_at: string | null;
  created_at: string;
};

type TalentReport = {
  id: string;
  company_id: string;
  candidate_id: string;
  reliability_index: "YES" | "CAUTION" | "NO" | "ZERO" | "FORCED";
  control_unexpected_count: number;
  profile_type: string;
  assessment_version: "v5";
  traits_v5: Record<string, number>;
  macro_areas: TalentReportPayload["macro_areas"];
  role_requested: string;
  role_match: TalentReportPayload["role_match"] | null;
  all_roles: TalentReportPayload["all_roles"];
  syndromes_detected: unknown[];
  strengths: string[];
  improvements: string[];
  valleys: string[];
  generated_at: string;
  mappa_interiore?: unknown | null;
  management_tips?: unknown | null;
  management_closing?: string | null;
  trait_narratives?: unknown | null;
  cache_version?: number | null;
};

type TalentAnswer = {
  question_id: number;
  answer_value: "A" | "B" | "C" | "D";
};

type TalentDbError = { message?: string } | null;
type TalentDbResponse<T = unknown> = { data: T | null; error: TalentDbError };
type TalentQueryBuilder<T = unknown> = PromiseLike<TalentDbResponse<T>> & {
  select: (columns?: string) => TalentQueryBuilder<T>;
  insert: (values: unknown) => TalentQueryBuilder<T>;
  upsert: (values: unknown, options?: unknown) => TalentQueryBuilder<T>;
  update: (values: unknown) => TalentQueryBuilder<T>;
  eq: (column: string, value: unknown) => TalentQueryBuilder<T>;
  order: (column: string, options?: unknown) => TalentQueryBuilder<T>;
};

type PublicLinkRpcResponse = {
  public_path?: string;
  token?: string;
  expires_at?: string | null;
};

const talentDb = supabase as unknown as {
  from: <T = unknown>(table: string) => TalentQueryBuilder<T>;
  rpc: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<TalentDbResponse<T>>;
};

type PublicLinkState = {
  candidateName: string;
  url: string;
  expiresAt: string | null;
};

const STATUS_LABELS: Record<TalentCandidateStatus, string> = {
  draft: "Bozza",
  invited: "Invitato",
  in_progress: "In corso",
  completed: "Completato",
  archived: "Archiviato",
};

const STATUS_CLASSES: Record<TalentCandidateStatus, string> = {
  draft: "bg-slate-50 text-slate-700 border-slate-200",
  invited: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
};

export function TabSelezioni() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questionnaireCandidate, setQuestionnaireCandidate] = useState<TalentCandidate | null>(null);
  const [selectedReport, setSelectedReport] = useState<{ candidate: TalentCandidate; report: TalentReport } | null>(null);
  const [publicLink, setPublicLink] = useState<PublicLinkState | null>(null);
  const [autoReportRunKey, setAutoReportRunKey] = useState("");
  const [form, setForm] = useState({
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    ruolo_richiesto: "Venditore/Commerciale",
    seniority: "Candidato",
  });

  const candidatesQuery = useQuery({
    queryKey: ["hr-talent-candidates", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await talentDb
        .from<TalentCandidate[]>("hr_talent_candidates")
        .select("id,nome,cognome,email,telefono,ruolo_richiesto,status,completed_at,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TalentCandidate[];
    },
    staleTime: 60_000,
  });

  const reportsQuery = useQuery({
    queryKey: ["hr-talent-reports", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await talentDb
        .from<TalentReport[]>("hr_talent_reports")
        .select("id,company_id,candidate_id,assessment_version,reliability_index,control_unexpected_count,profile_type,traits_v5,macro_areas,role_requested,role_match,all_roles,syndromes_detected,strengths,improvements,valleys,generated_at,mappa_interiore,management_tips,management_closing,trait_narratives,cache_version")
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TalentReport[];
    },
    staleTime: 60_000,
  });

  const createCandidate = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!form.nome.trim() || !form.cognome.trim()) throw new Error("Nome e cognome sono obbligatori");

      const payload = {
        company_id: companyId,
        nome: form.nome.trim(),
        cognome: form.cognome.trim(),
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        ruolo_richiesto: form.ruolo_richiesto,
        seniority: form.seniority,
        status: "draft",
        assessment_version: "v5",
        metadata: { origin: "personale_selezioni" },
      };

      const { error } = await talentDb.from("hr_talent_candidates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidato creato in Selezioni");
      setDialogOpen(false);
      setForm({ nome: "", cognome: "", email: "", telefono: "", ruolo_richiesto: "Venditore/Commerciale", seniority: "Candidato" });
      queryClient.invalidateQueries({ queryKey: ["hr-talent-candidates"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Errore creazione candidato");
    },
  });

  const issuePublicLink = useMutation({
    mutationFn: async (candidate: TalentCandidate) => {
      const { data, error } = await talentDb.rpc<PublicLinkRpcResponse>("hr_talent_issue_public_link", {
        p_candidate_id: candidate.id,
      });
      if (error) throw error;
      const publicPath = String(data?.public_path || `/talent-profile/${data?.token || ""}`);
      const url = new URL(publicPath, window.location.origin).toString();
      return {
        candidateName: `${candidate.nome} ${candidate.cognome}`,
        url,
        expiresAt: data?.expires_at || null,
      } satisfies PublicLinkState;
    },
    onSuccess: (link) => {
      setPublicLink(link);
      toast.success("Link candidato generato");
      queryClient.invalidateQueries({ queryKey: ["hr-talent-candidates"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Errore generazione link candidato");
    },
  });

  const candidates = useMemo(() => candidatesQuery.data || [], [candidatesQuery.data]);
  const reports = useMemo(() => reportsQuery.data || [], [reportsQuery.data]);
  const reportsByCandidate = useMemo(() => new Map(reports.map((report) => [report.candidate_id, report])), [reports]);
  const roleNames = useMemo(() => Object.keys(ROLE_PROFILES_V5), []);
  const completedWithoutReports = useMemo(
    () => candidates.filter((candidate) => candidate.status === "completed" && !reportsByCandidate.has(candidate.id)),
    [candidates, reportsByCandidate],
  );

  const autoGenerateMissingReports = useMutation({
    mutationFn: async (targetCandidates: TalentCandidate[]) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      let generated = 0;
      let failed = 0;

      // Isolamento per candidato: un report con dati incompleti/non validi NON
      // deve bloccare la generazione degli altri (prima il throw nel loop
      // interrompeva l'intero batch). Conteggio onesto generati/falliti.
      for (const candidate of targetCandidates) {
        try {
          const { data, error } = await talentDb
            .from<TalentAnswer[]>("hr_talent_answers")
            .select("question_id,answer_value")
            .eq("candidate_id", candidate.id)
            .order("question_id", { ascending: true });
          if (error) throw error;

          const rows = (data || []) as TalentAnswer[];
          if (rows.length < DOMANDE.length) continue; // test incompleto → salta (non è un errore)

          const answers = rows.reduce<Record<number, "A" | "B" | "C" | "D">>((acc, answer) => {
            acc[answer.question_id] = answer.answer_value;
            return acc;
          }, {});

          const reportPayload = buildTalentReportPayload({
            companyId,
            candidate,
            answers,
          });

          const { error: reportError } = await talentDb
            .from("hr_talent_reports")
            .upsert(reportPayload, { onConflict: "candidate_id,assessment_version" });
          if (reportError) throw reportError;
          generated += 1;
        } catch (candidateError) {
          failed += 1;
          console.warn("[selezioni] report auto-gen fallito per candidato", candidate.id, candidateError);
        }
      }

      return { generated, failed };
    },
    onSuccess: ({ generated, failed }) => {
      if (generated > 0) {
        toast.success(`${generated} report Talent Assessment generati automaticamente`);
        queryClient.invalidateQueries({ queryKey: ["hr-talent-reports"] });
      }
      if (failed > 0) {
        toast.info(`${failed} report non generati: dati assessment incompleti o non validi.`);
      }
    },
    onError: () => {
      toast.error("Non sono riuscito a generare i report automatici");
    },
  });

  const autoReportKey = completedWithoutReports.map((candidate) => candidate.id).join("|");

  useEffect(() => {
    if (!autoReportKey || autoReportKey === autoReportRunKey || autoGenerateMissingReports.isPending) return;
    setAutoReportRunKey(autoReportKey);
    autoGenerateMissingReports.mutate(completedWithoutReports);
  }, [autoGenerateMissingReports, autoReportKey, autoReportRunKey, completedWithoutReports]);

  const stats = useMemo(() => {
    const completed = candidates.filter((candidate) => candidate.status === "completed").length;
    const inProgress = candidates.filter((candidate) => candidate.status === "in_progress" || candidate.status === "invited").length;
    const reliable = reports.filter((report) => report.reliability_index === "YES").length;
    const bestFit = reports.reduce((best, report) => Math.max(best, Number(report.role_match?.compatibilitaPct || 0)), 0);
    return { total: candidates.length, completed, inProgress, reliable, bestFit };
  }, [candidates, reports]);

  const isLoading = candidatesQuery.isLoading || reportsQuery.isLoading;
  const hasError = candidatesQuery.isError || reportsQuery.isError;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm shadow-orange-200">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Selezioni</h2>
                <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Talent Assessment</Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Assessment attitudinale per assunzioni e crescita interna: 242 domande V5, attendibilità, sindromi, matching su {roleNames.length} ruoli e aggancio ai profili HR dopo l'assunzione.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                candidatesQuery.refetch();
                reportsQuery.refetch();
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Aggiorna
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuovo candidato
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nuovo candidato Talent Assessment</DialogTitle>
                  <DialogDescription>
                    Crea la scheda selezione. Il link pubblico del questionario verrà generato dal flusso invito.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome">
                    <Input value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} placeholder="Nome" />
                  </Field>
                  <Field label="Cognome">
                    <Input value={form.cognome} onChange={(event) => setForm((prev) => ({ ...prev, cognome: event.target.value }))} placeholder="Cognome" />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="candidato@email.it" />
                  </Field>
                  <Field label="Telefono">
                    <Input value={form.telefono} onChange={(event) => setForm((prev) => ({ ...prev, telefono: event.target.value }))} placeholder="+39..." />
                  </Field>
                  <Field label="Ruolo da valutare">
                    <Select value={form.ruolo_richiesto} onValueChange={(value) => setForm((prev) => ({ ...prev, ruolo_richiesto: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {roleNames.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Livello">
                    <Select value={form.seniority} onValueChange={(value) => setForm((prev) => ({ ...prev, seniority: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Candidato">Candidato</SelectItem>
                        <SelectItem value="Junior">Junior</SelectItem>
                        <SelectItem value="Intermedio">Intermedio</SelectItem>
                        <SelectItem value="Senior">Senior</SelectItem>
                        <SelectItem value="Manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
                  <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => createCandidate.mutate()} disabled={createCandidate.isPending}>
                    {createCandidate.isPending ? "Creazione..." : "Crea selezione"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={UserRoundSearch} label="Candidati" value={stats.total} detail="nel perimetro azienda" />
        <MetricCard icon={Clock3} label="Da completare" value={stats.inProgress} detail="invitati o in corso" tone="amber" />
        <MetricCard icon={CheckCircle2} label="Completati" value={stats.completed} detail="con questionario chiuso" tone="emerald" />
        <MetricCard icon={ShieldCheck} label="Attendibili" value={stats.reliable} detail="report con indice YES" tone="blue" />
        <MetricCard icon={Target} label="Best fit" value={`${stats.bestFit}%`} detail="compatibilità più alta" tone="orange" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Pipeline selezioni</CardTitle>
              <p className="text-sm text-slate-500">Candidati, stato test e primo esito del report.</p>
            </div>
            <Badge variant="outline">{DOMANDE.length} domande</Badge>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : hasError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Errore nel caricamento delle selezioni. Verifica che la migrazione `hr_talent_profile` sia applicata.
              </div>
            ) : candidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Sparkles className="mx-auto h-9 w-9 text-orange-500" />
                <h3 className="mt-3 text-lg font-semibold text-slate-900">Nessuna selezione ancora</h3>
                <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600">
                  Crea il primo candidato, scegli il ruolo e prepara l'invito al Talent Assessment.
                </p>
                <Button className="mt-4 bg-orange-600 hover:bg-orange-700" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuovo candidato
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    report={reportsByCandidate.get(candidate.id)}
                    onOpenQuestionnaire={() => setQuestionnaireCandidate(candidate)}
                    onOpenReport={() => {
                      const report = reportsByCandidate.get(candidate.id);
                      if (report) setSelectedReport({ candidate, report });
                    }}
                    onGenerateLink={() => issuePublicLink.mutate(candidate)}
                    isGeneratingLink={issuePublicLink.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Motore V5 attivo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <CheckLine icon={ClipboardCheck} title={`${DOMANDE.length} domande`} detail="versionate e pronte per seed DB" />
              <CheckLine icon={Target} title={`${roleNames.length} ruoli`} detail="matching mansione con soglie, ruoli edilizia e disqualifier" />
              <CheckLine icon={ShieldCheck} title="Controlli attendibilità" detail="5 domande CTRL + indice YES/CAUTION/NO/ZERO" />
              <CheckLine icon={Link2} title="Invito pubblico" detail="link candidato con privacy, autosalvataggio e completamento" />
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50/40">
            <CardHeader>
              <CardTitle className="text-base">Flusso operativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>
                Da qui crei il candidato, invii il link esterno, rivedi le risposte e generi il report con fit ruolo quando il test e completo.
              </p>
              <Badge className="bg-white text-orange-700 hover:bg-white">Questionario interno + link pubblico attivi</Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      <SelezioniAnalytics candidates={candidates} reports={reports} />

      {questionnaireCandidate && (
        <TalentQuestionnaireDialog
          candidate={questionnaireCandidate}
          companyId={companyId}
          open={!!questionnaireCandidate}
          onOpenChange={(open) => {
            if (!open) setQuestionnaireCandidate(null);
          }}
          onCompleted={() => {
            setQuestionnaireCandidate(null);
            candidatesQuery.refetch();
            reportsQuery.refetch();
          }}
        />
      )}

      {selectedReport && (
        <ReportDecisionDialog
          candidate={selectedReport.candidate}
          report={selectedReport.report}
          open={!!selectedReport}
          onOpenChange={(open) => {
            if (!open) setSelectedReport(null);
          }}
        />
      )}

      <Dialog open={!!publicLink} onOpenChange={(open) => {
        if (!open) setPublicLink(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Talent Assessment generato</DialogTitle>
            <DialogDescription>
              Condividi questo link con {publicLink?.candidateName}. Per sicurezza il token completo viene mostrato solo ora.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input readOnly value={publicLink?.url || ""} onFocus={(event) => event.currentTarget.select()} />
            {publicLink?.expiresAt && (
              <p className="text-xs text-slate-500">
                Scade il {new Date(publicLink.expiresAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                if (!publicLink?.url) return;
                window.open(publicLink.url, "_blank", "noopener,noreferrer");
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Apri link
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              onClick={async () => {
                if (!publicLink?.url) return;
                await navigator.clipboard.writeText(publicLink.url);
                toast.success("Link copiato");
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copia link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "slate",
}: {
  icon: typeof UserRoundSearch;
  label: string;
  value: number | string;
  detail: string;
  tone?: "slate" | "amber" | "emerald" | "blue" | "orange";
}) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-950">{value}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

function CandidateRow({
  candidate,
  report,
  onOpenQuestionnaire,
  onOpenReport,
  onGenerateLink,
  isGeneratingLink,
}: {
  candidate: TalentCandidate;
  report?: TalentReport;
  onOpenQuestionnaire: () => void;
  onOpenReport: () => void;
  onGenerateLink: () => void;
  isGeneratingLink: boolean;
}) {
  const score = Number(report?.role_match?.compatibilitaPct || 0);
  const decision = report ? buildTalentReportDecision(report) : null;
  const questionnaireActionLabel = report
    ? "Rivedi test"
    : candidate.status === "completed"
      ? "Genera report"
      : "Compila test";

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{candidate.nome} {candidate.cognome}</p>
          <Badge variant="outline" className={STATUS_CLASSES[candidate.status]}>{STATUS_LABELS[candidate.status]}</Badge>
          {report && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Report pronto</Badge>}
          {decision && <Badge variant="outline" className={decision.tone === "red" ? "border-red-200 bg-red-50 text-red-700" : decision.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{decision.label}</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{candidate.ruolo_richiesto}</span>
          {candidate.email && <span>{candidate.email}</span>}
          {candidate.telefono && <span>{candidate.telefono}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-20 text-right">
          <p className="text-sm font-semibold text-slate-900">{report ? `${score}%` : "..."}</p>
          <p className="text-xs text-slate-500">fit ruolo</p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenQuestionnaire}>
          {questionnaireActionLabel}
        </Button>
        <Button variant="outline" size="sm" onClick={onGenerateLink} disabled={isGeneratingLink || candidate.status === "completed"}>
          <Link2 className="mr-2 h-4 w-4" />
          Genera link
        </Button>
        <Button variant="outline" size="sm" disabled={!report} onClick={onOpenReport}>
          <FileText className="mr-2 h-4 w-4" />
          Apri report
        </Button>
        {report && <PremiumReportButton candidate={candidate} report={report} />}
      </div>
    </div>
  );
}

function formatTalentTrait(value: string) {
  return TRAIT_LABELS[value as TraitCode] || value;
}

function buildTargetTraitsForRole(ruoloName: string): Record<string, number> | undefined {
  const profile = ROLE_PROFILES_V5[ruoloName];
  if (!profile) return undefined;
  const target: Record<string, number> = {};
  for (const req of profile.requisiti) {
    target[req.trait] = Math.max(0, Math.min(100, req.soglia));
  }
  for (const t of profile.trattiFondamentali) {
    if (target[t] === undefined || target[t] < 70) target[t] = 70;
  }
  return target;
}

function clampTalentPercent(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function openTalentReportPrintView(candidate: TalentCandidate, report: TalentReport) {
  const html = buildTalentReportPrintHtml({
    candidateName: `${candidate.nome} ${candidate.cognome}`.trim() || "Candidato",
    companyName: "Edilizia in Cloud",
    report,
  });
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    toast.error("Popup bloccato: abilita le nuove finestre per scaricare il PDF.");
    return;
  }

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 350);
}

function copyTalentReportSummary(report: TalentReport) {
  const decision = buildTalentReportDecision(report);
  navigator.clipboard.writeText(decision.executiveSummary)
    .then(() => toast.success("Sintesi report copiata"))
    .catch(() => toast.error("Non riesco a copiare la sintesi"));
}

function ReportDecisionDialog({
  candidate,
  report,
  open,
  onOpenChange,
}: {
  candidate: TalentCandidate;
  report: TalentReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const decision = buildTalentReportDecision(report);
  const topRoles = (report.all_roles || []).slice(0, 5);
  const missingRequirements = report.role_match?.requisitiMancanti || [];
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[decision.tone];

  const cacheReady = (report.cache_version ?? 0) >= REPORT_CACHE_VERSION;
  const precomputed: CachedDerivedReport | null = useMemo(() => {
    if (!cacheReady) return null;
    return {
      mappa_interiore: (report.mappa_interiore as CachedDerivedReport["mappa_interiore"]) ?? null,
      management_tips: ((report.management_tips as CachedDerivedReport["management_tips"]) ?? []) || [],
      management_closing: typeof report.management_closing === "string" ? report.management_closing : "",
      trait_narratives: (report.trait_narratives as CachedDerivedReport["trait_narratives"]) ?? {},
    };
  }, [cacheReady, report.mappa_interiore, report.management_tips, report.management_closing, report.trait_narratives]);

  const wroteCacheRef = useRef(false);
  useEffect(() => {
    if (!open || cacheReady || wroteCacheRef.current) return;
    wroteCacheRef.current = true;
    const derived = computeDerivedReport({
      traits: report.traits_v5,
      candidateName: candidate.nome,
      candidateSesso: null,
      candidateEta: null,
      syndromes: (report.syndromes_detected || []) as never,
    });
    void talentDb
      .from("hr_talent_reports")
      .update({
        mappa_interiore: derived.mappa_interiore,
        management_tips: derived.management_tips,
        management_closing: derived.management_closing,
        trait_narratives: derived.trait_narratives,
        cache_version: REPORT_CACHE_VERSION,
      })
      .eq("id", report.id)
      .then((res) => {
        if (res?.error) {
          // Cache write failure: log silently, lo schema legacy continua a funzionare.
          console.warn("[talent-cache] write failed", res.error.message);
          wroteCacheRef.current = false;
        }
      });
  }, [open, cacheReady, report.id, report.traits_v5, report.syndromes_detected, candidate.nome]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <DialogTitle>Report Talent Assessment</DialogTitle>
              <DialogDescription>
                {candidate.nome} {candidate.cognome} · {report.role_requested || candidate.ruolo_richiesto}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={toneClass}>{decision.label}</Badge>
              <Badge variant="outline">Attendibilita {report.reliability_index}</Badge>
              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                {Number(report.role_match?.compatibilitaPct || 0)}% fit
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <HeroReportVisual
          candidate={{ nome: candidate.nome, cognome: candidate.cognome }}
          traits={report.traits_v5}
          syndromes={(report.syndromes_detected || []) as never}
          macroAreas={{
            essere: report.macro_areas?.essere_pct ?? 0,
            fare: report.macro_areas?.fare_pct ?? 0,
            avere: report.macro_areas?.avere_pct ?? 0,
          }}
          fitPct={Number(report.role_match?.compatibilitaPct || 0)}
          fitVerdict={report.role_match?.verdict}
          profileLabel={report.profile_type.replace(/_/g, " ")}
          decisionLabel={decision.label}
          decisionTone={decision.tone}
          reliability={report.reliability_index}
          targetTraits={buildTargetTraitsForRole(report.role_requested || candidate.ruolo_richiesto)}
          targetRoleLabel={report.role_requested || candidate.ruolo_richiesto}
          precomputedMappa={precomputed?.mappa_interiore ?? null}
        />

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className={`border ${toneClass}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BrainCircuit className="h-4 w-4" />
                Decisione HR — dettaglio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-slate-800">{decision.executiveSummary}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniKpi label="Profilo" value={report.profile_type} />
                <MiniKpi label="Controlli" value={`${report.control_unexpected_count} anomalie`} />
                <MiniKpi label="Verdetto" value={report.role_match?.verdict || "Da valutare"} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Rischi e verifiche
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {decision.risks.map((risk) => (
                <div key={risk} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {risk}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <ReportInsightCard
            title="Punti forti"
            description="Leve da usare subito in selezione e inserimento."
            items={report.strengths}
            fallback="Nessun punto forte dominante: usare colloquio e referenze per completare la valutazione."
            tone="emerald"
          />
          <ReportInsightCard
            title="Aree da allenare"
            description="Competenze o abitudini da trasformare in piano operativo."
            items={report.improvements}
            fallback="Nessuna area critica dominante rilevata."
            tone="amber"
          />
          <ReportInsightCard
            title="Tratti sensibili"
            description="Punti bassi da non ignorare prima della decisione finale."
            items={report.valleys}
            fallback="Nessun tratto basso prioritario."
            tone="slate"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <ReportMacroAreas report={report} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-orange-600" />
                Prossime azioni HR
              </CardTitle>
              <p className="text-sm text-slate-500">Checklist operativa per trasformare il report in una decisione controllata.</p>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {decision.nextActions.map((action) => (
                <div key={action.title} className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
                  <Badge variant="outline" className="border-orange-200 bg-white text-orange-800">{action.priority}</Badge>
                  <p className="mt-3 text-sm font-semibold text-slate-950">{action.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{action.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Domande colloquio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {decision.interviewQuestions.map((question, index) => (
                <div key={`${question}-${index}`} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                  <span className="mr-2 font-semibold text-orange-700">{index + 1}.</span>
                  {question}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confronto ruoli</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topRoles.map((role, index) => (
                <div key={role.ruolo} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{index + 1}. {role.ruolo}</p>
                    <p className="text-xs text-slate-500">{role.verdict}</p>
                  </div>
                  <Badge variant="outline">{role.compatibilita}%</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Punti da approfondire</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {missingRequirements.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Requisiti principali soddisfatti. Validare esperienza, referenze e disponibilita.
                </div>
              ) : (
                missingRequirements.slice(0, 5).map((requirement) => (
                  <div key={requirement.trait} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {requirement.label}: {requirement.valore}/{requirement.soglia}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <ReportTraitsPanel report={report} />

        <RichReportSections
          candidate={{ nome: candidate.nome, cognome: candidate.cognome }}
          traits={report.traits_v5}
          syndromes={(report.syndromes_detected || []) as never}
          profileType={report.profile_type}
          reliability={report.reliability_index}
          precomputed={precomputed}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Piano 30/60/90</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {decision.onboardingPlan.map((step) => (
              <div key={step.phase} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-950">{step.phase}</p>
                <p className="mt-1 text-sm text-orange-700">{step.focus}</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {step.actions.map((action) => (
                    <li key={action} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        <SilvioReportActions candidate={candidate} report={report} />

        <DialogFooter>
          <Button variant="outline" onClick={() => copyTalentReportSummary(report)}>
            <Copy className="mr-2 h-4 w-4" />
            Copia sintesi
          </Button>
          <Button variant="outline" onClick={() => openTalentReportPrintView(candidate, report)}>
            <Printer className="mr-2 h-4 w-4" />
            Stampa rapida
          </Button>
          <PremiumReportButton candidate={candidate} report={report} />
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => onOpenChange(false)}>
            Chiudi report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportMacroAreas({ report }: { report: TalentReport }) {
  const areas = [
    { label: "Essere", value: clampTalentPercent(report.macro_areas?.essere_pct), detail: "Obiettivi, energia e stabilita" },
    { label: "Fare", value: clampTalentPercent(report.macro_areas?.fare_pct), detail: "Esecuzione, vendita e iniziativa" },
    { label: "Avere", value: clampTalentPercent(report.macro_areas?.avere_pct), detail: "Relazione, influenza e collaborazione" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Macro aree</CardTitle>
        <p className="text-sm text-slate-500">Equilibrio del profilo tra spinta personale, azione e relazione.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {areas.map((area) => (
          <div key={area.label} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{area.label}</p>
                <p className="text-xs text-slate-500">{area.detail}</p>
              </div>
              <Badge variant="outline">{area.value}%</Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-orange-500" style={{ width: `${area.value}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const TRAIT_ORDER: TraitCode[] = [
  "ORG", "AUT", "GP", "ADS", "DET", "VEN", "HRM",
  "LDR", "PRO", "COM", "ESP", "RC", "FIN", "SUC", "PRI",
];

const TRAIT_MACRO: Record<TraitCode, "ESSERE" | "FARE" | "AVERE" | "INDICATOR" | "CTRL"> = {
  ORG: "ESSERE", AUT: "ESSERE", GP: "ESSERE",
  ADS: "FARE", DET: "FARE", VEN: "FARE", HRM: "FARE",
  LDR: "AVERE", PRO: "AVERE", COM: "AVERE", ESP: "AVERE",
  RC: "INDICATOR", FIN: "INDICATOR", SUC: "INDICATOR", PRI: "INDICATOR",
  CTRL: "CTRL",
};

function ReportTraitsPanel({ report }: { report: TalentReport }) {
  const traits = (report.traits_v5 || {}) as Record<string, number>;
  const groups: { label: string; code: "ESSERE" | "FARE" | "AVERE" | "INDICATOR" }[] = [
    { label: "Essere — concentrazione obiettivi", code: "ESSERE" },
    { label: "Fare — azione concreta", code: "FARE" },
    { label: "Avere — relazioni di valore", code: "AVERE" },
    { label: "Indicatori comportamentali", code: "INDICATOR" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">15 tratti psicometrici</CardTitle>
        <p className="text-sm text-slate-500">Profilo dettagliato del candidato. Verde = punto forte (≥65), ambra = medio (40–64), rosso = leva critica (&lt;40).</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map((group) => {
          const codes = TRAIT_ORDER.filter((c) => TRAIT_MACRO[c] === group.code);
          return (
            <div key={group.code} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {codes.map((code) => {
                  const value = clampTalentPercent(traits[code]);
                  const tone = value >= 65 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
                  return (
                    <div key={code} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700">{TRAIT_LABELS[code]}</span>
                        <span className="text-xs font-bold tabular-nums text-slate-900">{value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const RELIABILITY_COLORS: Record<string, string> = {
  YES: "#16A34A",
  CAUTION: "#D97706",
  NO: "#DC2626",
  ZERO: "#6B7280",
  FORCED: "#9333EA",
};

const RELIABILITY_LABELS: Record<string, string> = {
  YES: "Attendibile",
  CAUTION: "Cautela",
  NO: "Non attendibile",
  ZERO: "Inutilizzabile",
  FORCED: "Forzato",
};

function SelezioniAnalytics({ candidates, reports }: { candidates: TalentCandidate[]; reports: TalentReport[] }) {
  const trendData = useMemo(() => {
    const days = 30;
    const now = new Date();
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const c of candidates) {
      const key = c.created_at?.slice(0, 10);
      if (key && buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, value]) => ({
      date: date.slice(5),
      value,
    }));
  }, [candidates]);

  const fitByRole = useMemo(() => {
    const grouped = new Map<string, { sum: number; count: number }>();
    for (const r of reports) {
      const ruolo = r.role_requested || "Non specificato";
      const pct = Number(r.role_match?.compatibilitaPct || 0);
      const cur = grouped.get(ruolo) || { sum: 0, count: 0 };
      cur.sum += pct;
      cur.count += 1;
      grouped.set(ruolo, cur);
    }
    return Array.from(grouped.entries())
      .map(([ruolo, { sum, count }]) => ({
        ruolo: ruolo.length > 18 ? `${ruolo.slice(0, 18)}…` : ruolo,
        fit: Math.round(sum / count),
        count,
      }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 8);
  }, [reports]);

  const reliabilityData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reports) counts.set(r.reliability_index, (counts.get(r.reliability_index) || 0) + 1);
    return Array.from(counts.entries()).map(([key, value]) => ({
      name: RELIABILITY_LABELS[key] || key,
      value,
      color: RELIABILITY_COLORS[key] || "#94A3B8",
    }));
  }, [reports]);

  const profileTypeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reports) counts.set(r.profile_type, (counts.get(r.profile_type) || 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: name.replace("_", " "), value }));
  }, [reports]);

  const conversion = useMemo(() => {
    const total = candidates.length;
    const completed = candidates.filter((c) => c.status === "completed" || c.status === "reviewed").length;
    const reliable = reports.filter((r) => r.reliability_index === "YES").length;
    const completedPct = total === 0 ? 0 : Math.round((completed / total) * 100);
    const reliablePct = total === 0 ? 0 : Math.round((reliable / total) * 100);
    return { total, completed, reliable, completedPct, reliablePct };
  }, [candidates, reports]);

  if (candidates.length === 0) return null;

  const PIE_COLORS = ["#F97316", "#1E3A5F", "#16A34A", "#D97706", "#7C3AED", "#0891B2", "#DB2777", "#65A30D"];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-orange-600" />
          <CardTitle className="text-base">Analytics selezioni</CardTitle>
        </div>
        <p className="text-sm text-slate-500">
          Trend candidati, conversion e distribuzione dei report sulle ultime selezioni.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conversion test</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{conversion.completedPct}%</p>
            <p className="mt-1 text-xs text-slate-500">{conversion.completed}/{conversion.total} candidati completati</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Tasso attendibilità</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{conversion.reliablePct}%</p>
            <p className="mt-1 text-xs text-emerald-700">{conversion.reliable} report con indice YES</p>
          </div>
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Report totali</p>
            <p className="mt-1 text-2xl font-bold text-orange-900">{reports.length}</p>
            <p className="mt-1 text-xs text-orange-700">su {conversion.total} candidati totali</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Nuovi candidati ultimi 30 giorni</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trendData}>
                <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} interval={4} />
                <YAxis stroke="#94A3B8" fontSize={10} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(249, 115, 22, 0.1)" }} contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} />
                <Bar dataKey="value" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Fit medio per ruolo</p>
            {fitByRole.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nessun report ancora generato.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={fitByRole} layout="vertical">
                  <XAxis type="number" stroke="#94A3B8" fontSize={10} domain={[0, 100]} />
                  <YAxis type="category" dataKey="ruolo" stroke="#94A3B8" fontSize={10} width={110} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="fit" fill="#1E3A5F" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Attendibilità report</p>
            {reliabilityData.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nessun report ancora generato.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={reliabilityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={36} outerRadius={70} paddingAngle={2}>
                    {reliabilityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {reliabilityData.map((d) => (
                <Badge key={d.name} variant="outline" style={{ borderColor: d.color, color: d.color }}>
                  {d.name} · {d.value}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Distribuzione profili</p>
            {profileTypeData.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nessun report ancora generato.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={profileTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(entry: { name: string; percent: number }) => `${entry.name} ${(entry.percent * 100).toFixed(0)}%`}>
                    {profileTypeData.map((_, index) => (
                      <Cell key={`pcell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SilvioReportActions({ candidate, report }: { candidate: TalentCandidate; report: TalentReport }) {
  const name = `${candidate.nome} ${candidate.cognome}`.trim();
  const ruolo = report.role_requested || candidate.ruolo_richiesto || "il ruolo richiesto";
  const fitPct = Number(report.role_match?.compatibilitaPct || 0);
  const profilo = report.profile_type?.replace(/_/g, " ") || "profilo non identificato";
  const reliability = report.reliability_index;
  const syndromesCount = Array.isArray(report.syndromes_detected) ? report.syndromes_detected.length : 0;
  const decision = buildTalentReportDecision(report);

  const baseContext =
    `Contesto candidato: ${name} (ruolo valutato: ${ruolo}). ` +
    `Fit ${fitPct}%, profilo ${profilo}, attendibilità ${reliability}, ${syndromesCount} sindromi attive. ` +
    `Decisione: ${decision.label}.`;

  const openWithDraft = (draft: string) => {
    window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft } }));
  };

  const actions: { id: string; label: string; emoji: string; build: () => string; tone: string }[] = [
    {
      id: "sintesi",
      emoji: "📋",
      label: "Sintetizza in 60s",
      tone: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
      build: () =>
        `${baseContext}\n\nRiassumi questo candidato in 60 secondi: verdetto, 3 punti forti concreti, 2 rischi reali, 1 raccomandazione operativa. Parla in italiano colloquiale per imprenditore (non psicologico/tecnico). Massimo 8 righe.`,
    },
    {
      id: "domande",
      emoji: "❓",
      label: "Domande colloquio",
      tone: "border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100",
      build: () =>
        `${baseContext}\n\nGenera 5 domande critiche di colloquio personalizzate per questo candidato. Per ciascuna: (1) la domanda concreta da fare, (2) cosa stai osservando dietro la domanda, (3) cosa significa una risposta "rossa". Focalizzati sui tratti più sensibili e sulle sindromi attive.`,
    },
    {
      id: "email_offerta",
      emoji: "✉️",
      label: "Email offerta",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
      build: () =>
        `${baseContext}\n\nScrivi una bozza di email di offerta di lavoro per ${name}. Tono caldo ma professionale, personalizza sui suoi tratti dominanti. Includi: ruolo, sede di lavoro generica "il nostro cantiere", prossimo passo "fissiamo un colloquio finale". Massimo 150 parole. Saluti firmati "HR — EdiliziaInCloud".`,
    },
    {
      id: "email_rifiuto",
      emoji: "📧",
      label: "Email rifiuto",
      tone: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
      build: () =>
        `${baseContext}\n\nScrivi una bozza di email di rifiuto educata e rispettosa per ${name}. NON dire le ragioni vere (sindromi, fit basso): usa formula tipo "altri profili più allineati al ruolo in questo momento". Lascia porta aperta per il futuro. Tono umano, non robotico. Massimo 100 parole. Saluti firmati "HR — EdiliziaInCloud".`,
    },
  ];

  return (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="h-4 w-4 text-orange-600" />
          Chiedi a Silvio
        </CardTitle>
        <p className="text-sm text-slate-600">
          Apre la chat con un prompt già scritto + contesto del candidato. Modifica prima di inviare se vuoi.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openWithDraft(a.build())}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${a.tone}`}
            >
              <span className="text-xl">{a.emoji}</span>
              <span>
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="text-xs opacity-80">Click per aprire Silvio</span>
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportInsightCard({
  title,
  description,
  items,
  fallback,
  tone,
}: {
  title: string;
  description: string;
  items: string[];
  fallback: string;
  tone: "emerald" | "amber" | "slate";
}) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-slate-500">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {(items || []).length === 0 ? (
          <div className={`rounded-xl border p-3 text-sm ${toneClasses}`}>{fallback}</div>
        ) : (
          items.slice(0, 6).map((item) => (
            <div key={item} className={`rounded-xl border px-3 py-2 text-sm font-medium ${toneClasses}`}>
              {formatTalentTrait(item)}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function TalentQuestionnaireDialog({
  candidate,
  companyId,
  open,
  onOpenChange,
  onCompleted,
}: {
  candidate: TalentCandidate;
  companyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [block, setBlock] = useState(1);
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const blocks = useMemo(() => Array.from(new Set(DOMANDE.map((domanda) => domanda.blocco_tematico))).sort((a, b) => a - b), []);
  const currentQuestions = useMemo(() => DOMANDE.filter((domanda) => domanda.blocco_tematico === block), [block]);

  const answersQuery = useQuery({
    queryKey: ["hr-talent-answers", candidate.id],
    enabled: open && !!candidate.id,
    queryFn: async () => {
      const { data, error } = await talentDb
        .from<TalentAnswer[]>("hr_talent_answers")
        .select("question_id,answer_value")
        .eq("candidate_id", candidate.id)
        .order("question_id", { ascending: true });

      if (error) throw error;
      return (data || []) as TalentAnswer[];
    },
  });

  useEffect(() => {
    if (!answersQuery.data) return;
    setAnswers(
      answersQuery.data.reduce<Record<number, "A" | "B" | "C" | "D">>((acc, answer) => {
        acc[answer.question_id] = answer.answer_value;
        return acc;
      }, {}),
    );
  }, [answersQuery.data]);

  const answeredCount = Object.keys(answers).length;
  const progressPct = Math.round((answeredCount / DOMANDE.length) * 100);
  const blockIndex = blocks.indexOf(block);

  const saveAnswers = useMutation({
    mutationFn: async (nextStatus?: TalentCandidateStatus) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const rows = Object.entries(answers).map(([questionId, value]) => ({
        company_id: companyId,
        candidate_id: candidate.id,
        assessment_version: "v5",
        question_id: Number(questionId),
        answer_value: value,
      }));

      if (rows.length > 0) {
        const { error } = await talentDb
          .from("hr_talent_answers")
          .upsert(rows, { onConflict: "candidate_id,assessment_version,question_id" });
        if (error) throw error;
      }

      if (nextStatus && candidate.status !== "completed") {
        const { error } = await talentDb
          .from("hr_talent_candidates")
          .update({ status: nextStatus, started_at: new Date().toISOString() })
          .eq("id", candidate.id)
          .eq("company_id", companyId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Risposte salvate");
      queryClient.invalidateQueries({ queryKey: ["hr-talent-answers", candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["hr-talent-candidates"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Errore salvataggio risposte"),
  });

  const completeAssessment = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (answeredCount < DOMANDE.length) {
        throw new Error(`Mancano ${DOMANDE.length - answeredCount} risposte prima di generare il report`);
      }

      await saveAnswers.mutateAsync("completed");

      const reportPayload = buildTalentReportPayload({
        companyId,
        candidate,
        answers,
      });

      const { error: reportError } = await talentDb
        .from("hr_talent_reports")
        .upsert(reportPayload, { onConflict: "candidate_id,assessment_version" });
      if (reportError) throw reportError;

      const { error: candidateError } = await talentDb
        .from("hr_talent_candidates")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("company_id", companyId);
      if (candidateError) throw candidateError;
    },
    onSuccess: () => {
      toast.success("Report Talent Assessment generato");
      queryClient.invalidateQueries({ queryKey: ["hr-talent-reports"] });
      queryClient.invalidateQueries({ queryKey: ["hr-talent-candidates"] });
      onCompleted();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Errore generazione report"),
  });

  const goToBlock = async (nextBlock: number) => {
    if (nextBlock === block || saveAnswers.isPending || completeAssessment.isPending) return;

    try {
      await saveAnswers.mutateAsync("in_progress");
      setBlock(nextBlock);
    } catch {
      // La mutation mostra gia il messaggio: blocchiamo solo la navigazione per non perdere risposte.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Questionario Talent Assessment</DialogTitle>
              <DialogDescription>
                {candidate.nome} {candidate.cognome} · {candidate.ruolo_richiesto}
              </DialogDescription>
            </div>
            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">{answeredCount}/{DOMANDE.length} risposte</Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-orange-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </DialogHeader>

        <div className="grid max-h-[68vh] grid-cols-1 overflow-hidden lg:grid-cols-[180px_1fr]">
          <aside className="hidden border-r border-slate-200 bg-slate-50 p-3 lg:block">
            <div className="space-y-1">
              {blocks.map((item) => {
                const blockAnswered = DOMANDE.filter((domanda) => domanda.blocco_tematico === item && answers[domanda.id]).length;
                const blockTotal = DOMANDE.filter((domanda) => domanda.blocco_tematico === item).length;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void goToBlock(item)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${block === item ? "bg-orange-100 text-orange-800" : "text-slate-600 hover:bg-white"}`}
                  >
                    <span>Blocco {item}</span>
                    <span className="text-xs">{blockAnswered}/{blockTotal}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="overflow-y-auto p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Blocco {block}</p>
                <p className="text-xs text-slate-500">Rispondi con la scelta più naturale. Le domande speciali mostrano testi dedicati.</p>
              </div>
              <Select value={String(block)} onValueChange={(value) => void goToBlock(Number(value))}>
                <SelectTrigger className="w-36 lg:hidden"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {blocks.map((item) => <SelectItem key={item} value={String(item)}>Blocco {item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {currentQuestions.map((domanda) => (
                <div key={domanda.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Domanda {domanda.id} · {domanda.scala_primaria}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{domanda.testo}</p>
                    </div>
                    <AnswerButtons
                      value={answers[domanda.id]}
                      custom={domanda.risposte_custom}
                      onChange={(value) => setAnswers((prev) => ({ ...prev, [domanda.id]: value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-4">
          <Button variant="outline" disabled={blockIndex <= 0 || saveAnswers.isPending} onClick={() => void goToBlock(blocks[Math.max(0, blockIndex - 1)])}>
            Indietro
          </Button>
          <Button variant="outline" onClick={() => saveAnswers.mutate("in_progress")} disabled={saveAnswers.isPending}>
            Salva bozza
          </Button>
          {blockIndex < blocks.length - 1 ? (
            <Button disabled={saveAnswers.isPending} onClick={() => void goToBlock(blocks[Math.min(blocks.length - 1, blockIndex + 1)])}>
              Avanti
            </Button>
          ) : (
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => completeAssessment.mutate()} disabled={completeAssessment.isPending}>
              Genera report
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnswerButtons({
  value,
  custom,
  onChange,
}: {
  value?: "A" | "B" | "C" | "D";
  custom?: { a: string; b: string; c: string };
  onChange: (value: "A" | "B" | "C") => void;
}) {
  const options = [
    { value: "A" as const, label: custom?.a || "Vero / Sì" },
    { value: "B" as const, label: custom?.b || "A volte / Incerto" },
    { value: "C" as const, label: custom?.c || "Falso / No" },
  ];

  return (
    <div className="grid min-w-64 gap-2 sm:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
            value === option.value
              ? "border-orange-500 bg-orange-50 text-orange-800"
              : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/60"
          }`}
        >
          <span className="block text-[11px] font-bold">{option.value}</span>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CheckLine({ icon: Icon, title, detail }: { icon: typeof ClipboardCheck; title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
