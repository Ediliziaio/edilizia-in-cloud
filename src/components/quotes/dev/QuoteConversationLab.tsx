import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ThinkingPromptInput, ThinkingProgress, type ThinkingStep, type ThinkingStatus } from "@/components/ui/thinking-prompt-input";
import { advanceLabConversation, type LabConversation, type LabRow, type LabScenario } from "@/lib/preventivi/devQuoteConversation";
import { recordConversationRequest, log } from "@/lib/preventivi/devSimulation";

type Props = { scenario: LabScenario; slow: boolean; onScenario: (scenario: LabScenario) => void; onRow: (index: number, row: LabRow) => void; onDiscount: (discount: number) => void };
type Message = { role: "user" | "assistant"; text: string; steps?: ThinkingStep[]; progressStatus?: ThinkingStatus; elapsed?: number };
export default function QuoteConversationLab({ scenario, slow, onScenario, onRow, onDiscount }: Props) {
  const [conversation, setConversation] = useState<LabConversation>({ scenario, step: "request" });
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "Che lavoro vuoi preventivare? Proviamo un bagno, un cappotto o un campo da tennis. Ti farò una domanda alla volta e comporrò la bozza a fianco mentre rispondi." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const revealProgress = () => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; };
  const append = (message: Message) => setMessages(prev => [...prev, message].slice(-60));
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!busy) return;
    const clock = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(clock);
  }, [busy]);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, busy, steps]);
  const send = (suggestion?: string) => {
    const text = (suggestion ?? input).trim();
    if (!text || text.length > 3000 || timer.current) return;
    append({ role: "user", text }); setInput(""); setBusy(true); setElapsed(0);
    startedAt.current = recordConversationRequest();
    const initialSteps: ThinkingStep[] = [
      { id: "read", text: "Leggo la risposta del caso demo", status: "active" },
      { id: "check", text: "Controllo misure e dati disponibili", status: "pending" },
      { id: "apply", text: "Preparo la domanda o la modifica alla bozza", status: "pending" },
    ];
    setSteps(initialSteps);
    const phaseDuration = slow ? [2600, 2600, 2800] : [80, 80, 90];
    timer.current = setTimeout(() => {
      const turn = advanceLabConversation(conversation, text);
      const checked: ThinkingStep[] = initialSteps.map(step => ({ ...step, status: step.id === "read" ? "complete" : step.id === "check" ? "active" : "pending" }));
      setSteps(checked);
      timer.current = setTimeout(() => {
        const applying: ThinkingStep[] = checked.map(step => ({ ...step, status: step.id === "apply" ? "active" : "complete", text: step.id === "apply" ? turn.row || turn.discount != null ? "Aggiorno la sola bozza locale" : "Preparo la prossima risposta" : step.text }));
        setSteps(applying);
        timer.current = setTimeout(() => {
          timer.current = null;
          if (turn.next.scenario !== conversation.scenario) onScenario(turn.next.scenario);
          if (turn.row) onRow(turn.row.index, turn.row.value);
          if (turn.discount != null) onDiscount(turn.discount);
          const completed: ThinkingStep[] = applying.map(step => ({ ...step, status: "complete" }));
          setSteps(completed); setConversation(turn.next);
          append({ role: "assistant", text: turn.reply, steps: completed, progressStatus: "done", elapsed: (Date.now() - startedAt.current) / 1000 }); setBusy(false);
        }, phaseDuration[2]);
      }, phaseDuration[1]);
    }, phaseDuration[0]);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setBusy(false);
    append({ role: "assistant", text: "Risposta interrotta. La bozza non è stata modificata; puoi rispondere di nuovo.", steps: steps.map(step => ({ ...step, status: step.status === "active" ? "stopped" : step.status })), progressStatus: "stopped", elapsed: (Date.now() - startedAt.current) / 1000 });
    log("Chat simulata interrotta, nessuna riga applicata.");
  };
  return <section className="quote-lab-chat" aria-label="Chat preventivo">
    <header><span><Sparkles size={17} /> Assistente preventivi</span><small>Chat simulata · nessun credito consumato</small></header>
    <div className="quote-lab-messages" role="log" aria-label="Conversazione preventivo" aria-live="polite" ref={transcript}>
      {messages.map((message, i) => <article key={i} className={`quote-lab-message ${message.role}`}><small>{message.role === "user" ? "Tu" : "Assistente · prova locale"}</small>{message.steps && <ThinkingProgress status={message.progressStatus ?? "done"} steps={message.steps} elapsedSeconds={message.elapsed} simulated onReveal={revealProgress} />}<p>{message.text}</p></article>)}
      {busy && <ThinkingProgress status="thinking" steps={steps} elapsedSeconds={elapsed} simulated onReveal={revealProgress} />}
    </div>
    {conversation.step === "request" && <div className="quote-lab-suggestions">{["Ristrutturiamo un bagno", "Prepariamo un cappotto", "Costruiamo un campo da tennis"].map(text => <button key={text} disabled={busy} onClick={() => send(text)}>{text}</button>)}</div>}
    <ThinkingPromptInput value={input} onValueChange={setInput} onSubmit={() => send()} onStop={stop} busy={busy} />
    <p className="quote-lab-caption">Invio per rispondere · Maiusc+Invio per andare a capo. Il totale include solo le voci completate; una bozza parziale non è un’offerta.</p>
  </section>;
}
