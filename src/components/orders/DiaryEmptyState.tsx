import { Mail, MessageSquare, MessageCircle, FileText, Plus } from "lucide-react";

type Channel = "email" | "sms" | "whatsapp" | "nota_interna";

interface DiaryEmptyStateProps {
  onSelectChannel: (channel: Channel) => void;
}

const CHANNELS: {
  id: Channel;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: "email",
    name: "Email",
    description: "Raggiunge il cliente in modo formale",
    icon: <Mail className="w-7 h-7" />,
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
  },
  {
    id: "sms",
    name: "SMS",
    description: "Messaggio istantaneo e diretto",
    icon: <MessageSquare className="w-7 h-7" />,
    color: "bg-green-50 border-green-200 hover:border-green-400",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Chat con immagini e link",
    icon: <MessageCircle className="w-7 h-7" />,
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
  },
  {
    id: "nota_interna",
    name: "Nota interna",
    description: "Visibile solo al tuo team",
    icon: <FileText className="w-7 h-7" />,
    color: "bg-gray-50 border-gray-200 hover:border-gray-400",
  },
];

export function DiaryEmptyState({ onSelectChannel }: DiaryEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-100">
      {/* Icona principale */}
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
        <Mail className="w-8 h-8 text-primary" />
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Nessun messaggio ancora
      </h2>
      <p className="text-sm text-gray-500 text-center mb-10 max-w-sm">
        Inizia a comunicare con il cliente su questo ordine. Scegli il canale che preferisci.
      </p>

      {/* Card canali */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mb-8">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelectChannel(ch.id)}
            className={`p-4 rounded-xl border-2 text-left transition-all hover:shadow-sm hover:-translate-y-0.5 ${ch.color}`}
          >
            <div className="flex items-start gap-3">
              <div className="text-gray-600 mt-0.5 shrink-0">{ch.icon}</div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{ch.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ch.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* CTA principale */}
      <button
        onClick={() => onSelectChannel("email")}
        className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Scrivi il primo messaggio
      </button>
    </div>
  );
}
