import { Card, CardContent } from "@/components/ui/card";
import { Database, ArrowRight } from "lucide-react";

/** Tabella assente nello schema (migrazione outreach non ancora applicata). */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  return (
    code === "42P01" || code === "PGRST205" || code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

export const OUTREACH_MIGRATION_FILE = "supabase/migrations/20270815000000_outreach_engine_core.sql";

/** Stato "funzione pronta, attivala con la migrazione". Mostrato finché le tabelle non esistono. */
export function MigrationGate({ title, unlocks }: { title: string; unlocks: string[] }) {
  return (
    <Card className="border-dashed border-orange-300 bg-orange-50/30">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-orange-700">
          <Database className="h-5 w-5" />
          <span className="font-semibold">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Tutto il codice è pronto: questa funzione si attiva applicando la migrazione del motore outreach.
        </p>
        <code className="block rounded bg-muted px-3 py-2 text-xs">supabase db push</code>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Una volta attiva sblocca:</p>
          <ul className="space-y-1 text-sm">
            {unlocks.map((u) => (
              <li key={u} className="flex gap-2 text-muted-foreground">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />{u}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground">Migrazione: <code>{OUTREACH_MIGRATION_FILE}</code></p>
        <p className="text-[11px] text-muted-foreground">📖 Guida passo-passo (domini, SES, caselle, risposte, cron): <code>docs/outreach-setup-ses.md</code></p>
      </CardContent>
    </Card>
  );
}
