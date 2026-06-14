import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Centralina in-app (Fase 1, solo uscita): softphone WebRTC Telnyx.
 * L'operatore chiama e PARLA dal browser, sullo stesso account Telnyx degli SMS.
 *
 * Il provider va montato una volta nel CompanyLayout. È inerte finché non si
 * avvia una chiamata: l'SDK @telnyx/webrtc viene importato in lazy al primo uso
 * (resta fuori dal bundle iniziale) e il token effimero arriva dall'edge
 * function telnyx-webrtc-token (nessun segreto nel browser).
 */
type Status = "idle" | "connecting" | "ringing" | "active" | "ending";

interface SoftphoneApi {
  status: Status;
  startCall: (number: string, opts?: { name?: string; contactId?: string }) => void;
}

const SoftphoneContext = createContext<SoftphoneApi | null>(null);

/** Hook tollerante: ritorna null se non c'è il provider (es. fuori dal CompanyLayout). */
export function useSoftphoneOptional(): SoftphoneApi | null {
  return useContext(SoftphoneContext);
}

const REMOTE_AUDIO_ID = "telnyx-remote-audio";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("idle");
  const [peer, setPeer] = useState<{ number: string; name?: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const logIdRef = useRef<string | null>(null);
  const startMsRef = useRef<number | null>(null);
  const userIdRef = useRef<string | null>(null);
  const userNameRef = useRef<string | null>(null);

  const companyId = useEffectiveCompanyId();

  // Operatore corrente (per "chi ha chiamato" nello storico): risolto una volta.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      if (!active) return;
      userIdRef.current = uid;
      if (uid) {
        const { data: p } = await supabase
          .from("profiles").select("first_name, last_name").eq("id", uid).maybeSingle();
        const nm = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
        userNameRef.current = nm || data.user?.email || null;
      }
    });
    return () => { active = false; };
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Finalizza il log chiamata (storico call center) se aperto.
    if (logIdRef.current && startMsRef.current) {
      const dur = Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000));
      const lid = logIdRef.current;
      supabase.from("human_call_logs")
        .update({ status: "completed", duration_seconds: dur, ended_at: new Date().toISOString() })
        .eq("id", lid)
        .then(() => { /* best-effort */ });
    }
    logIdRef.current = null;
    startMsRef.current = null;
    try { callRef.current?.hangup?.(); } catch { /* noop */ }
    try { clientRef.current?.disconnect?.(); } catch { /* noop */ }
    callRef.current = null;
    clientRef.current = null;
    setStatus("idle");
    setPeer(null);
    setMuted(false);
    setSeconds(0);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startCall = useCallback((number: string, opts?: { name?: string }) => {
    if (status !== "idle") { toast.error("C'è già una chiamata in corso"); return; }
    if (!number) { toast.error("Numero mancante"); return; }
    setStatus("connecting");
    setPeer({ number, name: opts?.name });

    (async () => {
      try {
        // Preflight microfono: prompt anticipato + errore chiaro se negato.
        try {
          const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
          ms.getTracks().forEach((t) => t.stop());
        } catch {
          throw new Error("Permesso microfono negato: consenti il microfono per chiamare.");
        }

        const { data, error } = await supabase.functions.invoke("telnyx-webrtc-token", { body: {} });
        if (error) throw error;
        if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
        const loginToken = (data as { login_token?: string })?.login_token;
        const callerNumber = ((data as { caller_numbers?: string[] })?.caller_numbers || [])[0];
        if (!loginToken) throw new Error("Token centralina non disponibile");

        const mod = await import("@telnyx/webrtc");
        const TelnyxRTC = mod.TelnyxRTC;
        // SDK esterno: tipi delle opzioni call/eventi non perfettamente allineati →
        // usiamo un riferimento sciolto per evitare attriti TS, logica invariata.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client: any = new TelnyxRTC({ login_token: loginToken });
        clientRef.current = client;

        client.on("telnyx.ready", () => {
          const call = client.newCall({
            destinationNumber: number,
            callerNumber,
            callerName: opts?.name,
            audio: true,
            video: false,
            remoteElement: REMOTE_AUDIO_ID,
          });
          callRef.current = call;
        });
        client.on("telnyx.error", (e: unknown) => {
          console.error("[softphone] telnyx.error", e);
          toast.error("Errore di connessione alla centralina");
          cleanup();
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.on("telnyx.notification", (n: any) => {
          if (n?.type !== "callUpdate" || !n.call) return;
          const st = n.call.state as string;
          if (st === "ringing" || st === "trying" || st === "requesting" || st === "early") {
            setStatus("ringing");
          } else if (st === "active") {
            setStatus("active");
            if (!timerRef.current) {
              timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
            }
            // Apri il log chiamata (storico) una volta sola, alla risposta.
            if (!logIdRef.current && companyId) {
              startMsRef.current = Date.now();
              const sessionId = n.call.telnyxSessionId || n.call.telnyxCallControlId || n.call.id || null;
              supabase.from("human_call_logs")
                .insert({
                  company_id: companyId,
                  user_id: userIdRef.current,
                  user_name: userNameRef.current,
                  contact_id: opts?.contactId ?? null,
                  contact_name: opts?.name ?? null,
                  direction: "outbound",
                  to_number: number,
                  from_number: callerNumber ?? null,
                  telnyx_session_id: sessionId,
                  status: "active",
                })
                .select("id")
                .single()
                .then(({ data: row }) => { if (row?.id) logIdRef.current = row.id; });
            }
          } else if (st === "hangup" || st === "destroy" || st === "purge") {
            cleanup();
          }
        });

        client.connect();
      } catch (e) {
        console.error("[softphone] startCall", e);
        toast.error(e instanceof Error ? e.message : "Impossibile avviare la chiamata");
        cleanup();
      }
    })();
  }, [status, cleanup, companyId]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    try {
      if (typeof call.toggleAudioMute === "function") call.toggleAudioMute();
      else if (muted && typeof call.unmuteAudio === "function") call.unmuteAudio();
      else if (!muted && typeof call.muteAudio === "function") call.muteAudio();
      setMuted((m) => !m);
    } catch { /* noop */ }
  }, [muted]);

  const hangup = useCallback(() => {
    setStatus("ending");
    cleanup();
  }, [cleanup]);

  return (
    <SoftphoneContext.Provider value={{ status, startCall }}>
      {children}
      {/* elemento audio remoto: la voce dell'interlocutore esce da qui */}
      <audio id={REMOTE_AUDIO_ID} autoPlay />

      {status !== "idle" && (
        <div className="fixed bottom-4 right-4 z-[100] w-72 rounded-xl border bg-background shadow-2xl p-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
            )}>
              {status === "connecting" || status === "ending" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Phone className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peer?.name || peer?.number}</p>
              <p className="text-xs text-muted-foreground">
                {status === "connecting" && "Connessione…"}
                {status === "ringing" && "Sta squillando…"}
                {status === "active" && `In chiamata · ${fmt(seconds)}`}
                {status === "ending" && "Chiusura…"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={toggleMute}
              disabled={status !== "active"}
              aria-label={muted ? "Riattiva microfono" : "Muto"}
              title={muted ? "Riattiva microfono" : "Muto"}
            >
              {muted ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-9 gap-1.5"
              onClick={hangup}
            >
              <PhoneOff className="h-4 w-4" /> Riaggancia
            </Button>
          </div>
        </div>
      )}
    </SoftphoneContext.Provider>
  );
}
