/**
 * PoweredByBadge — Mostra "Powered by Edilizia in Cloud" o testo personalizzato.
 * Nascosto se hide_platform_branding = true e il tier lo permette.
 */
import { useBranding } from "@/hooks/useBranding";

interface PoweredByBadgeProps {
  className?: string;
}

export function PoweredByBadge({ className = "" }: PoweredByBadgeProps) {
  const { data: branding } = useBranding();

  // Se il branding dice di nascondere il powered-by, non mostriamo nulla
  if (branding?.hide_platform_branding) return null;

  const platformName = branding?.platform_name || "EdiliziaInCloud";
  const text = `Powered by ${platformName}`;

  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      {text}
    </p>
  );
}
