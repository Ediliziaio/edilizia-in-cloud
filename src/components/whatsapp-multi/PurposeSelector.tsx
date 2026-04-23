// MP04 — Selettore scopo numero WhatsApp per Connect Wizard.

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { MessageSquare, HeadphonesIcon, Target, Megaphone, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { PURPOSE_DESCRIPTIONS, PURPOSE_LABELS, type WAPurpose } from "@/hooks/whatsapp/useWhatsAppNumbers";

const ICONS: Record<WAPurpose, typeof MessageSquare> = {
  bot_operativo: MessageSquare,
  assistenza: HeadphonesIcon,
  lead: Target,
  marketing: Megaphone,
  notifiche: Bell,
};

const PURPOSE_ORDER: WAPurpose[] = [
  "bot_operativo",
  "assistenza",
  "lead",
  "marketing",
  "notifiche",
];

interface Props {
  selected: WAPurpose | null;
  onSelect: (purpose: WAPurpose) => void;
  disabledPurposes?: WAPurpose[];
}

export function PurposeSelector({ selected, onSelect, disabledPurposes = [] }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {PURPOSE_ORDER.map((p) => {
        const Icon = ICONS[p];
        const isDisabled = disabledPurposes.includes(p);
        const isSelected = selected === p;
        return (
          <button
            key={p}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(p)}
            aria-label={`Scegli scopo ${PURPOSE_LABELS[p]}`}
            aria-pressed={isSelected}
            className={cn(
              "w-full text-left rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isDisabled && "opacity-50 cursor-not-allowed",
              !isDisabled && "cursor-pointer",
            )}
          >
            <Card
              className={cn(
                "border-2 transition-colors",
                isSelected && "border-primary bg-primary/5",
                !isSelected && !isDisabled && "hover:border-primary/40",
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{PURPOSE_LABELS[p]}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs">
                  {PURPOSE_DESCRIPTIONS[p]}
                </CardDescription>
                {isDisabled && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Già configurato per questa azienda.
                  </p>
                )}
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
