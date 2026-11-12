/**
 * La bolla dal telefono, dopo la foto (12/11/2026). Due casi, la stessa finestra
 * «Controlla la bolla» in versione telefono (foto sopra, righe sotto):
 *
 *  · `RevisioneBollaTelefono` — l'AI ha letto il documento: si mostra cosa ha
 *    capito (fornitore, numero, righe) e chi può registrare bolle conferma o
 *    corregge. Si registra con `ddt_documento_registra`, come dall'ufficio.
 *  · `CompilaBollaTelefono` — l'AI è spenta: si scrive a mano guardando la foto,
 *    oppure si salva il solo documento e lo compila l'ufficio. Senza lettura non
 *    c'è un documento in coda (`ddt_documento_accoda` lo legge sempre con l'AI),
 *    quindi la bolla nasce direttamente, come dal «Nuovo DDT» del computer.
 *
 * In entrambi i casi la destinazione è quella scelta sul telefono: il cantiere, o
 * il magazzino (che per l'ufficio vuol dire «senza commessa»).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useWarehouses } from "@/hooks/useWarehouses";
import {
  useDDTAttachments,
  useDDTRicezioneMutations,
  type DDTRigaNuova,
} from "@/hooks/useDDTRicezione";
import {
  documentiDb,
  leggiPersistente,
  type DocumentoPersistente,
} from "@/lib/ddt/documentiPersistenti";
import { leggiDDTdaAI, quantitaTotale } from "@/lib/ddt/letturaAI";
import { abbinaFornitore, type FornitoreInRubrica } from "@/lib/ddt/abbinaFornitore";
import type { TestataBolla } from "@/lib/ddt/righeBolla";
import {
  avvisaEsitoCarico,
  caricaAlSalvataggio,
  mostraSpuntaCarico,
} from "@/lib/ddt/caricoAlSalvataggio";
import { FinestraBollaFotoRighe } from "./FinestraBollaFotoRighe";

/** Chi può registrare una bolla letta (`ddt_documento_registra`). */
export function puoRegistrareBolle(p: {
  solaLettura: boolean; isAdmin: boolean; canEditOrders: boolean; canManagePurchasing: boolean; canEditWarehouse: boolean;
}): boolean {
  return !p.solaLettura && (p.isAdmin || p.canEditOrders || p.canManagePurchasing || p.canEditWarehouse);
}

/** Chi può far nascere una bolla senza lettura (inserimento diretto: acquisti). */
export function puoCompilareSenzaAI(p: { solaLettura: boolean; isAdmin: boolean; canManagePurchasing: boolean }): boolean {
  return !p.solaLettura && (p.isAdmin || p.canManagePurchasing);
}

function useRubrica(companyId: string | null | undefined) {
  return useQuery<FornitoreInRubrica[]>({
    queryKey: ["ddt-fornitori-abbinamento", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, vat_number, fiscal_code")
        .eq("company_id", companyId!)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as FornitoreInRubrica[];
    },
  });
}

const oggi = () => format(new Date(), "yyyy-MM-dd");

// ─── L'AI ha letto: conferma o correggi ─────────────────────────────────────

export function RevisioneBollaTelefono({
  documento,
  etichettaCantiere,
  onChiudi,
}: {
  documento: DocumentoPersistente;
  /** «SIM-1 · Via Roma» oppure «Magazzino». */
  etichettaCantiere: string;
  onChiudi: () => void;
}) {
  const qc = useQueryClient();
  const permessi = usePermissions();
  const magazzini = useWarehouses();
  const rubrica = useRubrica(documento.company_id);
  const destinazione: TestataBolla["destinazione"] = documento.order_id ? "cantiere" : "magazzino";
  const caricamento = useQuery({
    queryKey: ["ddt-revisione-telefono", documento.id, documento.updated_at],
    staleTime: Infinity,
    queryFn: async () => {
      const job = await leggiPersistente(documento.id);
      const files: File[] = [];
      for (const f of job.files) {
        const percorso = f.prepared_path ?? f.path;
        const { data, error } = await supabase.storage.from(f.bucket ?? "ddt-documenti").download(percorso);
        if (error || !data) throw new Error("Originale non disponibile: riprova");
        files.push(new File([data], f.prepared_name ?? f.name, { type: f.prepared_mime ?? f.mime }));
      }
      return { files, result: job.result ?? {} };
    },
  });
  // Quello che l'AI ha letto è il punto di partenza; le correzioni stanno sopra.
  const iniziale = useMemo(() => {
    if (!caricamento.data) return null;
    const letta = leggiDDTdaAI(caricamento.data.result);
    return {
      testata: {
        numero: letta.numero ?? "",
        data: letta.data ?? oggi(),
        supplierId: abbinaFornitore(letta, rubrica.data ?? [])?.id ?? null,
        orderId: documento.order_id,
        destinazione,
      } as TestataBolla,
      righe: letta.righe,
      fornitoreLetto: letta.fornitoreNome,
    };
  }, [caricamento.data, rubrica.data, documento.order_id, destinazione]);
  const [correzioni, setCorrezioni] = useState<Partial<TestataBolla>>({});
  const [righeCorrette, setRighe] = useState<DDTRigaNuova[] | null>(null);
  const testata = iniziale ? { ...iniziale.testata, ...correzioni } : null;
  const righe = righeCorrette ?? iniziale?.righe ?? [];
  const fornitoreLetto = iniziale?.fornitoreLetto ?? null;
  const [carica, setCarica] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const magazzino = magazzini.defaultWarehouse?.id ?? null;
  const senzaMagazzino = destinazione === "magazzino" && !magazzino;
  const spunta = mostraSpuntaCarico({ destinazione, puoMagazzino: permessi.canEditWarehouse && !permessi.solaLettura });

  const registra = async () => {
    if (!testata) return;
    setSalvando(true);
    try {
      const { data, error } = await documentiDb.rpc("ddt_documento_registra", {
        p_id: documento.id,
        p_altra_versione: false,
        p_dati: {
          order_id: testata.orderId,
          supplier_id: testata.supplierId,
          numero_ddt: testata.numero.trim(),
          data_ricezione: testata.data,
          destinazione,
          warehouse_id: destinazione === "magazzino" ? magazzino : null,
          righe,
        },
      });
      if (error) throw error;
      toast.success("Bolla registrata");
      if (spunta && carica) avvisaEsitoCarico(await caricaAlSalvataggio(data as string), testata.numero.trim());
      void qc.invalidateQueries({ queryKey: ["ddt-documenti"] });
      onChiudi();
    } catch (e) {
      toast.error("Bolla non registrata", { description: (e as { message?: string })?.message });
    } finally {
      setSalvando(false);
    }
  };

  if (caricamento.isError)
    return (
      <div role="alert" className="rounded-xl border p-3 text-sm">
        {(caricamento.error as Error).message}
        <button type="button" className="ml-2 underline" onClick={() => void caricamento.refetch()}>Riprova</button>
        <button type="button" className="ml-2 underline" onClick={onChiudi}>Chiudi</button>
      </div>
    );
  if (!caricamento.data || !testata)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Apro la bolla letta…
      </p>
    );
  return (
    <FinestraBollaFotoRighe
      open
      onOpenChange={(v) => { if (!v) onChiudi(); }}
      titolo="Ecco cosa ha letto l'AI"
      files={caricamento.data.files}
      companyId={documento.company_id}
      testata={testata}
      onTestataChange={(p) => setCorrezioni((c) => ({ ...c, ...p }))}
      righe={righe}
      onRigheChange={setRighe}
      fornitoreLetto={testata.supplierId ? null : fornitoreLetto}
      commessaFissa={etichettaCantiere}
      stato={
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Controlla fornitore, numero e righe, poi conferma. Si corregge tutto toccando i campi.
        </p>
      }
      carico={{ visibile: spunta && !senzaMagazzino, valore: carica, onChange: setCarica }}
      conferma={{
        etichetta: "Conferma la bolla",
        onConferma: () => void registra(),
        inCorso: salvando,
        bloccata: senzaMagazzino ? "non c'è un magazzino di arrivo: la registra l'ufficio" : null,
      }}
      etichettaChiudi="Dopo"
    />
  );
}

// ─── Senza AI: si scrive a mano, o la compila l'ufficio ─────────────────────

export function CompilaBollaTelefono({
  files,
  companyId,
  orderId,
  etichettaCantiere,
  onFatto,
  onChiudi,
}: {
  files: File[];
  companyId: string;
  orderId: string | null;
  etichettaCantiere: string;
  onFatto: () => void;
  onChiudi: () => void;
}) {
  const permessi = usePermissions();
  const { createDDT } = useDDTRicezioneMutations(null);
  const { uploadMainDDT, uploadAttachments } = useDDTAttachments();
  const destinazione: TestataBolla["destinazione"] = orderId ? "cantiere" : "magazzino";
  const [testata, setTestata] = useState<TestataBolla>({ numero: "", data: oggi(), supplierId: null, orderId, destinazione });
  const [righe, setRighe] = useState<DDTRigaNuova[]>([]);
  const [carica, setCarica] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const spunta = mostraSpuntaCarico({ destinazione, puoMagazzino: permessi.canEditWarehouse && !permessi.solaLettura });
  const pagine = useMemo(() => files, [files]);

  const salva = async () => {
    setSalvando(true);
    try {
      const creata = await createDDT.mutateAsync({
        silenzioso: true,
        magazzinoFacoltativo: true,
        order_id: orderId,
        supplier_id: testata.supplierId,
        destinazione,
        righe,
        numero_ddt: testata.numero.trim(),
        data_ricezione: testata.data,
        quantita_ricevuta: quantitaTotale(righe),
        stato: "ricevuto",
      });
      await uploadMainDDT.mutateAsync({ ddtId: creata.id, file: files[0], silenzioso: true });
      if (files.length > 1)
        await uploadAttachments.mutateAsync({ ddtId: creata.id, files: files.slice(1).map((file) => ({ file, kind: "bolla" as const })) });
      toast.success("Bolla registrata");
      if (spunta && carica) avvisaEsitoCarico(await caricaAlSalvataggio(creata.id), testata.numero.trim());
      onFatto();
    } catch (e) {
      toast.error("Bolla non registrata: le foto restano qui", { description: (e as { message?: string })?.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FinestraBollaFotoRighe
      open
      onOpenChange={(v) => { if (!v) onChiudi(); }}
      titolo="Compila la bolla"
      files={pagine}
      companyId={companyId}
      testata={testata}
      onTestataChange={(p) => setTestata((t) => ({ ...t, ...p }))}
      righe={righe}
      onRigheChange={setRighe}
      commessaFissa={etichettaCantiere}
      carico={{ visibile: spunta, valore: carica, onChange: setCarica }}
      conferma={{ etichetta: "Registra la bolla", onConferma: () => void salva(), inCorso: salvando }}
      etichettaChiudi="Indietro"
    />
  );
}

/** «La compila l'ufficio»: nasce la bolla col solo documento, senza numero né righe. */
export function useSalvaSoloDocumento() {
  const { createDDT } = useDDTRicezioneMutations(null);
  const { uploadMainDDT, uploadAttachments } = useDDTAttachments();
  return async (files: File[], orderId: string | null) => {
    const creata = await createDDT.mutateAsync({
      silenzioso: true,
      soloDocumento: true,
      numeroFacoltativo: true,
      magazzinoFacoltativo: true,
      order_id: orderId,
      destinazione: orderId ? "cantiere" : "magazzino",
      numero_ddt: "",
      data_ricezione: oggi(),
      quantita_ricevuta: 0,
      stato: "ricevuto",
      righe: [],
    });
    await uploadMainDDT.mutateAsync({ ddtId: creata.id, file: files[0], silenzioso: true });
    if (files.length > 1)
      await uploadAttachments.mutateAsync({ ddtId: creata.id, files: files.slice(1).map((file) => ({ file, kind: "bolla" as const })) });
    return creata.id;
  };
}
