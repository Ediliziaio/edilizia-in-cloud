/**
 * Configurazione → Categorie del cash flow (14/11/2026).
 *
 * Il catalogo dell'azienda (`cassa_voci`), nato dalle 330 voci del file
 * «Catalogo voci controllo gestione»: area → categoria → voce → sottovoce.
 * Qui l'azienda:
 *  - accende e spegne le voci che le servono (le spente non compaiono nei
 *    selettori; i movimenti già classificati restano dove sono);
 *  - rinomina, spiega, dà un esempio (il codice non cambia mai);
 *  - decide in quale riga del cash flow finisce ogni voce, per entrate e uscite;
 *  - aggiunge voci e sottovoci proprie;
 *  - archivia invece di cancellare: lo storico resta consultabile.
 * Le modifiche valgono solo per questa azienda.
 */
import { useMemo, useState } from "react";
import { Archive, ChevronDown, Loader2, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { GRUPPI_CASSA, VOCI_CASSA, VOCE_PER_CHIAVE, type VoceCassa } from "@/lib/controlloGestione/vociCassa";
import { SEZIONI, useCatalogoCassa, useSalvaVoceCassa, type FlussoVoce, type VoceCatalogo } from "@/lib/finance/cassaVoci";

type Filtro = "tutte" | "attive" | "spente" | "archiviate" | "azienda";
const FILTRI: { key: Filtro; label: string }[] = [
  { key: "tutte", label: "Tutte" },
  { key: "attive", label: "Attive" },
  { key: "spente", label: "Spente" },
  { key: "archiviate", label: "Archiviate" },
  { key: "azienda", label: "Aggiunte da voi" },
];
const VERSO: Record<FlussoVoce, string> = { entrata: "Entrata", uscita: "Uscita", entrambi: "Entrata/uscita", nessuno: "Senza cassa" };
const RIGHE_MANUALI = new Set<VoceCassa>(["inc_manuali", "usc_manuali", "inv_manuali", "fin_manuali"]);
const righeScegliibili = VOCI_CASSA.filter((v) => !RIGHE_MANUALI.has(v.key));

function passa(v: VoceCatalogo, f: Filtro) {
  if (f === "attive") return v.attiva && !v.archiviata_il;
  if (f === "spente") return !v.attiva && !v.archiviata_il;
  if (f === "archiviate") return !!v.archiviata_il;
  if (f === "azienda") return v.origine === "azienda";
  return true;
}

export function CategorieCassaConfig() {
  const company = useEffectiveCompanyId();
  const permessi = usePermissions();
  // Le gestisce chi ha il controllo di gestione o chi gestisce la tesoreria
  // (la vede e riconcilia): lo stesso controllo è nel database (cassa_accesso).
  const puoModificare =
    !permessi.solaLettura && (permessi.canViewControlloGestione || (permessi.canViewTesoreria && permessi.canReconcileBankTransactions));
  const catalogo = useCatalogoCassa(company);
  const salva = useSalvaVoceCassa(company);
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [aperte, setAperte] = useState<Set<string>>(new Set());
  const [scelta, setScelta] = useState<string | null>(null);

  const albero = useMemo(() => {
    const voci = catalogo.data ?? [];
    const figli = new Map<string | null, VoceCatalogo[]>();
    for (const v of voci) figli.set(v.parent_id, [...(figli.get(v.parent_id) ?? []), v]);
    const q = cerca.trim().toLocaleLowerCase("it-IT");
    const corrisponde = (v: VoceCatalogo) =>
      !q || `${v.codice} ${v.nome} ${v.descrizione ?? ""}`.toLocaleLowerCase("it-IT").includes(q);
    return (figli.get(null) ?? []).map((area) => ({
      area,
      categorie: (figli.get(area.id) ?? [])
        .map((cat) => {
          const tutte = (figli.get(cat.id) ?? []).flatMap((v) => [v, ...(figli.get(v.id) ?? [])]);
          const voci = tutte.filter((v) => passa(v, filtro) && (corrisponde(v) || corrisponde(cat)));
          return { cat, voci, attive: tutte.filter((v) => v.attiva && !v.archiviata_il).length, totale: tutte.length };
        })
        .filter((c) => c.voci.length || (filtro === "tutte" && corrisponde(c.cat) && !q)),
    })).filter((a) => a.categorie.length);
  }, [catalogo.data, cerca, filtro]);

  const anteprima = useMemo(() => {
    const conta = new Map<VoceCassa, number>();
    for (const v of catalogo.data ?? []) {
      if (!v.attiva || v.archiviata_il || (v.livello !== "voce" && v.livello !== "sottovoce")) continue;
      for (const r of [v.voce_cassa_in, v.voce_cassa_out]) if (r) conta.set(r, (conta.get(r) ?? 0) + 1);
    }
    return conta;
  }, [catalogo.data]);

  const selezionata = catalogo.data?.find((v) => v.id === scelta) ?? null;
  const cambia = (id: string, dati: Record<string, unknown>, ok?: string) =>
    salva.mutate({ id, dati }, {
      onSuccess: () => ok && toast.success(ok),
      onError: (e) => toast.error("Non salvato", { description: e instanceof Error ? e.message : String(e) }),
    });
  const apriChiudi = (id: string) => setAperte((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (catalogo.isPending) {
    return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Preparazione del catalogo…</p>;
  }
  if (catalogo.isError) {
    return <p role="alert" className="rounded-lg border p-4 text-sm text-destructive">Catalogo non disponibile: {(catalogo.error as Error).message}</p>;
  }

  const totali = (catalogo.data ?? []).filter((v) => v.livello === "voce" || v.livello === "sottovoce");
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="rounded-2xl">
        <CardHeader className="space-y-2 pb-3">
          <CardTitle className="text-base">Categorie del cash flow</CardTitle>
          <p className="text-sm text-muted-foreground">
            Le voci con cui classificare entrate e uscite di banca. Accendi quelle che usate, rinominale come le chiamate voi,
            aggiungine di vostre, anche categorie intere. Partono dallo standard del catalogo e valgono solo per questa azienda:
            le stesse si modificano dal Controllo di gestione e dalle impostazioni della Tesoreria.
          </p>
          <p className="text-xs text-muted-foreground">
            {totali.filter((v) => v.attiva && !v.archiviata_il).length} voci attive su {totali.length}. Spegnere o archiviare una
            voce non sposta i movimenti già classificati: smette solo di comparire nelle scelte.
          </p>
          <div className="flex flex-col gap-2 pt-1 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca voce, codice o descrizione…" value={cerca} onChange={(e) => setCerca(e.target.value)} className="pl-9" aria-label="Cerca nel catalogo" />
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtro voci">
              {FILTRI.map((f) => (
                <button key={f.key} type="button" role="tab" aria-selected={filtro === f.key} onClick={() => setFiltro(f.key)}
                  className={cn("rounded-full border px-3 py-1 text-xs", filtro === f.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {albero.length === 0 && <p className="text-sm text-muted-foreground">Nessuna voce con questi filtri.</p>}
          {albero.map(({ area, categorie }) => (
            <div key={area.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{area.nome}</p>
                {puoModificare && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setScelta(area.id)} aria-label={`Aggiungi categoria in ${area.nome}`}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi categoria
                  </Button>
                )}
              </div>
              <div className="divide-y rounded-lg border">
                {categorie.map(({ cat, voci, attive, totale }) => {
                  const aperta = aperte.has(cat.id) || !!cerca.trim() || filtro !== "tutte";
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => apriChiudi(cat.id)} aria-expanded={aperta} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
                          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !aperta && "-rotate-90")} aria-hidden />
                          <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{cat.codice}</span>
                          <span className="truncate font-medium">{cat.nome}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{attive}/{totale} attive</span>
                        </button>
                        {puoModificare && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setScelta(cat.id)}>Aggiungi voce</Button>
                        )}
                      </div>
                      {aperta && (
                        <ul className="border-t bg-muted/10">
                          {voci.map((v) => {
                            const riga = v.flusso === "entrata" ? v.voce_cassa_in : v.flusso === "uscita" ? v.voce_cassa_out : v.voce_cassa_out ?? v.voce_cassa_in;
                            return (
                              <li key={v.id} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", v.livello === "sottovoce" && "pl-10", scelta === v.id && "bg-primary/5")}>
                                <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{v.codice}</span>
                                <button type="button" className={cn("min-w-0 flex-1 truncate text-left hover:underline", (!v.attiva || v.archiviata_il) && "text-muted-foreground")} onClick={() => setScelta(v.id)} title={v.descrizione ?? undefined}>
                                  {v.nome}
                                </button>
                                {v.origine === "azienda" && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">vostra</Badge>}
                                {v.archiviata_il && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">archiviata</Badge>}
                                <span className="hidden w-24 shrink-0 text-xs text-muted-foreground md:block">{VERSO[v.flusso]}</span>
                                <span className="hidden w-56 shrink-0 truncate text-xs text-muted-foreground lg:block" title={riga ? VOCE_PER_CHIAVE.get(riga)?.label : undefined}>
                                  {riga ? VOCE_PER_CHIAVE.get(riga)?.label : "—"}
                                </span>
                                <Switch
                                  checked={v.attiva && !v.archiviata_il}
                                  disabled={!puoModificare || !!v.archiviata_il}
                                  onCheckedChange={(on) => cambia(v.id, { attiva: on })}
                                  aria-label={`${v.attiva ? "Spegni" : "Accendi"} ${v.nome}`}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        {selezionata ? (
          <EditorVoce key={selezionata.id} voce={selezionata} catalogo={catalogo.data ?? []} puoModificare={puoModificare} salva={salva} onAggiunta={(id) => setScelta(id)} />
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Scegli una voce per vederne significato ed esempio, cambiarla o aggiungerne una sotto.
            </CardContent>
          </Card>
        )}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Righe del riassunto del cash flow</CardTitle>
            <p className="text-xs text-muted-foreground">
              Il cash flow si legge per queste categorie; nella vista «Riassunto» per queste righe. Accanto, quante voci attive finiscono in ciascuna.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {GRUPPI_CASSA.map((g) => (
              <div key={g.key}>
                <p className="font-semibold">{g.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {VOCI_CASSA.filter((v) => v.gruppo === g.key && !RIGHE_MANUALI.has(v.key)).map((v) => (
                    <li key={v.key} className={cn("flex justify-between gap-2", v.daClassificare && "text-amber-800 dark:text-amber-300")}>
                      <span className="truncate">{v.label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{anteprima.get(v.key) ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EditorVoce({ voce, catalogo, puoModificare, salva, onAggiunta }: {
  voce: VoceCatalogo;
  catalogo: VoceCatalogo[];
  puoModificare: boolean;
  salva: ReturnType<typeof useSalvaVoceCassa>;
  onAggiunta: (id: string) => void;
}) {
  const [nome, setNome] = useState(voce.nome);
  const [descrizione, setDescrizione] = useState(voce.descrizione ?? "");
  const [esempio, setEsempio] = useState(voce.esempio ?? "");
  const [flusso, setFlusso] = useState<FlussoVoce>(voce.flusso);
  const [rigaIn, setRigaIn] = useState<string>(voce.voce_cassa_in ?? "");
  const [rigaOut, setRigaOut] = useState<string>(voce.voce_cassa_out ?? "");
  const [nuova, setNuova] = useState("");
  const [nuovaDescr, setNuovaDescr] = useState("");
  const padre = catalogo.find((v) => v.id === voce.parent_id);
  const modificabile = puoModificare && voce.livello !== "area";
  const foglia = voce.livello === "voce" || voce.livello === "sottovoce";
  const puoAggiungere = puoModificare && (voce.livello === "area" || voce.livello === "categoria" || voce.livello === "voce");
  const esito = {
    onError: (e: unknown) => toast.error("Non salvato", { description: e instanceof Error ? e.message : String(e) }),
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-1 pb-3">
        <p className="font-mono text-xs text-muted-foreground">{voce.codice}{padre ? ` · ${padre.nome}` : ""}</p>
        <CardTitle className="text-base">{voce.nome}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {SEZIONI[voce.sezione] ?? voce.sezione} · {voce.origine === "catalogo" ? "dal catalogo" : "aggiunta da voi"}
          {voce.archiviata_il ? ` · archiviata il ${new Date(voce.archiviata_il).toLocaleDateString("it-IT")}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {modificabile ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="cv-nome">Nome</Label>
              <Input id="cv-nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
            </div>
            {foglia && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="cv-descr">Cosa significa, quando usarla</Label>
                  <Textarea id="cv-descr" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cv-es">Esempio</Label>
                  <Input id="cv-es" value={esempio} onChange={(e) => setEsempio(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Verso</Label>
                  <Select value={flusso} onValueChange={(v) => setFlusso(v as FlussoVoce)}>
                    <SelectTrigger aria-label="Verso"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VERSO) as FlussoVoce[]).map((k) => <SelectItem key={k} value={k}>{VERSO[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(flusso === "entrata" || flusso === "entrambi") && (
                  <div className="space-y-1">
                    <Label>Riga del cash flow per le entrate</Label>
                    <Select value={rigaIn} onValueChange={setRigaIn}>
                      <SelectTrigger aria-label="Riga per le entrate"><SelectValue placeholder="Scegli la riga" /></SelectTrigger>
                      <SelectContent>{righeScegliibili.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {(flusso === "uscita" || flusso === "entrambi") && (
                  <div className="space-y-1">
                    <Label>Riga del cash flow per le uscite</Label>
                    <Select value={rigaOut} onValueChange={setRigaOut}>
                      <SelectTrigger aria-label="Riga per le uscite"><SelectValue placeholder="Scegli la riga" /></SelectTrigger>
                      <SelectContent>{righeScegliibili.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={salva.isPending || !nome.trim()}
                onClick={() =>
                  salva.mutate(
                    {
                      id: voce.id,
                      dati: foglia
                        ? {
                            nome, descrizione, esempio, flusso,
                            voce_cassa_in: flusso === "uscita" || flusso === "nessuno" ? "" : rigaIn,
                            voce_cassa_out: flusso === "entrata" || flusso === "nessuno" ? "" : rigaOut,
                          }
                        : { nome },
                    },
                    { ...esito, onSuccess: () => toast.success("Voce salvata") },
                  )
                }
              >
                {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva
              </Button>
              {foglia && (voce.archiviata_il ? (
                <Button size="sm" variant="outline" disabled={salva.isPending} onClick={() => salva.mutate({ id: voce.id, dati: { archiviata: false } }, { ...esito, onSuccess: () => toast.success("Voce ripristinata") })}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Ripristina
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={salva.isPending} onClick={() => salva.mutate({ id: voce.id, dati: { archiviata: true } }, { ...esito, onSuccess: () => toast.success("Voce archiviata: i movimenti già classificati restano") })}>
                  <Archive className="mr-2 h-4 w-4" /> Archivia
                </Button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            {voce.descrizione && <p>{voce.descrizione}</p>}
            {voce.esempio && <p className="text-muted-foreground">Esempio: {voce.esempio}</p>}
          </div>
        )}

        {puoAggiungere && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">
              {voce.livello === "area" ? "Aggiungi una categoria in quest'area" : voce.livello === "categoria" ? "Aggiungi una voce in questa categoria" : "Aggiungi una sottovoce"}
            </p>
            <Input placeholder="Nome" value={nuova} maxLength={120} onChange={(e) => setNuova(e.target.value)} aria-label="Nome della nuova voce" />
            <Input placeholder="Cosa significa (facoltativo)" value={nuovaDescr} onChange={(e) => setNuovaDescr(e.target.value)} aria-label="Descrizione della nuova voce" />
            <Button
              size="sm"
              variant="outline"
              disabled={salva.isPending || !nuova.trim()}
              onClick={() =>
                salva.mutate(
                  { id: null, dati: { parent_id: voce.id, nome: nuova, descrizione: nuovaDescr } },
                  {
                    ...esito,
                    onSuccess: (id) => {
                      toast.success(voce.livello === "area" ? "Categoria aggiunta: ora aggiungi le sue voci" : "Voce aggiunta");
                      setNuova("");
                      setNuovaDescr("");
                      onAggiunta(id);
                    },
                  },
                )
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Aggiungi
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {voce.livello === "area"
                ? "Una categoria raccoglie voci: dopo averla creata, aggiungi dentro le voci con cui classificare i movimenti."
                : `Eredita verso e riga del cash flow da «${voce.nome}»: puoi cambiarli dopo.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
