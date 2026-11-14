/**
 * «Preventivi» nella scheda committente (10/11/2026, approvato da Florin).
 *
 * I preventivi sono quelli classici, fatti col preventivatore di sempre e legati al committente
 * (quotes.customer_id). Qui si vedono con numero, data, importo e stato, e si fa quello che lo stato chiede:
 *  - accettato → nuova commessa (il firmato è il contratto) o lavoro extra su una commessa già aperta;
 *  - rifiutato → resta nello storico col motivo, e se ne fa una revisione da rimandare;
 *  - scaduto → «Cosa fare adesso» lo propone da richiamare; anche lui si può rivedere.
 * Gli euro si vedono solo col permesso sugli importi.
 *
 * Dal 14/11/2026 lo stesso riquadro sta anche nella scheda del cliente privato (`perPrivato`): stesse azioni, senza
 * i testi «a corpo / contratto del committente». I preventivi dei moduli (fotovoltaico, serramenti…) non stanno in
 * `quotes`: arrivano in `altri` e restano collegamenti, la commessa si fa dal loro preventivatore.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature, GitBranch, HardHat, Loader2, Plus, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { euro } from "@/lib/clienti/schedaCliente";
import { duplicaPreventivo } from "@/lib/quotes/duplicaPreventivo";
import { convertiPreventivoInCantiere } from "@/lib/quotes/convertiPreventivoInCantiere";
import {
  MOTIVI_RIFIUTO, STATI_COMMITTENTE, daDecidere, datiRifiuto, etichettaRifiuto, numeroPreventivo, statoCommittente,
  type MotivoRifiuto, type PreventivoCommittente,
} from "@/lib/preventivi/preventiviCommittente";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type PreventivoScheda = PreventivoCommittente & { source?: string | null };
export interface CommessaScheda { id: string; order_code: string | null; description: string | null; quote_id?: string | null }
/** Un preventivo di un modulo (fotovoltaico, serramenti…): solo da aprire. */
export interface PreventivoAltro { id: string; quote_number: string | null; title: string | null; total: number | null; status: string | null; created_at: string }

const giornoIT = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function PreventiviCommittente({
  committenteId, companyId, preventivi, caricamento, errore, commesse, oggi, vedeImporti, puoPreventivi, puoCommesse,
  perPrivato = false, altri = [],
}: {
  committenteId: string;
  companyId: string;
  preventivi: PreventivoScheda[];
  caricamento: boolean;
  errore: boolean;
  commesse: CommessaScheda[];
  oggi: string;
  vedeImporti: boolean;
  puoPreventivi: boolean;
  puoCommesse: boolean;
  /** Scheda del cliente privato: testi da cliente, chiave di cache sua. */
  perPrivato?: boolean;
  altri?: PreventivoAltro[];
}) {
  const chi = perPrivato ? "cliente" : "committente";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rifiuto, setRifiuto] = useState<{ q: PreventivoScheda; motivo: MotivoRifiuto | null; testo: string } | null>(null);
  const [commessaDa, setCommessaDa] = useState<PreventivoScheda | null>(null);
  const [extraDa, setExtraDa] = useState<{ q: PreventivoScheda; orderId: string } | null>(null);
  const ricarica = () => {
    queryClient.invalidateQueries({ queryKey: ["preventivi-committente"] });
    queryClient.invalidateQueries({ queryKey: ["preventivi-cliente"] });
    queryClient.invalidateQueries({ queryKey: ["scheda-cliente"] });
  };
  const commessaDi = (quoteId: string) => commesse.find((o) => o.quote_id === quoteId);

  const segnaRifiutato = useMutation({
    mutationFn: async (r: { q: PreventivoScheda; motivo: MotivoRifiuto | null; testo: string }) => {
      const dati = datiRifiuto(r.motivo, r.testo);
      const { data, error } = await supabase.from("quotes").update(dati as never)
        .eq("id", r.q.id).eq("company_id", companyId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Non hai il permesso di modificare questo preventivo.");
    },
    onSuccess: () => { setRifiuto(null); ricarica(); toast.success("Segnato come rifiutato"); },
    onError: (e) => toast.error("Non salvato", { description: e instanceof Error ? e.message : String(e) }),
  });

  const revisione = useMutation({
    mutationFn: async (q: PreventivoScheda) => (await duplicaPreventivo(q.id, companyId, { comeRevisione: true })).id,
    onSuccess: (id) => { ricarica(); toast.success("Revisione creata", { description: "Parte in bozza: correggila e rimandala." }); navigate(`/azienda/marketing/preventivi/${id}/modifica`); },
    onError: (e) => toast.error("Revisione non creata", { description: e instanceof Error ? e.message : String(e) }),
  });

  const nuovaCommessa = useMutation({
    mutationFn: async (q: PreventivoScheda) => convertiPreventivoInCantiere(q.id, q.version ?? undefined),
    onSuccess: (esito) => {
      setCommessaDa(null);
      ricarica();
      if (esito.avviso) toast.warning("Commessa creata, ma non completa", { description: esito.avviso, duration: 12000 });
      else toast.success("Commessa creata dal preventivo");
      navigate(`/azienda/ordini/${esito.orderId}`);
    },
    onError: (e) => toast.error("Commessa non creata", { description: e instanceof Error ? e.message : String(e) }),
  });

  const nuovoPreventivo = () => navigate(`/azienda/marketing/preventivi/nuovo?customer_id=${committenteId}`);

  return (
    <div className="space-y-2 p-1">
      {puoPreventivi && (
        <Button size="sm" variant="outline" className="w-full" onClick={nuovoPreventivo}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuovo preventivo
        </Button>
      )}
      {caricamento ? (
        <Skeleton className="h-24 w-full" />
      ) : errore ? (
        <p className="text-sm text-destructive">Non riesco a leggere i preventivi: riprova tra poco.</p>
      ) : preventivi.length === 0 && altri.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun preventivo a questo {chi}.</p>
      ) : (
        <ul className="divide-y" aria-label={`Preventivi del ${chi}`}>
          {preventivi.map((q) => {
            const stato = statoCommittente(q, oggi);
            const conf = STATI_COMMITTENTE[stato];
            const commessa = commessaDi(q.id);
            const diModulo = (q.source ?? "").startsWith("modulo:");
            const decidere = !diModulo && daDecidere(q, !!commessa);
            const motivo = stato === "rifiutato" ? etichettaRifiuto(q.refused_motivo, q.refused_reason) : "";
            return (
              <li key={q.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <button type="button" className="min-w-0 truncate text-left text-sm font-medium hover:underline"
                    onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}>
                    {numeroPreventivo(q)}
                  </button>
                  {vedeImporti && <span className="shrink-0 text-sm font-medium tabular-nums">{q.total == null ? "—" : euro(q.total, true)}</span>}
                </div>
                {q.title && <p className="line-clamp-1 text-xs text-muted-foreground">{q.title}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-normal", conf.className)}>{conf.label}</Badge>
                  <span>{giornoIT(q.created_at)}</span>
                  {(stato === "inviato" || stato === "scaduto") && q.expires_at && <span>{stato === "scaduto" ? "scaduto il" : "valido fino al"} {giornoIT(q.expires_at)}</span>}
                  {motivo && <span className="text-red-700">{motivo}</span>}
                  {commessa && (
                    <button type="button" className="text-primary hover:underline" onClick={() => navigate(`/azienda/ordini/${commessa.id}`)}>
                      Commessa {commessa.order_code ?? ""}
                    </button>
                  )}
                  {q.variante_id && <span>Lavoro extra su commessa</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
                  {decidere && puoCommesse && (
                    <>
                      <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCommessaDa(q)}>
                        <HardHat className="h-3.5 w-3.5" /> Nuova commessa
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={commesse.length === 0}
                        title={commesse.length === 0 ? `Il ${chi} non ha commesse aperte` : undefined}
                        onClick={() => setExtraDa({ q, orderId: commesse[0]?.id ?? "" })}>
                        <GitBranch className="h-3.5 w-3.5" /> Lavoro extra
                      </Button>
                    </>
                  )}
                  {puoPreventivi && !diModulo && (stato === "inviato" || stato === "scaduto") && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setRifiuto({ q, motivo: null, testo: "" })}>
                      <XCircle className="h-3.5 w-3.5" /> Segna rifiutato
                    </Button>
                  )}
                  {puoPreventivi && !diModulo && (stato === "rifiutato" || stato === "scaduto") && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={revisione.isPending} onClick={() => revisione.mutate(q)}>
                      {revisione.isPending && revisione.variables?.id === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />}
                      Revisione
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {altri.map((q) => (
            <li key={q.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <button type="button" className="min-w-0 truncate text-left text-sm font-medium hover:underline"
                  onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}>
                  {q.quote_number || q.title || "Preventivo"}
                </button>
                {vedeImporti && q.total != null && <span className="shrink-0 text-sm font-medium tabular-nums">{euro(q.total, true)}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {q.title && q.quote_number && <span className="capitalize">{q.title}</span>}
                {q.status && <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">{q.status}</Badge>}
                <span>{giornoIT(q.created_at)}</span>
                <span>dal preventivatore del modulo</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Rifiutato: il motivo resta nello storico. */}
      <Dialog open={!!rifiuto} onOpenChange={(o) => !o && setRifiuto(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rifiutato · {rifiuto ? numeroPreventivo(rifiuto.q) : ""}</DialogTitle>
            <DialogDescription>Resta nello storico con il motivo. Poi puoi farne una revisione.</DialogDescription>
          </DialogHeader>
          {rifiuto && (
            <div className="space-y-3">
              <div className="flex gap-1.5" role="group" aria-label="Motivo">
                {MOTIVI_RIFIUTO.map((m) => (
                  <Button key={m.v} type="button" size="sm" variant={rifiuto.motivo === m.v ? "default" : "outline"} aria-pressed={rifiuto.motivo === m.v}
                    onClick={() => setRifiuto({ ...rifiuto, motivo: m.v })}>
                    {m.label}
                  </Button>
                ))}
              </div>
              <div>
                <Label htmlFor="rifiuto-testo">{rifiuto.motivo === "altro" ? "Motivo" : "Nota (facoltativa)"}</Label>
                <Textarea id="rifiuto-testo" rows={2} value={rifiuto.testo} onChange={(e) => setRifiuto({ ...rifiuto, testo: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRifiuto(null)}>Annulla</Button>
            <Button disabled={!rifiuto?.motivo || segnaRifiutato.isPending} onClick={() => rifiuto && segnaRifiutato.mutate(rifiuto)}>
              {segnaRifiutato.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accettato → nuova commessa: il percorso di sempre, il firmato è il contratto. */}
      <Dialog open={!!commessaDa} onOpenChange={(o) => !o && !nuovaCommessa.isPending && setCommessaDa(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova commessa · {commessaDa ? numeroPreventivo(commessaDa) : ""}</DialogTitle>
            <DialogDescription>
              {perPrivato
                ? "Il preventivo accettato è il contratto: le voci diventano le lavorazioni della commessa."
                : "Il preventivo accettato è il contratto: le voci diventano lavorazioni, a corpo, col contratto in corso del committente."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={nuovaCommessa.isPending} onClick={() => setCommessaDa(null)}>Annulla</Button>
            <Button disabled={nuovaCommessa.isPending} onClick={() => commessaDa && nuovaCommessa.mutate(commessaDa)}>
              {nuovaCommessa.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Crea commessa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accettato → lavoro extra su una commessa già aperta: si apre il flusso delle varianti della commessa. */}
      <Dialog open={!!extraDa} onOpenChange={(o) => !o && setExtraDa(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lavoro extra · {extraDa ? numeroPreventivo(extraDa.q) : ""}</DialogTitle>
            <DialogDescription>Su quale commessa? Si apre il lavoro extra già scritto con le voci del preventivo.</DialogDescription>
          </DialogHeader>
          {extraDa && (
            <Select value={extraDa.orderId} onValueChange={(v) => setExtraDa({ ...extraDa, orderId: v })}>
              <SelectTrigger aria-label="Commessa"><SelectValue /></SelectTrigger>
              <SelectContent>
                {commesse.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{[o.order_code, o.description].filter(Boolean).join(" · ") || "Commessa"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraDa(null)}>Annulla</Button>
            <Button disabled={!extraDa?.orderId}
              onClick={() => extraDa && navigate(`/azienda/ordini/${extraDa.orderId}?lavoro_extra_da=${extraDa.q.id}`)}>
              Apri il lavoro extra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
