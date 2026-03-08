import { cn } from "@/lib/utils";
import { Mic, FileText, Image, Bot, Clock, Check, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface MessageBubbleProps {
  message: {
    id: string;
    sender_type: string;
    sender_name: string | null;
    message_type: string;
    content: string | null;
    transcription: string | null;
    ai_processed: boolean;
    created_at: string;
    delivery_status?: string | null;
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function DeliveryStatusIcon({ status }: { status?: string | null }) {
  if (!status) return null;
  switch (status) {
    case "pending":
      return <Clock className="h-3 w-3 opacity-50" />;
    case "sent":
      return <Check className="h-3 w-3 opacity-50" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 opacity-50" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case "failed":
      return <span className="text-[10px] text-destructive">!</span>;
    default:
      return <Check className="h-3 w-3 opacity-50" />;
  }
}

export function MessageBubble({ message, isSelected, onSelect }: MessageBubbleProps) {
  const isContact = message.sender_type === "contact";
  const isSystem = message.sender_type === "system";
  const isOperator = message.sender_type === "operator";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const typeIcon = {
    audio: <Mic className="h-3 w-3" />,
    image: <Image className="h-3 w-3" />,
    document: <FileText className="h-3 w-3" />,
  }[message.message_type];

  return (
    <div
      className={cn(
        "flex mb-3 cursor-pointer",
        isContact ? "justify-start" : "justify-end"
      )}
      onClick={() => onSelect(message.id)}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2 relative transition-all shadow-sm",
          isContact
            ? "bg-card text-card-foreground border rounded-bl-md"
            : "bg-emerald-100 dark:bg-emerald-900/40 text-foreground rounded-br-md",
          isSelected && "ring-2 ring-primary ring-offset-2"
        )}
      >
        {isContact && message.sender_name && (
          <p className="text-xs font-semibold mb-1 text-primary">{message.sender_name}</p>
        )}

        {typeIcon && (
          <div className="flex items-center gap-1 mb-1 opacity-70">
            {typeIcon}
            <span className="text-xs capitalize">{message.message_type}</span>
          </div>
        )}

        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {message.message_type === "audio" && message.transcription && (
          <div className="mt-2 pt-2 border-t border-current/10">
            <p className="text-xs opacity-70 italic">📝 {message.transcription}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-1 mt-1">
          {message.ai_processed && (
            <Bot className="h-3 w-3 opacity-50" />
          )}
          <span className="text-[10px] opacity-50">
            {format(new Date(message.created_at), "HH:mm", { locale: it })}
          </span>
          {isOperator && <DeliveryStatusIcon status={message.delivery_status} />}
        </div>
      </div>
    </div>
  );
}
