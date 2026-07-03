import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, Loader2, Save, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

type AnswerValue = "A" | "B" | "C" | "D";

type PublicQuestion = {
  question_id: number;
  question_text: string;
  trait_code: string;
  polarity: "+" | "-" | "S" | "C";
  theme_block: number;
  display_order: number;
  custom_answers: { a?: string; b?: string; c?: string } | null;
};

type PublicSession = {
  valid: boolean;
  reason?: string;
  candidate?: {
    id: string;
    nome: string;
    cognome: string;
    ruolo_richiesto: string;
    status: string;
    completed_at: string | null;
  };
  company?: { name?: string | null };
  privacy_accepted?: boolean;
  expires_at?: string | null;
  questions?: PublicQuestion[];
  answers?: Record<string, AnswerValue>;
};

type TalentRpcError = { message?: string } | null;
type TalentRpcResponse<T = unknown> = { data: T | null; error: TalentRpcError };
type PublicSaveResponse = {
  valid?: boolean;
  reason?: string;
  privacy_accepted?: boolean;
  completed_at?: string | null;
};

const talentRpc = supabase as unknown as {
  rpc: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<TalentRpcResponse<T>>;
};

const answerOptions = [
  { value: "A" as const, label: "Vero / Sì" },
  { value: "B" as const, label: "A volte / Incerto" },
  { value: "C" as const, label: "Falso / No" },
];

// Valori realmente selezionabili dalla UI. Il CHECK del DB ammette anche "D"
// (versioni storiche), ma il questionario V5 è a 3 opzioni: qualunque valore
// fuori da questo set viene trattato come "non risposto" (l'utente lo re-inserisce)
// invece di restare invisibile ma conteggiato.
const SELECTABLE_ANSWER_VALUES = new Set<AnswerValue>(answerOptions.map((o) => o.value));

function reasonLabel(reason?: string) {
  if (reason === "expired") return "Questo link è scaduto. Chiedi all'azienda un nuovo invito.";
  if (reason === "token_missing") return "Link incompleto.";
  if (reason === "privacy_required") return "Prima devi accettare l'informativa privacy.";
  if (reason === "incomplete") return "Rispondi a tutte le domande prima di completare il test.";
  return "Link non valido o non più disponibile.";
}

export default function TalentProfilePublic() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  // Gate "test avviato": disaccoppiato dalla spunta privacy. Senza, la sola
  // checkbox faceva saltare il gate avviando il test (pulsante "Inizia"
  // irraggiungibile + consenso esplicito non salvato sull'avvio).
  const [started, setStarted] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [completed, setCompleted] = useState(false);
  const loadedRef = useRef(false);

  const PAGE_SIZE = 10;
  const questions = useMemo(() => session?.questions || [], [session?.questions]);
  // Set degli ID domanda realmente presenti nella sessione corrente. Serve a
  // NON inviare mai al DB risposte "orfane" (domande disattivate o di un'altra
  // versione), che farebbero fallire l'intero salvataggio con un errore SQL.
  const validQuestionIds = useMemo(() => new Set(questions.map((q) => q.question_id)), [questions]);
  const pages = useMemo(() => {
    const result: typeof questions[] = [];
    for (let i = 0; i < questions.length; i += PAGE_SIZE) {
      result.push(questions.slice(i, i + PAGE_SIZE));
    }
    return result;
  }, [questions]);
  const totalPages = pages.length;
  const currentPage = pages[pageIndex] || [];
  const currentPageStartNum = pageIndex * PAGE_SIZE + 1;
  const currentPageEndNum = Math.min(questions.length, (pageIndex + 1) * PAGE_SIZE);
  const isLastPage = totalPages > 0 && pageIndex >= totalPages - 1;
  // Conta solo le risposte relative a domande della sessione corrente: risposte
  // orfane non gonfiano il contatore (che divergerebbe dal DB al completamento).
  const answeredCount = useMemo(
    () => questions.reduce((n, q) => (answers[q.question_id] ? n + 1 : n), 0),
    [answers, questions],
  );
  const missingAnswersCount = Math.max(0, questions.length - answeredCount);
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const currentPageAnsweredCount = currentPage.filter((q) => answers[q.question_id]).length;

  const loadSession = useCallback(async () => {
    if (!token) {
      setSession({ valid: false, reason: "token_missing" });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await talentRpc.rpc<PublicSession>("hr_talent_public_session", { p_token: token });
      if (error) throw error;

      const nextSession = (data || { valid: false }) as PublicSession;
      setSession(nextSession);

      if (nextSession.valid) {
        const sessionQuestionIds = new Set((nextSession.questions || []).map((q) => q.question_id));
        const nextAnswers = Object.entries(nextSession.answers || {}).reduce<Record<number, AnswerValue>>(
          (acc, [questionId, value]) => {
            // Tieni solo risposte di domande esistenti e con un valore selezionabile:
            // così i contatori e il payload di salvataggio restano coerenti col DB.
            if (sessionQuestionIds.has(Number(questionId)) && SELECTABLE_ANSWER_VALUES.has(value)) {
              acc[Number(questionId)] = value;
            }
            return acc;
          },
          {},
        );
        setAnswers(nextAnswers);
        setPrivacyAccepted(Boolean(nextSession.privacy_accepted));
        // Ripresa: se il candidato ha già accettato la privacy, salta la
        // schermata iniziale e torna direttamente alle domande.
        setStarted(Boolean(nextSession.privacy_accepted));
        setCompleted(nextSession.candidate?.status === "completed");
        const allQuestions = nextSession.questions || [];
        const firstUnansweredIndex = allQuestions.findIndex((q) => !nextAnswers[q.question_id]);
        if (firstUnansweredIndex >= 0) {
          setPageIndex(Math.floor(firstUnansweredIndex / PAGE_SIZE));
        }
      }

      loadedRef.current = true;
    } catch (error) {
      setSession({ valid: false, reason: error instanceof Error ? error.message : "error" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const persistAnswers = useCallback(
    async ({
      complete = false,
      acceptPrivacy = privacyAccepted,
      silent = false,
    }: {
      complete?: boolean;
      acceptPrivacy?: boolean;
      silent?: boolean;
    } = {}) => {
      if (!token) throw new Error("Token mancante");
      if (complete && !acceptPrivacy) throw new Error(reasonLabel("privacy_required"));
      if (complete && answeredCount < questions.length) throw new Error(reasonLabel("incomplete"));

      setSaving(true);
      try {
        const payload = Object.entries(answers)
          // Non inviare risposte orfane o con valore non ammesso: eviterebbero il
          // RAISE lato RPC che altrimenti bloccherebbe ogni salvataggio successivo.
          .filter(([questionId, answerValue]) =>
            validQuestionIds.has(Number(questionId)) && SELECTABLE_ANSWER_VALUES.has(answerValue),
          )
          .map(([questionId, answerValue]) => ({
            question_id: Number(questionId),
            answer_value: answerValue,
          }));

        const { data, error } = await talentRpc.rpc<PublicSaveResponse>("hr_talent_public_save_answers", {
          p_token: token,
          p_answers: payload,
          p_privacy_accepted: acceptPrivacy,
          p_completed: complete,
        });
        if (error) throw error;
        if (data?.valid === false) throw new Error(reasonLabel(data.reason));

        setDirty(false);
        setPrivacyAccepted(Boolean(data?.privacy_accepted ?? acceptPrivacy));
        if (complete) {
          setCompleted(true);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  candidate: prev.candidate
                    ? { ...prev.candidate, status: "completed", completed_at: data?.completed_at || new Date().toISOString() }
                    : prev.candidate,
                }
              : prev,
          );
        }
        if (!silent) toast.success(complete ? "Test completato" : "Risposte salvate");
        return data ?? undefined;
      } finally {
        setSaving(false);
      }
    },
    [answeredCount, answers, privacyAccepted, questions.length, token, validQuestionIds],
  );

  useEffect(() => {
    // `saving` nella guardia: mai lanciare l'autosave mentre un altro salvataggio
    // è in volo (evita chiamate concorrenti e indicatori "salvato" prematuri).
    if (!loadedRef.current || !dirty || completed || !started || saving) return;
    const timeout = window.setTimeout(() => {
      persistAnswers({ silent: true }).catch(() => {
        // Il salvataggio manuale resta disponibile e mostrera l'errore.
      });
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [completed, dirty, persistAnswers, started, saving]);

  // Cambio pagina "best-effort": tenta il salvataggio ma NON blocca la navigazione
  // se fallisce (le risposte restano in stato e verranno risalvate). Prima un save
  // in errore imprigionava l'utente sulla pagina, senza avanti né indietro.
  const changePage = useCallback(
    async (delta: number) => {
      if (dirty) {
        try {
          await persistAnswers({ silent: true });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito, riprovo tra poco");
        }
      }
      setPageIndex((p) => Math.min(totalPages - 1, Math.max(0, p + delta)));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [dirty, persistAnswers, totalPages],
  );
  const goNextPage = useCallback(() => changePage(1), [changePage]);
  const goPrevPage = useCallback(() => changePage(-1), [changePage]);

  useEffect(() => {
    if (!started || completed) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" && pageIndex < totalPages - 1) {
        e.preventDefault();
        void goNextPage();
      } else if (e.key === "ArrowLeft" && pageIndex > 0) {
        e.preventDefault();
        void goPrevPage();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [started, completed, pageIndex, totalPages, goNextPage, goPrevPage]);

  const acceptPrivacyAndStart = async () => {
    // Persisti PRIMA il consenso; avvia il test solo se il backend conferma
    // (persistAnswers aggiorna privacyAccepted dalla risposta). Così un errore
    // di rete non lascia l'utente "avviato" senza consenso salvato, e il
    // pulsante resta in stato di caricamento finché non completa.
    try {
      const result = await persistAnswers({ acceptPrivacy: true, silent: false });
      // Avvia solo se il backend conferma il consenso: evita di entrare nel test
      // con privacy non registrata (che poi bloccherebbe il completamento).
      if (result?.privacy_accepted === false) {
        toast.error("Non è stato possibile registrare il consenso. Riprova.");
        return;
      }
      setStarted(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Non sono riuscito ad avviare il test");
    }
  };

  const handleComplete = async () => {
    try {
      await persistAnswers({ complete: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore";
      toast.error(message);
      // Se il backend segnala risposte mancanti (divergenza col conteggio locale),
      // porta l'utente direttamente alla prima domanda senza risposta.
      if (message === reasonLabel("incomplete")) {
        const firstMissingIdx = questions.findIndex((q) => !answers[q.question_id]);
        if (firstMissingIdx >= 0) {
          setPageIndex(Math.floor(firstMissingIdx / PAGE_SIZE));
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-orange-300" />
          <span className="text-sm font-medium">Caricamento Talent Assessment...</span>
        </div>
      </div>
    );
  }

  if (!session?.valid) {
    // Distingue gli errori permanenti (link scaduto/non valido) da quelli
    // potenzialmente transitori (rete/RPC): in entrambi i casi offriamo "Riprova"
    // così un errore di caricamento momentaneo non diventa un vicolo cieco.
    const permanentReasons = new Set(["expired", "token_missing", "token_invalid", "privacy_required"]);
    const isPermanent = permanentReasons.has(session?.reason || "");
    return (
      <PublicShell>
        <Card className="mx-auto max-w-lg border-red-200">
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="text-xl font-bold text-slate-950">Questionario non disponibile</h1>
            <p className="text-sm text-slate-600">{reasonLabel(session?.reason)}</p>
            {!isPermanent && (
              <Button
                variant="outline"
                onClick={() => loadSession()}
                disabled={loading}
                className="mx-auto"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Riprova
              </Button>
            )}
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // Sessione valida ma nessuna domanda attiva: stato dedicato invece di mostrare
  // un test vuoto "Schermata 1 di 0" che si potrebbe pure "completare" a vuoto.
  if (questions.length === 0) {
    return (
      <PublicShell companyName={session.company?.name || undefined}>
        <Card className="mx-auto max-w-lg border-amber-200">
          <CardContent className="space-y-3 p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-950">Assessment in preparazione</h1>
            <p className="text-sm text-slate-600">
              Il questionario non è ancora disponibile. Riprova più tardi o contatta l'azienda che ti ha invitato.
            </p>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  if (completed) {
    return (
      <PublicShell companyName={session.company?.name || undefined}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto max-w-xl"
        >
          <Card className="overflow-hidden border-emerald-200 shadow-xl">
            <div className="h-2 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600" />
            <CardContent className="space-y-5 p-10 text-center">
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50"
              >
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </motion.div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950">Test completato</h1>
                <p className="mt-3 text-base text-slate-600">
                  Grazie {session.candidate?.nome}. Le tue risposte sono state inviate al team HR.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Riceverai aggiornamenti sul processo di selezione direttamente dall'azienda.
                </p>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-xs text-slate-500"
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                Powered by EdiliziaInCloud Talent Assessment
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </PublicShell>
    );
  }

  if (!started) {
    return (
      <PublicShell companyName={session.company?.name || undefined}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-2xl"
        >
          <Card className="overflow-hidden border-0 shadow-2xl">
            <div className="h-2 bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500" />
            <CardContent className="space-y-6 p-10">
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 180 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200"
                >
                  <BrainCircuit className="h-8 w-8" />
                </motion.div>
                <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">Ciao {session.candidate?.nome}</h1>
                <p className="mt-2 text-base text-slate-600">
                  Stai per iniziare il <span className="font-semibold text-orange-700">Talent Assessment</span> per il ruolo di {session.candidate?.ruolo_richiesto}.
                </p>
              </div>

              <div className="space-y-3 rounded-2xl bg-slate-50 p-5">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Circa 25-35 minuti</p>
                    <p className="text-xs text-slate-600">{questions.length} domande in {totalPages} schermate, circa {PAGE_SIZE} per schermata.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Save className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Salvataggio automatico</p>
                    <p className="text-xs text-slate-600">Puoi chiudere e riprendere dallo stesso punto in qualsiasi momento.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Risposte riservate</p>
                    <p className="text-xs text-slate-600">Vengono lette solo dal team HR autorizzato. Mai condivise con terzi.</p>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 p-4 transition hover:border-orange-300 hover:bg-orange-50/40">
                <Checkbox
                  checked={privacyAccepted}
                  onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
                />
                <span className="text-sm leading-relaxed text-slate-700">
                  Confermo di aver letto l'informativa privacy e acconsento al trattamento dei dati per il processo di selezione.
                </span>
              </label>

              <Button
                size="lg"
                className="h-12 w-full bg-gradient-to-r from-orange-600 to-amber-500 text-base font-semibold hover:from-orange-700 hover:to-amber-600"
                disabled={!privacyAccepted || saving}
                onClick={acceptPrivacyAndStart}
              >
                {saving ? "Salvataggio..." : "Inizia il test →"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </PublicShell>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40">
      {/* Top progress bar */}
      <div className="fixed inset-x-0 top-0 z-20 h-1 bg-slate-100">
        <motion.div
          className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Compact header */}
      <header className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">Talent Assessment</p>
              <p className="text-xs text-slate-500">EdiliziaInCloud · {session.candidate?.ruolo_richiesto}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              {dirty ? (
                <motion.div key="dirty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hidden items-center gap-1.5 text-xs text-amber-600 sm:flex">
                  <Save className="h-3 w-3 animate-pulse" />
                  <span>salvataggio...</span>
                </motion.div>
              ) : (
                <motion.div key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hidden items-center gap-1.5 text-xs text-emerald-600 sm:flex">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>salvato</span>
                </motion.div>
              )}
            </AnimatePresence>
            <Badge variant="outline" className="border-slate-200 bg-white tabular-nums">
              {answeredCount}/{questions.length}
            </Badge>
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
            Domande {currentPageStartNum} – {currentPageEndNum} di {questions.length}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Schermata {pageIndex + 1} di {totalPages}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Scegli la risposta più naturale per ognuna. Non c'è una risposta giusta o sbagliata.
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={pageIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="space-y-5"
          >
            {currentPage.map((question, qIdx) => (
              <motion.div
                key={question.question_id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: qIdx * 0.04, duration: 0.3 }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-orange-200 hover:shadow-md"
              >
                <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs font-bold tabular-nums text-orange-600">
                      {currentPageStartNum + qIdx}.
                    </span>
                    <p className="text-base font-semibold leading-snug text-slate-950 sm:text-lg">
                      {question.question_text}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-3">
                  {answerOptions.map((option) => {
                    const label = question.custom_answers?.[option.value.toLowerCase() as "a" | "b" | "c"] || option.label;
                    const active = answers[question.question_id] === option.value;
                    return (
                      <motion.button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${question.question_text} — ${label}`}
                        whileTap={{ scale: 0.96 }}
                        whileHover={{ y: -2 }}
                        onClick={() => {
                          if (answers[question.question_id] === option.value) return;
                          setAnswers((prev) => ({ ...prev, [question.question_id]: option.value }));
                          setDirty(true);
                        }}
                        className={`group flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                          active
                            ? "border-orange-500 bg-orange-50 shadow-sm shadow-orange-100"
                            : "border-slate-200 bg-white hover:border-orange-200"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition ${
                            active
                              ? "bg-orange-600 text-white"
                              : "bg-slate-100 text-slate-500 group-hover:bg-orange-100 group-hover:text-orange-700"
                          }`}
                        >
                          {option.value}
                        </span>
                        <span className={`text-sm font-medium ${active ? "text-orange-900" : "text-slate-700"}`}>
                          {label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Bottom navigation */}
        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="tabular-nums">{currentPageAnsweredCount}/{currentPage.length} risposte in questa schermata</span>
          </div>
          <div className="flex w-full max-w-md items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              disabled={pageIndex <= 0 || saving}
              onClick={goPrevPage}
              className="flex-1"
            >
              ← Indietro
            </Button>
            {!isLastPage ? (
              <Button
                size="lg"
                disabled={saving}
                onClick={goNextPage}
                className="flex-[2] bg-gradient-to-r from-orange-600 to-amber-500 font-semibold hover:from-orange-700 hover:to-amber-600"
              >
                Avanti →
              </Button>
            ) : missingAnswersCount > 0 ? (
              <Button
                size="lg"
                disabled={saving}
                onClick={() => {
                  const firstMissingIdx = questions.findIndex((q) => !answers[q.question_id]);
                  if (firstMissingIdx >= 0) {
                    setPageIndex(Math.floor(firstMissingIdx / PAGE_SIZE));
                    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="flex-[2] bg-gradient-to-r from-amber-500 to-orange-500 font-semibold hover:from-amber-600 hover:to-orange-600"
              >
                Vai alle {missingAnswersCount} risposte mancanti →
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={saving}
                onClick={handleComplete}
                className="flex-[2] bg-gradient-to-r from-emerald-600 to-emerald-500 font-semibold hover:from-emerald-700 hover:to-emerald-600"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                ✓ Completa test
              </Button>
            )}
          </div>
          <p className="text-center text-[11px] text-slate-400">
            Le tue risposte vengono salvate automaticamente. Puoi chiudere e riprendere in qualsiasi momento.
          </p>
          <p className="hidden text-center text-[10px] text-slate-400 sm:block">
            Suggerimento: usa i tasti <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px]">←</kbd> <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px]">→</kbd> per navigare tra le schermate
          </p>
        </div>
      </div>
    </main>
  );
}

function PublicShell({ children, companyName }: { children: ReactNode; companyName?: string }) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_35%)]" />
      <div className="relative z-10">
        <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Edilizia in Cloud</p>
              <p className="text-xs text-white/60">{companyName || "Selezione personale"}</p>
            </div>
          </div>
          <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">Area candidato</Badge>
        </header>
        {children}
      </div>
    </main>
  );
}
