/**
 * «Leggi il contratto con l'AI» su una commessa già creata (14/11/2026, fase 6 del piano anomalie).
 *
 * Stesso lettore della creazione (`ContractImportDialog` → `generic-doc-ai-extract`), poi un'anteprima di cosa
 * cambia: importo e IVA, voci da aggiungere, rate. Le rate già fatturate o incassate non si toccano
 * (`lib/orders/contrattoSuCommessa`). Si applica con `commessa_salva`, che controlla permessi, importi e versione;
 * le voci si aggiungono, il contratto originale va nei Documenti della commessa.
 *
 * Dal 15/11/2026 anche le fasi di lavoro lette nel contratto, se la commessa non ne ha ancora: si creano con le date
 * dei lavori, una dopo l'altra sui giorni di lavoro (stessa regola di «Nuova commessa»).
 *
 * Vale per la commessa del cliente privato e per quella del committente. Lo vede chi può modificare le commesse e
 * vederne gli importi, come alla creazione.
 */
import { righeDocumentoFirmato } from "@/lib/orders/contractPreparation";
import { lazy, Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ScanText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import { calendarioCantiere } from "@/lib/orders/sottofasi";
import { fasiColPiano, pianificaFasi } from "@/lib/orders/pianoFasiNuovaCommessa";
import { salvaFasiDiPartenza } from "@/lib/orders/pianificazioneAvvio";
import { formatCurrency } from "@/lib/formatters";
import { contractNeedsAllocation, type ContractExtract } from "@/lib/orders/contractExtract";
import type { StoredContractFile } from "@/lib/orders/contractPreparation";
import { pianoOperativoContratto, modelliDalPiano } from "@/lib/orders/pianoOperativoContratto";
import { salvaPianoOperativoContratto } from "@/lib/orders/salvaPianoOperativoContratto";
import { collegaAnalisiAllaCommessa } from "@/lib/orders/lettureContrattoSalvate";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

const ContractImportDialog = lazy(() => import("@/components/orders/ContractImportDialog").then((m) => ({ default: m.ContractImportDialog })));

interface Lettura {
  origine: StoredContractFile | null;
  ex: ContractExtract;
  file: File | null;
  piano: PianoContrattoSuCommessa;
  commessa: CommessaPerContratto & { version: number | null };
  vociEsistenti: number;
  /** Il lettore l'ha già caricato fra i documenti della commessa. */
  giaNeiDocumenti: boolean;
  /** Le note interne di adesso: le righe del documento firmato si aggiungono in fondo. */
  noteInterne: string | null;
}

const euro = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(Number(n)));

export function LeggiContrattoCommessa({ orderId, companyId, perCommittente, etichetta }: {
  orderId: string;
  companyId: string;
  perCommittente: boolean;
  etichetta?: string;
}) {
  const t = useT();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lettore, setLettore] = useState(false);
  const [preparo, setPreparo] = useState(false);
  const [lettura, setLettura] = useState<Lettura | null>(null);
  const [scelte, setScelte] = useState({ importi: true, voci: true, rate: true, fasi: true, documento: true, note: true });
  const { chiusure } = useCalendarioCantiere();
  const [salvo, setSalvo] = useState(false);

  /** Il contratto è letto: si legge com'è la commessa adesso e si prepara l'anteprima. */
  const preparaAnteprima = async (ex: ContractExtract, file?: File | null, origine?: StoredContractFile | null) => {
    setLettore(false);
    setPreparo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [o, rate, voci, fasiOra] = await Promise.all([
        db.from("orders").select("total_amount, vat_rate, work_start_date, work_end_date, order_type, tetto_importo, riferimento_committente, version, internal_notes")
          .eq("id", orderId).eq("company_id", companyId).maybeSingle(),
        db.from("order_installments").select("*").eq("order_id", orderId).order("position"),
        db.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId),
        db.from("order_work_phases").select("id", { count: "exact", head: true }).eq("order_id", orderId),
      ]);
      if (o.error || rate.error || voci.error || fasiOra.error) throw o.error ?? rate.error ?? voci.error ?? fasiOra.error;
      if (!o.data) throw new Error(t("Commessa non trovata."));
      const commessa = o.data as Lettura["commessa"];
      const piano = pianoContrattoSuCommessa(ex, commessa, (rate.data ?? []) as RataEsistente[], fasiOra.count ?? 0);
      const vociEsistenti = voci.count ?? 0;
      setScelte({
        importi: piano.campi.total_amount != null || piano.campi.vat_rate != null,
        // Se la commessa ha già voci, aggiungerne altre è una scelta da fare guardando.
        voci: piano.voci.length > 0 && vociEsistenti === 0,
        rate: !!piano.rateNuove,
        fasi: piano.fasi.length > 0,
        documento: !!file && !(origine?.path?.startsWith(`${orderId}/`)),
        note: righeDocumentoFirmato(ex).length > 0,
      });
      const giaNeiDocumenti = !!origine?.path?.startsWith(`${orderId}/`);
      setLettura({ ex, origine: origine ?? null, file: file ?? null, piano, commessa, vociEsistenti, giaNeiDocumenti, noteInterne: (o.data as { internal_notes?: string | null }).internal_notes ?? null });
    } catch (e) {
      toast.error(t("Non riesco a leggere la commessa"), { description: messaggioErrore(e) });
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
      if (lettura.origine) await collegaAnalisiAllaCommessa(companyId, orderId, lettura.origine);
      const usaPianoOperativo = !perCommittente && !contractNeedsAllocation(lettura.ex) && lettura.ex.origine_lettura !== "computo" && lettura.ex.natura_documento !== "offerta_fornitore";
      const campiAltri = Object.fromEntries(Object.entries(piano.campi).filter(([k]) => !["total_amount", "vat_rate"].includes(k)));
      const campi: Record<string, unknown> = { ...(scelte.importi ? piano.campi : campiAltri) };
      // Firma, note a mano e allegato del documento firmato: in fondo alle note interne, una volta sola (17/11/2026).
      const righe = scelte.note ? righeDocumentoFirmato(lettura.ex) : [];
      if (righe.length && !(lettura.noteInterne ?? "").includes(righe.join("\n"))) {
        campi.internal_notes = [lettura.noteInterne?.trim(), "DAL CONTRATTO FIRMATO", ...righe].filter(Boolean).join("\n");
      }
      const rate = scelte.rate ? rateDaSalvare(piano) : null;
      if (Object.keys(campi).length > 0 || rate) {
        const { error } = await supabase.rpc("commessa_salva", {
          p_commessa: orderId,
          p_campi: Object.keys(campi).length > 0 ? campi : null,
          p_rate: rate,
          p_versione: commessa.version,
        } as never);
        if (error) {
          if (["PT409", "40001"].includes(error.code ?? "")) throw new Error(t("Qualcuno ha modificato la commessa nel frattempo: ricarica e rileggi il contratto."));
          throw new Error((error.message ?? t("Salvataggio non riuscito")).replace(/^commessa_salva:\s*/, ""));
        }
        if (scelte.importi && piano.campi.total_amount != null) fatti.push(t("importo"));
        if (campi.internal_notes) fatti.push(t("note dal contratto"));
        if (rate) fatti.push(t("{n} rate", { n: piano.rateNuove?.length ?? 0 }));
      }
      if (usaPianoOperativo && (scelte.fasi || scelte.voci)) {
        const operativo = pianoOperativoContratto(lettura.ex);
        const inizio = commessa.work_start_date ?? (typeof campi.work_start_date === "string" ? campi.work_start_date : null);
        const fine = commessa.work_end_date ?? (typeof campi.work_end_date === "string" ? campi.work_end_date : null);
        const fasi = scelte.fasi ? modelliDalPiano(operativo) : [];
        const date = pianificaFasi(fasi, { inizio, fine, lavorativo: calendarioCantiere({ sabato: false, chiusure }) });
        await salvaPianoOperativoContratto({ companyId, orderId, piano: operativo, fasi: fasiColPiano(fasi, date), aggiungiArticoli: scelte.voci, vatRate: piano.iva ?? commessa.vat_rate });
        fatti.push(t("piano di lavoro e articoli collegati"));
      }
      if (!usaPianoOperativo && scelte.fasi && piano.fasi.length > 0) {
        // Le date: quelle della commessa, o quelle del contratto se si sono appena salvate.
        const inizio = commessa.work_start_date ?? (typeof campi.work_start_date === "string" ? campi.work_start_date : null);
        const fine = commessa.work_end_date ?? (typeof campi.work_end_date === "string" ? campi.work_end_date : null);
        const pianoFasi = pianificaFasi(piano.fasi, { inizio, fine, lavorativo: calendarioCantiere({ sabato: false, chiusure }) });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errFasi = await salvaFasiDiPartenza(orderId, fasiColPiano(piano.fasi, pianoFasi), (nome, args) => (supabase as any).rpc(nome, args));
        if (errFasi) throw new Error(fatti.length ? t("{elenco} salvati, ma le fasi no: {errore}", { elenco: fatti.join(", "), errore: errFasi }) : t("Fasi non create: {errore}", { errore: errFasi }));
        fatti.push(t("{n} fasi", { n: piano.fasi.length }));
      }
      if (!usaPianoOperativo && scelte.voci && piano.voci.length > 0) {
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
        if (error) throw new Error(t("Importi e rate salvati, ma le voci no: {errore}", { errore: error.message }));
        fatti.push(t("{n} voci", { n: piano.voci.length }));
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
            file_size: ridotto.size, uploaded_by: user.id, visible_to_customer: false, thumb_path: miniatura, access_scope: "vendita",
          } as never);
          if (eDb) {
            await supabase.storage.from("order-attachments").remove(miniatura ? [percorso, miniatura] : [percorso]);
            throw eDb;
          }
          fatti.push(t("contratto nei documenti"));
        } catch (e) {
          toast.error(t("Il contratto originale non è stato salvato nei documenti"), { description: messaggioErrore(e) });
        }
      }
      toast.success(t("Contratto applicato alla commessa"), { description: fatti.length ? fatti.join(" · ") : t("Nessuna modifica scelta.") });
      setLettura(null);
    } catch (e) {
      toast.error(t("Contratto non applicato"), { description: messaggioErrore(e) });
    } finally {
      setSalvo(false);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(orderId) });
      queryClient.invalidateQueries({ queryKey: ["letture-contratto-salvate"] });
    }
  };

  const p = lettura?.piano;
  const sommaRate = (r: { amount: number }[]) => r.reduce((s, x) => s + Number(x.amount || 0), 0);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" disabled={preparo} onClick={() => setLettore(true)}>
        {preparo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} {etichetta ?? t("Leggi contratto con l'AI")}
      </Button>
      {lettore && (
        <Suspense fallback={<p role="status">{t("Apertura lettore…")}</p>}>
          <ContractImportDialog open companyId={companyId} orderId={orderId} destinazione={perCommittente ? "appaltatore" : "cliente"}
            onOpenChange={setLettore} onApply={(ex, file, origine) => void preparaAnteprima(ex, file, origine)} />
        </Suspense>
      )}
      <Dialog open={!!lettura} onOpenChange={(o) => !o && !salvo && setLettura(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Applica il contratto alla commessa")}</DialogTitle>
            <DialogDescription>{t("Scegli cosa prendere dal contratto. Le rate già fatturate o incassate restano come sono.")}</DialogDescription>
          </DialogHeader>
          {lettura && p && (
            <div className="space-y-4 text-sm">
              {p.avvisi.length > 0 && (
                <Alert><AlertDescription><ul className="list-disc space-y-0.5 pl-4">{p.avvisi.map((a) => <li key={a}>{a}</li>)}</ul></AlertDescription></Alert>
              )}

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.importi} disabled={p.campi.total_amount == null && p.campi.vat_rate == null}
                  onCheckedChange={(v) => setScelte({ ...scelte, importi: v === true })} aria-label={t("Importo e IVA")} />
                <span>
                  <span className="font-medium">{t("Importo e IVA")}</span>
                  <span className="block text-muted-foreground">
                    {t("Imponibile")} {euro(lettura.commessa.total_amount)} → <b>{euro(p.imponibile)}</b>
                    {" · "}IVA {lettura.commessa.vat_rate ?? "—"}% → <b>{p.iva ?? "—"}%</b>
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.voci} disabled={p.voci.length === 0}
                  onCheckedChange={(v) => setScelte({ ...scelte, voci: v === true })} aria-label={t("Voci del contratto")} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t("Aggiungi {n} voci del contratto", { n: p.voci.length })}</span>
                  <span className="block text-muted-foreground">
                    {/* Il conteggio non è affidabile per tutti (chi non vede i margini non legge le righe): niente «non ha voci». */}
                    {lettura.vociEsistenti > 0 ? t("La commessa ha già {n} voci: queste si aggiungono, nessuna viene tolta.", { n: lettura.vociEsistenti }) : t("Si aggiungono a quelle della commessa: nessuna viene tolta.")}
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
                  onCheckedChange={(v) => setScelte({ ...scelte, rate: v === true })} aria-label={t("Rate del contratto")} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t("Rate dal contratto")}</span>
                  {p.rateNuove ? (
                    <span className="block text-muted-foreground">
                      {p.rateTenute.length > 0 && <>{t("Restano {n} rate fatturate o incassate ({importo}).", { n: p.rateTenute.length, importo: euro(sommaRate(p.rateTenute)) })} </>}
                      {p.rateSostituite.length > 0 ? <>{t("Sostituisce {n} rate da incassare ({importo}).", { n: p.rateSostituite.length, importo: euro(sommaRate(p.rateSostituite)) })} </> : null}
                    </span>
                  ) : <span className="block text-muted-foreground">{t("Nessun piano dei pagamenti nel contratto.")}</span>}
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

              {p.fasi.length > 0 && (
                <label className="flex items-start gap-2">
                  <Checkbox checked={scelte.fasi} onCheckedChange={(v) => setScelte({ ...scelte, fasi: v === true })} aria-label={t("Fasi di lavoro del contratto")} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t("Crea {n} fasi di lavoro dal contratto", { n: p.fasi.length })}</span>
                    <span className="block text-muted-foreground">{t("La commessa non ha ancora fasi. Prendono le date dall'inizio lavori, una dopo l'altra; si correggono poi nel Cantiere.")}</span>
                    <ol className="mt-1 max-h-32 list-decimal overflow-y-auto rounded border py-1 pl-7 pr-2 text-xs">
                      {p.fasi.map((f, i) => (
                        <li key={i}>{f.nome}{f.giorni ? ` · ${t("{n} gg", { n: f.giorni })}` : ""}{f.sottofasi.length ? ` · ${t("{n} sottofasi", { n: f.sottofasi.length })}` : ""}</li>
                      ))}
                    </ol>
                  </span>
                </label>
              )}

              {righeDocumentoFirmato(lettura.ex).length > 0 && (
                <label className="flex items-start gap-2">
                  <Checkbox checked={scelte.note} onCheckedChange={(v) => setScelte({ ...scelte, note: v === true })} aria-label={t("Note a mano, firma e allegato nelle note interne")} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t("Aggiungi alle note interne: firma, note scritte a mano e allegato")}</span>
                    <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border px-2 py-1 font-sans text-xs text-muted-foreground">{righeDocumentoFirmato(lettura.ex).join("\n")}</pre>
                  </span>
                </label>
              )}

              <label className="flex items-start gap-2">
                <Checkbox checked={scelte.documento || lettura.giaNeiDocumenti} disabled={!lettura.file || lettura.giaNeiDocumenti}
                  onCheckedChange={(v) => setScelte({ ...scelte, documento: v === true })} aria-label={t("Salva il contratto nei documenti")} />
                <span>
                  <span className="font-medium">{t("Salva il contratto nei documenti della commessa")}</span>
                  <span className="block text-muted-foreground">
                    {lettura.giaNeiDocumenti ? t("{nome} è già nei documenti, salvato alla lettura.", { nome: lettura.file?.name ?? t("Il contratto") }) : lettura.file ? lettura.file.name : t("Il file non è disponibile.")}{" "}{t("Non visibile al cliente.")}
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={salvo} onClick={() => setLettura(null)}>{t("Annulla")}</Button>
            <Button disabled={salvo || !lettura || !Object.values(scelte).some(Boolean)} onClick={() => void applica()}>
              {salvo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {t("Applica")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
