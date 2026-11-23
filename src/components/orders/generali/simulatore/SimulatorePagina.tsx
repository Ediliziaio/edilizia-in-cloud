// src/components/orders/generali/simulatore/SimulatorePagina.tsx
// Il simulatore prima dell'acquisto: si scrive un'ipotesi e si vede subito se conviene,
// la si salva, la si confronta con altre, e quando si decide «Diventa operazione».
// Tablet e computer: tutto. Telefono: sola lettura delle ipotesi salvate.
import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImportaBusinessPlan, type VoceImportata, type OrigineBusinessPlan } from "../piano/ImportaBusinessPlan";
import { conservaOriginaleAi } from "@/lib/orders/documentImportAi";
import { ipotesiDaPiano } from "@/lib/orders/generali/simulatoreImport";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Rocket, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Confronto, type IpotesiDaConfrontare } from "@/components/orders/generali/simulatore/Confronto";
import { DettaglioVoci } from "@/components/orders/generali/simulatore/DettaglioVoci";
import { DiventaOperazioneDialog } from "@/components/orders/generali/simulatore/DiventaOperazioneDialog";
import { FormIpotesi } from "@/components/orders/generali/simulatore/FormIpotesi";
import { Risultati, Sensibilita } from "@/components/orders/generali/simulatore/Risultati";
import { euro, percento } from "@/components/orders/generali/piano/formato";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";
import { useEliminaIpotesi, useIpotesiSalvata, useIpotesiSalvate, useSalvaIpotesi, type IpotesiSalvata } from "@/hooks/useGeneraleSimulatore";
import { messaggioErrore } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";
import { calcolaIpotesi, ipotesiDiPartenza, MODELLI_SIMULATI, type Ipotesi, type ModelloSimulato } from "@/lib/orders/generali/simulatore";
import { fonteDaParametri, importoLavoriDaComputo, ipotesiDaPlanimetria } from "@/lib/orders/generali/ipotesiDaPlanimetria";
import { caricaPlanimetria, caricaVersione } from "@/lib/planimetrie/archivio";
import { idComputoStudio, studioVariante, type FonteStudio } from "@/lib/planimetrie/studioImmobiliare";
import type { Planimetria } from "../../../../../shared/planimetrie/modello.ts";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import { percorsoVariantePlanimetria, percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const APERTA = "__aperta";
const meseProssimo = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 7);
};
const dataIt = (d: string) => new Date(d).toLocaleDateString(intlCampo(), { day: "2-digit", month: "2-digit", year: "numeric" });

interface Aperta { id: string | null; nome: string; ipotesi: Ipotesi }
interface OrigineStudio { livelloId?: string }

function stessaVariante(a?: FonteStudio, b?: FonteStudio) {
  return !!a && !!b && a.planimetriaId === b.planimetriaId && a.versione === b.versione && a.varianteId === b.varianteId;
}

async function leggiCostoDellaVariante(companyId: string, fonte: FonteStudio, documento?: Planimetria) {
  const computo = await leggiComputoCloud(companyId, await idComputoStudio(fonte));
  if (!computo || !stessaVariante(fonte, computo.bozza.fontePlanimetria)) return null;
  if (!documento) {
    const pianta = await caricaPlanimetria(fonte.planimetriaId);
    if (pianta.riga.company_id!==companyId) throw new Error("La planimetria non appartiene a questa azienda.");
    documento = (fonte.versione===pianta.versione.numero ? pianta.versione : await caricaVersione(fonte.planimetriaId,fonte.versione)).documento;
  }
  const studio = studioVariante(documento,fonte.varianteId);
  const sospese = new Set(studio.righe.filter(r=>r.quantificazioneSospesa).map(r=>r.id));
  const riepilogo = importoLavoriDaComputo(computo.bozza,sospese);
  const riscontriStrutturali = studio.paretiDaRiscontrare.length;
  return { id:computo.id,...riepilogo,importo:riscontriStrutturali ? null : riepilogo.importo,riscontriStrutturali };
}

const nuova = (modello: ModelloSimulato): Aperta => ({
  id: null,
  nome: modello === "sviluppo" ? "Nuovo sviluppo" : "Nuova compravendita",
  ipotesi: ipotesiDiPartenza(modello, meseProssimo()),
});

export function SimulatorePagina() {
  const t = useT();
  const permissions = usePermissions();
  const { effectiveCompany } = useAuth();
  const [params] = useSearchParams();
  const isMobile = useIsMobile();
  const puoVedere = !!(permissions.isAdmin || permissions.canViewMargins);
  const elenco = useIpotesiSalvate(puoVedere);
  const richiestaIpotesi = params.get("ipotesi");
  const idIpotesi = richiestaIpotesi && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(richiestaIpotesi) ? richiestaIpotesi : null;
  const selezionata = useIpotesiSalvata(idIpotesi,puoVedere && !permissions.isLoading);
  const recuperata = selezionata.data ?? null;
  const salvate = elenco.data ?? [];
  const elencoCompleto = recuperata && !salvate.some(s=>s.id===recuperata.id) ? [recuperata,...salvate] : salvate;
  const { modelli } = useImpostazioniCommesseGenerali();
  const fonte = fonteDaParametri(params);
  const rif = params.get("riferimento"), altra = params.get("confronta");
  const confrontoIniziale = rif && altra && rif !== altra ? [rif,altra] : undefined;
  const apriPrezzi = params.get("prezzi") === "1";
  const ipotesiConfrontata = confrontoIniziale && elenco.data?.find(s => s.id === altra);
  const daPlanimetria = useQuery({
    queryKey:["simulatore-da-planimetria",effectiveCompany?.id,fonte],
    enabled:!!fonte && !!effectiveCompany?.id && puoVedere && permissions.canViewRenderAi && !isMobile && !permissions.isLoading,
    refetchOnMount:"always",
    refetchOnWindowFocus:false,
    queryFn:async () => {
      if (!fonte || !effectiveCompany?.id) throw new Error(t("Riferimento alla planimetria mancante."));
      const pianta = await caricaPlanimetria(fonte.planimetriaId);
      if (pianta.riga.company_id !== effectiveCompany.id) throw new Error(t("La planimetria non appartiene a questa azienda."));
      const versione = fonte.versione === pianta.versione.numero ? pianta.versione : await caricaVersione(fonte.planimetriaId,fonte.versione);
      const lavori = permissions.canViewPreventivi ? await leggiCostoDellaVariante(effectiveCompany.id, fonte, versione.documento).catch((): null => null) : null;
      const livelloId = versione.documento.livelli.find(l => l.proposte.some(p => p.id === fonte.varianteId))?.id;
      return {
        ipotesi: ipotesiDaPlanimetria({ documento:versione.documento, fonte, inizio:meseProssimo(), importoComputo:lavori?.importo ?? null }),
        origine: { livelloId },
      };
    },
  });

  if (permissions.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!puoVedere) {
    return (
      <div role="alert" className="rounded-lg border p-6">
        <h1 className="text-lg font-semibold">{t("Valuta un'operazione")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Per usare il simulatore serve il permesso di vedere i margini. Chiedilo al titolare.")}</p>
      </div>
    );
  }
  if (params.has("ipotesi") && (!idIpotesi || !effectiveCompany?.id)) return <p role="alert" className="rounded-lg border p-4">{t("Riferimento all’ipotesi non valido.")}</p>;
  if (idIpotesi && selezionata.isPending) return <Skeleton className="h-64 w-full" />;
  if (idIpotesi && !recuperata) return <p role="alert" className="rounded-lg border p-4">{t("L’ipotesi collegata non è disponibile.")}</p>;
  if (isMobile) return <SoloLettura key={idIpotesi} elenco={elencoCompleto} caricamento={elenco.isPending} apriId={idIpotesi} />;
  if (fonte && !permissions.canViewRenderAi) return <p role="alert" className="rounded-lg border p-4">{t("Serve il permesso per consultare le planimetrie.")}</p>;
  if (fonte && !effectiveCompany?.id) return <p role="alert" className="rounded-lg border p-4">{t("Seleziona l’azienda della planimetria.")}</p>;
  if (params.has("planimetria") && !fonte) return <p role="alert" className="rounded-lg border p-4">{t("Riferimento alla variante non valido.")}</p>;
  if (confrontoIniziale && elenco.isPending) return <Skeleton className="h-64 w-full" />;
  if (fonte && (daPlanimetria.isPending || (daPlanimetria.isFetching && !daPlanimetria.isFetchedAfterMount))) return <Skeleton className="h-64 w-full" />;
  if (fonte && daPlanimetria.error) return <div role="alert" className="space-y-3 rounded-lg border p-4"><p>{daPlanimetria.error.message}</p><Button asChild variant="outline"><Link to={percorsiPlanimetrie.pianta(fonte.planimetriaId)}>{t("Torna alla planimetria")}</Link></Button></div>;
  return <Editor key={JSON.stringify([fonte,confrontoIniziale,apriPrezzi,idIpotesi])}
    iniziale={recuperata ?? daPlanimetria.data?.ipotesi ?? ipotesiConfrontata} origineStudio={daPlanimetria.data?.origine}
    confrontoIniziale={confrontoIniziale} apriPrezzi={apriPrezzi}
    salvate={elencoCompleto} caricamento={elenco.isPending} modelliAttivi={modelli} puoCreare={!!(permissions.isAdmin || permissions.canEditOrders)}
    puoLeggereComputi={!!permissions.canViewPreventivi && !!permissions.canViewRenderAi} />;
}

function Intestazione({ children }: { children?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/azienda/ordini" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {t("Commesse")}
        </Link>
        <h1 className="text-xl font-semibold">{t("Valuta un'operazione")}</h1>
        <p className="text-sm text-muted-foreground">{t("Prima di comprare: scrivi l'ipotesi e guarda subito se conviene. Niente commessa finché non decidi.")}</p>
      </div>
      {children}
    </div>
  );
}

/** Telefono: le ipotesi salvate con i loro numeri, senza modificarle. */
function SoloLettura({ elenco, caricamento, apriId }: { elenco: IpotesiSalvata[]; caricamento: boolean; apriId: string | null }) {
  const t = useT();
  const [aperta, setAperta] = useState(apriId);
  return (
    <div className="space-y-3">
      <Intestazione />
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t("Da telefono le ipotesi si guardano soltanto: per scriverle usa un tablet o un computer.")}</p>
      {caricamento && <Skeleton className="h-24 w-full" />}
      {!caricamento && elenco.length === 0 && <p className="text-sm text-muted-foreground">{t("Nessuna ipotesi salvata.")}</p>}
      {elenco.map((s) => {
        const r = calcolaIpotesi(s.ipotesi);
        return (
          <div key={s.id} className="rounded-lg border bg-card">
            <button type="button" className="w-full px-3 py-2 text-left" aria-expanded={aperta === s.id} onClick={() => setAperta(aperta === s.id ? null : s.id)}>
              <p className="text-sm font-semibold" dir="auto">{s.nome}</p>
              <p className="text-xs text-muted-foreground">{t(DEFINIZIONI_MODELLI[s.modello].nome)} · {dataIt(s.aggiornataIl)}</p>
              <p className="text-sm tabular-nums">{t("Utile {utile} · ROE {roe}", { utile: euro(r.numeri.utileNetto), roe: percento(r.numeri.roe) })}</p>
            </button>
            {aperta === s.id && <div className="border-t px-3 py-2"><Risultati risultato={r} /></div>}
          </div>
        );
      })}
    </div>
  );
}

function Editor({ salvate, caricamento, modelliAttivi, puoCreare, puoLeggereComputi, iniziale, origineStudio, confrontoIniziale, apriPrezzi }: {
  salvate: IpotesiSalvata[];
  caricamento: boolean;
  modelliAttivi: ReturnType<typeof useImpostazioniCommesseGenerali>["modelli"];
  puoCreare: boolean;
  puoLeggereComputi: boolean;
  iniziale?: Aperta;
  origineStudio?: OrigineStudio;
  confrontoIniziale?: string[];
  apriPrezzi: boolean;
}) {
  const t = useT();
  const euroConCentesimi = new Intl.NumberFormat(intlCampo(), { style: "currency", currency: "EUR", minimumFractionDigits: 2, useGrouping: "always" });
  const { effectiveCompany } = useAuth();
  const [,setParametri] = useSearchParams();
  const [importAperto, setImportAperto] = useState(false);
  const [importando, setImportando] = useState(false);
  const primoModello: ModelloSimulato = modelliAttivi.includes("sviluppo") || !modelliAttivi.includes("compravendita") ? "sviluppo" : "compravendita";
  const [aperta, setAperta] = useState<Aperta>(() => iniziale ?? nuova(primoModello));
  const [scheda, setScheda] = useState(confrontoIniziale ? "confronto" : "ipotesi");
  const [confronto, setConfronto] = useState<string[]>(confrontoIniziale ?? []);
  const [diventa, setDiventa] = useState<IpotesiSalvata | null>(null);
  const conferma = useConfirm();
  const salva = useSalvaIpotesi();
  const togli = useEliminaIpotesi();

  const risultato = useMemo(() => calcolaIpotesi(aperta.ipotesi), [aperta.ipotesi]);
  const salvata = aperta.id ? salvate.find((s) => s.id === aperta.id) ?? null : null;
  const modificata = !salvata || salvata.nome !== aperta.nome.trim() || JSON.stringify(salvata.ipotesi) !== JSON.stringify(aperta.ipotesi);
  const giaOperazione = salvata?.generaleId ?? null;
  const importDaConfermare = !!aperta.ipotesi.importazione && !aperta.ipotesi.importazione.confermata;
  const f = aperta.ipotesi.planimetria;
  const origine = stessaVariante(f, iniziale?.ipotesi.planimetria) ? origineStudio : undefined;
  const computo = useQuery({
    queryKey: ["simulatore-computo-variante", effectiveCompany?.id, f?.planimetriaId, f?.versione, f?.varianteId],
    enabled: !!f && !!effectiveCompany?.id && puoLeggereComputi && scheda === "ipotesi",
    queryFn: () => leggiCostoDellaVariante(effectiveCompany!.id, f!),
    refetchOnWindowFocus: true,
    retry: false,
  });
  const abbinato = computo.data;
  const costoLavori = risultato.numeri.costoLavori;
  const differenzaCosto = abbinato?.importo == null ? null : abbinato.importo - costoLavori;
  const usaCostoDelComputo = async () => {
    const lettura = await computo.refetch();
    const aggiornato = lettura.data?.importo;
    if (lettura.isError || aggiornato == null) return;
    setAperta(a => {
      const fonte = a.ipotesi.planimetria;
      if (!fonte || a.id !== aperta.id || !stessaVariante(fonte, f)) return a;
      return { ...a, ipotesi: {
        ...a.ipotesi,
        ritocchi: { ...a.ipotesi.ritocchi, costruzione: { ...a.ipotesi.ritocchi.costruzione, importo: aggiornato } },
        planimetria: { ...fonte, computoImportato: true, confermata: false },
      } };
    });
  };
  const datiDaConfermare = importDaConfermare || (!!f && !f.confermata);
  const importaPiano = async (voci: VoceImportata[], origine?: OrigineBusinessPlan) => {
    if (!origine || !effectiveCompany?.id || importando) return;
    setImportando(true);
    try {
      const originale = await conservaOriginaleAi(origine.file, effectiveCompany.id);
      const ipotesi = ipotesiDaPiano(voci, origine.simulazione ?? {}, aperta.ipotesi.modello, { originale, hash: origine.hash, scenario: origine.foglio });
      setAperta({ id: null, nome: `${origine.file.name.replace(/\.[^.]+$/, "")} · ${origine.foglio}`.slice(0,200), ipotesi });
      setScheda("ipotesi"); setImportAperto(false);
      toast.success(t("Piano trasferito nell’ipotesi"), { description: t("Verifica unità e fonti, poi salva. Nessuna commessa è stata creata.") });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("Importazione non riuscita.")); }
    finally { setImportando(false); }
  };

  const disponibili: IpotesiDaConfrontare[] = useMemo(() => [
    ...(modificata ? [{ id: APERTA, nome: t("{nome} (non salvata)", { nome: aperta.nome || t("Ipotesi") }), ipotesi: aperta.ipotesi }] : []),
    ...salvate.map((s) => ({ id: s.id, nome: s.nome, ipotesi: s.ipotesi })),
  ], [modificata, aperta, salvate, t]);
  // Di partenza le prime due salvate; l'ipotesi aperta solo se non ce ne sono abbastanza.
  const confrontabili = confronto.filter(id => disponibili.some(d => d.id === id));
  const scelteConfronto = confrontabili.length ? confrontabili : (salvate.length >= 2 ? salvate.map((s) => s.id) : disponibili.map((d) => d.id)).slice(0, 2);

  const salvaOra = async (comeNuova = false): Promise<IpotesiSalvata | null> => {
    try {
      const nome = (comeNuova ? `${aperta.nome} (copia)` : aperta.nome).trim() || "Ipotesi";
      const id = await salva.mutateAsync({ id: comeNuova ? null : aperta.id, nome, ipotesi: aperta.ipotesi });
      setAperta((a) => ({ ...a, id, nome }));
      toast.success(comeNuova ? t("Copia salvata") : t("Ipotesi salvata"));
      return { id, nome, modello: aperta.ipotesi.modello, ipotesi: aperta.ipotesi, generaleId: comeNuova ? null : salvata?.generaleId ?? null, creataIl: "", aggiornataIl: "" };
    } catch (e) {
      toast.error(t("Non è stato possibile salvare l'ipotesi. {errore}", { errore: messaggioErrore(e) }));
      return null;
    }
  };

  const salvaEApri = async (comeNuova = false) => {
    const salvata = await salvaOra(comeNuova);
    if (salvata) setParametri({ipotesi:salvata.id},{replace:true});
  };

  const eliminaOra = async () => {
    if (!aperta.id) return;
    const ok = await conferma({
      title: t("Eliminare l'ipotesi?"),
      description: t("«{nome}» sparisce dalle ipotesi salvate. Un'operazione già creata da qui resta com'è.", { nome: aperta.nome }),
      confirmLabel: t("Elimina"),
      variant: "destructive",
    });
    if (!ok) return;
    togli.mutate(aperta.id, {
      onSuccess: () => { toast.success(t("Ipotesi eliminata")); setAperta(nuova(aperta.ipotesi.modello)); },
      onError: (e) => toast.error(t("Non è stato possibile eliminarla. {errore}", { errore: messaggioErrore(e) })),
    });
  };

  const apriDiventa = async () => {
    if (datiDaConfermare) { toast.error(t("Conferma prima i dati dell’ipotesi importata.")); return; }
    const s = modificata ? await salvaOra() : salvata;
    if (s) setDiventa(s);
  };

  return (
    <div className="space-y-4">
      <Intestazione>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={() => setImportAperto(true)}>{t("Importa business plan (Excel o PDF AI)")}</Button>
          <div className="space-y-1">
            <Label htmlFor="sim-apri" className="text-sm font-normal text-muted-foreground">{t("Apri")}</Label>
            <Select
              value={aperta.id ?? ""}
              onValueChange={(v) => {
                if (v.startsWith("nuova:")) return setAperta(nuova(v.slice(6) as ModelloSimulato));
                const s = salvate.find((x) => x.id === v);
                if (s) setAperta({ id: s.id, nome: s.nome, ipotesi: s.ipotesi });
              }}
            >
              <SelectTrigger id="sim-apri" className="h-9 w-64 text-sm"><SelectValue placeholder={caricamento ? t("Carico le ipotesi…") : t("Ipotesi nuova (non salvata)")} /></SelectTrigger>
              <SelectContent>
                {MODELLI_SIMULATI.map((m) => <SelectItem key={m} value={`nuova:${m}`}>{t("+ Nuova · {modello}", { modello: t(DEFINIZIONI_MODELLI[m].nome) })}</SelectItem>)}
                {salvate.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome} · {dataIt(s.aggiornataIl)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Intestazione>

      {scheda === "ipotesi" && <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card px-4 py-3">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <Label htmlFor="sim-nome" className="text-sm font-normal text-muted-foreground">{t("Nome dell'ipotesi · {modello}", { modello: t(DEFINIZIONI_MODELLI[aperta.ipotesi.modello].nome) })}</Label>
          <Input id="sim-nome" value={aperta.nome} maxLength={200} className="h-9 text-sm" placeholder={t("Es. Residenza 6 appartamenti")} onChange={(e) => setAperta((a) => ({ ...a, nome: e.target.value }))} />
        </div>
        <Button onClick={() => void salvaEApri()} disabled={salva.isPending || !modificata}><Save className="mr-1 h-4 w-4" />{aperta.id ? t("Salva") : t("Salva l'ipotesi")}</Button>
        {aperta.id && <Button variant="outline" onClick={() => void salvaEApri(true)} disabled={salva.isPending}><Copy className="mr-1 h-4 w-4" />{t("Salva come nuova")}</Button>}
        {aperta.id && <Button variant="ghost" size="icon" aria-label={t("Elimina l'ipotesi")} onClick={() => void eliminaOra()}><Trash2 className="h-4 w-4" /></Button>}
        {giaOperazione ? (
          <Button variant="outline" asChild><Link to={`/azienda/ordini/${giaOperazione}`}>{t("Apri l'operazione creata")}</Link></Button>
        ) : puoCreare ? (
          <Button variant="default" onClick={() => void apriDiventa()} disabled={salva.isPending || datiDaConfermare} className="bg-emerald-700 hover:bg-emerald-800">
            <Rocket className="mr-1 h-4 w-4" />{t("Diventa operazione")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t("Per trasformarla in operazione serve il permesso «Ordini e Commesse».")}</p>
        )}
      </div>}
      {scheda === "ipotesi" && f && <div className="space-y-2 rounded-lg border bg-blue-50/50 p-4 text-sm">
        <p className="font-medium">{t("Unità dalla variante {variante} · planimetria v{versione}", { variante: f.varianteId, versione: f.versione })}</p>
        <p className="text-muted-foreground">{f.computoImportato && differenzaCosto === 0 ? t("Costo lavori dal computo") : t("Costo lavori nell’ipotesi")}{" "}
          <strong className="tabular-nums text-foreground">{euroConCentesimi.format(costoLavori)}</strong></p>
        {abbinato?.importo != null && (differenzaCosto !== 0 || !f.computoImportato) && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2.5">
          <p>{t("Importo lavori nel computo")} <strong className="tabular-nums">{euroConCentesimi.format(abbinato.importo)}</strong>
            {!!differenzaCosto && <span className="ml-2 tabular-nums text-muted-foreground">{differenzaCosto > 0 ? "+" : "−"}{euroConCentesimi.format(Math.abs(differenzaCosto))}</span>}</p>
          <Button size="sm" variant="outline" disabled={computo.isFetching} onClick={() => void usaCostoDelComputo()}>{t("Aggiorna costo dal computo")}</Button>
        </div>}
        {abbinato?.incomplete ? <p className="text-muted-foreground">{t(abbinato.incomplete === 1 ? "Costo dal computo in attesa di {n} voce." : "Costo dal computo in attesa di {n} voci.", { n: abbinato.incomplete })}{abbinato.daMisurare ? ` ${t("{n} quantità da completare.", { n: abbinato.daMisurare })}` : ""}{abbinato.daPrezzare ? ` ${t(abbinato.daPrezzare===1 ? "{n} prezzo da inserire." : "{n} prezzi da inserire.", { n: abbinato.daPrezzare })}` : ""}</p> : null}
        {!!abbinato?.riscontriStrutturali && <p className="text-amber-800">{t("Il costo della variante resta da completare finché ci sono interventi su pareti portanti da riscontrare nel fascicolo.")}</p>}
        {computo.isError && <p role="status" className="text-muted-foreground">{t("Costo del computo al momento non disponibile.")}</p>}
        <p className="text-muted-foreground">{t("Controlla acquisto, prezzi di vendita e calendario prima di usare margine e cassa.")}</p>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.confermata} onChange={e=> {
          const confermata = e.target.checked;
          setAperta(a=>({ ...a,ipotesi:{...a.ipotesi,planimetria:{...f,confermata}} }));
        }} />{t("Ho verificato importi, superfici e mesi. Gli eventuali zeri sono intenzionali.")}</label>
        <div className="flex flex-wrap gap-x-4">
          <Link className="font-medium text-primary underline" to={percorsoVariantePlanimetria(f,{livello:origine?.livelloId,studio:true,
            torna:aperta.id ? `/azienda/ordini/simulatore?ipotesi=${aperta.id}` : undefined})}>{t("Apri la variante di origine")}</Link>
          {abbinato && <Link className="font-medium text-primary underline" to={`/azienda/marketing/preventivi/computo?bozza=${abbinato.id}&esistente=1&fase=3`}>{t("Apri il computo metrico")}</Link>}
        </div>
      </div>}

      {aperta.ipotesi.importazione && <div className="space-y-2 rounded-lg border bg-amber-50/40 p-4 text-sm"><p>{t("Importato da")} <strong dir="auto">{aperta.ipotesi.importazione.originale.name}</strong> · {aperta.ipotesi.importazione.scenario}</p><ul className="list-disc pl-5 text-muted-foreground">{aperta.ipotesi.importazione.avvisi.map(a => <li key={a}>{a}</li>)}</ul><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={aperta.ipotesi.importazione.confermata} onChange={e => { const confermata = e.target.checked; setAperta(a => ({ ...a, ipotesi: { ...a.ipotesi, importazione: { ...a.ipotesi.importazione!, confermata } } })); }}/>{t("Ho verificato importi, mesi, unità, superfici e fonti. Gli eventuali zeri rimasti sono intenzionali.")}</label></div>}
      <Dialog open={importAperto} onOpenChange={o => { if (!importando) setImportAperto(o); }}><DialogContent ampiezza="spazio" className="max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{t("Importa business plan nel simulatore")}</DialogTitle><DialogDescription>{t("Scegli un solo scenario. L’anteprima è la stessa del piano economico; le ipotesi già salvate restano disponibili.")}</DialogDescription></DialogHeader>{importAperto && <ImportaBusinessPlan companyId={effectiveCompany?.id ?? null} destinazione="simulatore" occupato={importando} onAnnulla={() => setImportAperto(false)} onImporta={(voci, origine) => void importaPiano(voci, origine)}/>}</DialogContent></Dialog>

      <Tabs value={scheda} onValueChange={setScheda}>
        <TabsList>
          <TabsTrigger value="ipotesi">{t("Ipotesi")}</TabsTrigger>
          <TabsTrigger value="confronto">{t("Confronto")}</TabsTrigger>
        </TabsList>
        <TabsContent value="ipotesi" className="mt-3">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
            <div className="space-y-3">
              <FormIpotesi ipotesi={aperta.ipotesi} onCambia={(ipotesi) => setAperta((a) => ({ ...a, ipotesi }))} />
              <DettaglioVoci ipotesi={aperta.ipotesi} onCambia={(ipotesi) => setAperta((a) => ({ ...a, ipotesi }))} />
              <Sensibilita ipotesi={aperta.ipotesi} risultato={risultato} />
            </div>
            <div className="lg:sticky lg:top-4 lg:self-start">
              <Risultati risultato={risultato} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="confronto" className="mt-3">
          <Confronto disponibili={disponibili} scelte={scelteConfronto} onScelte={setConfronto} apriPrezzi={apriPrezzi} />
        </TabsContent>
      </Tabs>

      {diventa && (
        <DiventaOperazioneDialog open={!!diventa} onOpenChange={(o) => { if (!o) setDiventa(null); }} salvata={diventa} modelliAttivi={modelliAttivi} />
      )}
    </div>
  );
}
