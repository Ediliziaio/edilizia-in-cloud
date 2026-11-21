import { formatSupportHours, isSupportActive } from "./supportInbox";

interface SupportStatsProps {
  conversations: Array<{ status: string; unansweredByAdmin: boolean; resolvedAt: string | null; agingHours: number }>;
  messages: Array<{ company_id: string; sender_role: string; created_at: string }>;
  observedAt: number;
}

export function SupportStats({ conversations, messages, observedAt }: SupportStatsProps) {
  const active = conversations.filter((conversation) => isSupportActive(conversation.status));
  const waiting = active.filter((conversation) => conversation.unansweredByAdmin);
  const totalWaitingHours = waiting.reduce((total, conversation) => total + conversation.agingHours, 0);
  const oldest = waiting.reduce((hours, conversation) => Math.max(hours, conversation.agingHours), 0);
  const since = observedAt - 7 * 24 * 60 * 60 * 1000;
  const resolved = conversations.filter((conversation) => conversation.resolvedAt && Date.parse(conversation.resolvedAt) >= since);

  const previousByCompany = new Map<string, SupportStatsProps["messages"][number]>();
  let totalResponseHours = 0;
  let responseCount = 0;
  for (const message of [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    const previous = previousByCompany.get(message.company_id);
    if (previous && previous.sender_role !== "super_admin" && message.sender_role === "super_admin") {
      totalResponseHours += (Date.parse(message.created_at) - Date.parse(previous.created_at)) / 3_600_000;
      responseCount += 1;
    }
    previousByCompany.set(message.company_id, message);
  }

  const counters = [
    { label: "Attivi", value: active.length },
    { label: "Da rispondere", value: waiting.length },
    { label: "Oltre SLA (4 ore)", value: waiting.filter((conversation) => conversation.agingHours > 4).length },
    { label: "Attesa media", value: waiting.length ? formatSupportHours(totalWaitingHours / waiting.length) : "—" },
    { label: "Attesa più lunga", value: waiting.length ? formatSupportHours(oldest) : "—" },
    { label: "Quota con risposta", value: active.length ? Math.round((active.length - waiting.length) / active.length * 100) + "%" : "—" },
    { label: "Tempo medio di risposta", value: responseCount ? formatSupportHours(totalResponseHours / responseCount) : "—" },
    { label: "Risolti negli ultimi 7 giorni", value: resolved.length },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 bg-muted/40 p-4 sm:grid-cols-4">
      {counters.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
