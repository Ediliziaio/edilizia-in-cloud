import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { flushSync } from "react-dom";
import { CloudDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ComputoNativoEditor from "./ComputoNativoEditor";
import { creaBackupComputo } from "@/lib/computo/backupComputo";
import { leggiBozzaComputo, type BozzaComputo } from "@/lib/computo/editorNativo";
import { ConflittoComputoCloud, improntaComputo, leggiComputoCloud, preparaAllegatiCloud, salvaComputoCloud } from "@/lib/computo/cloudComputo";

type Props = ComponentProps<typeof ComputoNativoEditor> & { companyId: string; draftId: string };
type Stato = { pronto: boolean; errore: string; conflitto: boolean; epoch: number; serverJson: string | null };

export default function ComputoCloudEditor({ companyId, draftId, ...props }: Props) {
  const { storageKey } = props;
  const [stato, setStato] = useState<Stato>({ pronto: false, errore: "", conflitto: false, epoch: 0, serverJson: null });
  const [corrente, setCorrente] = useState<BozzaComputo | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useRef<number | null>(null);
  const markerKey = `${storageKey}:supabase`;
  const onChange = useCallback((bozza: BozzaComputo) => setCorrente(bozza), []);
  const marca = useCallback(async (bozza: BozzaComputo, rev: number) => {
    const digest = await improntaComputo(bozza);
    localStorage.setItem(markerKey, JSON.stringify({ revision: rev, digest }));
  }, [markerKey]);

  const carica = useCallback(async (forza = false, attivo: () => boolean = () => true) => {
    setBusy(true);
    try {
      const remoto = await leggiComputoCloud(companyId, draftId);
      if (!attivo()) return;
      let locale: BozzaComputo | null = null;
      const raw = localStorage.getItem(storageKey);
      if (raw) locale = leggiBozzaComputo(raw);
      let marker: { revision?: number; digest?: string } = {};
      try { marker = JSON.parse(localStorage.getItem(markerKey) ?? "{}"); } catch { /* Una cache corrotta non autorizza una sovrascrittura. */ }
      const serverJson = remoto ? JSON.stringify(remoto.bozza) : null;
      const diversa = remoto && locale && JSON.stringify(locale) !== serverJson;
      const localeModificata = diversa && marker.digest !== await improntaComputo(locale!);
      if (!attivo()) return;
      const remotoInvariato = remoto && marker.revision === remoto.revision && marker.digest === await improntaComputo(remoto.bozza);
      if (!attivo()) return;
      if (localeModificata && remotoInvariato && !forza) {
        revision.current = remoto.revision;
        setStato(s => ({ pronto: true, errore: "", conflitto: false, serverJson, epoch: s.epoch + 1 }));
        return;
      }
      if (localeModificata && !forza) {
        revision.current = null;
        setStato(s => ({ ...s, pronto: true, conflitto: true, errore: "La copia locale e quella Supabase contengono modifiche diverse. Nessuna versione è stata sovrascritta.", serverJson }));
        return;
      }
      if (remoto) {
        await preparaAllegatiCloud(companyId, draftId, storageKey, remoto.bozza);
        if (!attivo()) return;
        localStorage.setItem(storageKey, serverJson!);
        await marca(remoto.bozza, remoto.revision);
      }
      if (!attivo()) return;
      revision.current = remoto?.revision ?? 0;
      setStato(s => ({ pronto: true, errore: "", conflitto: false, serverJson, epoch: s.epoch + 1 }));
    } catch (e) {
      if (attivo()) setStato(s => ({ ...s, errore: e instanceof Error ? e.message : "Supabase non disponibile.", conflitto: false }));
    } finally { if (attivo()) setBusy(false); }
  }, [companyId, draftId, storageKey, markerKey, marca]);
  useEffect(() => { let attivo = true; void carica(false, () => attivo); return () => { attivo = false; }; }, [carica]);

  const salva = async (bozza: BozzaComputo) => {
    if (revision.current == null) throw new Error("Riapri la versione Supabase prima di sincronizzare questa copia.");
    setBusy(true);
    try {
      const salvata = await salvaComputoCloud(companyId, draftId, storageKey, bozza, revision.current);
      revision.current = salvata.revision;
      // Il salvataggio remoto è già riuscito: un problema della cache non lo annulla.
      try { await marca(salvata.bozza, salvata.revision); } catch { /* Al prossimo accesso sarà richiesto un confronto prudente delle copie. */ }
      setStato(s => ({ ...s, serverJson: JSON.stringify(salvata.bozza), errore: "", conflitto: false }));
    } catch (e) {
      if (e instanceof ConflittoComputoCloud) { revision.current = null; setStato(s => ({ ...s, conflitto: true, errore: e.message })); }
      throw e;
    } finally { setBusy(false); }
  };
  const riapri = async () => {
    setBusy(true);
    try {
      const raw = localStorage.getItem(storageKey);
      const daConservare = corrente ?? (raw ? leggiBozzaComputo(raw) : null);
      if (daConservare) {
        const copia = await creaBackupComputo(storageKey, daConservare);
        const url = URL.createObjectURL(copia), a = document.createElement("a");
        a.href = url; a.download = "computo-copia-prima-di-ricaricare.bozza.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      // Smonta e completa il salvataggio locale prima di sostituire la copia.
      flushSync(() => setStato(s => ({ ...s, pronto: false })));
      await carica(true);
    } catch (e) { setStato(s => ({ ...s, errore: e instanceof Error ? e.message : "Copia locale non conservata: caricamento annullato." })); }
    finally { setBusy(false); }
  };
  const sporca = !stato.serverJson || !corrente || JSON.stringify(corrente) !== stato.serverJson;
  return <div className="space-y-3">
    {stato.errore && <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{stato.errore}</p>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => {
        if (stato.conflitto) { void riapri(); return; }
        flushSync(() => setStato(s => ({ ...s, pronto: false })));
        void carica();
      }}><CloudDownload className="mr-1 h-4 w-4" />{stato.conflitto ? "Conserva copia e riapri Supabase" : "Riprova Supabase"}</Button>
      {!stato.pronto && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStato(s => ({ ...s, pronto: true }))}>Continua con la copia locale</Button>}
    </div>}
    {!stato.pronto ? <p role="status" className="flex items-center gap-2 py-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Caricamento dati e allegati da Supabase…</p>
      : <fieldset disabled={busy} className="min-w-0"><ComputoNativoEditor key={stato.epoch} {...props} cloud={{ onSave: salva, onChange, disabled: busy || stato.conflitto || revision.current == null,
        status: busy ? "Supabase · sincronizzazione in corso" : stato.conflitto ? "Supabase · conflitto da risolvere" : sporca ? "Supabase · modifiche da salvare" : "Salvato su Supabase" }} /></fieldset>}
  </div>;
}
