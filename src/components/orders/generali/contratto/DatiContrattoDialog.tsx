// src/components/orders/generali/contratto/DatiContrattoDialog.tsx
// Il contratto con il committente: importi, date, penale, anticipazione, ritenuta, CIG/CUP e IVA.
// Il valore aggiornato si vede mentre si scrive: è quello che diventa il valore della generale.
import { lazy, Suspense, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { generaleDaContratto } from "@/lib/orders/contrattiDestinazioni";
import { collegaOriginaleAi } from "@/lib/orders/documentImportAi";
import type { StoredContractFile } from "@/lib/orders/contractPreparation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSalvaContratto } from "@/hooks/useGeneraleContratto";
import {
  CONTRATTO_VUOTO, anticipazioneProposta, erroriContratto, messaggioContratto, valoreContratto,
  type AttoAggiuntivo, type ContrattoGenerale,
} from "@/lib/orders/generali/contratto";
import { Campo, CampoNumero } from "./campi";
import { euro, haNumeriSbagliati } from "./formato";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ContractImportDialog = lazy(() => import("@/components/orders/ContractImportDialog").then(m => ({ default: m.ContractImportDialog })));
export function DatiContrattoDialog({ open, onOpenChange, generaleId, contratto, atti, valoreGenerale = null, avviaImportAi = false }: {
  open: boolean; onOpenChange: (o: boolean) => void; generaleId: string;
  contratto: ContrattoGenerale | null; atti: AttoAggiuntivo[];
  /** Il valore scritto creando la generale: si riparte da lì, non da un campo vuoto. */
  valoreGenerale?: number | null;
  avviaImportAi?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {/* Il modulo nasce a ogni apertura con i valori di adesso. */}
        {open && <Modulo onOpenChange={onOpenChange} generaleId={generaleId} iniziale={contratto ?? { ...CONTRATTO_VUOTO, importoBase: valoreGenerale }} atti={atti} nuovo={!contratto} avviaImportAi={avviaImportAi} />}
      </DialogContent>
    </Dialog>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{titolo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Modulo({ onOpenChange, generaleId, iniziale, atti, nuovo, avviaImportAi }: {
  onOpenChange: (o: boolean) => void; generaleId: string; iniziale: ContrattoGenerale; atti: AttoAggiuntivo[]; nuovo: boolean;
  avviaImportAi: boolean;
}) {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();
  const [importAi, setImportAi] = useState(avviaImportAi);
  const [originale, setOriginale] = useState<StoredContractFile | null>(null);
  const [confermato, setConfermato] = useState(false);
  const [collegando, setCollegando] = useState(false);
  const [revisioneImport, setRevisioneImport] = useState(0);
  const salva = useSalvaContratto(generaleId);
  const [c, setC] = useState<ContrattoGenerale>(iniziale);
  const metti = <K extends keyof ContrattoGenerale>(k: K, v: ContrattoGenerale[K]) => setC((x) => ({ ...x, [k]: v }));
  const errori = erroriContratto(c);
  const bloccato = Object.keys(errori).length > 0 || haNumeriSbagliati(c) || (originale !== null && !confermato);
  const valore = haNumeriSbagliati(c) ? null : valoreContratto(c, atti);
  const proposta = valore ? anticipazioneProposta(c, atti) : null;
  const testo = (v: string) => (v.trim() === "" ? null : v.trim());

  const conferma = async () => {
    if (bloccato) return;
    setCollegando(true);
    try {
      if (originale && (!effectiveCompany?.id || !user?.id)) throw new Error("Sessione non disponibile: ricarica prima di salvare.");
      await salva.mutateAsync(c);
      if (originale) await collegaOriginaleAi(supabase, generaleId, effectiveCompany!.id, user!.id, originale);
      void qc.invalidateQueries({ queryKey: ["order-attachments", generaleId] });
      toast.success(nuovo ? t("Contratto salvato") : t("Contratto aggiornato")); onOpenChange(false);
    } catch (e) { toast.error(messaggioContratto(e, "il contratto")); }
    finally { setCollegando(false); }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{nuovo ? t("Compila il contratto") : t("Modifica il contratto")}</DialogTitle>
        <DialogDescription>{t("Importi al netto dell'IVA. Il valore aggiornato diventa il valore della commessa generale.")}</DialogDescription>
      </DialogHeader>
      <Button type="button" variant="outline" onClick={() => setImportAi(true)} disabled={collegando}>{t("Carica contratto (AI)")}</Button>
      {originale && <div className="space-y-2 rounded-lg border bg-amber-50/40 p-3 text-sm"><p>{t("Proposta da {file}. Verifica base prima del ribasso, oneri e quota di competenza. Percentuali di anticipazione e ritenuta non sono incassi registrati.", { file: originale.name })}</p><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={confermato} onChange={e => setConfermato(e.target.checked)}/>{t("Ho confrontato importi, quota azienda, condizioni SAL, date e regime IVA con il documento.")}</label></div>}
      {importAi && <Suspense fallback={<p role="status">{t("Apertura lettore…")}</p>}><ContractImportDialog open companyId={effectiveCompany?.id ?? null} destinazione="generale_appalto" onOpenChange={setImportAi} onApply={(ex, _file, source) => { setC(generaleDaContratto(ex, c, source ?? null)); setOriginale(source ?? null); setConfermato(false); setRevisioneImport(v => v + 1); }}/></Suspense>}
      <form key={revisioneImport} className="space-y-5" onSubmit={(e) => { e.preventDefault(); void conferma(); }}>
        <Sezione titolo={t("Importi")}>
          <CampoNumero etichetta={t("Importo lavori a base del contratto")} valore={c.importoBase} onChange={(v) => metti("importoBase", v)} errore={errori.importoBase} suffisso="€" aiuto={t("La parte soggetta a ribasso.")} />
          <CampoNumero etichetta={t("Ribasso")} valore={c.ribassoPct} onChange={(v) => metti("ribassoPct", v ?? 0)} errore={errori.ribassoPct} suffisso="%" decimali={4} />
          <CampoNumero etichetta={t("Oneri della sicurezza")} valore={c.oneriSicurezza} onChange={(v) => metti("oneriSicurezza", v ?? 0)} errore={errori.oneriSicurezza} suffisso="€" aiuto={t("Non soggetti a ribasso.")} />
          <Campo etichetta={t("Numero o riferimento del contratto")}>
            {(id) => <Input id={id} value={c.riferimento ?? ""} onChange={(e) => metti("riferimento", testo(e.target.value))} placeholder="Rep. 1234/2027" />}
          </Campo>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
            {valore ? (
              <span>
                {t("Valore aggiornato:")} <strong className="tabular-nums">{euro(valore.aggiornato)}</strong>
                <span className="text-muted-foreground"> {t("= lavori ribassati {lavori} + sicurezza {sicurezza}", { lavori: euro(valore.lavoriNetti), sicurezza: euro(valore.sicurezza) })}{valore.atti !== 0 ? ` ${valore.atti > 0 ? "+" : "−"} ${t("atti {importo}", { importo: euro(Math.abs(valore.atti)) })}` : ""}</span>
              </span>
            ) : <span className="text-muted-foreground">{t("Scrivi l'importo a base per vedere il valore aggiornato.")}</span>}
          </div>
        </Sezione>

        <Sezione titolo={t("Date")}>
          <Campo etichetta={t("Firma del contratto")}>{(id) => <Input id={id} type="date" value={c.dataFirma ?? ""} onChange={(e) => metti("dataFirma", testo(e.target.value))} />}</Campo>
          <Campo etichetta={t("Consegna dei lavori")}>{(id) => <Input id={id} type="date" value={c.dataConsegnaLavori ?? ""} onChange={(e) => metti("dataConsegnaLavori", testo(e.target.value))} />}</Campo>
          <Campo etichetta={t("Fine lavori prevista")} errore={errori.dataFinePrevista} aiuto={t("Le proroghe si aggiungono come atti.")}>
            {(id) => <Input id={id} type="date" value={c.dataFinePrevista ?? ""} onChange={(e) => metti("dataFinePrevista", testo(e.target.value))} />}
          </Campo>
          <Campo etichetta={t("Lavori ultimati il")} aiuto={t("Da qui la penale non cresce più.")}>
            {(id) => <Input id={id} type="date" value={c.dataUltimazione ?? ""} onChange={(e) => metti("dataUltimazione", testo(e.target.value))} />}
          </Campo>
          <CampoNumero etichetta={t("Penale per ogni giorno di ritardo")} valore={c.penaleGiornaliera} onChange={(v) => metti("penaleGiornaliera", v)} errore={errori.penaleGiornaliera} suffisso="€" />
          <CampoNumero etichetta={t("Tetto della penale")} valore={c.penaleMassimaPct} onChange={(v) => metti("penaleMassimaPct", v ?? 10)} errore={errori.penaleMassimaPct} suffisso="%" aiuto={t("Del valore del contratto (di solito il 10%).")} />
        </Sezione>

        <Sezione titolo={t("Anticipazione e ritenuta")}>
          <CampoNumero etichetta={t("Anticipazione")} valore={c.anticipazionePct} onChange={(v) => metti("anticipazionePct", v ?? 0)} errore={errori.anticipazionePct} suffisso="%" aiuto={t("La stessa quota si recupera da ogni SAL.")} />
          <CampoNumero
            etichetta={t("Anticipazione ricevuta")}
            valore={c.anticipazioneImporto}
            onChange={(v) => metti("anticipazioneImporto", v)}
            errore={errori.anticipazioneImporto}
            suffisso="€"
            aiuto={proposta !== null && c.anticipazioneImporto === null ? t("Sul valore aggiornato sarebbe {importo}.", { importo: euro(proposta) }) : t("Quanto ti ha versato il committente.")}
          />
          <Campo etichetta={t("Ricevuta il")}>{(id) => <Input id={id} type="date" value={c.anticipazioneData ?? ""} onChange={(e) => metti("anticipazioneData", testo(e.target.value))} />}</Campo>
          <CampoNumero etichetta={t("Ritenuta di garanzia")} valore={c.ritenutaPct} onChange={(v) => metti("ritenutaPct", v ?? 0)} errore={errori.ritenutaPct} suffisso="%" aiuto={t("Trattenuta su ogni SAL e svincolata a fine lavori (0,5% negli appalti pubblici).")} />
        </Sezione>

        <Sezione titolo={t("Dati per le fatture")}>
          <Campo etichetta="CIG">{(id) => <Input id={id} value={c.cig ?? ""} onChange={(e) => metti("cig", testo(e.target.value))} />}</Campo>
          <Campo etichetta="CUP">{(id) => <Input id={id} value={c.cup ?? ""} onChange={(e) => metti("cup", testo(e.target.value))} />}</Campo>
          <label className="flex items-start gap-3 rounded-md border px-3 py-2">
            <Switch checked={c.splitPayment} onCheckedChange={(v) => metti("splitPayment", v)} className="mt-0.5" />
            <span className="text-sm">{t("Scissione dei pagamenti")}<span className="block text-xs text-muted-foreground">{t("L'IVA la versa il committente (pubblica amministrazione).")}</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-md border px-3 py-2">
            <Switch checked={c.reverseCharge} onCheckedChange={(v) => metti("reverseCharge", v)} className="mt-0.5" />
            <span className="text-sm">{t("Inversione contabile")}<span className="block text-xs text-muted-foreground">{t("Subappalto edile: fattura senza IVA.")}</span></span>
          </label>
          {errori.reverseCharge && <p className="text-xs text-destructive sm:col-span-2">{errori.reverseCharge}</p>}
        </Sezione>

        <Campo etichetta={t("Note")}>{(id) => <Textarea id={id} rows={2} value={c.note ?? ""} onChange={(e) => metti("note", e.target.value || null)} />}</Campo>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button type="submit" disabled={salva.isPending || collegando || bloccato}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("Salva il contratto")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
