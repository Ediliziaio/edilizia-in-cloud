import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bankRpc, type BankMovement } from "@/lib/finance/bankWorkspace";
import { syncBankExternalPayments } from "@/lib/finance/bankExternalPayments";
import { formatTreasuryCurrency as money } from "@/lib/treasury";
import { formatDateIt } from "@/lib/formatters";

/**
 * Il motore degli esiti della tesoreria (tesoreria_esito_movimento): per ogni
 * movimento dice com'è messo (pronto, proposta, scelta, conflitto, da gestire),
 * di che natura è, perché, cosa manca, e le alternative di abbinamento. Le righe
 * delle alternative si confermano con la conferma di sempre
 * (bank_conferma_ripartizione), che ricontrolla residui e concorrenza.
 */

export type EsitoCodice = "automatico" | "proposta" | "scelta" | "conflitto" | "da_gestire";
export interface RigaEsito {
  tipo: "documento" | "invoice" | "scadenza" | "rata" | "movimento";
  id: string;
  titolo: string;
  controparte?: string | null;
  residuo: number;
  quota: number;
}
export interface CandidatoEsito {
  chiave: string;
  forza: "forte" | "media" | "debole";
  motivi: string[];
  conflitti?: string[];
  righe: RigaEsito[];
}
export interface EsitoMovimentoDati {
  esito: EsitoCodice;
  natura: string;
  regola?: string;
  motivi?: string[];
  conflitti?: (string | { titolo?: string; motivi?: string[] })[];
  mancanti?: string[];
  differenza?: number;
  nota?: string | null;
  candidati?: CandidatoEsito[];
  ripartizione_da_completare?: boolean;
  calcolato_at?: string | null;
  scartato_at?: string | null;
  scartato_motivo?: string | null;
  storia?: { il: string; evento: string; esito?: string; natura?: string; regola?: string; da?: string | null }[];
}

export const ETICHETTA_ESITO: Record<EsitoCodice, { label: string; className: string }> = {
  automatico: { label: "Pronto da confermare", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  proposta: { label: "Proposta", className: "border-amber-200 bg-amber-50 text-amber-700" },
  scelta: { label: "Da scegliere", className: "border-amber-200 bg-amber-50 text-amber-700" },
  conflitto: { label: "Conflitto", className: "border-red-200 bg-red-50 text-red-700" },
  da_gestire: { label: "Da gestire", className: "text-muted-foreground" },
};

export const NATURA: Record<string, string> = {
  documento: "Una fattura",
  cumulativo: "Più fatture insieme",
  parziale: "Pagamento parziale",
  eccedenza: "Oltre il dovuto",
  acconto: "Acconto",
  compensazione_nc: "Con nota di credito",
  differenza: "Con differenza",
  giroconto: "Giroconto",
  f24: "F24",
  storno: "Storno o rimborso",
  spesa_bancaria: "Spesa bancaria",
  spesa_carta: "Spesa con carta",
  gia_riconciliato: "Già collegato",
  sconosciuta: "Da capire",
};

const EVENTO_STORIA: Record<string, string> = {
  calcolo: "calcolata",
  scartato: "scartata",
  confermato_clic: "confermata a mano",
  confermato_auto: "confermata in automatico",
};

const testoConflitto = (c: string | { titolo?: string; motivi?: string[] }) =>
  typeof c === "string" ? c : [c.titolo, ...(c.motivi ?? [])].filter(Boolean).join(": ");

/** Si conferma da qui solo un'alternativa fatta di fatture e scadenze con quota positiva. */
export const confermabile = (c: CandidatoEsito) =>
  c.righe.length > 0 && c.righe.every((r) => ["documento", "invoice", "scadenza"].includes(r.tipo) && Number(r.quota) > 0);

export function useEsitoMovimento(company: string, tx: string) {
  return useQuery({
    queryKey: ["tesoreria-esito", company, tx],
    retry: false,
    queryFn: async (): Promise<EsitoMovimentoDati | null> => {
      // Esito e alternative calcolati adesso (senza scrivere): dopo un collegamento sono già giusti.
      // Da quello registrato dal cron si prendono solo lo scarto e lo storico.
      const [vivo, salvato] = await Promise.all([
        bankRpc<EsitoMovimentoDati | null>("tesoreria_classifica_movimento", { p_company: company, p_tx: tx }),
        bankRpc<EsitoMovimentoDati | null>("tesoreria_esito_movimento", { p_company: company, p_tx: tx }).catch((): null => null),
      ]);
      const valido = (x: unknown): x is EsitoMovimentoDati => !!x && typeof x === "object" && !Array.isArray(x) && typeof (x as EsitoMovimentoDati).esito === "string";
      if (!valido(vivo)) return valido(salvato) ? salvato : null;
      return { ...vivo, storia: valido(salvato) ? salvato.storia ?? [] : [], scartato_at: valido(salvato) ? salvato.scartato_at ?? null : null, scartato_motivo: valido(salvato) ? salvato.scartato_motivo ?? null : null };
    },
  });
}

/** Etichetta per la testata: niente per i movimenti già chiusi. */
export function BadgeEsito({ esito }: { esito: EsitoMovimentoDati | null | undefined }) {
  if (!esito || esito.natura === "gia_riconciliato" || esito.scartato_at) return null;
  const e = ETICHETTA_ESITO[esito.esito];
  if (!e) return null;
  return <Badge variant="outline" className={e.className} title={NATURA[esito.natura] ?? esito.natura}>{e.label}</Badge>;
}

/**
 * Riga «Esito» di «A cosa è collegato»: natura, motivi, conflitti e cosa manca,
 * con «Scarta proposta» (motivo obbligatorio) e lo storico dei calcoli.
 */
export function RigaEsitoMovimento({ company, movement: m, esito, puoScrivere, onCambiato }: {
  company: string;
  movement: BankMovement;
  esito: EsitoMovimentoDati;
  puoScrivere: boolean;
  onCambiato: () => void;
}) {
  const [scarto, setScarto] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const e = ETICHETTA_ESITO[esito.esito];
  const conflitti = (esito.conflitti ?? []).map(testoConflitto).filter(Boolean);
  // «Unico e verificato» su una fattura o un giroconto: si conferma con un clic, a nome di chi clicca.
  // Il database ricontrolla tutto e rifiuta se l'esito non è più quello (messaggio mostrato così com'è).
  const confermaClic = puoScrivere && !esito.scartato_at && esito.esito === "automatico" && ["documento", "giroconto"].includes(esito.natura);
  async function confermaEsito() {
    if (inCorso) return;
    setInCorso(true);
    try {
      await bankRpc("tesoreria_conferma_esito", { p_company: company, p_tx: m.id });
      toast.success(esito.natura === "giroconto" ? "Giroconto confermato" : "Collegamento confermato");
      onCambiato();
    } catch (err) {
      toast.error("Non confermato", { description: err instanceof Error ? err.message : undefined });
      onCambiato();
    } finally {
      setInCorso(false);
    }
  }
  const scartabile = puoScrivere && !esito.scartato_at && esito.natura !== "gia_riconciliato" && (esito.candidati?.length ?? 0) > 0;
  async function scarta() {
    const motivo = (scarto ?? "").trim();
    if (motivo.length < 3 || inCorso) return;
    setInCorso(true);
    try {
      await bankRpc("tesoreria_scarta_esito", { p_company: company, p_tx: m.id, p_motivo: motivo });
      toast.success("Proposta scartata");
      setScarto(null);
      onCambiato();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Proposta non scartata");
    } finally {
      setInCorso(false);
    }
  }
  return (
    <div className="w-full min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {e && <Badge variant="outline" className={e.className}>{e.label}</Badge>}
        <span className="font-medium">{NATURA[esito.natura] ?? esito.natura}</span>
        {(esito.motivi ?? []).length > 0 && <span className="text-xs text-muted-foreground">· {esito.motivi!.join(" · ")}</span>}
        {Number(esito.differenza) > 0 && <span className="text-xs text-amber-700">· differenza {money(Number(esito.differenza), "—", m.currency)}</span>}
      </div>
      {esito.nota && <p className="text-xs text-muted-foreground">{esito.nota}</p>}
      {conflitti.map((c, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-red-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{c}</p>
      ))}
      {(esito.mancanti ?? []).map((c, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground"><CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />{c}</p>
      ))}
      {esito.ripartizione_da_completare && <p className="text-xs text-amber-700">Il documento è su più commesse senza le quote: la ripartizione va completata.</p>}
      {esito.scartato_at && (
        <p className="text-xs text-muted-foreground">Proposta scartata il {formatDateIt(esito.scartato_at)}{esito.scartato_motivo ? `: ${esito.scartato_motivo}` : ""}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {confermaClic && (
          <Button size="sm" className="h-7" disabled={inCorso} onClick={() => void confermaEsito()}>
            {inCorso && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}<CheckCircle2 className="mr-1 h-3.5 w-3.5" />Conferma
          </Button>
        )}
        {scartabile && scarto === null && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setScarto("")}>Scarta proposta</Button>
        )}
        {(esito.storia?.length ?? 0) > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Storico ({esito.storia!.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {esito.storia!.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  {formatDateIt(h.il)} · {EVENTO_STORIA[h.evento] ?? h.evento}
                  {h.esito ? ` · ${ETICHETTA_ESITO[h.esito as EsitoCodice]?.label ?? h.esito}` : ""}
                  {h.natura ? ` · ${NATURA[h.natura] ?? h.natura}` : ""}
                  {h.regola ? ` (${h.regola})` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {scarto !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={scarto} onChange={(ev) => setScarto(ev.target.value)} placeholder="Perché la scarti? (resta nello storico)" className="h-8 max-w-sm text-sm"
            aria-label="Motivo dello scarto" autoFocus onKeyDown={(ev) => { if (ev.key === "Enter") void scarta(); }} />
          <Button size="sm" className="h-8" disabled={inCorso || scarto.trim().length < 3} onClick={() => void scarta()}>
            {inCorso && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Scarta
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setScarto(null)}>Annulla</Button>
        </div>
      )}
    </div>
  );
}

/** Dentro «Fatture e pagamenti»: le alternative del motore, ognuna con i suoi motivi e le sue quote. */
export function AlternativeEsito({ company, movement: m, esito, puoAbbinare, onAbbinato }: {
  company: string;
  movement: BankMovement;
  esito: EsitoMovimentoDati;
  puoAbbinare: boolean;
  onAbbinato: () => void;
}) {
  const [inCorso, setInCorso] = useState<string | null>(null);
  const candidati = esito.scartato_at || esito.natura === "gia_riconciliato" ? [] : esito.candidati ?? [];
  if (!candidati.length) return null;
  async function conferma(c: CandidatoEsito) {
    if (inCorso) return;
    setInCorso(c.chiave);
    let salvato = false;
    try {
      const righe = c.righe.map((r) => ({ tipo: r.tipo, id: r.id, importo: Math.round(Number(r.quota) * 100) / 100 }));
      const result = await bankRpc<{ esterne?: { invoice_id: string; provider: string; saldata: boolean; importo: number; numero: string }[] }>(
        "bank_conferma_ripartizione", { p_company: company, p_tx: m.id, p_rows: righe, p_note: null },
      );
      salvato = true;
      const falliti = await syncBankExternalPayments([{ id: m.id, booking_date: m.booking_date, result }]);
      toast.success(c.righe.length === 1 ? `Collegato a ${c.righe[0].titolo}` : `Collegato a ${c.righe.length} documenti`);
      if (falliti.length) toast.warning(`Pagamento salvato, aggiornamento esterno da riprovare: ${falliti.join(", ")}`);
    } catch (err) {
      if (salvato) toast.warning("Collegamento salvato, aggiornamento esterno da riprovare");
      else toast.error(err instanceof Error ? err.message : "Collegamento non riuscito");
    } finally {
      setInCorso(null);
      if (salvato) onAbbinato();
    }
  }
  const valuta = (n: number) => money(n, "—", m.currency);
  return (
    <div className="w-full min-w-0 basis-full space-y-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />{candidati.length === 1 ? "Proposta" : `${candidati.length} alternative`}
      </p>
      <ul className="divide-y rounded-lg border bg-card">
        {candidati.map((c) => {
          const totale = c.righe.reduce((s, r) => s + Number(r.quota), 0);
          const ok = puoAbbinare && confermabile(c) && totale <= m.links.remaining + 0.004;
          return (
            <li key={c.chiave} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 sm:flex-nowrap">
              <div className="min-w-0 flex-1 max-sm:order-first max-sm:basis-full">
                <p className="truncate font-medium" title={c.righe.map((r) => r.titolo).join(" · ")}>
                  {c.righe.map((r) => r.titolo).join(" + ")}
                  {c.righe[0]?.controparte && <span className="font-normal text-muted-foreground"> · {c.righe[0].controparte}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={c.motivi.join(" · ")}>{c.motivi.join(" · ")}</p>
                {(c.conflitti ?? []).length > 0 && <p className="truncate text-xs text-red-700">{c.conflitti!.join(" · ")}</p>}
              </div>
              <Badge variant="outline" className={c.forza === "forte" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : c.forza === "media" ? "border-amber-200 bg-amber-50 text-amber-700" : "text-muted-foreground"}
                title="Quanto è sicura l'alternativa">
                {c.forza === "forte" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}{c.forza}
              </Badge>
              <span className="shrink-0 tabular-nums">{valuta(totale)}</span>
              {ok ? (
                <Button size="sm" className="h-7" variant={c.forza === "forte" ? "default" : "outline"} disabled={!!inCorso} onClick={() => void conferma(c)}
                  aria-label={`Conferma ${c.righe.map((r) => r.titolo).join(" + ")}`}>
                  {inCorso === c.chiave && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Conferma
                </Button>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground" title="Questa alternativa si collega da «Collega»">a mano</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
