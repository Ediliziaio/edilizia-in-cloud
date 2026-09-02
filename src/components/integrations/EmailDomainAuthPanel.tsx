/**
 * Autenticazione dei domini delle caselle collegate (SPF / DKIM / DMARC).
 *
 * Vive in Integrazioni, accanto alle caselle: controllo AUTOMATICO al primo
 * accesso (poi in cache 6 ore) su OGNI dominio collegato, non su richiesta.
 * Dice tre cose per record: configurato, mancante, o presente-ma-sbagliato —
 * e per gli sbagliati elenca il perché e il record da mettere.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Copy, Mail } from "lucide-react";

type Stato = "ok" | "assente" | "errato" | "debole";
interface RecordSuggerito { tipo: string; host: string; valore: string; nota: string }
interface EsitoDominio {
  dominio: string;
  provider_label: string;
  pec: boolean;
  caselle: string[];
  stati: { spf: Stato; dkim: Stato; dmarc: Stato };
  problemi: string[];
  suggeriti: { spf: RecordSuggerito | null; dkim: RecordSuggerito | null; dmarc: RecordSuggerito | null };
}

const STILE: Record<Stato, { label: string; classe: string; Icona: typeof ShieldCheck }> = {
  ok:      { label: "Configurato",   classe: "border-emerald-200 bg-emerald-50 text-emerald-700", Icona: ShieldCheck },
  debole:  { label: "Da rafforzare", classe: "border-amber-200 bg-amber-50 text-amber-700",       Icona: ShieldAlert },
  errato:  { label: "Da correggere", classe: "border-rose-200 bg-rose-50 text-rose-700",          Icona: ShieldX },
  assente: { label: "Mancante",      classe: "border-rose-200 bg-rose-50 text-rose-700",          Icona: ShieldX },
};

function Semaforo({ nome, stato, descr }: { nome: string; stato: Stato; descr: string }) {
  const s = STILE[stato];
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5">
      <div className="min-w-0">
        <span className="text-xs font-semibold">{nome}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">{descr}</span>
      </div>
      <Badge variant="outline" className={`shrink-0 gap-1 text-[10px] ${s.classe}`}>
        <s.Icona className="h-3 w-3" /> {s.label}
      </Badge>
    </div>
  );
}

function RecordDaMettere({ r }: { r: RecordSuggerito }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span className="rounded bg-white px-1.5 py-0.5">{r.tipo}</span>
        <span className="text-muted-foreground">host:</span> <b>{r.host}</b>
      </div>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded bg-white px-2 py-1 text-[11px]">{r.valore}</code>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label="Copia"
          onClick={() => { navigator.clipboard?.writeText(r.valore); toast.success("Copiato"); }}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-amber-800">{r.nota}</p>
    </div>
  );
}

export function EmailDomainAuthPanel({ haCaselle }: { haCaselle: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["email-domain-auth"],
    enabled: haCaselle,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-ai-deliverability", { body: { all: true } });
      // Nessuna casella collegata → la edge risponde 400 "domain_richiesto":
      // non è un errore, è "niente da controllare".
      const ctx = (error as { context?: Response } | null)?.context;
      if (error && ctx?.status === 400) return [] as EsitoDominio[];
      if (error) throw error;
      if (data?.error === "domain_richiesto") return [] as EsitoDominio[];
      if (data?.error) throw new Error(data.reason ?? data.error);
      return (data?.domini ?? []) as EsitoDominio[];
    },
  });

  if (!haCaselle) return null;

  const domini = data ?? [];
  const conProblemi = domini.filter((d) => d.problemi.length > 0).length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" /> Autenticazione email (SPF / DKIM / DMARC)
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Controllo automatico sui domini delle caselle collegate: se questi record mancano o sono sbagliati, le tue email finiscono in spam o possono essere falsificate.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 shrink-0" disabled={isFetching}
          onClick={() => qc.invalidateQueries({ queryKey: ["email-domain-auth"] })}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Ricontrolla
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p className="text-sm text-rose-600">Controllo non riuscito: riprova tra poco.</p>
        ) : domini.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun dominio da controllare.</p>
        ) : (
          <>
            {conProblemi > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {conProblemi === 1 ? "1 dominio ha problemi di autenticazione: leggi sotto cosa sistemare." : `${conProblemi} domini hanno problemi di autenticazione: leggi sotto cosa sistemare.`}
              </div>
            )}
            {domini.map((d) => (
              <div key={d.dominio} className="rounded-xl border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{d.dominio}</span>
                  <Badge variant="outline" className="text-[10px]">{d.provider_label}</Badge>
                  {d.pec && <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-700">PEC: record gestiti dal gestore</Badge>}
                  <span className="ml-auto text-[11px] text-muted-foreground truncate">{d.caselle.join(", ")}</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  <Semaforo nome="SPF" stato={d.stati.spf} descr="chi può spedire per te" />
                  <Semaforo nome="DKIM" stato={d.stati.dkim} descr="firma anti-falsificazione" />
                  <Semaforo nome="DMARC" stato={d.stati.dmarc} descr="cosa fare se ti falsificano" />
                </div>
                {d.problemi.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                    {d.problemi.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                )}
                {(d.suggeriti.spf || d.suggeriti.dkim || d.suggeriti.dmarc) && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Record da mettere nel DNS del dominio</p>
                    {d.suggeriti.spf && <RecordDaMettere r={d.suggeriti.spf} />}
                    {d.suggeriti.dkim && <RecordDaMettere r={d.suggeriti.dkim} />}
                    {d.suggeriti.dmarc && <RecordDaMettere r={d.suggeriti.dmarc} />}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
