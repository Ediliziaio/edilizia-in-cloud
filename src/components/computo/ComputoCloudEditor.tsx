import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { flushSync } from "react-dom";
import { CloudDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ComputoNativoEditor from "./ComputoNativoEditor";
import { creaBackupComputo } from "@/lib/computo/backupComputo";
import { leggiBozzaComputo, type BozzaComputo } from "@/lib/computo/editorNativo";
import { ConflittoComputoCloud, improntaComputo, leggiComputoCloud, preparaAllegatiCloud, salvaComputoCloud } from "@/lib/computo/cloudComputo";

type Props = Omit<ComponentProps<typeof ComputoNativoEditor>, "cloud"> & { companyId: string; draftId: string };
type Stato = { pronto: boolean; errore: string; conflitto: boolean; epoch: number; serverJson: string | null };
type Salvataggio = { stato: "fermo" | "in-corso" | "errore"; alle?: Date; errore?: string };

/** Dopo l'ultima modifica si aspetta un attimo: chi scrive una descrizione non salva a ogni lettera. */
const ATTESA_SALVATAGGIO_MS = 1500;

/**
 * Il computo si salva da solo nel gestionale, come gli altri preventivi.
 *
 * Fino al 29/10/2026 serviva un pulsante «Salva su Supabase»: un nome tecnico
 * che un titolare non deve vedere, e un passo che si dimentica. Ora si salva
 * da solo un secondo e mezzo dopo l'ultima modifica, senza mai bloccare
 * l'editor mentre salva. La copia nel browser resta: se la rete non risponde
 * non si perde niente, e al primo tentativo riuscito si allinea.
 *
 * Le protezioni restano quelle di prima: ogni salvataggio porta la revisione
 * letta, e se nel frattempo un altro dispositivo ha salvato la sua, il
 * salvataggio si ferma invece di sovrascriverla.
 */
export default function ComputoCloudEditor({ companyId, draftId, ...props }: Props) {
  const { storageKey } = props;
  const [stato, setStato] = useState<Stato>({ pronto: false, errore: "", conflitto: false, epoch: 0, serverJson: null });
  const [corrente, setCorrente] = useState<BozzaComputo | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [salvataggio, setSalvataggio] = useState<Salvataggio>({ stato: "fermo" });
  const revision = useRef<number | null>(null);
  const inVolo = useRef(false);
  const inCoda = useRef<BozzaComputo | null>(null);
  /**
   * La bozza com'era all'apertura (l'editor la ripete appena montato). Un
   * computo NUOVO si salva solo quando qualcuno lo cambia: altrimenti ogni
   * clic su «nuovo computo» lascerebbe nel gestionale una riga vuota.
   */
  const aperta = useRef<string | null>(null);
  const markerKey = `${storageKey}:supabase`;
  const onChange = useCallback((bozza: BozzaComputo) => {
    if (aperta.current === null) aperta.current = JSON.stringify(bozza);
    setCorrente(bozza);
  }, []);
  const marca = useCallback(async (bozza: BozzaComputo, rev: number) => {
    const digest = await improntaComputo(bozza);
    localStorage.setItem(markerKey, JSON.stringify({ revision: rev, digest }));
  }, [markerKey]);

  const carica = useCallback(async (forza = false, attivo: () => boolean = () => true) => {
    setCaricando(true);
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
        setStato(s => ({ ...s, pronto: true, conflitto: true, errore: "Su questo computer c'è una versione del computo diversa da quella salvata nel gestionale. Non ne è stata sovrascritta nessuna.", serverJson }));
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
      aperta.current = null;
      setStato(s => ({ pronto: true, errore: "", conflitto: false, serverJson, epoch: s.epoch + 1 }));
    } catch (e) {
      if (attivo()) setStato(s => ({ ...s, errore: e instanceof Error ? e.message : "Il gestionale non risponde.", conflitto: false }));
    } finally { if (attivo()) setCaricando(false); }
  }, [companyId, draftId, storageKey, markerKey, marca]);
  useEffect(() => { let attivo = true; void carica(false, () => attivo); return () => { attivo = false; }; }, [carica]);

  const salvaOra = useCallback(async (bozza: BozzaComputo): Promise<void> => {
    if (revision.current == null) return;
    // Un salvataggio alla volta: quello che arriva nel frattempo aspetta e parte subito dopo, con la revisione nuova.
    if (inVolo.current) { inCoda.current = bozza; return; }
    inVolo.current = true;
    setSalvataggio(s => ({ ...s, stato: "in-corso" }));
    try {
      const salvata = await salvaComputoCloud(companyId, draftId, storageKey, bozza, revision.current);
      revision.current = salvata.revision;
      // Il salvataggio remoto è già riuscito: un problema della cache non lo annulla.
      try { await marca(salvata.bozza, salvata.revision); } catch { /* Al prossimo accesso sarà richiesto un confronto prudente delle copie. */ }
      setStato(s => ({ ...s, serverJson: JSON.stringify(salvata.bozza), errore: "", conflitto: false }));
      setSalvataggio({ stato: "fermo", alle: new Date() });
    } catch (e) {
      if (e instanceof ConflittoComputoCloud) {
        revision.current = null;
        setStato(s => ({ ...s, conflitto: true, errore: e.message }));
        setSalvataggio({ stato: "fermo" });
      } else setSalvataggio({ stato: "errore", errore: e instanceof Error ? e.message : "Salvataggio non riuscito." });
    } finally {
      inVolo.current = false;
      const prossima = inCoda.current; inCoda.current = null;
      if (prossima && revision.current != null) void salvaOra(prossima);
    }
  }, [companyId, draftId, storageKey, marca]);

  const json = corrente ? JSON.stringify(corrente) : null;
  const nuovoIntatto = stato.serverJson === null && (json === null || json === aperta.current);
  const sporca = !nuovoIntatto && json !== null && json !== stato.serverJson;

  useEffect(() => {
    if (!stato.pronto || stato.conflitto || revision.current == null || !corrente || !sporca) return;
    const t = setTimeout(() => { void salvaOra(corrente); }, ATTESA_SALVATAGGIO_MS);
    return () => clearTimeout(t);
  }, [corrente, sporca, stato.pronto, stato.conflitto, salvaOra]);

  const riapri = async () => {
    setCaricando(true);
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
    finally { setCaricando(false); }
  };

  const ora = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const testoStato = stato.conflitto ? "Salvataggio fermo: versione diversa su un altro dispositivo"
    : revision.current == null ? "Non collegato al gestionale: le modifiche restano su questo computer"
      : salvataggio.stato === "in-corso" ? "Salvataggio…"
        : salvataggio.stato === "errore" ? `Non salvato: ${salvataggio.errore ?? "il gestionale non risponde"}. Riprovo alla prossima modifica.`
          : nuovoIntatto ? "Si salva da solo alla prima modifica"
            : sporca ? "Modifiche da salvare…"
              : salvataggio.alle ? `Salvato alle ${ora(salvataggio.alle)}` : "Salvato";

  return <div className="space-y-3">
    {stato.errore && <div role="alert" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{stato.errore}</p>
      <Button variant="outline" size="sm" disabled={caricando} onClick={() => {
        if (stato.conflitto) { void riapri(); return; }
        flushSync(() => setStato(s => ({ ...s, pronto: false })));
        void carica();
      }}><CloudDownload className="mr-1 h-4 w-4" />{stato.conflitto ? "Scarica la mia copia e riapri quella salvata" : "Riprova"}</Button>
      {!stato.pronto && <Button variant="ghost" size="sm" disabled={caricando} onClick={() => setStato(s => ({ ...s, pronto: true }))}>Continua con la copia su questo computer</Button>}
    </div>}
    {!stato.pronto ? <p role="status" className="flex items-center gap-2 py-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Apro il computo…</p>
      : <fieldset disabled={caricando} className="min-w-0"><ComputoNativoEditor key={stato.epoch} {...props} cloud={{ onChange, status: testoStato }} /></fieldset>}
  </div>;
}
