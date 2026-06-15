import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Inbox, ArrowRight, MailOpen, AlertTriangle, Mailbox } from "lucide-react";
import { MigrationGate } from "./_shared";
import {
  INTENT_META, contactName, iniziali, relativeTime, useOutreachConversations,
} from "./useOutreachConversations";

/**
 * OutreachInboxPreview — widget compatto "ultime risposte da leggere" per la
 * scheda "Oggi". Sostituisce il grande client OutreachInbox (che ora vive nella
 * tab "Posta" come OutreachMailClient a 3 pannelli), così "Oggi" resta una
 * console di sintesi senza duplicare il client completo.
 *
 * Mostra al massimo 5 conversazioni NON LETTE; un click (o "Apri la Posta")
 * porta alla tab Posta via onOpenMailbox. Riusa useOutreachConversations (DRY).
 */
const MAX = 5;

export function OutreachInboxPreview({
  companyId, onOpenMailbox,
}: {
  companyId: string;
  onOpenMailbox: () => void;
}) {
  const { conversations, counts, sendersById, isLoading, errored, tableMissing } =
    useOutreachConversations(companyId);

  const unread = useMemo(
    () => conversations.filter((c) => !c.archived && c.unread).slice(0, MAX),
    [conversations],
  );

  if (tableMissing) {
    return (
      <MigrationGate
        title="Posta cold — ultime risposte"
        unlocks={[
          "Le risposte da leggere in evidenza nella console quotidiana.",
          "Un click apre la Posta: client a 3 pannelli con caselle e thread.",
          "Rispondi dalla stessa casella, con bozza AI.",
        ]}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-orange-500" /> Posta — da leggere
          {counts.unread > 0 && <Badge className="bg-orange-500">{counts.unread}</Badge>}
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onOpenMailbox}>
          Apri la Posta <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
              </div>
            ))}
          </div>
        ) : errored ? (
          <div className="flex items-center gap-2 py-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Errore nel caricamento risposte.
          </div>
        ) : unread.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <MailOpen className="h-6 w-6 opacity-40" />
            <p>Nessuna risposta da leggere. Tutto sotto controllo.</p>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onOpenMailbox}>
              Vai alla Posta <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {unread.map((conv) => {
              const name = contactName(conv.contact, conv.email);
              const company = conv.contact?.company_name;
              const intentMeta = conv.lastIntent ? INTENT_META[conv.lastIntent] : null;
              const mailbox = conv.primarySenderId ? sendersById.get(conv.primarySenderId) ?? null : null;
              return (
                <li key={conv.key}>
                  <button
                    onClick={onOpenMailbox}
                    className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(name)}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-background" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(conv.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {company ? `${company} · ` : ""}{conv.lastSnippet}
                        </span>
                        {intentMeta && (
                          <Badge variant="outline" className={cn("shrink-0 text-[10px]", intentMeta.cls)}>{intentMeta.label}</Badge>
                        )}
                      </div>
                      {mailbox && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground/80">
                          <Mailbox className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{mailbox.email}</span>
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
