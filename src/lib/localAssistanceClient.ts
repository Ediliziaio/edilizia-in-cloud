import type {
  FishVoicePreview,
  FishVoiceSegment,
} from "@/components/agenti/FishLiveVoice";
import type { FishAssistanceActivity } from "./fishAssistanceActivities";
import type { FishCallback } from "./fishCallbacks";
export type LocalPhase =
  | "problem"
  | "urgency"
  | "name"
  | "address"
  | "ticket_choice"
  | "ticket_confirmation"
  | "appointment_choice"
  | "day"
  | "slot"
  | "appointment_confirmation"
  | "done"
  | "needs_office";
export interface LocalLabMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  at: string;
}
export interface LocalLabBootstrap {
  mode: "local";
  productionConnected: false;
  voice?: LocalFishVoiceStatus;
  phoneSetup?: LocalPhoneSetup;
  backend: string;
  scenarios: { id: string; name: string }[];
  customers: { id: string; name: string; address: string; phone: string }[];
  calendars: { id: string; name: string; duration_minutes: number }[];
  defaultCalendarId: string;
  defaultDay: string;
  sessions: {
    id: string;
    scenario: string;
    phase: LocalPhase;
    created_at: string;
  }[];
}
export interface LocalPhoneSettings {
  officeSeconds: number;
  outboundEnabled: boolean;
}
interface LocalPhoneSetup {
  companyNumber: string;
  callerNumber: string;
  officeGroup: string;
  defaultSettings: LocalPhoneSettings;
  durations: number[];
}
export type LocalPhoneAction =
  | "office_answer"
  | "skip_wait"
  | "accept_callback"
  | "decline_callback"
  | "hang_up"
  | "answer_callback"
  | "miss_callback";
export interface LocalPhoneTrial {
  id: string;
  version: number;
  phase:
    | "office_ringing"
    | "office_answered"
    | "ai"
    | "consented"
    | "declined"
    | "callback_ringing"
    | "callback_blocked"
    | "callback_answered"
    | "callback_unanswered";
  settings: LocalPhoneSettings;
  deadline: number;
  now: number;
  inbound: { from: string; to: string };
  callback: { from: string; to: string } | null;
  events: { version: number; at: number; label: string }[];
  prompt: string | null;
}
export interface LocalFishVoiceStatus {
  configured: boolean;
  provider: "fish_audio";
  model: "drama-3";
  voice: string;
  asrModel: "transcribe-1";
  maxSeconds: number;
}
export interface LocalLabSnapshot {
  mode: "local";
  productionConnected: false;
  session: {
    id: string;
    scenario: string;
    phase: LocalPhase;
    messages: LocalLabMessage[];
    tools: {
      id: string;
      name: string;
      at: string;
      result: Record<string, unknown>;
    }[];
    suggestions: string[];
    day: string | null;
  };
  fixture: { name: string; address: string; phone: string } | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    address: string;
    city: string;
  } | null;
  ticket: {
    id: string;
    customer_id: string;
    subject: string;
    descrizione: string;
    indirizzo_intervento: string;
    status: string;
    transcript: LocalLabMessage[];
    notes: { id: string; note: string }[];
  } | null;
  appointment: {
    id: string;
    calendar_id: string;
    appointment_date: string;
    appointment_time: string;
    appointment_end_time: string;
    assigned_to: string;
    status: string;
    description: string;
  } | null;
  steps: { ordine: number; azione_chiave: string; stato: string }[];
  activity: FishAssistanceActivity | null;
}
export type LocalLeadSetup = {
  ready: boolean;
  name: string;
  address: string;
  phone: string;
  day: string;
};
export type LocalLeadSnapshot = {
  id: string;
  scenario: string;
  contact: { id: string; name: string; address: string; phone: string };
  opportunityId: string;
  appointment: {
    id: string;
    contact_id: string;
    opportunity_id: string | null;
    appointment_date: string;
    appointment_time: string;
  } | null;
  callback: FishCallback | null;
  call: { contact_id: string; iniziata_il: string; terminata_il: string | null };
  outcome: {
    opportunity_id: string;
    outcome: string;
    note: string;
    next_action: string | null;
  } | null;
  transcript: { role: string; text: string }[];
};
const PREFIX = "/__local-assistance";
const checkId = (id: string) => {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))
    throw new Error("Riferimento di prova non valido.");
  return id;
};
export function createLocalAssistanceClient() {
  let token = "";
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(PREFIX + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...(token ? { "X-Local-Assistance-Token": token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Backend locale non disponibile.");
    if (result.mode !== "local" || result.productionConnected !== false)
      throw new Error(
        "La risposta non appartiene al collaudo locale. Operazione fermata.",
      );
    return result as T;
  }
  async function requestSpeech(
    path: string,
    body: object,
    signal?: AbortSignal,
  ) {
    const response = await fetch(PREFIX + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Local-Assistance-Token": token,
      },
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(50_000),
      cache: "no-store",
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "Voce Fish non disponibile.");
    }
    if (
      response.headers.get("X-Local-Assistance-Mode") !== "local" ||
      response.headers.get("X-Fish-Speech-Model") !== "drama-3" ||
      !response.headers.get("Content-Type")?.startsWith("audio/mpeg")
    )
      throw new Error(
        "La risposta non è un audio Drama 3 del collaudo locale.",
      );
    return response.blob();
  }
  return {
    async leadSetup() {
      return (await request<{ setup: LocalLeadSetup }>("/lead-trials")).setup;
    },
    async leadOpen(scenario: string) {
      return (
        await request<{
          preview: FishVoicePreview & { local_trial_id: string };
        }>("/lead-trials", { scenario })
      ).preview;
    },
    async leadSnapshot(id: string) {
      return (
        await request<{ trial: LocalLeadSnapshot }>(
          "/lead-trials/" + checkId(id),
        )
      ).trial;
    },
    async leadTool(
      id: string,
      tool: string,
      parameters: Record<string, unknown>,
      transcript: FishVoiceSegment[],
    ) {
      return (
        await request<{ result: unknown }>(
          "/lead-trials/" + checkId(id) + "/tool",
          { tool, parameters, transcript },
        )
      ).result;
    },
    async leadTranscript(id: string, transcript: FishVoiceSegment[]) {
      return request("/lead-trials/" + checkId(id) + "/transcript", {
        transcript,
      });
    },
    speech(id: string, messageId: string, signal?: AbortSignal) {
      return requestSpeech(
        "/sessions/" + checkId(id) + "/speech",
        { messageId },
        signal,
      );
    },
    startPhoneTrial(input: LocalPhoneSettings & { requestId: string }) {
      return request<{ trial: LocalPhoneTrial }>("/phone-trials", input);
    },
    phoneTrial(id: string) {
      return request<{ trial: LocalPhoneTrial }>(
        "/phone-trials/" + checkId(id),
      );
    },
    advancePhoneTrial(id: string, version: number, action: LocalPhoneAction) {
      return request<{ trial: LocalPhoneTrial }>(
        "/phone-trials/" + checkId(id),
        { version, action },
      );
    },
    phoneSpeech(id: string, version: number, signal: AbortSignal) {
      return requestSpeech(
        "/phone-trials/" + checkId(id) + "/speech",
        { version },
        signal,
      );
    },
    async transcribe(id: string, audio: Blob, signal?: AbortSignal) {
      const response = await fetch(
        PREFIX + "/sessions/" + checkId(id) + "/transcribe",
        {
          method: "POST",
          headers: {
            "Content-Type": audio.type,
            "X-Local-Assistance-Token": token,
          },
          body: audio,
          signal: signal || AbortSignal.timeout(50_000),
          cache: "no-store",
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Trascrizione non disponibile.");
      if (
        result.mode !== "local" ||
        result.productionConnected !== false ||
        typeof result.text !== "string"
      )
        throw new Error("La trascrizione non appartiene al collaudo locale.");
      return result as { text: string; duration: number };
    },
    async bootstrap() {
      const data = await request<LocalLabBootstrap & { token: string }>(
        "/bootstrap",
      );
      token = data.token;
      return data;
    },
    start(input: {
      requestId: string;
      customerId: string;
      calendarId: string;
      scenario: string;
    }) {
      return request<LocalLabSnapshot>("/sessions", input);
    },
    snapshot(id: string) {
      return request<LocalLabSnapshot>("/sessions/" + checkId(id));
    },
    turn(id: string, input: { requestId: string; text: string }) {
      return request<LocalLabSnapshot>(
        "/sessions/" + checkId(id) + "/turn",
        input,
      );
    },
  };
}
