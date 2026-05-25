import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  { value: "A" as const, label: "Vero / Si" },
  { value: "B" as const, label: "A volte / Incerto" },
  { value: "C" as const, label: "Falso / No" },
];

function reasonLabel(reason?: string) {
  if (reason === "expired") return "Questo link e scaduto. Chiedi all'azienda un nuovo invito.";
  if (reason === "token_missing") return "Link incompleto.";
  if (reason === "privacy_required") return "Prima devi accettare l'informativa privacy.";
  if (reason === "incomplete") return "Rispondi a tutte le domande prima di completare il test.";
  return "Link non valido o non piu disponibile.";
}

export default function TalentProfilePublic() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [block, setBlock] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [completed, setCompleted] = useState(false);
  const loadedRef = useRef(false);

  const questions = useMemo(() => session?.questions || [], [session?.questions]);
  const blocks = useMemo(
    () => Array.from(new Set(questions.map((question) => question.theme_block))).sort((a, b) => a - b),
    [questions],
  );
  const currentQuestions = useMemo(
    () => questions.filter((question) => question.theme_block === block),
    [block, questions],
  );
  const blockIndex = Math.max(0, blocks.indexOf(block));
  const answeredCount = Object.keys(answers).length;
  const missingAnswersCount = Math.max(0, questions.length - answeredCount);
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

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
        const nextAnswers = Object.entries(nextSession.answers || {}).reduce<Record<number, AnswerValue>>(
          (acc, [questionId, value]) => {
            acc[Number(questionId)] = value;
            return acc;
          },
          {},
        );
        setAnswers(nextAnswers);
        setPrivacyAccepted(Boolean(nextSession.privacy_accepted));
        setCompleted(nextSession.candidate?.status === "completed");
        const firstBlock = nextSession.questions?.[0]?.theme_block;
        if (firstBlock) setBlock(firstBlock);
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
        const payload = Object.entries(answers).map(([questionId, answerValue]) => ({
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
      } finally {
        setSaving(false);
      }
    },
    [answeredCount, answers, privacyAccepted, questions.length, token],
  );

  useEffect(() => {
    if (!loadedRef.current || !dirty || completed || !privacyAccepted) return;
    const timeout = window.setTimeout(() => {
      persistAnswers({ silent: true }).catch(() => {
        // Il salvataggio manuale resta disponibile e mostrera l'errore.
      });
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [completed, dirty, persistAnswers, privacyAccepted]);

  const goNext = async () => {
    await persistAnswers({ silent: false });
    setBlock(blocks[Math.min(blocks.length - 1, blockIndex + 1)]);
  };

  const goToBlock = async (nextBlock: number) => {
    if (nextBlock === block || saving) return;

    if (dirty) {
      try {
        await persistAnswers({ silent: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Non sono riuscito a salvare le risposte");
        return;
      }
    }

    setBlock(nextBlock);
  };

  const acceptPrivacyAndStart = async () => {
    setPrivacyAccepted(true);
    await persistAnswers({ acceptPrivacy: true, silent: false });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-orange-300" />
          <span className="text-sm font-medium">Caricamento Talent Profile...</span>
        </div>
      </div>
    );
  }

  if (!session?.valid) {
    return (
      <PublicShell>
        <Card className="mx-auto max-w-lg border-red-200">
          <CardContent className="space-y-3 p-8 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="text-xl font-bold text-slate-950">Questionario non disponibile</h1>
            <p className="text-sm text-slate-600">{reasonLabel(session?.reason)}</p>
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

  return (
    <PublicShell companyName={session.company?.name || undefined}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
        <Card className="overflow-hidden border-orange-200 bg-white/95 shadow-md">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500" />
          <CardHeader className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <motion.div
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm shadow-orange-200"
                >
                  <BrainCircuit className="h-6 w-6" />
                </motion.div>
                <div>
                  <CardTitle className="text-2xl tracking-tight">Talent Profile</CardTitle>
                  <p className="mt-1 text-sm text-slate-600">
                    {session.candidate?.nome} {session.candidate?.cognome} · ruolo valutato: <span className="font-semibold text-slate-900">{session.candidate?.ruolo_richiesto}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 tabular-nums">{answeredCount}/{questions.length} risposte</Badge>
                {missingAnswersCount > 0 && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    mancano {missingAnswersCount}
                  </Badge>
                )}
                {session.expires_at && (
                  <Badge variant="outline" className="gap-1">
                    <Clock3 className="h-3 w-3" />
                    scade {new Date(session.expires_at).toLocaleDateString("it-IT")}
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-slate-500">Progresso</span>
                <span className="text-sm font-bold tabular-nums text-orange-700">{progressPct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          </CardHeader>
        </Card>
        </motion.div>

        {!privacyAccepted ? (
          <Card className="mx-auto max-w-3xl">
            <CardContent className="space-y-5 p-6">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-950">Prima di iniziare</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Le risposte sono usate solo per la selezione e saranno visibili al team autorizzato dell'azienda.
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
                <Checkbox
                  checked={privacyAccepted}
                  onCheckedChange={(checked) => setPrivacyAccepted(checked === true)}
                />
                <span className="text-sm text-slate-700">
                  Confermo di aver letto l'informativa privacy e acconsento al trattamento dei dati per il processo di selezione.
                </span>
              </label>
              <Button className="bg-orange-600 hover:bg-orange-700" disabled={!privacyAccepted || saving} onClick={acceptPrivacyAndStart}>
                {saving ? "Salvataggio..." : "Accetto e inizio"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="space-y-1">
                {blocks.map((item) => {
                  const blockQuestions = questions.filter((question) => question.theme_block === item);
                  const answered = blockQuestions.filter((question) => answers[question.question_id]).length;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => void goToBlock(item)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                        block === item ? "bg-orange-100 text-orange-800" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>Blocco {item}</span>
                      <span className="text-xs">{answered}/{blockQuestions.length}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <Card className="overflow-hidden shadow-md">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Sezione {blockIndex + 1} / {blocks.length}</p>
                    <CardTitle className="text-xl tracking-tight">Blocco {block}</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">Scegli la risposta più naturale, senza pensarci troppo.</p>
                  </div>
                  <AnimatePresence mode="wait">
                    {dirty ? (
                      <motion.div key="dirty" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <Badge className="w-fit gap-1.5 bg-amber-100 text-amber-800 hover:bg-amber-100">
                          <Save className="h-3 w-3" />
                          modifiche da salvare
                        </Badge>
                      </motion.div>
                    ) : (
                      <motion.div key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <Badge className="w-fit gap-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          <CheckCircle2 className="h-3 w-3" />
                          salvato
                        </Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={block}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-3"
                  >
                    {currentQuestions.map((question, qIdx) => (
                      <motion.div
                        key={question.question_id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: qIdx * 0.03, duration: 0.25 }}
                        className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:shadow-sm"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                              Domanda {question.question_id}
                            </p>
                            <p className="mt-1 text-base font-medium leading-relaxed text-slate-950">{question.question_text}</p>
                          </div>
                          <div className="grid min-w-full gap-2 sm:grid-cols-3 xl:min-w-[420px]">
                            {answerOptions.map((option) => {
                              const label = question.custom_answers?.[option.value.toLowerCase() as "a" | "b" | "c"] || option.label;
                              const active = answers[question.question_id] === option.value;
                              return (
                                <motion.button
                                  key={option.value}
                                  type="button"
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => {
                                    setAnswers((prev) => ({ ...prev, [question.question_id]: option.value }));
                                    setDirty(true);
                                  }}
                                  className={`rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                                    active
                                      ? "border-orange-500 bg-orange-50 text-orange-900 shadow-sm shadow-orange-100"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/60"
                                  }`}
                                >
                                  <span className={`block text-[11px] font-bold ${active ? "text-orange-600" : "text-slate-400"}`}>{option.value}</span>
                                  {label}
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>

                <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="outline" disabled={blockIndex <= 0 || saving} onClick={() => void goToBlock(blocks[Math.max(0, blockIndex - 1)])}>
                    Indietro
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" disabled={saving} onClick={() => persistAnswers()}>
                      {saving ? "Salvataggio..." : "Salva bozza"}
                    </Button>
                    {blockIndex < blocks.length - 1 ? (
                      <Button disabled={saving} onClick={goNext}>
                        Salva e continua
                      </Button>
                    ) : (
                      <Button className="bg-orange-600 hover:bg-orange-700" disabled={saving || missingAnswersCount > 0} onClick={() => persistAnswers({ complete: true })}>
                        {missingAnswersCount > 0 ? `Mancano ${missingAnswersCount} risposte` : "Completa test"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PublicShell>
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
