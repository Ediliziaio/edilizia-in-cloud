import { Construction } from "lucide-react";

interface ConversationPlayerProps {
  conversationId: string;
}

export function ConversationPlayer({ conversationId }: ConversationPlayerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 border rounded-lg bg-muted/20">
      <Construction className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        Player conversazione in sviluppo.
      </p>
      <p className="text-xs text-muted-foreground">ID: {conversationId}</p>
    </div>
  );
}
