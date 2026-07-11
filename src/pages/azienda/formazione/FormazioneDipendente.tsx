/**
 * Formazione — Portale lato DIPENDENTE.
 *
 * A differenza di /azienda/personale/portale (gestione corsi, solo HR/admin),
 * questa pagina è accessibile a QUALSIASI utente azienda loggato: mostra i corsi
 * pubblicati, l'avanzamento REALE dell'utente (portal_course_enrollments) e
 * permette di consumare moduli/materiali salvando il progresso su DB.
 *
 * È il pezzo che finalmente popola le iscrizioni reali (prima vuote perché non
 * esisteva un consumo lato dipendente).
 *
 * Nessuna migration: usa solo tabelle/funzioni esistenti in portalLearningApi.
 * - listPortalCourses(companyId)            → catalogo (filtro: pubblicato)
 * - listPortalCourseEnrollments(co, userId) → mie iscrizioni (progresso reale)
 * - savePortalCourseEnrollment(...)         → salva % + stato
 * - logPortalCourseActivity(...)            → traccia eventi
 * - createPortalMaterialSignedUrl(path)     → apre materiali su storage
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Eye,
  FileQuestion,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  PlayCircle,
  Search,
  ShieldAlert,
  UserCheck,
  CalendarClock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  createPortalMaterialSignedUrl,
  listPortalCourseEnrollments,
  listPortalCourses,
  logPortalCourseActivity,
  savePortalCourseEnrollment,
  type PortalArea,
  type PortalAssetType,
  type PortalLearningAsset,
  type PortalLearningCourse,
  type PortalLearningEnrollment,
} from "@/lib/portalLearningApi";

// ─── Helpers locali ──────────────────────────────────────────────────────────

const AREA_META: Record<PortalArea, { label: string; className: string }> = {
  sicurezza: { label: "Sicurezza", className: "border-red-200 bg-red-50 text-red-700" },
  procedure: { label: "Procedure", className: "border-amber-200 bg-amber-50 text-amber-700" },
  commerciale: { label: "Commerciale", className: "border-violet-200 bg-violet-50 text-violet-700" },
  onboarding: { label: "Onboarding", className: "border-blue-200 bg-blue-50 text-blue-700" },
  tecnica: { label: "Tecnica", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

/** In edilizia i corsi di sicurezza/procedure sono di fatto obbligatori
 *  (stessa convenzione di PortalePage → sezione "Percorsi obbligatori"). */
function isMandatoryArea(area: PortalArea): boolean {
  return area === "sicurezza" || area === "procedure";
}

const ASSET_TYPE_LABEL: Record<PortalAssetType, string> = {
  video: "Video",
  pdf: "PDF",
  procedura: "Procedura",
  quiz: "Quiz",
  link: "Link",
  testo: "Testo",
  immagine: "Immagine",
  documento: "Documento",
};

function AssetTypeIcon({ type, className }: { type: PortalAssetType; className?: string }) {
  switch (type) {
    case "video":
      return <PlayCircle className={className} />;
    case "quiz":
      return <FileQuestion className={className} />;
    case "link":
      return <Link2 className={className} />;
    case "immagine":
      return <ImageIcon className={className} />;
    case "pdf":
    case "documento":
    case "procedura":
    case "testo":
    default:
      return <FileText className={className} />;
  }
}

function lsKey(companyId: string, userId: string, courseId: string) {
  return `portale-formazione:${companyId}:${userId}:${courseId}`;
}

function loadCompletedModules(companyId: string | null, userId: string | null, courseId: string): string[] {
  if (!companyId || !userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(lsKey(companyId, userId, courseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveCompletedModules(companyId: string | null, userId: string | null, courseId: string, ids: string[]) {
  if (!companyId || !userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(companyId, userId, courseId), JSON.stringify(ids));
  } catch {
    /* quota / private mode: ignora, il DB resta la fonte di verità */
  }
}

/** Materiali "visti" del corso (per auto-completamento modulo). */
function loadViewed(companyId: string | null, userId: string | null, courseId: string): string[] {
  if (!companyId || !userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${lsKey(companyId, userId, courseId)}:viewed`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveViewed(companyId: string | null, userId: string | null, courseId: string, ids: string[]) {
  if (!companyId || !userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${lsKey(companyId, userId, courseId)}:viewed`, JSON.stringify(ids));
  } catch {
    /* ignora */
  }
}

function statusTone(progress: number, enrollment?: PortalLearningEnrollment): { label: string; className: string } {
  if (progress >= 100 || enrollment?.status === "completato") {
    return { label: "Completato", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (progress > 0 || enrollment?.status === "in_corso") {
    return { label: "In corso", className: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  return { label: "Da iniziare", className: "border-slate-200 bg-slate-50 text-slate-600" };
}

function ctaLabel(progress: number): string {
  if (progress >= 100) return "Rivedi";
  if (progress > 0) return "Riprendi";
  return "Inizia";
}

// ─── Pagina ──────────────────────────────────────────────────────────────────

export default function FormazioneDipendente() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // "Ora" calcolata una sola volta (evita Date.now() impuro in render — react-hooks/purity).
  const [nowTs] = useState(() => Date.now());

  const coursesQuery = useQuery({
    queryKey: ["formazione-courses", companyId],
    queryFn: () => listPortalCourses(companyId as string),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const enrollmentsQuery = useQuery({
    queryKey: ["formazione-enrollments", companyId, userId],
    queryFn: () => listPortalCourseEnrollments(companyId as string, userId as string),
    enabled: !!companyId && !!userId,
    staleTime: 30_000,
  });

  const published = useMemo(
    () => (coursesQuery.data ?? []).filter((c) => c.status === "pubblicato"),
    [coursesQuery.data],
  );

  const enrollmentByCourse = useMemo(() => {
    const map = new Map<string, PortalLearningEnrollment>();
    for (const e of enrollmentsQuery.data ?? []) map.set(e.courseId, e);
    return map;
  }, [enrollmentsQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return published;
    return published.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        AREA_META[c.area]?.label.toLowerCase().includes(q),
    );
  }, [published, search]);

  const stats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    for (const c of published) {
      const e = enrollmentByCourse.get(c.id);
      const p = e?.progressPercent ?? 0;
      if (p >= 100 || e?.status === "completato") completed += 1;
      else if (p > 0 || e?.status === "in_corso") inProgress += 1;
    }
    return { total: published.length, completed, inProgress };
  }, [published, enrollmentByCourse]);

  const selected = selectedId ? published.find((c) => c.id === selectedId) ?? null : null;

  const onProgressSaved = () => {
    void qc.invalidateQueries({ queryKey: ["formazione-enrollments", companyId, userId] });
  };

  if (selected) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <CoursePlayer
          key={selected.id}
          course={selected}
          companyId={companyId}
          userId={userId}
          enrollment={enrollmentByCourse.get(selected.id)}
          onBack={() => setSelectedId(null)}
          onSaved={onProgressSaved}
        />
      </div>
    );
  }

  const loading = coursesQuery.isLoading || (!!userId && enrollmentsQuery.isLoading);

  // "Assegnati a te": corsi che un admin ti ha assegnato (enrollment.assignedBy)
  // e non ancora completati → priorità massima, ordinati per scadenza.
  const assignedTodo = filtered
    .filter((c) => {
      const e = enrollmentByCourse.get(c.id);
      return !!e?.assignedBy && (e?.progressPercent ?? 0) < 100;
    })
    .sort((a, b) => {
      const ad = enrollmentByCourse.get(a.id)?.dueAt ?? null;
      const bd = enrollmentByCourse.get(b.id)?.dueAt ?? null;
      if (ad && bd) return ad.localeCompare(bd);
      if (ad) return -1;
      if (bd) return 1;
      return a.title.localeCompare(b.title);
    });
  const assignedIds = new Set(assignedTodo.map((c) => c.id));

  // Obbligatori incompleti (esclusi quelli già in "Assegnati a te"); il resto ordinato.
  const mandatoryTodo = filtered.filter(
    (c) =>
      !assignedIds.has(c.id) &&
      isMandatoryArea(c.area) &&
      (enrollmentByCourse.get(c.id)?.progressPercent ?? 0) < 100,
  );
  const mandatoryTodoIds = new Set(mandatoryTodo.map((c) => c.id));
  const rest = filtered
    .filter((c) => !assignedIds.has(c.id) && !mandatoryTodoIds.has(c.id))
    .sort((a, b) => {
      const aDone = (enrollmentByCourse.get(a.id)?.progressPercent ?? 0) >= 100 ? 1 : 0;
      const bDone = (enrollmentByCourse.get(b.id)?.progressPercent ?? 0) >= 100 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/60 to-orange-50/70 p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-950">La mia formazione</h1>
            <p className="mt-1 text-sm text-slate-600">
              Corsi, procedure e materiali assegnati. Il tuo avanzamento viene salvato automaticamente.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatCard icon={BookOpen} label="Corsi" value={stats.total} tone="blue" />
          <StatCard icon={Loader2} label="In corso" value={stats.inProgress} tone="amber" />
          <StatCard icon={CheckCircle2} label="Completati" value={stats.completed} tone="emerald" />
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca corso, procedura o area"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Caricamento corsi…
        </div>
      ) : coursesQuery.isError || enrollmentsQuery.isError ? (
        // Errore reale (rete/RLS): NON mostrare "nessun corso" — sarebbe una
        // bugia e, peggio, l'utente entrerebbe in un corso con enrollment a 0%
        // rischiando di sovrascrivere il proprio avanzamento reale.
        <div className="rounded-2xl border border-red-200 bg-red-50/50 py-16 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            Impossibile caricare i corsi
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            C'è stato un problema di connessione. Riprova tra un momento.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              void coursesQuery.refetch();
              void enrollmentsQuery.refetch();
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Riprova
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {published.length === 0 ? "Nessun corso pubblicato" : "Nessun corso trovato"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {published.length === 0
              ? "Quando l'azienda pubblica un corso lo troverai qui, con il tuo avanzamento."
              : "Prova a modificare la ricerca."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {assignedTodo.length > 0 && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-600" />
                <h2 className="font-bold text-slate-950">Assegnati a te</h2>
                <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
                  {assignedTodo.length}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {assignedTodo.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    enrollment={enrollmentByCourse.get(course.id)}
                    mandatory={isMandatoryArea(course.area)}
                    now={nowTs}
                    onOpen={() => setSelectedId(course.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {mandatoryTodo.length > 0 && (
            <section className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-600" />
                <h2 className="font-bold text-slate-950">Obbligatori da completare</h2>
                <Badge variant="outline" className="border-red-200 bg-white text-red-700">
                  {mandatoryTodo.length}
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {mandatoryTodo.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    enrollment={enrollmentByCourse.get(course.id)}
                    mandatory
                    now={nowTs}
                    onOpen={() => setSelectedId(course.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <div>
              {mandatoryTodo.length > 0 && <h2 className="mb-3 font-bold text-slate-950">Tutti i corsi</h2>}
              <div className="grid gap-4 md:grid-cols-2">
                {rest.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    enrollment={enrollmentByCourse.get(course.id)}
                    mandatory={isMandatoryArea(course.area)}
                    now={nowTs}
                    onOpen={() => setSelectedId(course.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sotto-componenti ─────────────────────────────────────────────────────────

function CourseCard({
  course,
  enrollment,
  mandatory,
  now,
  onOpen,
}: {
  course: PortalLearningCourse;
  enrollment?: PortalLearningEnrollment;
  mandatory?: boolean;
  now: number;
  onOpen: () => void;
}) {
  const progress = enrollment?.progressPercent ?? 0;
  const area = AREA_META[course.area];
  const st = statusTone(progress, enrollment);
  const lessons = course.modules.reduce((acc, m) => acc + (m.lessons || 0), 0);
  const assigned = !!enrollment?.assignedBy;
  const dueAt = enrollment?.dueAt ?? null;
  const overdue = !!dueAt && progress < 100 && new Date(dueAt).getTime() < now;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("w-fit", area?.className)}>
            {area?.label ?? course.area}
          </Badge>
          {mandatory && (
            <Badge variant="outline" className="w-fit border-red-200 bg-red-50 text-red-700">
              Obbligatorio
            </Badge>
          )}
          {assigned && (
            <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
              Assegnato a te
            </Badge>
          )}
        </div>
        <Badge variant="outline" className={cn("w-fit", st.className)}>
          {st.label}
        </Badge>
      </div>
      <h3 className="mt-3 line-clamp-2 font-bold text-slate-950">{course.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{course.description || "—"}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" /> {course.modules.length} moduli
        </span>
        {lessons > 0 && (
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> {lessons} lezioni
          </span>
        )}
        {dueAt && (
          <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-red-600")}>
            <CalendarClock className="h-3.5 w-3.5" />
            {overdue ? "Scaduto " : "Scadenza "}
            {new Date(dueAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        )}
      </div>
      <div className="mt-auto pt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>{progress}%</span>
          <span className="font-medium text-blue-700">{ctaLabel(progress)} →</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  tone: "blue" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-2xl font-bold leading-none text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function CoursePlayer({
  course,
  companyId,
  userId,
  enrollment,
  onBack,
  onSaved,
}: {
  course: PortalLearningCourse;
  companyId: string | null;
  userId: string | null;
  enrollment?: PortalLearningEnrollment;
  onBack: () => void;
  onSaved: () => void;
}) {
  const totalModules = course.modules.length;

  const [completed, setCompleted] = useState<string[]>(() => {
    const stored = loadCompletedModules(companyId, userId, course.id);
    if (stored.length === 0 && (enrollment?.progressPercent ?? 0) >= 100) {
      return course.modules.map((m) => m.id);
    }
    // scarta id non più esistenti (moduli rimossi dall'admin)
    return stored.filter((id) => course.modules.some((m) => m.id === id));
  });
  const [saving, setSaving] = useState(false);
  const [viewed, setViewed] = useState<string[]>(() => loadViewed(companyId, userId, course.id));
  const [viewer, setViewer] = useState<{
    asset: PortalLearningAsset;
    url: string | null;
    siblings: PortalLearningAsset[];
    index: number;
  } | null>(null);

  const progress =
    totalModules === 0
      ? completed.length > 0 || (enrollment?.progressPercent ?? 0) >= 100
        ? 100
        : 0
      : Math.round((completed.length / totalModules) * 100);

  const area = AREA_META[course.area];
  const courseAssets = course.assets.filter((a) => !a.moduleId);

  const persist = async (ids: string[]) => {
    saveCompletedModules(companyId, userId, course.id, ids);
    if (!companyId || !userId) return;
    const pct = totalModules === 0 ? (ids.length > 0 ? 100 : 0) : Math.round((ids.length / totalModules) * 100);
    setSaving(true);
    try {
      await savePortalCourseEnrollment(companyId, userId, course.id, pct);
      await logPortalCourseActivity(companyId, course.id, pct >= 100 ? "course_completed" : "module_progress", {
        progress: pct,
        modules: ids.length,
      });
      onSaved();
    } catch {
      toast.error("Avanzamento non salvato. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (id: string) => {
    const next = completed.includes(id) ? completed.filter((x) => x !== id) : [...completed, id];
    setCompleted(next);
    void persist(next);
  };

  const completeCourse = () => {
    const ids = totalModules === 0 ? ["__corso__"] : course.modules.map((m) => m.id);
    setCompleted(ids);
    void persist(ids);
    toast.success("Corso segnato come completato.");
  };

  // Segna un materiale come "visto"; se tutti i materiali del modulo sono visti → modulo completato.
  const markViewed = (asset: PortalLearningAsset) => {
    if (viewed.includes(asset.id)) return;
    const nextViewed = [...viewed, asset.id];
    setViewed(nextViewed);
    saveViewed(companyId, userId, course.id, nextViewed);
    const mod = course.modules.find((m) => m.id === asset.moduleId);
    if (mod) {
      const modAssets = course.assets.filter((a) => a.moduleId === mod.id);
      const allViewed = modAssets.length > 0 && modAssets.every((a) => nextViewed.includes(a.id));
      if (allViewed && !completed.includes(mod.id)) {
        const nextCompleted = [...completed, mod.id];
        setCompleted(nextCompleted);
        void persist(nextCompleted);
        toast.success(`Modulo «${mod.title}» completato.`);
      }
    }
  };

  const openAsset = async (asset: PortalLearningAsset, siblings: PortalLearningAsset[] = [asset]) => {
    const index = Math.max(0, siblings.findIndex((a) => a.id === asset.id));
    // Testo/procedura: nessun file, mostra il contenuto direttamente nel visore.
    if (asset.type === "testo") {
      markViewed(asset);
      setViewer({ asset, url: null, siblings, index });
      if (companyId) {
        void logPortalCourseActivity(companyId, course.id, "asset_open", { assetId: asset.id, title: asset.title });
      }
      return;
    }
    const raw = asset.downloadUrl || asset.source || "";
    if (!raw || raw.startsWith("locale/")) {
      toast.error("Materiale non ancora disponibile.");
      return;
    }
    let url: string | null = raw;
    if (!raw.startsWith("http")) {
      try {
        url = await createPortalMaterialSignedUrl(raw);
      } catch {
        url = null;
      }
    }
    if (!url) {
      toast.error("Impossibile aprire il materiale.");
      return;
    }
    // Apertura IN-PLACE (video/PDF/immagine embeddati nel visore), niente nuova scheda.
    markViewed(asset);
    setViewer({ asset, url, siblings, index });
    if (companyId) {
      void logPortalCourseActivity(companyId, course.id, "asset_open", { assetId: asset.id, title: asset.title });
    }
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Tutti i corsi
      </button>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("w-fit", area?.className)}>
            {area?.label ?? course.area}
          </Badge>
          {progress >= 100 && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Completato
            </Badge>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">{course.title}</h1>
        {course.description && <p className="mt-1 text-sm text-slate-600">{course.description}</p>}

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              {totalModules === 0
                ? progress >= 100
                  ? "Completato"
                  : "Da completare"
                : `${completed.length}/${totalModules} moduli completati`}
            </span>
            <span className="flex items-center gap-2 text-slate-500">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="h-2.5" />
        </div>
      </header>

      {totalModules === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Materiali del corso</h2>
          {courseAssets.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Questo corso non ha ancora materiali strutturati.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {courseAssets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  viewed={viewed.includes(asset.id)}
                  onOpen={() => openAsset(asset, courseAssets)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-4">
          {course.modules.map((module, idx) => {
            const done = completed.includes(module.id);
            const moduleAssets = course.assets.filter((a) => a.moduleId === module.id);
            const moduleViewed = moduleAssets.filter((a) => viewed.includes(a.id)).length;
            return (
              <section
                key={module.id}
                className={cn(
                  "rounded-2xl border bg-white p-5 shadow-sm transition",
                  done ? "border-emerald-200" : "border-slate-200",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modulo {idx + 1}</p>
                    <h3 className="mt-0.5 font-bold text-slate-950">{module.title}</h3>
                    {module.description && <p className="mt-1 text-sm text-slate-500">{module.description}</p>}
                    {(module.lessons > 0 || module.duration || moduleAssets.length > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        {module.lessons > 0 && <span>{module.lessons} lezioni</span>}
                        {module.duration && <span>{module.duration}</span>}
                        {moduleAssets.length > 0 && (
                          <span
                            className={
                              moduleViewed === moduleAssets.length
                                ? "font-medium text-emerald-600"
                                : undefined
                            }
                          >
                            {moduleViewed}/{moduleAssets.length} materiali visti
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={done ? "outline" : "default"}
                    size="sm"
                    onClick={() => toggleModule(module.id)}
                    className={cn("shrink-0 gap-2", done && "border-emerald-200 text-emerald-700")}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    {done ? "Completato" : "Segna fatto"}
                  </Button>
                </div>

                {moduleAssets.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {moduleAssets.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        viewed={viewed.includes(asset.id)}
                        onOpen={() => openAsset(asset, moduleAssets)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {progress >= 100 ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Corso completato — ottimo lavoro!
          </span>
        ) : (
          <Button type="button" onClick={completeCourse} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Segna corso come completato
          </Button>
        )}
      </div>

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-4xl">
          {viewer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <AssetTypeIcon type={viewer.asset.type} className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="truncate">{viewer.asset.title}</span>
                </DialogTitle>
              </DialogHeader>
              <MaterialViewer asset={viewer.asset} url={viewer.url} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {viewer.siblings.length > 1 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={viewer.index <= 0}
                        onClick={() => {
                          const prev = viewer.siblings[viewer.index - 1];
                          if (prev) void openAsset(prev, viewer.siblings);
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" /> Precedente
                      </Button>
                      <span className="px-1 text-xs text-slate-500">
                        {viewer.index + 1} / {viewer.siblings.length}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={viewer.index >= viewer.siblings.length - 1}
                        onClick={() => {
                          const next = viewer.siblings[viewer.index + 1];
                          if (next) void openAsset(next, viewer.siblings);
                        }}
                      >
                        Successivo <ArrowRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
                {viewer.url && (
                  <div className="flex flex-wrap gap-2">
                    {viewer.asset.downloadable && (
                      <a href={viewer.url} download target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-2">
                          <Download className="h-4 w-4" /> Scarica
                        </Button>
                      </a>
                    )}
                    <a href={viewer.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        <ExternalLink className="h-4 w-4" /> Apri
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Visore materiali IN-PLACE (video / PDF / immagine / testo) ──────────────
function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

// iOS (Safari/WKWebView) renderizza i PDF in iframe mostrando SOLO la prima pagina,
// senza scroll (limite WebKit) → su iPhone/iPad i materiali multi-pagina vanno aperti
// esternamente. Guard typeof per il prerender Node; Macintosh+maxTouchPoints = iPadOS 13+.
const IS_IOS =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1));

function MaterialViewer({ asset, url }: { asset: PortalLearningAsset; url: string | null }) {
  if (asset.type === "testo") {
    return (
      <div className="max-h-[55dvh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700 sm:max-h-[70dvh]">
        {asset.content || "Nessun contenuto."}
      </div>
    );
  }
  if (!url) return <p className="py-8 text-center text-sm text-slate-500">Materiale non disponibile.</p>;

  if (asset.type === "immagine") {
    return <img src={url} alt={asset.title} className="mx-auto max-h-[72vh] rounded-lg object-contain" />;
  }

  if (asset.type === "video") {
    const yt = youTubeId(url);
    const vm = vimeoId(url);
    if (yt) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${yt}`}
            title={asset.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    if (vm) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            className="h-full w-full"
            src={`https://player.vimeo.com/video/${vm}`}
            title={asset.title}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    return <video src={url} controls playsInline className="max-h-[60dvh] w-full rounded-lg bg-black sm:max-h-[72dvh]" />;
  }

  if (asset.type === "pdf" || asset.type === "documento" || asset.type === "procedura") {
    if (IS_IOS) {
      return (
        <div className="rounded-lg bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-600">Su iPhone e iPad il documento si apre a schermo intero.</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
            <Button className="gap-2">
              <ExternalLink className="h-4 w-4" /> Apri il documento
            </Button>
          </a>
        </div>
      );
    }
    return <iframe src={url} title={asset.title} className="h-[60dvh] w-full rounded-lg border border-slate-200 sm:h-[72dvh]" />;
  }

  // link / quiz / altro non embeddabile → apri esterno
  return (
    <div className="rounded-lg bg-slate-50 p-8 text-center">
      <p className="text-sm text-slate-600">Questo materiale si apre in una nuova scheda.</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
        <Button className="gap-2">
          <ExternalLink className="h-4 w-4" /> Apri il materiale
        </Button>
      </a>
    </div>
  );
}

function AssetRow({
  asset,
  viewed,
  onOpen,
}: {
  asset: PortalLearningAsset;
  viewed?: boolean;
  onOpen: () => void;
}) {
  const hasContent = asset.type === "testo" && !!asset.content;
  const hasFile = !!(asset.downloadUrl || asset.source) && !(asset.source ?? "").startsWith("locale/");
  const canOpen = hasFile || hasContent;
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={canOpen ? onOpen : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
        viewed ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/60",
        canOpen ? "hover:border-blue-300 hover:bg-blue-50/50" : "cursor-default opacity-80",
      )}
    >
      {viewed ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AssetTypeIcon type={asset.type} className="h-4 w-4 shrink-0 text-blue-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{asset.title}</p>
        <p className="text-xs text-slate-500">
          {ASSET_TYPE_LABEL[asset.type]}
          {asset.duration ? ` · ${asset.duration}` : ""}
          {viewed ? " · visto" : ""}
        </p>
      </div>
      {canOpen && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-blue-700">
          {asset.type === "video" ? <PlayCircle className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {viewed ? "Rivedi" : asset.type === "video" ? "Guarda" : "Apri"}
        </span>
      )}
    </button>
  );
}
