import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInternalAutomationExecutionLog } from "@/hooks/useInternalAutomations";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, MinusCircle } from "lucide-react";

interface Props {
  flowId: string | undefined;
  open: boolean;
  onClose: () => void;
}

export function InternalAutomationLogDrawer({ flowId, open, onClose }: Props) {
  const { data: logs, isLoading } = useInternalAutomationExecutionLog(open ? flowId : undefined);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Log Esecuzioni</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !logs?.length ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nessuna esecuzione registrata
            </p>
          ) : (
            <div className="space-y-2 pr-2">
              {logs.map((log: any) => {
                const StatusIcon = log.status === "success" ? CheckCircle : log.status === "error" ? XCircle : MinusCircle;
                const statusColor = log.status === "success" ? "text-emerald-500" : log.status === "error" ? "text-destructive" : "text-muted-foreground";

                return (
                  <div key={log.id} className="border rounded-md p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                        <Badge variant="outline" className="text-xs">
                          {log.node_type || "—"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM HH:mm:ss", { locale: it })}
                      </span>
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                    )}
                    {log.output_json && Object.keys(log.output_json).length > 0 && (
                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(log.output_json, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
