/**
 * Autenticazione dei domini delle caselle collegate (SPF / DKIM / DMARC).
 *
 * Nel popup della scheda «Caselle email» in Integrazioni, sezione «Dominio»:
 * controllo AUTOMATICO al primo accesso alla pagina (poi in cache 6 ore) su
 * OGNI dominio collegato, non su richiesta. Dice tre cose per record:
 * configurato, mancante, o presente-ma-sbagliato — e per gli sbagliati elenca
 * il perché e il record da mettere.
 *
 * Dal 05/10/2026 salta i domini delle caselle gratuite (gmail.com, libero.it…):
 * i loro record li gestisce il fornitore, e chiedere di aggiungerne uno su
 * gmail.com non aveva senso. I domini PEC si mostrano ma non contano come
 * «da sistemare»: anche lì i record sono del gestore.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Copy } from "lucide-react";
import { eDominioGratuito } from "@/lib/email/dominiGratuiti";

type Stato = "ok" | "assente" | "errato" | "debole";
interface RecordSuggerito { tipo: string; host: string; valore: string; nota: string }
export interface EsitoDominio {
  dominio: string;
  provider_label: string;
  pec: boolean;
  caselle: string[];
  stati: { spf: Stato; dkim: Stato; dmarc: Stato };
  mx_ok?: boolean;
  punteggio?: number;
  rischio_spam?: "basso" | "medio" | "alto";
  problemi: string[];
  suggeriti: { spf: RecordSuggerito | null; dkim: RecordSuggerito | null; dmarc: RecordSuggerito | null };
}

const VERDE = "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
const GIALLO = "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
const ROSSO = "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300";

const STILE: Record<Stato, { label: string; classe: string; Icona: typeof ShieldCheck }> = {
  ok:      { label: "Configurato",   classe: VERDE,  Icona: ShieldCheck },
  debole:  { label: "Da rafforzare", classe: GIALLO, Icona: ShieldAlert },
  errato:  { label: "Da correggere", classe: ROSSO,  Icona: ShieldX },
  assente: { label: "Mancante",      classe: ROSSO,  Icona: ShieldX },
};

const RISCHIO: Record<"basso" | "medio" | "alto", string> = { basso: VERDE, medio: GIALLO, alto: ROSSO };

/** Un dominio aziendale con record da sistemare (i PEC no: li gestisce il gestore). */
export function dominioDaSistemare(d: EsitoDominio): boolean {
  return d.problemi.length > 0 && !d.pec;
}

/**
 * L'esito del controllo, già senza i domini delle caselle gratuite. Usato dal
 * popup e dalla pagina (stato della scheda, riquadro «Da sistemare»): stessa
 * chiave, una sola chiamata.
 */
export function useAutenticazioneDomini(abilitato = true) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["email-domain-auth"],
    enabled: abilitato,
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
  const divisi = useMemo(() => {
    const tutti = query.data ?? [];
    const domini = tutti.filter((d) => !eDominioGratuito(d.dominio));
    return {
      domini,
      gratuiti: tutti.filter((d) => eDominioGratuito(d.dominio)).map((d) => d.dominio),
      daSistemare: domini.filter(dominioDaSistemare),
    };
  }, [query.data]);
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    ...divisi,
    ricontrolla: () => qc.invalidateQueries({ queryKey: ["email-domain-auth"] }),
  };
}

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
    <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/20">
      <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span className="rounded bg-background px-1.5 py-0.5">{r.tipo}</span>
        <span className="text-muted-foreground">host:</span> <b>{r.host}</b>
      </div>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded bg-background px-2 py-1 text-[11px]">{r.valore}</code>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label="Copia"
          onClick={() => { navigator.clipboard?.writeText(r.valore); toast.success("Copiato"); }}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">{r.nota}</p>
    </div>
  );
}

/** Il controllo dei domini, senza cornice: sta nel popup «Caselle email». */
export function AutenticazioneDomini() {
  const { domini, gratuiti, daSistemare, isLoading, isError, isFetching, ricontrolla } = useAutenticazioneDomini();

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Controllo automatico sui domini delle caselle collegate: se questi record mancano o sono
          sbagliati, le tue email finiscono in spam o possono essere falsificate.
        </p>
        <Button size="sm" variant="outline" className="h-8 gap-1 shrink-0" disabled={isFetching} onClick={ricontrolla}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Ricontrolla
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <p className="text-sm text-rose-600">Controllo non riuscito: riprova tra poco.</p>
      ) : domini.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun dominio aziendale da controllare.</p>
      ) : (
        <>
          {daSistemare.length > 0 && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ROSSO}`}>
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {daSistemare.length === 1
                ? "1 dominio ha problemi di autenticazione: qui sotto cosa sistemare."
                : `${daSistemare.length} domini hanno problemi di autenticazione: qui sotto cosa sistemare.`}
            </div>
          )}
          {domini.map((d) => (
            <div key={d.dominio} className="rounded-xl border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {typeof d.punteggio === "number" && (
                  <div
                    className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-center ${RISCHIO[d.rischio_spam ?? "alto"]}`}
                    title="Punteggio autenticazione: SPF 35, DKIM 30, DMARC 20, MX 15"
                  >
                    <span className="text-sm font-bold leading-none tabular-nums">{d.punteggio}</span>
                    <span className="text-[9px] leading-none">/100</span>
                  </div>
                )}
                <span className="font-mono text-sm font-semibold">{d.dominio}</span>
                <Badge variant="outline" className="text-[10px]">{d.provider_label}</Badge>
                {d.rischio_spam && (
                  <Badge variant="outline" className={`text-[10px] ${RISCHIO[d.rischio_spam]}`}>
                    Rischio spam {d.rischio_spam}
                  </Badge>
                )}
                {d.pec && <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">PEC: record gestiti dal gestore</Badge>}
                <span className="ml-auto text-[11px] text-muted-foreground truncate">{d.caselle.join(", ")}</span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Semaforo nome="MX" stato={d.mx_ok === false ? "assente" : "ok"} descr="il dominio riceve posta" />
                <Semaforo nome="SPF" stato={d.stati.spf} descr="chi può spedire per te" />
                <Semaforo nome="DKIM" stato={d.stati.dkim} descr="firma anti-falsificazione" />
                <Semaforo nome="DMARC" stato={d.stati.dmarc} descr="cosa fare se ti falsificano" />
              </div>
              {d.problemi.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
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
      {gratuiti.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {gratuiti.join(", ")}: {gratuiti.length === 1 ? "è il dominio" : "sono i domini"} del fornitore di
          posta, che ne gestisce già i record. Non devi fare niente.
        </p>
      )}
    </div>
  );
}
