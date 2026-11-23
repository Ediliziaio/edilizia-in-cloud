import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardList, FolderOpen, Search, Settings2, Table2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KindIcon } from "@/components/orders/filePreview";
import { fileKind, KIND_LABEL } from "@/components/orders/filePreviewUtils";
import { DocumentFoldersNavigation, SENZA_CARTELLA, TUTTI_DOCUMENTI } from "@/components/orders/DocumentFoldersNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { useChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { usePermissions } from "@/hooks/usePermissions";
import { contaPerCartella } from "@/lib/commesse/documentiCommessa";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";
import { documentoNelFiltro, type FiltroDocumenti } from "@/lib/orders/generali/documentiFiltri";
import { formattaData, riepilogoVoceFiglie, testoCasella, type AllegatoCommessa, type CasellaDocumento, type ChecklistDocumenti } from "@/lib/orders/generali/documenti";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { cn } from "@/lib/utils";
import type { PropsScheda } from "../tipiScheda";
import { DocumentoContrattoAppalto } from "../contratto/DocumentoContrattoAppalto";
import { DialogContentOperativo } from "../design/ContestoOperativo";
import { AmbitoOperazione } from "../moduli/AmbitoOperazione";
import { IconaStato } from "./IconaStato";
import { PannelloVoce } from "./PannelloVoce";
import { COLORE_TONO, nomeBreve, testoBreve, tonoCasella } from "./statoVisivo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const OrderAttachments = lazy(() => import("@/components/orders/OrderAttachments").then(m => ({ default: m.OrderAttachments })));
const OriginaleDocumentoDialog = lazy(() => import("./OriginaleDocumentoDialog").then(m => ({ default: m.OriginaleDocumentoDialog })));

type Vista = "requisiti" | "unita" | "archivio";
type Commessa = { id: string; codice?: string | null; nome: string };
const FILTRI = [
  { id: "tutti", nome: "Tutti" },
  { id: "mancanti", nome: "Mancanti", colore: "text-destructive" },
  { id: "in_scadenza", nome: "In scadenza", colore: COLORE_TONO.ambra },
  { id: "scaduti", nome: "Scaduti", colore: "text-destructive" },
  { id: "senza_data", nome: "Senza scadenza", colore: COLORE_TONO.ambra },
  { id: "presenti", nome: "Obbligatori presenti", colore: COLORE_TONO.verde },
] as const satisfies readonly { id: FiltroDocumenti; nome: string; colore?: string }[];

const CAMPO_STATO = "stato-documenti";
const CAMPO_AMBITO = "ambito-documenti";
const CAMPO_VISTA = "vista-documenti";
const CAMPO_CARTELLA = "cartella-documenti";
const Tutta = { id: "", nome: "Tutta l’operazione" };
const nomeCommessa = (c: Commessa) => [c.codice, c.nome].filter(Boolean).join(" · ");
const data = (s: string | null | undefined) => s ? formattaData(s) : "—";
const classeTesto = "block max-w-full truncate text-left";
const gravita = (c: CasellaDocumento) => {
  if (c.stato === "scaduto") return 0;
  if (c.stato === "in_scadenza") return 1;
  if (c.stato === "mancante" && c.obbligatoria) return 2;
  if (c.senzaData) return 3;
  return c.stato === "presente" ? 4 : 5;
};

export function SchedaDocumenti({ riepilogo: r, puoModificare }: PropsScheda) {
  const t = useT();
  const [parametri, setParametri] = useSearchParams();
  const { hash } = useLocation();
  const [cerca, setCerca] = useState("");
  const [voce, setVoce] = useState<{ orderId: string; id: string }>();
  const [originale, setOriginale] = useState<AllegatoCommessa>();
  const [gestione, setGestione] = useState<string>();
  const ritornoOriginale = useRef<HTMLElement | null>(null);
  const isMobile = useIsMobile();
  const permissions = usePermissions();
  const dati = useChecklistGenerale(r);
  const generaleId = r.generale.id;
  const principale: Commessa = { id: generaleId, codice: r.generale.codice, nome: t("Commessa generale") };
  const tutta = { ...Tutta, nome: t(Tutta.nome) };
  const commesse = new Map<string, Commessa>([[generaleId, principale], ...r.figlie.map(f => [f.id, f] as const)]);
  const richiestaVista = parametri.get(CAMPO_VISTA);
  const vista: Vista = richiestaVista === "archivio" || (hash === "#contratto-appalto" && !richiestaVista) ? "archivio"
    : richiestaVista === "unita" && r.figlie.length ? "unita" : "requisiti";
  const categorie = useCartelleDocumenti({ tutte: true, enabled: vista === "archivio" });
  const perIdCartella = new Map(categorie.cartelle.map(c => [c.id, c.nome]));
  const richiestaCartella = parametri.get(CAMPO_CARTELLA);
  const cartella = !categorie.isError && richiestaCartella &&
    (richiestaCartella === SENZA_CARTELLA ? !categorie.isLoading : perIdCartella.has(richiestaCartella))
    ? richiestaCartella : TUTTI_DOCUMENTI;
  const nomeCartella = (f: AllegatoCommessa) => categorie.isLoading || categorie.isError ? ""
    : (f.folder_id && perIdCartella.get(f.folder_id)) || t("Senza cartella");
  const richiestaAmbito = parametri.get(CAMPO_AMBITO) ?? "";
  const ambito = commesse.has(richiestaAmbito) && (vista !== "unita" || richiestaAmbito !== generaleId) ? richiestaAmbito : "";
  const attivo = FILTRI.find(s => s.id === parametri.get(CAMPO_STATO))?.id ?? "tutti";
  const cambia = (chiave: string, valore: string) => {
    const p = new URLSearchParams(parametri);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    if (chiave === CAMPO_VISTA && valore === "unita" && richiestaAmbito === generaleId) p.delete(CAMPO_AMBITO);
    setParametri(p, { replace: true });
  };
  const tutte = useMemo(() => {
    const c = dati.checklist;
    return c ? [...c.generale, ...c.figlie.flatMap(g => g.caselle)] : [];
  }, [dati.checklist]);
  const selezionata = voce ? tutte.find(c => c.orderId === voce.orderId && c.voce.id === voce.id) : undefined;
  const apriVoce = (c: CasellaDocumento) => setVoce({ orderId: c.orderId, id: c.voce.id });
  const apriOriginale = (file: AllegatoCommessa) => {
    ritornoOriginale.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOriginale(file);
  };
  const descrivi = (orderId: string) => {
    const commessa = commesse.get(orderId);
    return commessa ? nomeCommessa(commessa) : t("Commessa collegata");
  };
  const righeAmbito = ambito ? tutte.filter(c => c.orderId === ambito) : tutte;
  const casellePerVista = vista === "unita" ? righeAmbito.filter(c => c.orderId !== generaleId) : righeAmbito;
  const cercaVoce = (c: CasellaDocumento) => cercaNellOperazione(cerca, [
    c.voce.nome, descrivi(c.orderId), ...c.documenti.map(d => d.allegato.file_name),
  ]);
  const modificabile = puoModificare && !isMobile;
  const unita = DEFINIZIONI_MODELLI[r.generale.modello].figlia;
  const viste = [
    { id: "requisiti", nome: t("Checklist"), icona: ClipboardList },
    ...(r.figlie.length ? [{ id: "unita", nome: t("Per {tipo}", { tipo: t(unita.una) }), icona: Table2 }] : []),
    { id: "archivio", nome: t("File originali"), icona: FolderOpen },
  ] as const;

  if (dati.isLoading) return <Skeleton className="h-48 rounded-lg" />;
  if (dati.isError || !dati.checklist) {
    return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
      <p>{t("Documenti della commessa non disponibili.")}</p>
      <Button size="sm" variant="outline" onClick={dati.refetch}>{t("Riprova")}</Button>
    </div>;
  }

  const scopeKey = JSON.stringify([vista, ambito, attivo, cerca, vista === "archivio" ? cartella : null]);
  const elenco = vista === "requisiti" ? righeAmbito.filter(c => documentoNelFiltro(c, attivo) && cercaVoce(c))
    .sort((a, b) => gravita(a) - gravita(b) || (a.scadenza ?? "9999").localeCompare(b.scadenza ?? "9999")
      || Number(b.orderId === generaleId) - Number(a.orderId === generaleId)) : [];

  const fileAmbito = vista === "archivio" ? [...dati.allegatiPer.entries()]
    .filter(([id]) => commesse.has(id) && (!ambito || id === ambito)).flatMap(([, righe]) => righe) : [];
  const perCartella = contaPerCartella(fileAmbito);
  const senzaCartella = fileAmbito.length - categorie.cartelle.reduce((n, c) => n + (perCartella[c.id] ?? 0), 0);
  const file = fileAmbito.filter(a => {
    const id = a.folder_id && perIdCartella.has(a.folder_id) ? a.folder_id : SENZA_CARTELLA;
    return (cartella === TUTTI_DOCUMENTI || id === cartella)
      && cercaNellOperazione(cerca, [a.file_name, descrivi(a.order_id), KIND_LABEL[fileKind(a)], nomeCartella(a)]);
  })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));

  return <section aria-labelledby="titolo-documenti-generale" className="generale-sheet generale-documenti min-w-0 space-y-2">
    <div className="generale-panel">
      <header className="flex flex-wrap items-center justify-between gap-1.5 border-b px-3 py-2">
        <h2 id="titolo-documenti-generale" className="flex items-center gap-2 text-sm font-semibold">
          <FolderOpen className="size-4 text-primary" aria-hidden="true" /> {t("Archivio e scadenze")}
        </h2>
        {(permissions.isAdmin || permissions.canViewSettingsOrders) && <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs">
          <Link to="/azienda/impostazioni/cartelle-documenti#documenti-generali" aria-label={t("Impostazioni requisiti")}>
            <Settings2 className="size-3.5" aria-hidden="true" /> {isMobile ? t("Requisiti") : t("Impostazioni requisiti")}
          </Link>
        </Button>}
      </header>
      <div className="generale-registro-strumenti flex min-w-0 flex-wrap items-center gap-2 px-2.5 py-1.5">
        <div role="group" aria-label={t("Viste documenti")} className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
          {viste.map(({ id, nome, icona: Icona }) => <Button key={id} type="button" size="sm" variant="ghost"
            aria-pressed={vista === id}
            className={cn("h-8 gap-1.5 px-2 text-xs", vista === id && "bg-card text-foreground shadow-sm")}
            onClick={() => {
              if (vista !== id) {
                setCerca("");
                cambia(CAMPO_VISTA, id === "requisiti" && hash !== "#contratto-appalto" ? "" : id);
              }
            }}>
            <Icona className="size-3.5 text-primary" aria-hidden="true" /> {nome}
          </Button>)}
        </div>
        <div className="relative min-w-[10rem] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label={t("Cerca nei documenti della commessa")}
            placeholder={vista === "archivio" ? t("Nome file o codice…") : vista === "unita" ? t("Nome o codice…") : t("Documento, file o codice…")}
            className="h-8 pl-8 pr-8 text-xs" value={cerca} onChange={e => setCerca(e.target.value)} />
          {cerca && <button type="button" aria-label={t("Cancella ricerca")} className="absolute right-1 top-1 grid size-6 place-items-center rounded hover:bg-muted"
            onClick={() => setCerca("")}><X className="size-3.5" aria-hidden="true" /></button>}
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-60">
          <span className="text-xs font-medium">{t("Ambito")}</span>
          <AmbitoOperazione fissi={vista === "unita" ? [tutta] : [tutta, principale]} figlie={r.figlie} valore={ambito}
            onChange={id => cambia(CAMPO_AMBITO, id)} etichetta={t("Ambito dei documenti")} />
        </div>
        {vista === "archivio" && <Button type="button" variant="outline" size="sm" className="ml-auto h-8 gap-1.5"
          onClick={() => setGestione(ambito || generaleId)}>
          <FolderOpen className="size-3.5" aria-hidden="true" /> {ambito ? t("Gestisci archivio") : t("Archivio della generale")}
        </Button>}
      </div>
      {vista !== "archivio" && <div className="flex flex-wrap items-center gap-1 border-t bg-muted/20 px-2.5 py-1.5" role="group" aria-label={t("Stato dei documenti")}>
        {FILTRI.map(s => {
          const valore = s.id === "tutti" ? casellePerVista.length : casellePerVista.filter(c => documentoNelFiltro(c, s.id)).length;
          const selezionato = s.id === attivo;
          return <Button key={s.id} type="button" variant={selezionato ? "default" : "outline"} size="sm"
            aria-pressed={selezionato} className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => cambia(CAMPO_STATO, s.id === "tutti" ? "" : s.id)}>
            {t(s.nome)} <span className={cn("font-semibold tabular-nums", !selezionato && ("colore" in s ? s.colore : "text-muted-foreground"))}>{valore}</span>
          </Button>;
        })}
      </div>}
    </div>

    {vista === "archivio" && (!ambito || ambito === generaleId) && <DocumentoContrattoAppalto
      riepilogo={r} puoModificare={modificabile} apriOriginale={apriOriginale} />}
    {vista === "requisiti" && <RegistroDocumenti key={scopeKey} righe={elenco} dimensione={20}
      singolare={t("voce")} plurale={t("voci")} vuoto={t("Nessun requisito corrisponde ai filtri.")}
      nome={t("Checklist documenti")} intestazione={<>
        <th scope="col" className="w-[53%] md:w-auto">{t("Documento")}</th>
        <th scope="col" className="hidden md:table-cell">{unita.tante === "Unità" ? t("Commessa / unità") : t("Commessa / ordine")}</th>
        <th scope="col">{t("Stato")}</th><th scope="col" className="hidden lg:table-cell">{t("Scadenza")}</th>
        <th scope="col" className="hidden md:table-cell">{t("Originale")}</th>
        <th scope="col" className="w-9 text-right"><span className="sr-only">{t("Azioni")}</span></th>
      </>}>
      {c => {
        const primo = c.documenti[0]?.allegato;
        const deveCaricare = modificabile && c.stato === "mancante";
        return <tr key={`${c.orderId}:${c.voce.id}`}>
          <td className="min-w-0">
            <button type="button" className={cn(classeTesto, "font-medium hover:text-primary hover:underline")} title={c.voce.nome} onClick={() => apriVoce(c)}>
              {c.voce.nome}
            </button>
            <div className="truncate text-[11px] text-muted-foreground md:hidden">{descrivi(c.orderId)}</div>
            {primo && <button type="button" className="block max-w-full truncate text-left text-[11px] text-primary hover:underline md:hidden"
              onClick={() => apriOriginale(primo)}>{primo.file_name}</button>}
          </td>
          <td className="hidden md:table-cell"><span className="block max-w-64 truncate text-xs" title={descrivi(c.orderId)}>{descrivi(c.orderId)}</span></td>
          <td><StatoDocumento casella={c} /></td>
          <td className="hidden whitespace-nowrap text-xs tabular-nums lg:table-cell">{data(c.scadenza)}</td>
          <td className="hidden max-w-60 md:table-cell">{primo ? <button type="button" className={cn(classeTesto, "text-xs text-primary hover:underline")}
            title={primo.file_name} onClick={() => apriOriginale(primo)}>
            {primo.file_name}{c.documenti.length > 1 && <span className="ml-1 text-muted-foreground">+{c.documenti.length - 1}</span>}
          </button> : <span className="text-xs text-muted-foreground">—</span>}</td>
          <td className="text-right">
            <Button type="button" variant="ghost" size="icon" className="size-8"
              aria-label={t(deveCaricare ? "Carica {voce} · {dove}" : "Dettagli {voce} · {dove}", { voce: c.voce.nome, dove: descrivi(c.orderId) })}
              onClick={() => apriVoce(c)} title={deveCaricare ? t("Carica o collega file") : t("Dettagli requisito")}>
              {deveCaricare ? <Upload className="size-4 text-primary" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
            </Button>
          </td>
        </tr>;
      }}
    </RegistroDocumenti>}

    {vista === "unita" && <MatriceDocumenti key={scopeKey} checklist={dati.checklist}
      figlie={r.figlie.filter(f => (!ambito || ambito === f.id) && cercaNellOperazione(cerca, [f.codice, f.nome, f.indirizzo]))}
      filtro={attivo} titolo={unita.tante} apri={apriVoce} />}

    {vista === "archivio" && <div className="grid min-w-0 items-start gap-2 md:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="generale-panel min-w-0 p-2 md:max-h-[58dvh] md:overflow-y-auto">
        <DocumentFoldersNavigation
          compact={isMobile}
          cartelle={categorie.isError ? [] : categorie.cartelle} conteggi={perCartella} totale={fileAmbito.length}
          senzaCartella={categorie.isLoading || categorie.isError ? 0 : senzaCartella}
          selezione={cartella} onSelect={id => cambia(CAMPO_CARTELLA, id === TUTTI_DOCUMENTI ? "" : id)}
          loading={categorie.isLoading} puoGestireCartelle={permissions.isAdmin || permissions.canEditSettingsOrders} />
        {categorie.isError && <div role="status" className="space-y-1 p-2 text-xs text-muted-foreground">
          <p>{t("Cartelle non disponibili.")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void categorie.refetch()}>{t("Riprova")}</Button>
        </div>}
      </aside>
      <RegistroDocumenti key={scopeKey} righe={file} dimensione={20}
      singolare={t("file")} plurale={t("file")} vuoto={cerca ? t("Nessun file corrisponde alla ricerca.")
        : cartella === TUTTI_DOCUMENTI ? t("Nessun file in questo ambito.") : t("Nessun file in questa cartella.")}
      nome={t("Originali dell’operazione")} intestazione={<>
        <th scope="col" className="w-[70%] md:w-auto">{t("File originale")}</th>
        <th scope="col" className="hidden md:table-cell">{unita.tante === "Unità" ? t("Commessa / unità") : t("Commessa / ordine")}</th>
        <th scope="col" className="hidden lg:table-cell">{t("Cartella")}</th>
        <th scope="col">{t("Tipo")}</th><th scope="col" className="hidden sm:table-cell">{t("Caricato il")}</th>
      </>}>
      {a => {
        const tipo = fileKind(a);
        return <tr key={a.id}>
          <td>
            <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left font-medium text-primary hover:underline"
              title={a.file_name} onClick={() => apriOriginale(a)}>
              <KindIcon kind={tipo} className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{a.file_name}</span>
            </button>
            <span className="block truncate pl-6 text-[11px] text-muted-foreground md:hidden">
              {[descrivi(a.order_id), nomeCartella(a)].filter(Boolean).join(" · ")}
            </span>
          </td>
          <td className="hidden md:table-cell">{descrivi(a.order_id)}</td>
          <td className="hidden lg:table-cell"><span className="block max-w-44 truncate text-xs" title={nomeCartella(a)}>{nomeCartella(a) || "—"}</span></td>
          <td className="text-xs">{t(KIND_LABEL[tipo])}</td>
          <td className="hidden whitespace-nowrap text-xs tabular-nums sm:table-cell">{data(a.created_at.slice(0, 10))}</td>
        </tr>;
      }}
      </RegistroDocumenti>
    </div>}

    {selezionata && <Dialog open onOpenChange={open => { if (!open) setVoce(undefined); }}>
      <DialogContentOperativo ampiezza="modulo" struttura="contenuta" className="max-h-[86dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{selezionata.voce.nome}</DialogTitle>
          <DialogDescription>{descrivi(selezionata.orderId)} · {testoCasella(selezionata)}
            {selezionata.voce.aiuto && <span className="block">{selezionata.voce.aiuto}</span>}
          </DialogDescription>
        </DialogHeader>
        <PannelloVoce key={`${selezionata.orderId}:${selezionata.voce.id}`} generaleId={generaleId}
          casella={selezionata} allegati={dati.allegatiPer.get(selezionata.orderId) ?? []}
          puoModificare={modificabile} nascondiIntestazione apriOriginale={apriOriginale} />
      </DialogContentOperativo>
    </Dialog>}
    {originale && <Suspense fallback={<span role="status" className="sr-only">{t("Caricamento anteprima…")}</span>}>
      <OriginaleDocumentoDialog key={originale.id} file={originale} ambito={descrivi(originale.order_id)}
        chiudi={() => setOriginale(undefined)} restituisciFocus={() => ritornoOriginale.current?.focus()} />
    </Suspense>}
    {gestione && <Dialog open onOpenChange={open => {
      if (!open) { setGestione(undefined); dati.refetch(); }
    }}>
      <DialogContentOperativo struttura="contenuta" className="max-h-[88dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Archivio della commessa")}</DialogTitle>
          <DialogDescription>{descrivi(gestione)}</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<p role="status" className="text-sm">{t("Caricamento archivio…")}</p>}>
          <OrderAttachments orderId={gestione} orderCode={commesse.get(gestione)?.codice ?? undefined} editable={modificabile}
            cartellaIniziale={cartella === TUTTI_DOCUMENTI ? undefined : cartella} />
        </Suspense>
      </DialogContentOperativo>
    </Dialog>}
  </section>;
}

function StatoDocumento({ casella }: { casella: CasellaDocumento }) {
  const t = useT();
  const tono = tonoCasella(casella);
  return <span className={cn("inline-flex items-center gap-1.5 text-xs", COLORE_TONO[tono])} title={testoCasella(casella)}>
    <IconaStato c={casella} className="size-3.5" />
    {tono === "verde" ? t("Presente") : casella.stato === "in_scadenza" ? t("In scadenza") : testoBreve(casella)}
  </span>;
}

function RegistroDocumenti<T>({ righe, dimensione, singolare, plurale, vuoto, nome, intestazione, children, minimo }: {
  righe: readonly T[];
  dimensione: number;
  singolare: string;
  plurale: string;
  vuoto: string;
  nome: string;
  intestazione: ReactNode;
  children: (riga: T) => ReactNode;
  minimo?: string;
}) {
  const t = useT();
  const [pagina, setPagina] = useState(1);
  const totale = righe.length;
  const pagine = Math.ceil(totale / dimensione);
  const corrente = Math.min(Math.max(1, pagine), pagina);
  const inizio = (corrente - 1) * dimensione;
  const fine = Math.min(totale, inizio + dimensione);
  if (!totale) return <div role="status" className="generale-panel p-4 text-sm text-muted-foreground">{vuoto}</div>;
  return <div className="generale-panel min-w-0 overflow-hidden">
    <div className="overflow-x-auto" tabIndex={minimo ? 0 : undefined} role={minimo ? "region" : undefined} aria-label={minimo ? nome : undefined}>
      <table aria-label={nome} className={cn("generale-registro-tabella table-fixed md:table-auto", minimo)}>
        <thead className="bg-muted/55 text-[11px] text-muted-foreground"><tr>{intestazione}</tr></thead>
        <tbody className="divide-y border-t [&_tr:hover]:bg-muted/30">{righe.slice(inizio, fine).map(children)}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1">
      <span role="status" className="text-xs tabular-nums text-muted-foreground">
        {pagine > 1 ? t("{inizio}–{fine} di {totale} {plurale}", { inizio: inizio + 1, fine: String(fine ?? ""), totale: String(totale ?? ""), plurale: String(plurale ?? "") }) : `${totale} ${totale === 1 ? singolare : plurale}`}
      </span>
      {pagine > 1 && <nav aria-label={t("Pagine di {nome}", { nome: nome.toLowerCase() })} className="flex gap-1">
        <Button type="button" variant="outline" size="icon" className="size-8" aria-label={t("Pagina precedente")}
          disabled={corrente <= 1} onClick={() => setPagina(corrente - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
        <Button type="button" variant="outline" size="icon" className="size-8" aria-label={t("Pagina successiva")}
          disabled={corrente >= pagine} onClick={() => setPagina(corrente + 1)}><ChevronRight className="size-4" aria-hidden="true" /></Button>
      </nav>}
    </div>
  </div>;
}

function MatriceDocumenti({ checklist, figlie, filtro, titolo, apri }: {
  checklist: ChecklistDocumenti;
  figlie: Commessa[];
  filtro: FiltroDocumenti;
  titolo: string;
  apri: (c: CasellaDocumento) => void;
}) {
  const t = useT();
  const idFiglie = new Set(figlie.map(f => f.id));
  const perVoce = checklist.figlie.map(g => ({
    voce: g.voce,
    totale: riepilogoVoceFiglie(g.caselle.filter(c => idFiglie.has(c.orderId))),
    caselle: new Map(g.caselle.map(c => [c.orderId, c])),
  }));
  const righe = perVoce.length ? figlie.filter(f => perVoce.some(g => {
    const c = g.caselle.get(f.id);
    return c && documentoNelFiltro(c, filtro);
  })) : [];
  return <RegistroDocumenti righe={righe} dimensione={12} singolare={titolo === "Unità" ? t("unità") : t("ordine")}
    plurale={t(titolo).toLocaleLowerCase()} nome={t("Matrice dei documenti")} vuoto={t("Nessuna commessa collegata corrisponde ai filtri.")}
    minimo="!w-auto min-w-full !table-auto" intestazione={<>
      <th scope="col" className="sticky left-0 z-10 whitespace-nowrap !bg-card">{t(titolo)}</th>
      {perVoce.map(g => <th scope="col" key={g.voce.id} className="min-w-28" title={g.voce.nome}>
        <span className="block font-medium text-foreground">{nomeBreve(g.voce.nome)}</span>
        <span className="font-normal tabular-nums">{t("{presenti}/{valgono} presenti", { presenti: String(g.totale.presenti ?? ""), valgono: String(g.totale.valgono ?? "") })}</span>
      </th>)}
    </>}>
    {f => <tr key={f.id} className="group">
      <th scope="row" className="sticky left-0 z-10 max-w-44 whitespace-nowrap !bg-card group-hover:!bg-muted">
        <Link to={`/azienda/ordini/${f.id}?tab=panoramica&section=section-documenti`} className="block truncate font-medium text-primary hover:underline"
          title={nomeCommessa(f)}>{f.codice || f.nome}</Link>
      </th>
      {perVoce.map(g => {
        const c = g.caselle.get(f.id);
        return <td key={g.voce.id} className="whitespace-nowrap">
          {c && documentoNelFiltro(c, filtro) ? <button type="button" onClick={() => apri(c)}
            className="rounded px-1 py-0.5 text-left hover:bg-muted" aria-label={`${g.voce.nome} · ${nomeCommessa(f)} · ${testoCasella(c)}`}>
            <StatoDocumento casella={c} />
          </button> : <span className="text-muted-foreground">—</span>}
        </td>;
      })}
    </tr>}
  </RegistroDocumenti>;
}
