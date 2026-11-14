/**
 * «Leggi il contratto con l'AI» su una commessa già creata (14/11/2026, fase 6 del piano anomalie).
 *
 * Stesso lettore della creazione (`ContractImportDialog` → `generic-doc-ai-extract`), poi un'anteprima di cosa
 * cambia: importo e IVA, voci da aggiungere, rate. Le rate già fatturate o incassate non si toccano
 * (`lib/orders/contrattoSuCommessa`). Si applica con `commessa_salva`, che controlla permessi, importi e versione;
 * le voci si aggiungono, il contratto originale va nei Documenti della commessa.
 *
 * Vale per la commessa del cliente privato e per quella del committente. Lo vede chi può modificare le commesse e
 * vederne gli importi, come alla creazione.
 */
import { lazy, Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScanText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import type { ContractExtract } from "@/lib/orders/contractExtract";
import type { StoredContractFile } from "@/lib/orders/contractPreparation";
import {
  descrizioneVoceContratto, pianoContrattoSuCommessa, rateDaSalvare, type CommessaPerContratto, type PianoContrattoSuCommessa, type RataEsistente,
} from "@/lib/orders/contrattoSuCommessa";
import { percorsoDocumento } from "@/lib/commesse/documentiCommessa";
import { riduciFile } from "@/lib/commesse/riduciFoto";
import { caricaMiniatura } from "@/lib/commesse/miniatura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const ContractImportDialog = lazy(() => import("@/components/orders/ContractImportDialog").then((m) => ({ default: m.ContractImportDialog })));

interface Lettura {
  ex: ContractExtract;
  file: File | null;
  piano: PianoContrattoSuCommessa;
  commessa: CommessaPerContratto & { version: number | null };
  vociEsistenti: number;
  /** Il lettore l'ha già caricato fra i documenti della commessa. */
  giaNeiDocumenti: boolean;
}

const euro = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(Number(n)));

export function LeggiContrattoCommessa({ orderId, companyId, perCommittente, etichetta = "Leggi contratto con l'AI" }: {
  orderId: string;
  companyId: string;
  perCommittente: boolean;
  etichetta?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lettore, setLettore] = useState(false);
  const [preparo, setPreparo] = useState(false);
  const [lettura, setLettura] = useState<Lettura | null>(null);
  const [scelte, setScelte] = useState({ importi: true, voci: true, rate: true, documento: true });
  const [salvo, setSalvo] = useState(false);

  /** Il contratto è letto: si legge com'è la commessa adesso e si prepara l'anteprima. */
  const preparaAnteprima = async (ex: ContractExtract, file?: File | null, origine?: StoredContractFile | null) => {
    setLettore(false);
    setPreparo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [o, rate, voci] = await Promise.all([
        db.from("orders").select("total_amount, vat_rate, work_start_date, work_end_date, order_type, tetto_importo, riferimento_committente, version")
          .eq("id", orderId).eq("company_id", companyId).maybeSingle(),
        db.from("order_installments").select("*").eq("order_id", orderId).order("position"),
        db.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId),
      ]);
      if (o.error || rate.error || voci.error) throw o.error ?? rate.error ?? voci.error;
      if (!o.data) throw new Error("Commessa non trovata.");
      const commessa = o.data as Lettura["commessa"];
      const piano = pianoContrattoSuCommessa(ex, commessa, (rate.data ?? []) as RataEsistente[]);
      const vociEsistenti = voci.count ?? 0;
      setScelte({
        importi: piano.campi.total_amount != null || piano.campi.vat_rate != null,
        // Se la commessa ha già voci, aggiungerne altre è una scelta da fare guardando.
        voci: piano.voci.length > 0 && vociEsistenti === 0,
        rate: !!piano.rateNuove,
        documento: !!file && !(origine?.path?.startsWith(`${orderId}/`)),
      });
      const giaNeiDocumenti = !!origine?.path?.startsWith(`${orderId}/`);
      setLettura({ ex, file: file ?? null, piano, commessa, vociEsistenti, giaNeiDocumenti });
    } catch (e) {
      toast.error("Non riesco a leggere la commessa", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPreparo(false);
    }
  };

  const applica = async () => {
    if (!lettura) return;
    const { piano, commessa, file } = lettura;
    setSalvo(true);
    const fatti: string[] = [];
    try {
      const campiAltri = Object.fromEntries(Object.entries(piano.campi).filter(([k]) => !["total_amount", "vat_rate"].includes(k)));
      const campi = scelte.importi ? piano.campi : campiAltri;
      const rate = scelte.rate ? rateDaSalvare(piano) : null;
      if (Object.keys(campi).length > 0 || rate) {
        const { error } = await supabase.rpc("commessa_salva", {
          p_commessa: orderId,
          p_campi: Object.keys(campi).length > 0 ? campi : null,
          p_rate: rate,
          p_versione: commessa.version,
        } as never);
        if (error) {
          if (["PT409", "40001"].includes(error.code ?? "")) throw new Error("Qualcuno ha modificato la commessa nel frattempo: ricarica e rileggi il contratto.");
          throw new Error((error.message ?? "Salvataggio non riuscito").replace(/^commessa_salva:\s*/, ""));
        }
        if (scelte.importi && piano.campi.total_amount != null) fatti.push("importo");
        if (rate) fatti.push(`${piano.rateNuove?.length ?? 0} rate`);
      }
      if (scelte.voci && piano.voci.length > 0) {
        // Come le altre pagine: la funzione controlla permesso e visibilità della commessa (un utente d'ufficio senza
        // i costi non può scrivere order_items direttamente). Il prezzo di vendita non sta sulla voce, che è un
        // acquisto: quello del contratto resta scritto nella descrizione.
        const { error } = await supabase.rpc("commessa_aggiungi_voci", {
          p_commessa: orderId,
          p_voci: piano.voci.map((v) => ({
            name: v.name, quantity: v.quantity, vat_rate: v.vat_rate, status: "da_ordinare",
            description: descrizioneVoceContratto(v),
          })),
        } as never);
        if (error) throw new Error(`Importi e rate salvati, ma le voci no: ${error.message}`);
        fatti.push(`${piano.voci.length} voci`);
      }
      // L'originale l'ha già messo nei documenti il lettore (serve per farlo leggere all'AI): qui niente doppione.
      if (scelte.documento && file && user && !lettura.giaNeiDocumenti) {
        try {
          const { file: ridotto } = await riduciFile(file);
          const percorso = percorsoDocumento(orderId, ridotto.name);
          const { error: eUp } = await supabase.storage.from("order-attachments").upload(percorso, ridotto, { contentType: ridotto.type || undefined });
          if (eUp) throw eUp;
          const miniatura = await caricaMiniatura("order-attachments", percorso, ridotto);
          const { error: eDb } = await supabase.from("order_attachments").insert({
            order_id: orderId, file_name: ridotto.name, file_url: percorso, file_type: ridotto.type || "application/octet-stream",
            file_size: ridotto.size, uploaded_by: user.id, visible_to_customer: false, thumb_path: miniatura,
          } as never);
          if (eDb) {
            await supabase.storage.from("order-attachments").remove(miniatura ? [percorso, miniatura] : [percorso]);
            throw eDb;
          }
          fatti.push("contratto nei documenti");
        } catch (e) {
          toast.error("Il contratto originale non è stato salvato nei documenti", { description: e instanceof Error ? e.message : String(e) });
        }
      }
      toast.success("Contratto applicato alla commessa", { description: fatti.length ? fatti.join(" · ") : "Nessuna modifica scelta." });
      setLettura(null);
    } catch (e) {
      toast.error("Contratto non applicato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvo(false);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(orderId) });
    }
  };

  const p = lettura?.piano;
  const sommaRate = (r: { amount: number }[]) => r.reduce((s, x) => s + Number(x.amount || 0), 0);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" disabled={preparo} onClick={() => setLettore(true)}>
        {preparo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} {etichetta}
      </Button>
      {lettore && (
        <Suspense fallback={<p role="status">Apertura lettore…</p>}>
          <ContractImportDialog open companyId={companyId} orderId={orderId} destinazione={perCommittente ? "appaltatore" : "cliente"}
            onOpenChange={setLettore} onApply={(ex, file, origine) => void preparaAnteprima(ex, file, origine)} />
        </Suspense>
      )}
      <Dialog open={!!lettura} onOpenChange={(o) => !o && !salvo && setLettura(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Applica il contratto alla commessa</DialogTitle>
            <DialogDescription>Scegli cosa prendere dal contratto. Le rate già fatturate o incassate restano come sono.</DialogDescription>
          </DialogHeader>
          {lettura && p && (
            <div className="space-y-4 text-sm">
              {p.avvisi.length > 0 && (
                <Alert><AlertDescription><ul className="list-disc space-y-0.5 pl-4">{p.avvisi.map((a) => <li key={a}>{a}</li>)}</ul></AlertDescription></Alert>
              )}

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.importi} disabled={p.campi.total_amount == null && p.campi.vat_rate == null}
                  onCheckedChange={(v) => setScelte({ ...scelte, importi: v === true })} aria-label="Importo e IVA" />
                <span>
                  <span className="font-medium">Importo e IVA</span>
                  <span className="block text-muted-foreground">
                    Imponibile {euro(lettura.commessa.total_amount)} → <b>{euro(p.imponibile)}</b>
                    {" · "}IVA {lettura.commessa.vat_rate ?? "—"}% → <b>{p.iva ?? "—"}%</b>
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.voci} disabled={p.voci.length === 0}
                  onCheckedChange={(v) => setScelte({ ...scelte, voci: v === true })} aria-label="Voci del contratto" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">Aggiungi {p.voci.length} voci del contratto</span>
                  <span className="block text-muted-foreground">
                    {lettura.vociEsistenti > 0 ? `La commessa ha già ${lettura.vociEsistenti} voci: queste si aggiungono, nessuna viene tolta.` : "La commessa non ha voci."}
                  </span>
                  {p.voci.length > 0 && (
                    <ul className="mt-1 max-h-32 overflow-y-auto rounded border text-xs">
                      {p.voci.map((v, i) => (
                        <li key={i} className="flex justify-between gap-2 border-b px-2 py-1 last:border-0">
                          <span className="truncate">{v.name}</span>
                          <span className="shrink-0 tabular-nums">{v.quantity} × {euro(v.unit_price)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </label>

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.rate} disabled={!p.rateNuove}
                  onCheckedChange={(v) => setScelte({ ...scelte, rate: v === true })} aria-label="Rate del contratto" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">Rate dal contratto</span>
                  {p.rateNuove ? (
                    <span className="block text-muted-foreground">
                      {p.rateTenute.length > 0 && <>Restano {p.rateTenute.length} rate fatturate o incassate ({euro(sommaRate(p.rateTenute))}). </>}
                      {p.rateSostituite.length > 0 ? <>Sostituisce {p.rateSostituite.length} rate da incassare ({euro(sommaRate(p.rateSostituite))}). </> : null}
                    </span>
                  ) : <span className="block text-muted-foreground">Nessun piano dei pagamenti nel contratto.</span>}
                  {p.rateNuove && p.rateNuove.length > 0 && (
                    <ul className="mt-1 rounded border text-xs">
                      {p.rateNuove.map((r) => (
                        <li key={r.position} className="flex justify-between gap-2 border-b px-2 py-1 last:border-0">
                          <span className="truncate">{r.label}</span><span className="shrink-0 tabular-nums">{euro(r.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </label>

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.documento || lettura.giaNeiDocumenti} disabled={!lettura.file || lettura.giaNeiDocumenti}
                  onCheckedChange={(v) => setScelte({ ...scelte, documento: v === true })} aria-label="Salva il contratto nei documenti" />
                <span>
                  <span className="font-medium">Salva il contratto nei documenti della commessa</span>
                  <span className="block text-muted-foreground">
                    {lettura.giaNeiDocumenti ? `${lettura.file?.name ?? "Il contratto"} è già nei documenti, salvato alla lettura.` : lettura.file ? lettura.file.name : "Il file non è disponibile."} Non visibile al cliente.
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={salvo} onClick={() => setLettura(null)}>Annulla</Button>
            <Button disabled={salvo || !lettura || !Object.values(scelte).some(Boolean)} onClick={() => void applica()}>
              {salvo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Applica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
