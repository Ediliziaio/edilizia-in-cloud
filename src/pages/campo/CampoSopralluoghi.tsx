import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ClipboardList,
  ChevronRight,
  RefreshCw,
  Search,
  Camera,
  LockKeyhole,
  Ruler,
} from "lucide-react";
import {
  useFieldSurveyAccess,
  useFieldSurveys,
  type FieldSurveyListRow,
} from "@/hooks/useFieldSurveys";
import { Button } from "@/components/ui/button";
import { dateSurvey, SURVEY_STATUS } from "@/lib/surveys/report";
import { Input } from "@/components/ui/input";
import {
  filterFieldSurveys,
  fieldSurveyGroup,
  type FieldSurveyFilter,
} from "@/lib/surveys/fieldList";
export default function CampoSopralluoghi() {
  const access = useFieldSurveyAccess();
  const list = useFieldSurveys(access.data?.can_view === true);
  if (access.isPending || (access.data?.can_view && list.isPending))
    return (
      <p role="status" className="p-4">
        Carico i tuoi sopralluoghi…
      </p>
    );
  if (access.isError || list.isError)
    return (
      <div role="alert" className="rounded-2xl border p-5">
        <p>
          Non riesco a caricare i sopralluoghi. Nessun dato viene considerato
          salvato offline.
        </p>
        <Button
          onClick={() => {
            void access.refetch();
            void list.refetch();
          }}
          className="mt-3"
        >
          Riprova
        </Button>
      </div>
    );
  return (
    <FieldSurveyCards
      surveys={access.data?.can_view ? (list.data ?? []) : []}
      onRefresh={() => {
        void access.refetch();
        void list.refetch();
      }}
    />
  );
}

/** Read-only presentation, also used by the local responsive preview. */
export function FieldSurveyCards({
  surveys,
  onRefresh,
}: {
  surveys: FieldSurveyListRow[];
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<FieldSurveyFilter>("all"),
    [search, setSearch] = useState("");
  const visible = filterFieldSurveys(surveys, filter, search);
  const choices: Array<[FieldSurveyFilter, string]> = [
    ["all", "Tutti"],
    ["todo", "Da fare"],
    ["office", "In ufficio"],
    ["done", "Conclusi"],
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">I miei sopralluoghi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Misure, foto e consegna all’ufficio. Solo i tuoi incarichi
            autorizzati.
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          aria-label="Aggiorna sopralluoghi"
          onClick={() => {
            onRefresh();
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>
      {!!surveys.length && (
        <>
          <div
            role="group"
            aria-label="Stato sopralluoghi"
            className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1"
          >
            {choices.map(([key, label]) => (
              <Button
                key={key}
                variant="ghost"
                aria-pressed={filter === key}
                className={`min-h-11 rounded-xl px-1 text-xs sm:text-sm ${filter === key ? "bg-white text-slate-900 shadow-sm hover:bg-white" : "text-slate-500"}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                aria-label="Cerca nei tuoi sopralluoghi"
                placeholder="Cerca luogo o codice…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 rounded-xl bg-white pl-9"
              />
            </div>
            {(search || filter !== "all") && (
              <Button
                variant="ghost"
                className="min-h-11 rounded-xl px-2 text-xs"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Azzera
              </Button>
            )}
          </div>
        </>
      )}
      {!surveys.length ? (
        <section className="rounded-2xl border bg-white p-6 text-center">
          <ClipboardList className="mx-auto mb-3 h-7 w-7 text-slate-400" />
          <h2 className="font-medium">Nessun sopralluogo disponibile</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            L’ufficio deve assegnarti il rilievo e autorizzare l’accesso
            dall’app operai.
          </p>
        </section>
      ) : !visible.length ? (
        <section
          className="rounded-2xl border bg-white p-6 text-center"
          aria-live="polite"
        >
          <h2 className="font-medium">Nessun sopralluogo con questi filtri</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cambia stato o azzera la ricerca per ritrovare gli altri incarichi.
          </p>
        </section>
      ) : (
        visible.map((s) => (
          <Link
            key={s.id}
            to={`/campo/sopralluoghi/${s.id}`}
            className="group flex min-h-24 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-colors duration-150 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:bg-slate-50 motion-reduce:transition-none"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-slate-500">
                  {s.code || "Sopralluogo"}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${fieldSurveyGroup(s.status) === "todo" ? "bg-blue-50 text-blue-800" : fieldSurveyGroup(s.status) === "office" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}
                >
                  {s.status === "in_progress" && s.field_review_note
                    ? "Da integrare"
                    : SURVEY_STATUS[s.status] || s.status}
                </span>
              </div>
              <h2 className="mt-3 break-words font-semibold leading-snug">
                {[s.address, s.city].filter(Boolean).join(", ") ||
                  "Luogo da completare"}
              </h2>
              {s.template?.name && (
                <p className="mt-1 text-xs text-slate-500">{s.template.name}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {s.scheduled_at
                  ? dateSurvey(s.scheduled_at, true)
                  : "Data da concordare"}
              </p>
              {s.field_review_note && (
                <p className="mt-3 line-clamp-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  Ufficio: {s.field_review_note}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {s.elements?.[0] && (
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="h-3.5 w-3.5" />
                    {s.elements[0].count} elementi
                  </span>
                )}
                {s.media?.[0] && (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5" />
                    {s.media[0].count} allegati
                  </span>
                )}
                {fieldSurveyGroup(s.status) !== "todo" ? (
                  <span className="ml-auto inline-flex items-center gap-1">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Consulta
                  </span>
                ) : (
                  <span className="ml-auto font-medium text-blue-700">
                    Apri rilievo
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </Link>
        ))
      )}
    </div>
  );
}
