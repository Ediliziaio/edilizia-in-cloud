/**
 * Tesoreria → Impostazioni: i riferimenti che il motore degli esiti usa come prova certa.
 * - IBAN verificati dei clienti: li aggiunge una persona con «Ricorda questo IBAN» su un incasso
 *   già collegato (Dettaglio movimento); qui si vedono e si revocano.
 * - Pagatori per conto di altri: un bonifico che arriva da un soggetto diverso dall'intestatario
 *   della fattura vale solo con un rapporto scritto, con la prova (delega, contratto, mail).
 * docs/automazioni-tesoreria-cdg.md, lotto 4.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Plus, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { bankRpc } from "@/lib/finance/bankWorkspace";
import { formatDateIt } from "@/lib/formatters";

export interface IbanCliente { id: string; cliente: string | null; chiave_fiscale: string; iban: string; confermato_at: string }
export interface Pagante { id: string; intestatario: string; pagante: string | null; iban: string | null; prova: string; created_at: string }
export interface Riferimenti { iban_clienti: IbanCliente[]; paganti: Pagante[] }

export const chiaveRiferimenti = (companyId: string) => ["tesoreria-riferimenti-verificati", companyId] as const;

/** Form del rapporto col pagante: usato qui e dal conflitto «pagante diverso» del Dettaglio movimento. */
export function FormPagante({ companyId, iniziale, onFatto, onAnnulla }: {
  companyId: string;
  iniziale?: { intestatario?: string; pagante?: string; iban?: string | null };
  onFatto: () => void;
  onAnnulla?: () => void;
}) {
  const [intestatario, setIntestatario] = useState(iniziale?.intestatario ?? "");
  const [pagante, setPagante] = useState(iniziale?.pagante ?? "");
  const [iban, setIban] = useState(iniziale?.iban ?? "");
  const [prova, setProva] = useState("");
  const [salvo, setSalvo] = useState(false);
  const pronto = intestatario.trim().length >= 2 && (pagante.trim() || iban.trim()) && prova.trim().length >= 3;
  async function salva() {
    if (!pronto || salvo) return;
    setSalvo(true);
    try {
      await bankRpc("tesoreria_registra_pagante", {
        p_company: companyId, p_soggetto_nome: intestatario.trim(), p_pagante_nome: pagante.trim() || null,
        p_pagante_iban: iban.trim() || null, p_prova: prova.trim(),
      });
      toast.success("Rapporto registrato: i pagamenti di questo pagante valgono per l'intestatario");
      onFatto();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rapporto non registrato");
    } finally {
      setSalvo(false);
    }
  }
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="pagante-intestatario" className="text-xs">Intestatario delle fatture</Label>
        <Input id="pagante-intestatario" value={intestatario} onChange={(e) => setIntestatario(e.target.value)} className="h-8" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pagante-nome" className="text-xs">Chi paga</Label>
        <Input id="pagante-nome" value={pagante} onChange={(e) => setPagante(e.target.value)} className="h-8" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pagante-iban" className="text-xs">IBAN di chi paga (facoltativo)</Label>
        <Input id="pagante-iban" value={iban ?? ""} onChange={(e) => setIban(e.target.value)} className="h-8 font-mono text-xs" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pagante-prova" className="text-xs">Prova del rapporto</Label>
        <Input id="pagante-prova" value={prova} onChange={(e) => setProva(e.target.value)} placeholder="Delega del 01/11, contratto, mail del cliente…" className="h-8" />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onAnnulla && <Button size="sm" variant="ghost" onClick={onAnnulla}>Annulla</Button>}
        <Button size="sm" disabled={!pronto || salvo} onClick={() => void salva()}>Registra il rapporto</Button>
      </div>
    </div>
  );
}

export function RiferimentiVerificati({ companyId, puoScrivere }: { companyId: string; puoScrivere: boolean }) {
  const qc = useQueryClient();
  const [nuovo, setNuovo] = useState(false);
  const q = useQuery({
    queryKey: chiaveRiferimenti(companyId),
    enabled: !!companyId,
    queryFn: () => bankRpc<Riferimenti>("tesoreria_riferimenti_verificati", { p_company: companyId }),
  });
  const aggiorna = (): void => { void qc.invalidateQueries({ queryKey: chiaveRiferimenti(companyId) }); };
  async function revoca(fn: "tesoreria_revoca_iban_cliente" | "tesoreria_revoca_pagante", id: string, testo: string) {
    try {
      await bankRpc(fn, { p_company: companyId, p_id: id });
      toast.success(testo);
      aggiorna();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Non revocato");
    }
  }
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError) return <p className="text-sm text-muted-foreground">Riferimenti verificati non disponibili per il tuo ruolo.</p>;
  const { iban_clienti = [], paganti = [] } = q.data ?? { iban_clienti: [], paganti: [] };
  return (
    <section className="space-y-4" aria-labelledby="riferimenti-verificati">
      <div>
        <h3 id="riferimenti-verificati" className="flex items-center gap-2 font-semibold"><UserCheck className="h-4 w-4" /> Riferimenti verificati</h3>
        <p className="text-sm text-muted-foreground">
          Quello che la riconciliazione considera certo. Un pagamento da solo non crea mai un riferimento: lo conferma una persona.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 py-3">
          <p className="flex items-center gap-2 text-sm font-medium"><Landmark className="h-4 w-4 text-muted-foreground" /> IBAN dei clienti</p>
          {iban_clienti.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessuno. Si aggiungono dal dettaglio di un incasso già collegato a una fattura, con «Ricorda questo IBAN».</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {iban_clienti.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.cliente ?? r.chiave_fiscale}</span>
                  <span className="font-mono text-xs">{r.iban}</span>
                  <span className="text-xs text-muted-foreground">dal {formatDateIt(r.confermato_at)}</span>
                  {puoScrivere && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Revoca IBAN di ${r.cliente ?? r.chiave_fiscale}`}
                      onClick={() => void revoca("tesoreria_revoca_iban_cliente", r.id, "IBAN revocato")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Chi paga per conto di altri</p>
            {puoScrivere && !nuovo && (
              <Button size="sm" variant="outline" onClick={() => setNuovo(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi</Button>
            )}
          </div>
          {nuovo && <FormPagante companyId={companyId} onFatto={() => { setNuovo(false); aggiorna(); }} onAnnulla={() => setNuovo(false)} />}
          {paganti.length === 0 && !nuovo ? (
            <p className="text-xs text-muted-foreground">Nessuno. Un bonifico da un soggetto diverso dall'intestatario resta in conflitto finché non c'è il rapporto.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {paganti.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate"><span className="font-medium">{p.pagante ?? p.iban}</span> paga per <span className="font-medium">{p.intestatario}</span></span>
                  <span className="truncate text-xs text-muted-foreground" title={p.prova}>{p.prova}</span>
                  {puoScrivere && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Revoca il rapporto di ${p.pagante ?? p.iban}`}
                      onClick={() => void revoca("tesoreria_revoca_pagante", p.id, "Rapporto revocato")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
