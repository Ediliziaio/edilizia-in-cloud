import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2, ArrowRight, Sparkles, Loader2, Send, ShieldCheck, AlertTriangle, ShieldAlert, Shuffle } from "lucide-react";
import { renderTemplate, contactToVars, hashSeed } from "../../../../supabase/functions/_shared/outreach-template";
import { spamScore } from "../../../../supabase/functions/_shared/outreach-spam-score";

/**
 * Playground personalizzazione — prova oggetto, variabili e spintax su contatti
 * REALI prima di lanciare. Usa il motore puro renderTemplate (lo stesso degli
 * invii) + spamScore per il controllo deliverability. Chip cliccabili che
 * inseriscono al cursore, anteprima varianti spintax e "invia test a me".
 */

interface Contact {
  id: string; first_name: string; last_name: string | null;
  company_name: string | null; email: string | null; phone: string | null;
}

const DEFAULT_SUBJECT = "Domanda veloce su {{company_name|la vostra impresa}}";
const DEFAULT_TPL = "{Ciao|Salve|Buongiorno} {{first_name|amico}},\n\nho visto il lavoro di {{company_name|la vostra impresa}} e volevo proporvi una cosa veloce.\n\nHa 10 minuti questa settimana?";

const FALLBACK_SAMPLE: Contact = { id: "", first_name: "Mario", last_name: "Rossi", company_name: "Rossi Costruzioni", email: "mario@rossi.it", phone: "" };

const CHIPS = ["{{first_name}}", "{{first_name|amico}}", "{{company_name}}", "{{last_name}}", "{Ciao|Salve|Buongiorno}", "{così|in questo modo}"];
const ANGLE_PRESETS = [
  "Risparmio tempo su fatturazione e DDT",
  "Tenere i cantieri sotto controllo",
  "Caso studio di un'impresa simile",
  "Domanda breve e curiosa",
];

const LEVEL_META = {
  ok: { label: "Buono", cls: "text-emerald-600", bar: "bg-emerald-500", Icon: ShieldCheck },
  attenzione: { label: "Attenzione", cls: "text-amber-600", bar: "bg-amber-500", Icon: AlertTriangle },
  rischio: { label: "Rischio spam", cls: "text-red-600", bar: "bg-red-500", Icon: ShieldAlert },
} as const;

const SEV_DOT = { low: "bg-amber-400", med: "bg-orange-500", high: "bg-red-500" } as const;

export function OutreachMessagePlayground({ companyId }: { companyId: string }) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [tpl, setTpl] = useState(DEFAULT_TPL);
  const [contactId, setContactId] = useState("");
  const [angle, setAngle] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const subjRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const me = useQuery({
    queryKey: ["admin-email"], staleTime: Infinity,
    queryFn: async () => (await supabase.auth.getUser()).data.user?.email ?? "",
  });

  const contacts = useQuery({
    queryKey: ["playground-contacts", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id,first_name,last_name,company_name,email,phone")
        .eq("company_id", companyId).order("last_activity_at", { ascending: false, nullsFirst: false }).limit(50);
      if (error) return [];
      return (data ?? []) as Contact[];
    },
  });

  const list = contacts.data ?? [];
  const selected = list.find((c) => c.id === contactId) ?? list[0] ?? FALLBACK_SAMPLE;
  const vars = contactToVars(selected);
  const seed = hashSeed(selected.email || selected.id || "seed");
  const renderedSubject = renderTemplate(subject, vars, { seed });
  const renderedBody = renderTemplate(tpl, vars, { seed });

  const hasSpintax = /\{[^{}]*\|[^{}]*\}/.test(subject + tpl);
  const variants = useMemo(() => {
    if (!hasSpintax) return [];
    return [0, 1, 2].map((i) => ({
      subject: renderTemplate(subject, vars, { seed: hashSeed(`var-${i}-${seed}`) }),
      body: renderTemplate(tpl, vars, { seed: hashSeed(`var-${i}-${seed}`) }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, tpl, hasSpintax, seed, selected.id]);

  // Copertura variabili: variabili usate SENZA fallback ({{x}} e non {{x|...}}).
  // Su un contatto senza quel campo renderizzano vuoto ("Ciao ,") → brutta
  // impressione + segnale spam. Contiamo quanti dei contatti d'anteprima le
  // hanno vuote, così l'utente sa se serve un fallback.
  const KNOWN_FIELDS = ["first_name", "last_name", "company_name", "email", "phone"] as const;
  const coverage = useMemo(() => {
    const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(\|[^}]*)?\}\}/g;
    const bare = new Set<string>();
    let m: RegExpExecArray | null;
    const text = `${subject}\n${tpl}`;
    while ((m = re.exec(text)) !== null) {
      if (!m[2]) bare.add(m[1]); // gruppo 2 = fallback: assente = "nuda"
    }
    if (list.length === 0) return [];
    return [...bare]
      .filter((v) => (KNOWN_FIELDS as readonly string[]).includes(v))
      .map((v) => {
        const missing = list.filter((c) => {
          const val = (c as unknown as Record<string, unknown>)[v];
          return !val || String(val).trim() === "";
        }).length;
        return { variable: v, missing, total: list.length };
      })
      .filter((x) => x.missing > 0)
      .sort((a, b) => b.missing - a.missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, tpl, list]);

  const score = useMemo(() => spamScore(renderedSubject, renderedBody, `${subject}\n${tpl}`), [renderedSubject, renderedBody, subject, tpl]);
  const bodyWords = renderedBody.trim() ? renderedBody.trim().split(/\s+/).length : 0;
  const level = LEVEL_META[score.level];

  function insertChip(chip: string) {
    if (activeField === "subject") {
      const el = subjRef.current;
      const s = el?.selectionStart ?? subject.length;
      const e = el?.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, s) + chip + subject.slice(e));
      requestAnimationFrame(() => { el?.focus(); const p = s + chip.length; el?.setSelectionRange(p, p); });
    } else {
      const el = bodyRef.current;
      const s = el?.selectionStart ?? tpl.length;
      const e = el?.selectionEnd ?? tpl.length;
      setTpl(tpl.slice(0, s) + chip + tpl.slice(e));
      requestAnimationFrame(() => { el?.focus(); const p = s + chip.length; el?.setSelectionRange(p, p); });
    }
  }

  async function generateAI() {
    setAiBusy(true);
    try {
      const payload: Record<string, unknown> = { angle };
      if (selected.id) payload.contact_id = selected.id;
      else payload.contact = { first_name: selected.first_name, last_name: selected.last_name, company_name: selected.company_name };
      const { data, error } = await supabase.functions.invoke("outreach-ai-email", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.body) { setTpl(data.body); if (data.subject) setSubject(data.subject); toast.success("Email generata con AI"); }
      else throw new Error("Nessuna email generata");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore AI");
    } finally {
      setAiBusy(false);
    }
  }

  async function sendTest() {
    const to = (testEmail || me.data || "").trim();
    if (!to) { toast.error("Inserisci un'email di test"); return; }
    setTestBusy(true);
    try {
      const { data: caselle } = await supabase
        .from("outreach_sender_accounts").select("id,email,status,daily_sent").order("daily_sent", { ascending: true }).limit(20);
      const sender = (caselle ?? []).find((c) => c.status !== "paused" && c.status !== "disabled");
      if (!sender) { toast.error("Nessuna casella attiva nel pool. Configurane una in Deliverability."); return; }
      const html = renderedBody.replace(/\n/g, "<br>");
      const { data, error } = await supabase.functions.invoke("outreach-send-single", {
        body: { sender_account_id: sender.id, to, subject: renderedSubject || "(senza oggetto)", html },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Email di test inviata a ${to} da ${sender.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invio non riuscito");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {/* header */}
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wand2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Anteprima &amp; editor messaggio</h3>
          <p className="text-xs text-muted-foreground">Variabili, spintax e spam-score su un contatto reale</p>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Scrivi oggetto e corpo, prova variabili e <strong>spintax</strong> su un contatto vero, controlla lo <strong>spam-score</strong> e invia un test a te prima di lanciare. Lo spintax <code className="rounded bg-muted px-1 font-mono">{"{Ciao|Salve}"}</code> varia il messaggio tra destinatari (meno spam).
        </p>

        {/* AI bar */}
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <Input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Angle (opzionale): es. risparmio su fatturazione e cantieri" className="h-8 flex-1 text-xs" />
            <Button size="sm" className="h-8 gap-1" disabled={aiBusy} onClick={generateAI}>
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Genera con AI
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 pl-6">
            {ANGLE_PRESETS.map((a) => (
              <button key={a} type="button" onClick={() => setAngle(a)}
                className="rounded-full border border-primary/20 bg-card px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/10">
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* editor */}
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Oggetto</Label>
                <span className={`text-[10px] ${renderedSubject.length > 65 ? "text-amber-600" : "text-muted-foreground"}`}>{renderedSubject.length} caratteri</span>
              </div>
              <Input ref={subjRef} value={subject} onFocus={() => setActiveField("subject")} onChange={(e) => setSubject(e.target.value)}
                placeholder="Oggetto della mail…" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Corpo</Label>
                <span className="text-[10px] text-muted-foreground">{bodyWords} parole · {renderedBody.length} caratteri</span>
              </div>
              <Textarea ref={bodyRef} value={tpl} onFocus={() => setActiveField("body")} onChange={(e) => setTpl(e.target.value)} rows={8} className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Clicca per inserire al cursore ({activeField === "subject" ? "oggetto" : "corpo"}):</p>
              <div className="flex flex-wrap gap-1">
                {CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => insertChip(c)}
                    className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* preview — sticky su desktop: resta in vista mentre scorri l'editor */}
          <div className="space-y-2 md:sticky md:top-4 md:self-start">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Anteprima per</Label>
              {list.length > 0 && (
                <Select value={selected.id} onValueChange={setContactId}>
                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {list.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ""} {c.company_name ? `· ${c.company_name}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="min-h-[180px] overflow-hidden rounded-lg border border-border bg-muted/20 text-sm">
              <div className="border-b border-border bg-card px-3 py-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Oggetto</span>
                <p className="font-medium leading-snug">{renderedSubject || <span className="text-muted-foreground">(vuoto)</span>}</p>
              </div>
              <div className="whitespace-pre-wrap px-3 py-2.5 leading-relaxed">{renderedBody}</div>
            </div>
            {list.length === 0 && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowRight className="h-3 w-3" /> Nessun contatto: anteprima su un esempio. Importa una lista per provare sui tuoi lead.
              </p>
            )}
          </div>
        </div>

        {/* copertura variabili — avvisa se una variabile senza fallback resta vuota */}
        {coverage.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-700 dark:bg-amber-950/20">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Variabili senza valore
            </p>
            <ul className="space-y-1">
              {coverage.map((c) => (
                <li key={c.variable} className="text-[11px] text-amber-800 dark:text-amber-300">
                  <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/40">{`{{${c.variable}}}`}</code>{" "}
                  è vuota per <strong>{c.missing}</strong> dei {c.total} contatti d'anteprima — aggiungi un fallback, es.{" "}
                  <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/40">{`{{${c.variable}|…}}`}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* spam-score */}
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <level.Icon className={`h-4 w-4 ${level.cls}`} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Spam-score</span>
            <span className={`text-sm font-semibold tabular-nums ${level.cls}`}>{score.score}<span className="text-xs font-normal text-muted-foreground">/100</span></span>
            <span className={`text-xs font-medium ${level.cls}`}>· {level.label}</span>
            <div className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${level.bar}`} style={{ width: `${score.score}%` }} />
            </div>
          </div>
          {score.signals.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /> Nessun segnale di rischio. Email pulita e pronta.
            </p>
          ) : (
            <ul className="space-y-1">
              {score.signals.map((s, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[s.severity]}`} /> {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* varianti spintax */}
        {variants.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Shuffle className="h-3.5 w-3.5 text-primary" /> Come variano gli invii (spintax)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {variants.map((v, i) => (
                <div key={i} className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
                  <p className="mb-1 font-medium leading-tight">{v.subject}</p>
                  <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* invia test */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
          <Send className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder={me.data ? `Invia test a… (${me.data})` : "Invia test a… (la tua email)"}
            className="h-8 flex-1 text-xs" type="email" />
          <Button size="sm" variant="outline" className="h-8 gap-1" disabled={testBusy} onClick={sendTest}>
            {testBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Invia test a me
          </Button>
        </div>
      </div>
    </section>
  );
}
