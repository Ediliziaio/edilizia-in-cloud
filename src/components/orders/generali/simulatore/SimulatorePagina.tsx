// src/components/orders/generali/simulatore/SimulatorePagina.tsx
// Il simulatore prima dell'acquisto: si scrive un'ipotesi e si vede subito se conviene,
// la si salva, la si confronta con altre, e quando si decide «Diventa operazione».
// Tablet e computer: tutto. Telefono: sola lettura delle ipotesi salvate.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
import { useEliminaIpotesi, useIpotesiSalvate, useSalvaIpotesi, type IpotesiSalvata } from "@/hooks/useGeneraleSimulatore";
import { messaggioErrore } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";
import { calcolaIpotesi, ipotesiDiPartenza, MODELLI_SIMULATI, type Ipotesi, type ModelloSimulato } from "@/lib/orders/generali/simulatore";

const APERTA = "__aperta";
const meseProssimo = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 7);
};
const dataIt = (d: string) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

interface Aperta { id: string | null; nome: string; ipotesi: Ipotesi }

const nuova = (modello: ModelloSimulato): Aperta => ({
  id: null,
  nome: modello === "sviluppo" ? "Nuovo sviluppo" : "Nuova compravendita",
  ipotesi: ipotesiDiPartenza(modello, meseProssimo()),
});

export function SimulatorePagina() {
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const puoVedere = !!(permissions.isAdmin || permissions.canViewMargins);
  const elenco = useIpotesiSalvate(puoVedere);
  const { modelli } = useImpostazioniCommesseGenerali();

  if (permissions.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!puoVedere) {
    return (
      <div role="alert" className="rounded-lg border p-6">
        <h1 className="text-lg font-semibold">Valuta un'operazione</h1>
        <p className="mt-1 text-sm text-muted-foreground">Per usare il simulatore serve il permesso di vedere i margini. Chiedilo al titolare.</p>
      </div>
    );
  }
  if (isMobile) return <SoloLettura elenco={elenco.data ?? []} caricamento={elenco.isPending} />;
  return <Editor salvate={elenco.data ?? []} caricamento={elenco.isPending} modelliAttivi={modelli} puoCreare={!!(permissions.isAdmin || permissions.canEditOrders)} />;
}

function Intestazione({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/azienda/ordini" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Commesse
        </Link>
        <h1 className="text-xl font-semibold">Valuta un'operazione</h1>
        <p className="text-sm text-muted-foreground">Prima di comprare: scrivi l'ipotesi e guarda subito se conviene. Niente commessa finché non decidi.</p>
      </div>
      {children}
    </div>
  );
}

/** Telefono: le ipotesi salvate con i loro numeri, senza modificarle. */
function SoloLettura({ elenco, caricamento }: { elenco: IpotesiSalvata[]; caricamento: boolean }) {
  const [aperta, setAperta] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Intestazione />
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Da telefono le ipotesi si guardano soltanto: per scriverle usa un tablet o un computer.</p>
      {caricamento && <Skeleton className="h-24 w-full" />}
      {!caricamento && elenco.length === 0 && <p className="text-sm text-muted-foreground">Nessuna ipotesi salvata.</p>}
      {elenco.map((s) => {
        const r = calcolaIpotesi(s.ipotesi);
        return (
          <div key={s.id} className="rounded-lg border bg-card">
            <button type="button" className="w-full px-3 py-2 text-left" aria-expanded={aperta === s.id} onClick={() => setAperta(aperta === s.id ? null : s.id)}>
              <p className="text-sm font-semibold">{s.nome}</p>
              <p className="text-xs text-muted-foreground">{DEFINIZIONI_MODELLI[s.modello].nome} · {dataIt(s.aggiornataIl)}</p>
              <p className="text-sm tabular-nums">Utile {euro(r.numeri.utileNetto)} · ROE {percento(r.numeri.roe)}</p>
            </button>
            {aperta === s.id && <div className="border-t px-3 py-2"><Risultati risultato={r} /></div>}
          </div>
        );
      })}
    </div>
  );
}

function Editor({ salvate, caricamento, modelliAttivi, puoCreare }: {
  salvate: IpotesiSalvata[];
  caricamento: boolean;
  modelliAttivi: ReturnType<typeof useImpostazioniCommesseGenerali>["modelli"];
  puoCreare: boolean;
}) {
  const primoModello: ModelloSimulato = modelliAttivi.includes("sviluppo") || !modelliAttivi.includes("compravendita") ? "sviluppo" : "compravendita";
  const [aperta, setAperta] = useState<Aperta>(() => nuova(primoModello));
  const [scheda, setScheda] = useState("ipotesi");
  const [confronto, setConfronto] = useState<string[]>([]);
  const [diventa, setDiventa] = useState<IpotesiSalvata | null>(null);
  const conferma = useConfirm();
  const salva = useSalvaIpotesi();
  const togli = useEliminaIpotesi();

  const risultato = useMemo(() => calcolaIpotesi(aperta.ipotesi), [aperta.ipotesi]);
  const salvata = aperta.id ? salvate.find((s) => s.id === aperta.id) ?? null : null;
  const modificata = !salvata || salvata.nome !== aperta.nome.trim() || JSON.stringify(salvata.ipotesi) !== JSON.stringify(aperta.ipotesi);
  const giaOperazione = salvata?.generaleId ?? null;

  const disponibili: IpotesiDaConfrontare[] = useMemo(() => [
    ...(modificata ? [{ id: APERTA, nome: `${aperta.nome || "Ipotesi"} (non salvata)`, ipotesi: aperta.ipotesi }] : []),
    ...salvate.map((s) => ({ id: s.id, nome: s.nome, ipotesi: s.ipotesi })),
  ], [modificata, aperta, salvate]);
  // Di partenza le prime due salvate; l'ipotesi aperta solo se non ce ne sono abbastanza.
  const scelteConfronto = confronto.length ? confronto : (salvate.length >= 2 ? salvate.map((s) => s.id) : disponibili.map((d) => d.id)).slice(0, 2);

  const salvaOra = async (comeNuova = false): Promise<IpotesiSalvata | null> => {
    try {
      const nome = (comeNuova ? `${aperta.nome} (copia)` : aperta.nome).trim() || "Ipotesi";
      const id = await salva.mutateAsync({ id: comeNuova ? null : aperta.id, nome, ipotesi: aperta.ipotesi });
      setAperta((a) => ({ ...a, id, nome }));
      toast.success(comeNuova ? "Copia salvata" : "Ipotesi salvata");
      return { id, nome, modello: aperta.ipotesi.modello, ipotesi: aperta.ipotesi, generaleId: comeNuova ? null : salvata?.generaleId ?? null, creataIl: "", aggiornataIl: "" };
    } catch (e) {
      toast.error(`Non è stato possibile salvare l'ipotesi. ${messaggioErrore(e)}`);
      return null;
    }
  };

  const eliminaOra = async () => {
    if (!aperta.id) return;
    const ok = await conferma({
      title: "Eliminare l'ipotesi?",
      description: `«${aperta.nome}» sparisce dalle ipotesi salvate. Un'operazione già creata da qui resta com'è.`,
      confirmLabel: "Elimina",
      variant: "destructive",
    });
    if (!ok) return;
    togli.mutate(aperta.id, {
      onSuccess: () => { toast.success("Ipotesi eliminata"); setAperta(nuova(aperta.ipotesi.modello)); },
      onError: (e) => toast.error(`Non è stato possibile eliminarla. ${messaggioErrore(e)}`),
    });
  };

  const apriDiventa = async () => {
    const s = modificata ? await salvaOra() : salvata;
    if (s) setDiventa(s);
  };

  return (
    <div className="space-y-4">
      <Intestazione>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="sim-apri" className="text-sm font-normal text-muted-foreground">Apri</Label>
            <Select
              value={aperta.id ?? ""}
              onValueChange={(v) => {
                if (v.startsWith("nuova:")) return setAperta(nuova(v.slice(6) as ModelloSimulato));
                const s = salvate.find((x) => x.id === v);
                if (s) setAperta({ id: s.id, nome: s.nome, ipotesi: s.ipotesi });
              }}
            >
              <SelectTrigger id="sim-apri" className="h-9 w-64 text-sm"><SelectValue placeholder={caricamento ? "Carico le ipotesi…" : "Ipotesi nuova (non salvata)"} /></SelectTrigger>
              <SelectContent>
                {MODELLI_SIMULATI.map((m) => <SelectItem key={m} value={`nuova:${m}`}>+ Nuova · {DEFINIZIONI_MODELLI[m].nome}</SelectItem>)}
                {salvate.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome} · {dataIt(s.aggiornataIl)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Intestazione>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card px-4 py-3">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <Label htmlFor="sim-nome" className="text-sm font-normal text-muted-foreground">Nome dell'ipotesi · {DEFINIZIONI_MODELLI[aperta.ipotesi.modello].nome}</Label>
          <Input id="sim-nome" value={aperta.nome} maxLength={200} className="h-9 text-sm" placeholder="Es. Via Roma — 6 appartamenti" onChange={(e) => setAperta((a) => ({ ...a, nome: e.target.value }))} />
        </div>
        <Button onClick={() => void salvaOra()} disabled={salva.isPending || !modificata}><Save className="mr-1 h-4 w-4" />{aperta.id ? "Salva" : "Salva l'ipotesi"}</Button>
        {aperta.id && <Button variant="outline" onClick={() => void salvaOra(true)} disabled={salva.isPending}><Copy className="mr-1 h-4 w-4" />Salva come nuova</Button>}
        {aperta.id && <Button variant="ghost" size="icon" aria-label="Elimina l'ipotesi" onClick={() => void eliminaOra()}><Trash2 className="h-4 w-4" /></Button>}
        {giaOperazione ? (
          <Button variant="outline" asChild><Link to={`/azienda/ordini/${giaOperazione}`}>Apri l'operazione creata</Link></Button>
        ) : puoCreare ? (
          <Button variant="default" onClick={() => void apriDiventa()} disabled={salva.isPending} className="bg-emerald-700 hover:bg-emerald-800">
            <Rocket className="mr-1 h-4 w-4" />Diventa operazione
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Per trasformarla in operazione serve il permesso «Ordini e Commesse».</p>
        )}
      </div>

      <Tabs value={scheda} onValueChange={setScheda}>
        <TabsList>
          <TabsTrigger value="ipotesi">Ipotesi</TabsTrigger>
          <TabsTrigger value="confronto">Confronto</TabsTrigger>
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
          <Confronto disponibili={disponibili} scelte={scelteConfronto} onScelte={setConfronto} />
        </TabsContent>
      </Tabs>

      {diventa && (
        <DiventaOperazioneDialog open={!!diventa} onOpenChange={(o) => { if (!o) setDiventa(null); }} salvata={diventa} modelliAttivi={modelliAttivi} />
      )}
    </div>
  );
}
