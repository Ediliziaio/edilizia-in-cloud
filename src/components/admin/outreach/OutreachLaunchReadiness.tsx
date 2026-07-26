import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Globe, Inbox, Mail,
  ShieldCheck, ShieldAlert, Rocket, Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isMissingTableError } from "./_shared";

/**
 * Prontezza al lancio, per brand.
 *
 * Perché esiste: prima del lancio la domanda vera è una sola — "questo brand
 * può spedire oggi, e se no cosa gli manca?". Le informazioni per rispondere
 * c'erano tutte ma sparse su tre pannelli diversi (Brand, Domini, Caselle), e
 * nessuno diceva il numero che conta davvero: quante email al giorno quel
 * brand riesce effettivamente a mandare adesso.
 *
 * Legge la vista v_outreach_infrastruttura (brand → dominio → casella con
 * SPF/DKIM/DMARC, connessione, SMTP/IMAP, warm-up e cap del giorno). Il flag
 * `pronta` è calcolato in SQL: è true solo se TUTTA la catena regge.
 *
 * Sola lettura. Non tocca niente, dice solo la verità.
 */

type Riga = {
  brand_id: string;
  brand: string;
  brand_status: string | null;
  ha_reply_to: boolean | null;
  ha_firma: boolean | null;
  ha_indirizzo: boolean | null;
  dominio_id: string | null;
  dominio: string | null;
  dominio_status: string | null;
  spf_verified: boolean | null;
  dkim_verified: boolean | null;
  dmarc_verified: boolean | null;
  casella_id: string | null;
  casella: string | null;
  casella_status: string | null;
  connection_status: string | null;
  ha_smtp: boolean | null;
  ha_imap: boolean | null;
  warmup_day: number | null;
  cap_oggi: number | null;
  pronta: boolean | null;
};

type Blocco = { gravita: "stop" | "attenzione"; testo: string };

type BrandStato = {
  id: string;
  nome: string;
  domini: number;
  dominiOk: number;
  caselle: number;
  casellePronte: number;
  capacitaOggi: number;
  blocchi: Blocco[];
};

function aggrega(righe: Riga[]): BrandStato[] {
  const per = new Map<string, BrandStato>();
  const dominiVisti = new Map<string, Set<string>>();
  const caselleViste = new Map<string, Set<string>>();

  for (const r of righe) {
    let b = per.get(r.brand_id);
    if (!b) {
      b = {
        id: r.brand_id, nome: r.brand, domini: 0, dominiOk: 0,
        caselle: 0, casellePronte: 0, capacitaOggi: 0, blocchi: [],
      };
      per.set(r.brand_id, b);
      dominiVisti.set(r.brand_id, new Set());
      caselleViste.set(r.brand_id, new Set());

      // Identità del brand: senza firma e indirizzo l'email è un segnale spam
      // e manca l'appiglio per l'informativa privacy.
      if (r.brand_status !== "active")
        b.blocchi.push({ gravita: "stop", testo: `Brand in stato "${r.brand_status ?? "?"}": non spedisce finché non è attivo` });
      if (!r.ha_reply_to)
        b.blocchi.push({ gravita: "attenzione", testo: "Nessun Reply-To: le risposte vanno all'indirizzo della casella, non a una inbox presidiata" });
      if (!r.ha_firma)
        b.blocchi.push({ gravita: "attenzione", testo: "Firma mancante" });
      if (!r.ha_indirizzo)
        b.blocchi.push({ gravita: "stop", testo: "Indirizzo postale mancante: serve in fondo a ogni email" });
    }

    if (r.dominio_id && !dominiVisti.get(r.brand_id)!.has(r.dominio_id)) {
      dominiVisti.get(r.brand_id)!.add(r.dominio_id);
      b.domini++;
      const dnsOk = !!(r.spf_verified && r.dkim_verified && r.dmarc_verified);
      if (dnsOk && r.dominio_status === "active") b.dominiOk++;
      const mancanti = [
        !r.spf_verified && "SPF",
        !r.dkim_verified && "DKIM",
        !r.dmarc_verified && "DMARC",
      ].filter(Boolean) as string[];
      if (mancanti.length)
        b.blocchi.push({ gravita: "stop", testo: `${r.dominio}: manca ${mancanti.join(", ")}` });
      else if (r.dominio_status !== "active")
        b.blocchi.push({ gravita: "attenzione", testo: `${r.dominio}: DNS a posto ma dominio in stato "${r.dominio_status}"` });
    }

    if (r.casella_id && !caselleViste.get(r.brand_id)!.has(r.casella_id)) {
      caselleViste.get(r.brand_id)!.add(r.casella_id);
      b.caselle++;
      if (r.pronta) {
        b.casellePronte++;
        b.capacitaOggi += r.cap_oggi ?? 0;
      }
      if (r.connection_status === "error")
        b.blocchi.push({ gravita: "stop", testo: `${r.casella}: connessione in errore` });
      else if (!r.ha_smtp)
        b.blocchi.push({ gravita: "stop", testo: `${r.casella}: SMTP non collegato` });
      if (!r.ha_imap)
        b.blocchi.push({ gravita: "stop", testo: `${r.casella}: IMAP non collegato — le risposte non verrebbero lette` });
      if ((r.warmup_day ?? 0) === 0 && r.casella_status === "warming")
        b.blocchi.push({ gravita: "attenzione", testo: `${r.casella}: warm-up non ancora avviato` });
    }
  }

  for (const b of per.values()) {
    if (b.domini === 0) b.blocchi.unshift({ gravita: "stop", testo: "Nessun dominio di invio collegato al brand" });
    else if (b.caselle === 0) b.blocchi.unshift({ gravita: "stop", testo: "Domini presenti ma nessuna casella collegata" });
  }
  return [...per.values()].sort((a, b) => b.capacitaOggi - a.capacitaOggi || a.nome.localeCompare(b.nome));
}

function semaforo(b: BrandStato): { label: string; classe: string; Icona: typeof CheckCircle2 } {
  if (b.casellePronte > 0 && !b.blocchi.some((x) => x.gravita === "stop"))
    return { label: "Pronto", classe: "bg-emerald-50 text-emerald-700 border-emerald-200", Icona: CheckCircle2 };
  if (b.domini > 0 || b.caselle > 0)
    return { label: "Da completare", classe: "bg-amber-50 text-amber-700 border-amber-200", Icona: AlertTriangle };
  return { label: "Fermo", classe: "bg-slate-100 text-slate-600 border-slate-200", Icona: Pause };
}

export function OutreachLaunchReadiness({ companyId }: { companyId: string }) {
  const [aperto, setAperto] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["outreach-readiness", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<BrandStato[] | null> => {
      const { data, error } = await supabase
        .from("v_outreach_infrastruttura" as never)
        .select("*");
      if (error) {
        if (isMissingTableError(error)) return null; // vista non ancora applicata
        throw error;
      }
      return aggrega((data ?? []) as unknown as Riga[]);
    },
  });

  if (q.isLoading) return <div className="h-52 animate-pulse rounded-xl border border-border bg-card" />;
  if (!q.data || q.data.length === 0) return null;

  const brands = q.data;
  const capacitaTotale = brands.reduce((s, b) => s + b.capacitaOggi, 0);
  const pronti = brands.filter((b) => semaforo(b).label === "Pronto").length;

  return (
    <Card className="border-border">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Rocket className="h-4 w-4 text-[#F97415]" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Prontezza al lancio</h3>
              <p className="text-xs text-muted-foreground">
                {pronti} brand su {brands.length} possono spedire
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-foreground">{capacitaTotale}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">email/giorno reali</div>
          </div>
        </div>

        <ul className="divide-y divide-border">
          {brands.map((b) => {
            const s = semaforo(b);
            const stop = b.blocchi.filter((x) => x.gravita === "stop").length;
            const isOpen = aperto === b.id;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setAperto(isOpen ? null : b.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97415]/40"
                >
                  <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", s.classe)}>
                    <s.Icona className="h-3 w-3" /> {s.label}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{b.nome}</span>

                  <span className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                    <span className="inline-flex items-center gap-1" title="domini con SPF+DKIM+DMARC / totali">
                      <Globe className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{b.dominiOk}/{b.domini}</span>
                    </span>
                    <span className="inline-flex items-center gap-1" title="caselle pronte / totali">
                      <Inbox className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{b.casellePronte}/{b.caselle}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums" title="email al giorno che questo brand può davvero mandare">
                      <Mail className="h-3.5 w-3.5" />{b.capacitaOggi}
                    </span>
                  </span>

                  {stop > 0 && (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      {stop} da risolvere
                    </span>
                  )}
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-muted/20 px-5 py-3">
                    {b.blocchi.length === 0 ? (
                      <p className="flex items-center gap-2 text-sm text-emerald-700">
                        <ShieldCheck className="h-4 w-4" /> Catena completa: brand, dominio e casella a posto.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {b.blocchi.map((x, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            {x.gravita === "stop"
                              ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                              : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                            <span className={x.gravita === "stop" ? "text-foreground" : "text-muted-foreground"}>{x.testo}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
