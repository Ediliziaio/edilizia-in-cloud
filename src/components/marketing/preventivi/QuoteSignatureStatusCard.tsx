import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Send,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuoteSignatureStatusCardProps {
  status: string;
  createdAt: string;
  sentAt?: string | null;
  viewedAt?: string | null;
  signedAt?: string | null;
  signedByName?: string | null;
  signedByIp?: string | null;
  refusedAt?: string | null;
  refusedReason?: string | null;
  expiresAt?: string | null;
}

const fmt = (d: string) => format(new Date(d), "dd MMM yyyy HH:mm", { locale: it });

export function QuoteSignatureStatusCard({
  status,
  createdAt,
  sentAt,
  viewedAt,
  signedAt,
  signedByName,
  signedByIp,
  refusedAt,
  refusedReason,
  expiresAt,
}: QuoteSignatureStatusCardProps) {
  const steps = [
    {
      id: "created",
      label: "Preventivo creato",
      date: createdAt,
      icon: FileText,
      done: true,
    },
    {
      id: "sent",
      label: "Inviato al cliente",
      date: sentAt,
      icon: Send,
      done: !!sentAt,
    },
    {
      id: "viewed",
      label: "Visualizzato dal cliente",
      date: viewedAt,
      icon: Eye,
      done: !!viewedAt,
    },
    ...(status === "rifiutata" || refusedAt
      ? [
          {
            id: "refused",
            label: "Rifiutato",
            date: refusedAt,
            icon: XCircle,
            done: !!refusedAt,
            isNegative: true,
          },
        ]
      : [
          {
            id: "signed",
            label: signedByName ? `Firmato da ${signedByName}` : "Firmato dal cliente",
            date: signedAt,
            icon: CheckCircle,
            done: !!signedAt,
          },
        ]),
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Stato Firma Digitale
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            const StepIcon = step.icon;
            const isNeg = (step as any).isNegative;

            return (
              <div key={step.id} className="flex items-start gap-3 relative">
                {/* Vertical line */}
                {!isLast && (
                  <div
                    className={cn(
                      "absolute left-[15px] top-[30px] w-0.5 h-[calc(100%-6px)]",
                      step.done ? "bg-primary/30" : "bg-border"
                    )}
                  />
                )}

                {/* Icon */}
                <div
                  className={cn(
                    "rounded-full p-1.5 z-10 shrink-0",
                    step.done
                      ? isNeg
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <StepIcon className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className={cn("pb-5", !step.done && "opacity-50")}>
                  <p className={cn("font-medium text-sm", isNeg && step.done && "text-destructive")}>
                    {step.label}
                  </p>
                  {step.done && step.date && (
                    <p className="text-xs text-muted-foreground">{fmt(step.date)}</p>
                  )}
                  {!step.done && (
                    <p className="text-xs text-muted-foreground italic">In attesa</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Refused reason */}
        {refusedReason && (
          <div className="mt-2 p-3 bg-destructive/10 rounded-lg text-sm">
            <p className="font-medium text-destructive">Motivo rifiuto:</p>
            <p className="text-muted-foreground">{refusedReason}</p>
          </div>
        )}

        {/* Expiry info */}
        {expiresAt && status === "inviata" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Offerta valida fino al {format(new Date(expiresAt), "dd/MM/yyyy")}
          </p>
        )}

        {/* Signed IP info */}
        {signedByIp && signedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            IP firma: {signedByIp}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
