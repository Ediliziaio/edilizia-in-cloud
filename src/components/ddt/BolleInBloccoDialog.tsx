/**
 * Caricare tante bolle insieme (05/11/2026): si scelgono i file, ognuno viene letto, e prima di salvare
 * si vede una riga per bolla con quello che il sistema ha capito. Niente entra senza conferma.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileUp,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDDTAttachments,
  useDDTRicezioneMutations,
} from "@/hooks/useDDTRicezione";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import {
  inviaDocumentoPersistente,
  attendiLetturaPersistente,
  documentiDb,
} from "@/lib/ddt/documentiPersistenti";
import { ACCEPT_DOCUMENTI_DDT } from "@/lib/ddt/preparaDocumento";
import { inParallelo } from "@/lib/fatturazione/importMassivo";
import { leggiDDTdaAI, quantitaTotale } from "@/lib/ddt/letturaAI";
import {
  scansioneComeFoto,
  contaPagine,
  leggiPerDividere,
  MAX_BYTE_DA_DIVIDERE,
  MAX_PAGINE_DIVISIONE,
  type PdfDaDividere,
} from "@/lib/ddt/dividiPdf";
import { FinestraBollaFotoRighe, SpuntaCaricoMagazzino } from "@/components/ddt/FinestraBollaFotoRighe";
import {
  avvisaEsitoCarico,
  caricaAlSalvataggio,
} from "@/lib/ddt/caricoAlSalvataggio";
import { CollegamentiBolla } from "@/components/ddt/CollegamentiBolla";
import { AzioniBolle } from "@/components/ddt/AzioniBolle";
import { NuovoFornitoreDaBolla } from "@/components/ddt/NuovoFornitoreDaBolla";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { usePermissions } from "@/hooks/usePermissions";
import type { Supplier } from "@/lib/suppliers/anagraficaFornitore";
import { RigheLetteBolla } from "@/components/ddt/RigheLetteBolla";
import { DividiPdfPannello } from "@/components/ddt/DividiPdfPannello";
import {
  conflittoFornitore,
  richiedeCaricoManuale,
  modificaBolleSelezionate,
  riabbinaFornitori,
  bollaDaFile,
  chiaveBolla,
  eUnPdf,
  conLettura,
  compilaAMano,
  doppioni,
  dubbi,
  motivoScartoFile,
  perAttenzione,
  problemiBloccanti,
  pronte,
  type BollaLetta,
} from "@/lib/ddt/importBolle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const QUANTE_INSIEME = 3;

async function leggiFile(file: File, companyId: string): Promise<unknown> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { data, error } = await supabase.functions.invoke("ddt-ai-extract", {
    body: {
      image_base64: btoa(bin),
      mime_type: file.type || "application/pdf",
      file_name: file.name,
      company_id: companyId,
    },
  });
  if (error)
    throw new Error(await edgeErrorMessage(error, "Lettura non riuscita"));
  if (!data?.success) throw new Error(data?.error ?? "Lettura non riuscita");
  return data.ddt ?? {};
}

const testoErrore = (e: unknown, riserva: string) =>
  e &&
  typeof e === "object" &&
  "message" in e &&
  typeof (e as { message: unknown }).message === "string"
    ? (e as { message: string }).message
    : riserva;

interface BolleProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId?: string | null;
  destinazione?: "magazzino" | "cantiere";
  warehouseId?: string | null;
  iniziali?: BollaLetta[];
  fileIniziale?: File;
  pdfIniziale?: PdfDaDividere;
  documentoOrigineId?: string;
}
export function BolleInBloccoDialog(props: BolleProps) {
  return props.open ? <BolleAperte {...props} /> : null;
}
function BolleAperte({
  open,
  onOpenChange,
  orderId,
  destinazione = "magazzino",
  warehouseId,
  iniziali,
  fileIniziale,
  pdfIniziale,
  documentoOrigineId,
}: BolleProps) {
  const { effectiveCompany, role, user } = useAuth();
  const permissions = usePermissions();
  const puoCreareFornitore =
    role === "company_admin" ||
    role === "super_admin" ||
    Boolean(permissions.canEditSettingsSuppliers);
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { createDDT } = useDDTRicezioneMutations(null);
  const { uploadMainDDT } = useDDTAttachments();
  const inputRef = useRef<HTMLInputElement>(null);
  const [bolleBase, setBolle] = useState<BollaLetta[]>(() => iniziali ?? []);
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set());
  const [nuovoFornitore, setNuovoFornitore] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("tutte");
  const [scartati, setScartati] = useState<{ nome: string; motivo: string }[]>(
    [],
  );
  const [salvando, setSalvando] = useState(false);
  const [daDividere, setDaDividere] = useState<
    { id: string; pdf: PdfDaDividere }[]
  >(() => pdfIniziale ? [{id:crypto.randomUUID(),pdf:pdfIniziale}] : []);
  const [progressoPdf, setProgressoPdf] = useState("");
  const [preparando, setPreparando] = useState(0);
  const annullato = useRef(false);
  const daAbbinare = useRef(0);
  // «Controlla la bolla»: la finestra con l'originale a fianco, per una bolla alla volta.
  const [finestraPer, setFinestraPer] = useState<string | null>(null);
  const giaAperte = useRef(new Set<string>());
  const puoMagazzino = !permissions.solaLettura && Boolean(permissions.canEditWarehouse);
  const [caricaMagazzino, setCaricaMagazzino] = useState(true);

  const {
    data: rubrica = [],
    refetch: ricaricaRubrica,
    isFetching: fornitoriInCaricamento,
  } = useQuery<Supplier[]>({
    queryKey: ["ddt-fornitori-abbinamento", companyId],
    enabled: open && !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      return loadCatalogPages<Supplier>((from, to) =>
        supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", companyId!)
          .order("id")
          .range(from, to),
      );
    },
  });

  const bolle = useMemo(
    () => riabbinaFornitori(bolleBase, rubrica),
    [bolleBase, rubrica],
  );

  // Le bolle che ci sono già: il fornitore può stare sulla bolla o sull'ordine a cui è legata.
  const { data: esistenti = new Set<string>() } = useQuery<Set<string>>({
    queryKey: ["ddt-chiavi-esistenti", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const chiavi = new Set<string>();
      const passo = 1000;
      for (let da = 0; ; da += passo) {
        const { data, error } = await db
          .from("ddt_ricezione")
          .select(
            "id, numero_ddt, data_ricezione, supplier_id, purchase_orders(supplier_id)",
          )
          .eq("company_id", companyId)
          .order("id")
          .range(da, da + passo - 1);
        if (error) throw error;
        for (const r of (data ?? []) as Array<{
          numero_ddt: string;
          data_ricezione: string;
          supplier_id: string | null;
          purchase_orders: { supplier_id: string | null } | null;
        }>) {
          const k = chiaveBolla(
            r.supplier_id ?? r.purchase_orders?.supplier_id,
            r.numero_ddt,
            r.data_ricezione,
          );
          if (k) chiavi.add(k);
        }
        if ((data ?? []).length < passo) return chiavi;
      }
    },
  });

  useEffect(() => {
    annullato.current = false;
    return () => {
      annullato.current = true;
    };
  }, []);

  const cambia = (id: string, patch: Partial<BollaLetta>) =>
    setBolle((p) =>
      p.map((b) => {
        if (b.id !== id) return b;
        const cambiaAssociazione =
          !Object.hasOwn(patch, "purchaseOrderId") &&
          ((patch.supplierId !== undefined &&
            patch.supplierId !== b.supplierId) ||
            (patch.orderId !== undefined && patch.orderId !== b.orderId));
        return {
          ...b,
          ...patch,
          ...(cambiaAssociazione
            ? {
                purchaseOrderId: null,
                righe: b.righe.map((r) => ({
                  ...r,
                  purchase_order_item_id: null as string | null,
                  abbinamento: null as "auto" | "manuale" | null,
                })),
              }
            : {}),
        };
      }),
    );

  const leggiTutte = async (nuove: BollaLetta[]) => {
    if (!companyId || !user?.id) return;
    const ids = new Set<string>();
    let accodate = 0;
    await inParallelo(nuove, QUANTE_INSIEME, async (b) => {
      if (annullato.current) return;
      cambia(b.id, { stato: "in_lettura" });
      try {
        const salvato = await inviaDocumentoPersistente({
          files: [b.file],
          companyId,
          userId: user.id,
          orderId: b.orderId,
          source: "desktop",
          operationId: b.id,
          salvaCopiaLocale: true,
        });
        if (!salvato.id)
          throw new Error(
            "Questo originale è già presente nei documenti dell’azienda.",
          );
        ids.add(salvato.id);
        accodate += 1;
        cambia(b.id, { documentoJobId: salvato.id });
        void queryClient.invalidateQueries({ queryKey: ["ddt-documenti"] });
        const grezzo = await attendiLetturaPersistente(
          salvato.id,
          () => annullato.current,
        );
        if (annullato.current) return;
        setBolle((p) =>
          p.map((x) =>
            x.id === b.id
              ? conLettura(x, leggiDDTdaAI(grezzo), grezzo, rubrica)
              : x,
          ),
        );
      } catch (e) {
        cambia(b.id, {
          stato: "non_letta",
          errore: testoErrore(e, "Lettura non riuscita"),
        });
      }
    });
    if (documentoOrigineId && accodate === nuove.length && ids.size) {
      const { error } = await documentiDb.rpc("ddt_documento_diviso", {
        p_id: documentoOrigineId,
        p_figli: [...ids],
      });
      if (error)
        toast.error("Bolle salvate; non riesco a segnare il PDF come diviso", {
          description: error.message,
        });
      void queryClient.invalidateQueries({ queryKey: ["ddt-documenti"] });
    }
  };

  const entra = (file: File[], leggi = true) => {
    const scarti = file.flatMap((f) => {
      const motivo = motivoScartoFile(f);
      return motivo ? [{ nome: f.name, motivo }] : [];
    });
    setScartati((p) => [...p, ...scarti]);
    const nuove = file
      .filter((f) => !motivoScartoFile(f))
      .map((f) => ({
        ...bollaDaFile(f, crypto.randomUUID(), { orderId, destinazione }),
        warehouseId: warehouseId ?? null,
      }));
    if (!nuove.length) return;
    setBolle((p) => [...p, ...nuove]);
    if (leggi) void leggiTutte(nuove);
  };

  // Un PDF con più pagine può avere più bolle: prima si guarda dove tagliare, poi si legge.
  const aggiungi = async (lista: FileList | File[]) => {
    const file = Array.from(lista);
    setPreparando((n) => n + 1);
    try {
      const diretti: File[] = [];
      for (const f of file) {
        const pdfAdattoADivisione =
          eUnPdf(f) && f.size > 0 && f.size <= MAX_BYTE_DA_DIVIDERE;
        const pagine = pdfAdattoADivisione ? await contaPagine(f) : null;
        if (pagine == null || pagine <= 1) {
          diretti.push(f);
          continue;
        }
        if (pagine > MAX_PAGINE_DIVISIONE) {
          setScartati((p) => [
            ...p,
            {
              nome: f.name,
              motivo: `ha ${pagine} pagine: dividilo in file fino a ${MAX_PAGINE_DIVISIONE}`,
            },
          ]);
          continue;
        }
        try {
          const letto = await leggiPerDividere(
            f,
            (pagina, totale) =>
              setProgressoPdf(`${f.name}: pagina ${pagina} di ${totale}`),
            () => annullato.current,
          );
          if (annullato.current) return;
          setDaDividere((p) => [...p, { id: crypto.randomUUID(), pdf: letto }]);
        } catch {
          diretti.push(f);
        }
      }
      if (!annullato.current) entra(diretti);
    } finally {
      setPreparando((n) => n - 1);
      setProgressoPdf("");
    }
  };

  const doppi = useMemo(() => doppioni(bolle, esistenti), [bolle, esistenti]);
  const elenco = useMemo(() => perAttenzione(bolle, doppi), [bolle, doppi]);
  const daSalvare = useMemo(
    () =>
      pronte(bolle, doppi).filter(
        (b) => !selezionate.size || selezionate.has(b.id),
      ),
    [bolle, doppi, selezionate],
  );
  const modificabili = bolle.filter(
    (b) => b.stato === "letta" && b.esito !== "salvata" && !b.ddtCreatoId,
  );
  const selezioneAttiva = new Set(
    modificabili.filter((b) => selezionate.has(b.id)).map((b) => b.id),
  );
  const elencoVisibile = elenco.filter(
    (b) =>
      filtro === "tutte" ||
      (filtro === "duplicati"
        ? !!doppi.get(b.id)
        : b.stato === "non_letta" ||
          problemiBloccanti(b).length > 0 ||
          dubbi(b).length > 0 ||
          richiedeCaricoManuale(b.grezzo) ||
          conflittoFornitore(b, rubrica)),
  );
  const bollaNuovoFornitore = bolle.find((b) => b.id === nuovoFornitore);
  const inLettura = bolle.some(
    (b) => b.stato === "da_leggere" || b.stato === "in_lettura",
  );
  const salvate = bolle.filter((b) => b.esito === "salvata").length;
  const caricoVisibile =
    puoMagazzino &&
    bolle.some(
      (b) =>
        b.stato === "letta" && b.esito !== "salvata" && b.destinazione === "magazzino",
    );
  const bollaInFinestra = bolle.find((b) => b.id === finestraPer) ?? null;

  // La finestra si apre da sola sulla prima bolla da compilare a mano o senza righe;
  // chiusa quella, sulla successiva. Una volta per bolla: chi la chiude ha deciso.
  useEffect(() => {
    if (finestraPer || salvando) return;
    const prossima = elenco.find(
      (b) =>
        b.stato === "letta" &&
        b.esito !== "salvata" &&
        !b.ddtCreatoId &&
        (b.compilaAMano || b.righe.length === 0) &&
        !giaAperte.current.has(b.id),
    );
    if (!prossima) return;
    giaAperte.current.add(prossima.id);
    setFinestraPer(prossima.id);
  }, [elenco, finestraPer, salvando]);

  const conferma = async (lista: BollaLetta[] = daSalvare) => {
    setSalvando(true);
    daAbbinare.current = 0;
    await inParallelo(lista, QUANTE_INSIEME, async (b) => {
      try {
        const creata = b.ddtCreatoId
          ? {
              id: b.ddtCreatoId,
              warehouse_id: b.warehouseId ?? warehouseId ?? null,
            }
          : b.documentoJobId
            ? await (async () => {
                const { data, error } = await documentiDb.rpc(
                  "ddt_documento_registra",
                  {
                    p_id: b.documentoJobId,
                    p_altra_versione: b.caricaComunque,
                    p_dati: {
                      order_id: b.orderId,
                      supplier_id: b.supplierId,
                      purchase_order_id: b.purchaseOrderId ?? null,
                      numero_ddt: b.numero.trim(),
                      data_ricezione: b.data,
                      destinazione: b.destinazione,
                      warehouse_id: b.warehouseId ?? warehouseId ?? null,
                      righe: b.righe,
                      note: b.note,
                      corriere: b.corriere,
                      targa_mezzo: b.targaMezzo,
                      autista_nome: b.autistaNome,
                      trasporto_a_cura_di: b.trasportoACuraDi,
                      porto: b.porto,
                    },
                  },
                );
                if (error) throw error;
                return {
                  id: data as string,
                  warehouse_id:
                    b.destinazione === "magazzino"
                      ? (b.warehouseId ?? warehouseId ?? null)
                      : null,
                };
              })()
            : await createDDT.mutateAsync({
                silenzioso: true,
                soloDocumento: true,
                purchase_order_id: b.purchaseOrderId ?? null,
                order_id: b.orderId,
                supplier_id: b.supplierId,
                destinazione: b.destinazione,
                trasporto_a_cura_di: b.trasportoACuraDi,
                porto: b.porto,
                righe: b.righe,
                ai_lettura: b.grezzo,
                ai_confidenza: b.confidenza,
                ai_avvisi: b.avvisi,
                numero_ddt: b.numero.trim(),
                data_ricezione: b.data,
                quantita_ricevuta: quantitaTotale(b.righe),
                stato: "ricevuto",
                note: b.note,
                warehouse_id: b.warehouseId ?? warehouseId ?? null,
                corriere: b.corriere,
                targa_mezzo: b.targaMezzo,
                autista_nome: b.autistaNome,
              });
        cambia(b.id, {
          ddtCreatoId: creata.id,
          warehouseId: creata.warehouse_id,
        });
        if (!b.documentoJobId)
          await uploadMainDDT.mutateAsync({
            ddtId: creata.id,
            file: b.file,
            silenzioso: true,
          });
        // Resi, noleggi e destinazioni miste non entrano da soli: si confermano dalla bolla.
        if (
          caricoVisibile &&
          caricaMagazzino &&
          b.destinazione === "magazzino" &&
          !richiedeCaricoManuale(b.grezzo)
        )
          avvisaEsitoCarico(await caricaAlSalvataggio(creata.id), b.numero.trim());
        daAbbinare.current += b.righe.length;
        cambia(b.id, { esito: "salvata", motivoEsito: null });
        setSelezionate((ids) => new Set([...ids].filter((id) => id !== b.id)));
      } catch (e) {
        cambia(b.id, {
          esito: "errore",
          motivoEsito: testoErrore(e, "Non salvata"),
        });
      }
    });
    setSalvando(false);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.ddtRicezione.all,
    });
    void queryClient.invalidateQueries({ queryKey: ["commessa-bolle-ddt"] });
    void queryClient.invalidateQueries({
      queryKey: ["ddt-chiavi-esistenti", companyId],
    });
    void queryClient.invalidateQueries({ queryKey: ["ddt-documenti"] });
  };

  // Finita la conferma senza errori si dice quante sono entrate e si chiude.
  const finite = bolle.length > 0 && bolle.every((b) => b.esito === "salvata");
  useEffect(() => {
    if (finite && !salvando) {
      toast.success(
        `${salvate} ${salvate === 1 ? "bolla registrata" : "bolle registrate"}`,
        daAbbinare.current > 0
          ? {
              description: `${daAbbinare.current} righe aspettano che tu scelga l'articolo: le trovi nella scheda di ogni bolla.`,
            }
          : undefined,
      );
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finite, salvando]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!salvando) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[94dvh] gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b bg-muted/20 px-6 py-5">
          <DialogTitle>Carica più bolle</DialogTitle>
          <DialogDescription>
            Scegli i file: conserviamo gli originali e leggiamo le bolle. La
            lettura continua anche se chiudi; il DDT viene registrato solo
            quando confermi.
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
          style={{ maxHeight: "calc(94dvh - 195px)" }}
        >
          <div
            className="rounded-xl border-2 border-dashed bg-muted/10 p-4 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void aggiungi(Array.from(e.dataTransfer.files));
            }}
          >
            <FileUp
              aria-hidden="true"
              className="mx-auto mb-2 h-6 w-6 text-muted-foreground"
            />
            <p className="text-sm text-muted-foreground">
              Trascina qui PDF e foto: una bolla per file, o un PDF con tante
              bolle.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se una scansione perde delle righe, usa «Rileggi scansione». Il
              PDF originale viene conservato.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={salvando || !!fileIniziale}
              onClick={() => inputRef.current?.click()}
            >
              Scegli i file
            </Button>
            {bolle.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 mt-2"
                disabled={salvando || fornitoriInCaricamento}
                onClick={async () => {
                  const result = await ricaricaRubrica();
                  if (result.error) {
                    toast.error(
                      "Non riesco ad aggiornare i fornitori. Le letture restano disponibili.",
                    );
                    return;
                  }
                  setBolle((attuali) =>
                    riabbinaFornitori(attuali, result.data ?? []),
                  );
                  toast.success(
                    "Rubrica aggiornata: ricollegati i fornitori riconosciuti, senza rileggere le bolle.",
                  );
                }}
              >
                {fornitoriInCaricamento
                  ? "Aggiorno i fornitori…"
                  : "Riconosci i nuovi fornitori"}
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              aria-label="File delle bolle"
              accept={ACCEPT_DOCUMENTI_DDT}
              onChange={(e) => {
                if (e.target.files) void aggiungi(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>

          {scartati.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Non presi:{" "}
              {scartati.map((s) => `${s.nome} (${s.motivo})`).join(", ")}.
            </p>
          )}

          {preparando > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {progressoPdf || "Sto guardando le pagine…"}
            </p>
          )}
          {daDividere.map((d) => (
            <DividiPdfPannello
              key={d.id}
              pdf={d.pdf}
              onTogli={() =>
                setDaDividere((p) => p.filter((x) => x.id !== d.id))
              }
              onDiviso={(pezzi, leggi = true) => {
                setDaDividere((p) => p.filter((x) => x.id !== d.id));
                entra(pezzi, leggi);
              }}
            />
          ))}

          {bolle.length > 0 && (
            <>
              <div
                className="flex flex-wrap items-center gap-2"
                aria-label="Filtri delle bolle"
              >
                {[
                  ["tutte", `Tutte (${bolle.length})`],
                  ["attenzione", "Da controllare"],
                  [
                    "duplicati",
                    `Duplicati (${[...doppi.values()].filter(Boolean).length})`,
                  ],
                ].map(([id, titolo]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={filtro === id ? "secondary" : "ghost"}
                    aria-pressed={filtro === id}
                    onClick={() => setFiltro(id)}
                  >
                    {titolo}
                  </Button>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">
                  {bolle.filter((b) => b.stato === "letta").length}/
                  {bolle.length} lette · {salvate}{" "}
                  {salvate === 1 ? "registrata" : "registrate"}
                </span>
              </div>
              {bolle.some((b) => b.stato === "da_leggere") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    salvando || bolle.some((b) => b.stato === "in_lettura")
                  }
                  onClick={() =>
                    void leggiTutte(
                      bolle.filter((b) => b.stato === "da_leggere"),
                    )
                  }
                >
                  Leggi con AI le{" "}
                  {bolle.filter((b) => b.stato === "da_leggere").length} bolle
                  preparate
                </Button>
              )}
              <AzioniBolle
                companyId={companyId}
                fornitori={rubrica}
                selezionate={selezioneAttiva.size}
                totale={modificabili.length}
                disabled={salvando || inLettura}
                onSeleziona={(tutte) =>
                  setSelezionate(
                    new Set(tutte ? modificabili.map((b) => b.id) : []),
                  )
                }
                onApplica={(patch) => {
                  setBolle((attuali) =>
                    modificaBolleSelezionate(attuali, selezioneAttiva, patch),
                  );
                  toast.success(
                    `Aggiornate ${selezioneAttiva.size} bolle. Controlla le associazioni prima di registrare.`,
                  );
                }}
                onTogli={() => {
                  setBolle((attuali) =>
                    attuali.filter((b) => !selezioneAttiva.has(b.id)),
                  );
                  setSelezionate(new Set());
                }}
                onDuplicati={() => {
                  const ids = new Set(
                    modificabili
                      .filter((b) => doppi.get(b.id) && !b.caricaComunque)
                      .map((b) => b.id),
                  );
                  setBolle((attuali) => attuali.filter((b) => !ids.has(b.id)));
                  setSelezionate(
                    (attuali) =>
                      new Set([...attuali].filter((id) => !ids.has(id))),
                  );
                  toast.success(`${ids.size} duplicati tolti dal caricamento.`);
                }}
              />
              {!elencoVisibile.length && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessuna bolla in questo filtro.
                </p>
              )}
            </>
          )}
          {elencoVisibile.length > 0 && (
            <ul aria-label="Bolle da confermare" className="space-y-2">
              {elencoVisibile.map((b) => {
                const bloccanti = problemiBloccanti(b);
                const dubbiB = b.stato === "letta" ? dubbi(b) : [];
                const doppio = doppi.get(b.id);
                const attenzione =
                  b.stato === "non_letta" ||
                  b.esito === "errore" ||
                  bloccanti.length > 0 ||
                  dubbiB.length > 0 ||
                  !!doppio ||
                  conflittoFornitore(b, rubrica) ||
                  richiedeCaricoManuale(b.grezzo);
                return (
                  <li
                    key={b.id}
                    className={`space-y-3 rounded-xl border bg-background p-4 text-sm shadow-sm ${b.esito === "salvata" ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : attenzione ? "border-amber-200 dark:border-amber-800" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Checkbox
                        aria-label={`Seleziona ${b.file.name}`}
                        disabled={
                          salvando ||
                          b.stato !== "letta" ||
                          b.esito === "salvata" ||
                          !!b.ddtCreatoId
                        }
                        checked={selezionate.has(b.id)}
                        onCheckedChange={(v) =>
                          setSelezionate((ids) => {
                            const next = new Set(ids);
                            if (v === true) next.add(b.id);
                            else next.delete(b.id);
                            return next;
                          })
                        }
                      />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${doppio ? "bg-amber-100 text-amber-900" : attenzione ? "bg-muted text-muted-foreground" : "bg-emerald-50 text-emerald-800"}`}
                      >
                        {b.esito === "salvata"
                          ? "Registrata"
                          : doppio
                            ? "Duplicata"
                            : attenzione
                              ? "Da controllare"
                              : "Pronta"}
                      </span>
                      {b.esito === "salvata" ? (
                        <CheckCircle2
                          aria-label="Salvata"
                          className="h-4 w-4 shrink-0 text-emerald-600"
                        />
                      ) : b.stato === "letta" ? null : b.stato ===
                        "non_letta" ? (
                        <AlertTriangle
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-amber-600"
                        />
                      ) : b.stato === "da_leggere" ? (
                        <span className="text-xs text-muted-foreground">
                          Da leggere
                        </span>
                      ) : (
                        <Loader2
                          aria-label="In lettura"
                          className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                        />
                      )}
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        title={b.file.name}
                      >
                        {b.file.name}
                      </span>
                      {eUnPdf(b.file) && b.stato === "letta" && (
                        <button
                          type="button"
                          className="shrink-0 text-xs underline underline-offset-2"
                          disabled={salvando || !!b.ddtCreatoId}
                          aria-label={`Rileggi scansione ${b.file.name}`}
                          onClick={async () => {
                            if (!companyId) return;
                            cambia(b.id, { stato: "in_lettura" });
                            try {
                              const foto = await scansioneComeFoto(b.file);
                              if (annullato.current) return;
                              const grezzo = await leggiFile(foto, companyId);
                              const letta = leggiDDTdaAI(grezzo);
                              if (
                                !letta.righe.length ||
                                letta.righe.length < b.righe.length
                              ) {
                                throw new Error(
                                  "La rilettura contiene meno righe: conservata la lettura precedente. Confronta con l’originale.",
                                );
                              }
                              if (!annullato.current)
                                setBolle((attuali) =>
                                  attuali.map((x) =>
                                    x.id === b.id
                                      ? conLettura(x, letta, grezzo, rubrica)
                                      : x,
                                  ),
                                );
                            } catch (e) {
                              cambia(b.id, { stato: "letta" });
                              toast.error(
                                testoErrore(
                                  e,
                                  "Rilettura non riuscita: la lettura precedente resta disponibile.",
                                ),
                              );
                            }
                          }}
                        >
                          Rileggi scansione
                        </button>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
                        onClick={() => {
                          const url = URL.createObjectURL(b.file);
                          window.open(url, "_blank", "noopener");
                          window.setTimeout(
                            () => URL.revokeObjectURL(url),
                            60_000,
                          );
                        }}
                      >
                        Apri
                        <ExternalLink aria-hidden="true" className="h-3 w-3" />
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={salvando || b.esito === "salvata"}
                        aria-label={`Togli ${b.file.name}`}
                        onClick={() => {
                          setBolle((p) => p.filter((x) => x.id !== b.id));
                          setSelezionate(
                            (ids) =>
                              new Set([...ids].filter((id) => id !== b.id)),
                          );
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {b.esito === "salvata" && b.ddtCreatoId && (
                      <a
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
                        href={`/azienda/ddt/${b.ddtCreatoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Apri DDT registrato
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {b.stato === "non_letta" && (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                        Non letta: {b.errore}.
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={salvando}
                          onClick={() => {
                            giaAperte.current.add(b.id);
                            setBolle((p) =>
                              p.map((x) => (x.id === b.id ? compilaAMano(x) : x)),
                            );
                            setFinestraPer(b.id);
                          }}
                        >
                          Compila a mano
                        </Button>
                        <span>oppure toglila e riprova.</span>
                      </p>
                    )}

                    {b.stato === "letta" && b.esito !== "salvata" && (
                      <>
                        <div className="grid gap-2 sm:grid-cols-[minmax(9rem,12rem)_9rem_minmax(0,1fr)_8rem]">
                          <p className="hidden text-xs font-medium text-muted-foreground sm:block">
                            Numero DDT
                          </p>
                          <p className="hidden text-xs font-medium text-muted-foreground sm:block">
                            Data documento
                          </p>
                          <p className="hidden text-xs font-medium text-muted-foreground sm:block">
                            Fornitore
                          </p>
                          <p className="hidden text-xs font-medium text-muted-foreground sm:block">
                            Destinazione
                          </p>
                          <Input
                            aria-label={`Numero bolla ${b.file.name}`}
                            placeholder="Numero"
                            value={b.numero}
                            disabled={salvando || !!b.ddtCreatoId}
                            className="h-9"
                            onChange={(e) =>
                              cambia(b.id, { numero: e.target.value })
                            }
                          />
                          <Input
                            aria-label={`Data bolla ${b.file.name}`}
                            type="date"
                            value={b.data}
                            disabled={salvando || !!b.ddtCreatoId}
                            className="h-9"
                            onChange={(e) =>
                              cambia(b.id, { data: e.target.value })
                            }
                          />
                          <Select
                            value={b.supplierId ?? "nessuno"}
                            disabled={salvando || !!b.ddtCreatoId}
                            onValueChange={(v) =>
                              cambia(b.id, {
                                supplierId: v === "nessuno" ? null : v,
                                abbinatoPer: null,
                              })
                            }
                          >
                            <SelectTrigger
                              className="h-8"
                              aria-label={`Fornitore bolla ${b.file.name}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nessuno">
                                {b.fornitoreLetto
                                  ? `Non in rubrica: ${b.fornitoreLetto}`
                                  : "Fornitore non riconosciuto"}
                              </SelectItem>
                              {rubrica.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={b.destinazione}
                            disabled={salvando || !!b.ddtCreatoId}
                            onValueChange={(v) =>
                              cambia(b.id, {
                                destinazione: v as BollaLetta["destinazione"],
                              })
                            }
                          >
                            <SelectTrigger
                              className="h-8"
                              aria-label={`Destinazione bolla ${b.file.name}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="magazzino">
                                Magazzino
                              </SelectItem>
                              <SelectItem value="cantiere">Cantiere</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {conflittoFornitore(b, rubrica) && (
                          <p
                            role="alert"
                            className="rounded-md bg-amber-50 p-2 text-xs font-medium text-amber-900"
                          >
                            Il fornitore scelto ha una partita IVA diversa da
                            quella letta sul documento. Verifica l’associazione.
                          </p>
                        )}
                        {!b.supplierId &&
                          b.fornitoreLetto &&
                          puoCreareFornitore && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={salvando || !!b.ddtCreatoId}
                              onClick={() => setNuovoFornitore(b.id)}
                            >
                              Crea fornitore dai dati letti
                            </Button>
                          )}
                        <div className="grid items-start gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Commessa
                            </p>
                            <OrderSelectCombobox
                              companyId={companyId}
                              filtroIniziale="all"
                              value={b.orderId ?? undefined}
                              disabled={salvando || !!b.ddtCreatoId}
                              placeholder="Commessa (facoltativa)"
                              onChange={(id) => cambia(b.id, { orderId: id })}
                            />
                          </div>
                          {b.destinazione === "cantiere" ? (
                            <p className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-900">
                              Consegna diretta in cantiere: non entra nelle
                              giacenze di magazzino.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">
                                Magazzino di arrivo
                              </p>
                              <WarehouseSelect
                                value={b.warehouseId ?? warehouseId}
                                disabled={salvando || !!b.ddtCreatoId}
                                placeholder="Magazzino predefinito dell’azienda"
                                onChange={(id) =>
                                  cambia(b.id, { warehouseId: id })
                                }
                              />
                            </div>
                          )}
                          {b.orderId && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              disabled={salvando || !!b.ddtCreatoId}
                              onClick={() => cambia(b.id, { orderId: null })}
                            >
                              Togli commessa
                            </Button>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {b.righe.length}{" "}
                            {b.righe.length === 1 ? "riga" : "righe"} merce
                            {b.abbinatoPer
                              ? ` · fornitore riconosciuto da ${b.abbinatoPer}`
                              : ""}
                          </span>
                        </div>
                        {richiedeCaricoManuale(b.grezzo) && (
                          <p
                            role="alert"
                            className="text-xs font-medium text-amber-800"
                          >
                            Documento da verificare: reso, noleggio o
                            destinazioni miste. Le righe non verranno caricate
                            automaticamente in magazzino; verifica dalla scheda
                            DDT.
                          </p>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant={b.righe.length ? "outline" : "default"}
                          disabled={salvando || !!b.ddtCreatoId}
                          onClick={() => setFinestraPer(b.id)}
                        >
                          {b.righe.length
                            ? "Controlla la bolla con la foto a fianco"
                            : "Compila le righe guardando la foto"}
                        </Button>
                        {companyId && (
                          <CollegamentiBolla
                            bolla={b}
                            companyId={companyId}
                            disabled={salvando || !!b.ddtCreatoId}
                            onChange={(patch) => cambia(b.id, patch)}
                          />
                        )}
                        <RigheLetteBolla
                          righe={b.righe}
                          documento={b.grezzo}
                          nomeFile={b.file.name}
                        />
                        {[...bloccanti, ...dubbiB].length > 0 && (
                          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle
                              aria-hidden="true"
                              className="mt-0.5 h-3 w-3 shrink-0"
                            />
                            {[...bloccanti, ...dubbiB].join(" · ")}
                          </p>
                        )}
                        {b.avvisi.length > 0 && (
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">
                              Note della lettura ({b.avvisi.length})
                            </summary>
                            <p className="mt-1">{b.avvisi.join(" · ")}</p>
                          </details>
                        )}
                        {doppio && (
                          <label className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <Checkbox
                              checked={b.caricaComunque}
                              disabled={salvando}
                              onCheckedChange={(v) =>
                                cambia(b.id, { caricaComunque: v === true })
                              }
                            />
                            {doppio === "gia_presente"
                              ? "Stesso numero, data e fornitore già registrati."
                              : "Stesso numero, data e fornitore: confronta gli originali, potrebbero essere versioni diverse."}{" "}
                            Carica comunque
                          </label>
                        )}
                        {b.esito === "errore" && (
                          <p className="text-xs text-destructive">
                            Non salvata: {b.motivoEsito}
                          </p>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {bollaNuovoFornitore && companyId && (
          <NuovoFornitoreDaBolla
            key={bollaNuovoFornitore.id}
            bolla={bollaNuovoFornitore}
            companyId={companyId}
            fornitori={rubrica}
            onChiudi={() => setNuovoFornitore(null)}
            onCreato={(fornitore) => {
              const aggiornati = [
                ...rubrica.filter((f) => f.id !== fornitore.id),
                fornitore,
              ];
              queryClient.setQueryData(
                ["ddt-fornitori-abbinamento", companyId],
                aggiornati,
              );
              setBolle((attuali) =>
                riabbinaFornitori(
                  attuali.map((b) =>
                    b.id === bollaNuovoFornitore.id
                      ? { ...b, supplierId: fornitore.id, abbinatoPer: null }
                      : b,
                  ),
                  aggiornati,
                ),
              );
              setNuovoFornitore(null);
            }}
          />
        )}
        {bollaInFinestra && (
          <FinestraBollaFotoRighe
            open
            onOpenChange={(v) => {
              if (!v) setFinestraPer(null);
            }}
            files={[bollaInFinestra.file]}
            companyId={companyId}
            testata={bollaInFinestra}
            onTestataChange={(patch) =>
              cambia(bollaInFinestra.id, {
                ...patch,
                ...(patch.supplierId !== undefined ? { abbinatoPer: null } : {}),
              })
            }
            righe={bollaInFinestra.righe}
            onRigheChange={(righe) => cambia(bollaInFinestra.id, { righe })}
            fornitoreLetto={bollaInFinestra.supplierId ? null : bollaInFinestra.fornitoreLetto}
            mostraDestinazione
            disabled={salvando || !!bollaInFinestra.ddtCreatoId}
            avvisi={[
              ...(doppi.get(bollaInFinestra.id) && !bollaInFinestra.caricaComunque
                ? ["stesso numero, data e fornitore già presenti: decidi nella lista"]
                : []),
              ...(conflittoFornitore(bollaInFinestra, rubrica)
                ? ["P.IVA del fornitore diversa da quella letta"]
                : []),
            ]}
            carico={{
              visibile: puoMagazzino && bollaInFinestra.destinazione === "magazzino",
              valore: caricaMagazzino,
              onChange: setCaricaMagazzino,
            }}
            conferma={{
              etichetta: "Registra la bolla",
              inCorso: salvando,
              bloccata:
                inLettura
                  ? "aspetta la fine delle letture"
                  : doppi.get(bollaInFinestra.id) && !bollaInFinestra.caricaComunque
                    ? "doppione: spunta «Carica comunque» nella lista"
                    : null,
              onConferma: () => {
                const b = bollaInFinestra;
                setFinestraPer(null);
                void conferma([b]);
              },
            }}
          />
        )}
        <DialogFooter className="items-center border-t bg-background px-6 py-4">
          {caricoVisibile && (
            <SpuntaCaricoMagazzino
              checked={caricaMagazzino}
              onChange={setCaricaMagazzino}
              disabled={salvando}
            />
          )}
          <p className="mr-auto text-xs text-muted-foreground">
            {selezionate.size
              ? "Registri solo le selezionate idonee."
              : "Registri tutte le bolle idonee."}{" "}
            I duplicati restano esclusi.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onOpenChange(false)}
          >
            {salvate > 0 ? "Chiudi" : "Annulla"}
          </Button>
          <Button
            type="button"
            disabled={
              salvando ||
              inLettura ||
              preparando > 0 ||
              daDividere.length > 0 ||
              daSalvare.length === 0
            }
            onClick={() => void conferma()}
          >
            {salvando && (
              <Loader2
                aria-hidden="true"
                className="mr-1.5 h-4 w-4 animate-spin"
              />
            )}
            {daDividere.length > 0
              ? "Prima controlla dove tagliare"
              : inLettura
                ? "Sto leggendo…"
                : `Registra ${daSalvare.length} ${daSalvare.length === 1 ? "bolla" : "bolle"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
