/**
 * Popup di verifica dei collegamenti (§7.14). Si apre da una fattura ricevuta (solo i suoi) o da
 * Impostazioni → Automazioni (tutti quelli dell'azienda).
 *
 * Tre schede: Da confermare · Collegati · Annullati. Nelle proposte, prima le «certe» (tutte le prove
 * tornano: si confermano insieme), poi quelle «da guardare» (si leggono e si decidono una per una).
 * Per ogni riga: da cosa a cosa, la regola, le prove con ✓ ✗ ?, il percorso. Rifiutare e annullare
 * chiedono il motivo, che resta nella storia. Le scritture passano dal database
 * (acquisti_collegamento_cambia_stato): permessi e transizioni li controlla lì.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import {
  ETICHETTA_TIPO,
  SIMBOLO_PROVA,
  azioniPossibili,
  etichettaRegola,
  gruppoVerifica,
  schedaDi,
  type RigaCollegamento,
  type Scheda,
  type StatoCollegamento,
} from "@/lib/acquisti/verificaCollegamenti";
import { useCambiaStatoCollegamenti, useVerificaCollegamenti } from "@/hooks/useVerificaCollegamenti";

const NOME_STATO: Record<StatoCollegamento, string> = {
  proposto: "Da confermare",
  collegato: "Collegato",
  verificato: "Verificato",
  approvato_pagamento: "Approvato per il pagamento",
  pagato: "Pagato",
  rifiutato: "Rifiutato",
  annullato: "Annullato",
};

const TONO_PROVA = { uguale: "text-emerald-700 dark:text-emerald-400", diverso: "text-destructive", mancante: "text-amber-700 dark:text-amber-400" };

function Motivo({ etichetta, onConferma, disabilitato }: { etichetta: string; onConferma: (motivo: string) => void; disabilitato: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabilitato}>{etichetta}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-sm font-medium">Perché? Resta nello storico.</p>
        <Textarea aria-label="Motivo" value={testo} onChange={(e) => setTesto(e.target.value)} rows={3} placeholder="Es. la bolla è di un altro cantiere" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAperto(false)}>Lascia stare</Button>
          <Button
            size="sm"
            disabled={!testo.trim()}
            onClick={() => {
              onConferma(testo.trim());
              setAperto(false);
              setTesto("");
            }}
          >
            {etichetta}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Riga({
  r,
  nomi,
  puoModificare,
  selezionabile,
  selezionata,
  onSeleziona,
  cambia,
  occupato,
}: {
  r: RigaCollegamento;
  nomi: Record<string, string>;
  puoModificare: boolean;
  selezionabile: boolean;
  selezionata: boolean;
  onSeleziona: (v: boolean) => void;
  cambia: (verso: StatoCollegamento, motivo?: string) => void;
  occupato: boolean;
}) {
  const nome = (tipo: string, id: string, riga: string | null) => `${nomi[id] ?? ETICHETTA_TIPO[tipo] ?? tipo}${riga ? ` · riga ${riga}` : ""}`;
  return (
    <li className="border-b px-3 py-3 last:border-b-0" data-collegamento={r.id}>
      <div className="flex items-start gap-3">
        {selezionabile && (
          <Checkbox className="mt-1" checked={selezionata} onCheckedChange={(v) => onSeleziona(v === true)} aria-label="Seleziona" disabled={!puoModificare} />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <span>{nome(r.da_tipo, r.da_id, r.da_riga)}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span>{nome(r.a_tipo, r.a_id, r.a_riga)}</span>
            {r.importo != null && <span className="text-muted-foreground">· {formatCurrency(r.importo)}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {etichettaRegola(r.regola)} · {r.esito === "automatico" ? "fatto da solo" : r.esito === "manuale" ? "fatto a mano" : "proposto"}
            {r.con_ai ? " · un dato letto dall'AI" : ""} · {NOME_STATO[r.stato]} dal {formatDateShort(r.updated_at)}
          </p>
          {!!r.prove?.length && (
            <ul className="space-y-0.5 text-xs" aria-label="Prove">
              {r.prove.map((p, i) => (
                <li key={i} className={TONO_PROVA[p.esito] ?? ""}>
                  <span aria-hidden>{SIMBOLO_PROVA[p.esito] ?? "·"}</span> {p.testo}
                </li>
              ))}
            </ul>
          )}
          {!!r.percorso?.length && (
            <p className="text-xs text-muted-foreground">Percorso: {r.percorso.map((p) => (p.passi ?? []).join(" → ")).join(" · ")}</p>
          )}
        </div>
        {puoModificare && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {azioniPossibili(r.stato).map((a) =>
              a.chiedeMotivo ? (
                <Motivo key={a.verso} etichetta={a.etichetta} disabilitato={occupato} onConferma={(m) => cambia(a.verso, m)} />
              ) : (
                <Button key={a.verso} size="sm" variant={a.verso === "collegato" ? "default" : "outline"} disabled={occupato} onClick={() => cambia(a.verso)}>
                  {a.etichetta}
                </Button>
              ),
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Elenco({ titolo, children, vuoto }: { titolo?: ReactNode; children: ReactNode[]; vuoto: string }) {
  return (
    <section className="space-y-1">
      {titolo}
      {children.length ? <ul className="rounded-md border">{children}</ul> : <p className="px-1 py-3 text-sm text-muted-foreground">{vuoto}</p>}
    </section>
  );
}

export function VerificaCollegamentiDialog({
  companyId,
  fatturaId,
  puoModificare,
  trigger,
}: {
  companyId: string;
  /** Solo i collegamenti di questa fattura; senza, tutti quelli dell'azienda. */
  fatturaId?: string | null;
  puoModificare: boolean;
  trigger?: ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const [scheda, setScheda] = useState<Scheda>("da_confermare");
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const { data, isLoading, error } = useVerificaCollegamenti(aperto ? companyId : undefined, fatturaId);
  const cambia = useCambiaStatoCollegamenti(companyId);

  const righe = useMemo(() => data?.righe ?? [], [data]);
  const perScheda = (s: Scheda) => righe.filter((r) => schedaDi(r.stato) === s);
  const proposte = perScheda("da_confermare");
  const certe = proposte.filter((r) => gruppoVerifica(r) === "certo");
  const daGuardare = proposte.filter((r) => gruppoVerifica(r) === "da_guardare");
  const selezionateCerte = certe.filter((r) => selezione.has(r.id));

  const esegui = (ids: string[], verso: StatoCollegamento, motivo?: string) =>
    cambia.mutate({ ids, stato: verso, motivo }, { onSuccess: () => setSelezione(new Set()) });

  const riga = (r: RigaCollegamento, selezionabile = false) => (
    <Riga
      key={r.id}
      r={r}
      nomi={data?.nomi ?? {}}
      puoModificare={puoModificare}
      selezionabile={selezionabile}
      selezionata={selezione.has(r.id)}
      onSeleziona={(v) => setSelezione((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })}
      cambia={(verso, motivo) => esegui([r.id], verso, motivo)}
      occupato={cambia.isPending}
    />
  );

  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs">
            <ListChecks className="mr-1 h-3.5 w-3.5" /> Verifica collegamenti
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verifica collegamenti</DialogTitle>
          <DialogDescription>
            {fatturaId ? "I collegamenti di questa fattura" : "I collegamenti fra documenti dell'azienda"}: perché sono stati proposti o fatti, e cosa
            fare. Ogni passo resta nello storico.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Carico…</p>}
        {error && <p className="text-sm text-destructive">Non riesco a leggere i collegamenti.</p>}
        {data && (
          <Tabs value={scheda} onValueChange={(v) => { setScheda(v as Scheda); setSelezione(new Set()); }}>
            <TabsList>
              <TabsTrigger value="da_confermare">Da confermare ({proposte.length})</TabsTrigger>
              <TabsTrigger value="collegati">Collegati ({perScheda("collegati").length})</TabsTrigger>
              <TabsTrigger value="annullati">Annullati ({perScheda("annullati").length})</TabsTrigger>
            </TabsList>
            <TabsContent value="da_confermare" className="space-y-4">
              <Elenco
                vuoto="Nessuna proposta certa."
                titolo={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Certe: tutti i dati tornano ({certe.length})</p>
                    {puoModificare && certe.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelezione(selezionateCerte.length === certe.length ? new Set() : new Set(certe.map((r) => r.id)))}
                        >
                          {selezionateCerte.length === certe.length ? "Deseleziona tutte" : "Seleziona tutte"}
                        </Button>
                        <Button size="sm" disabled={!selezionateCerte.length || cambia.isPending} onClick={() => esegui(selezionateCerte.map((r) => r.id), "collegato")}>
                          Conferma {selezionateCerte.length || ""} selezionate
                        </Button>
                      </div>
                    )}
                  </div>
                }
              >
                {certe.map((r) => riga(r, true))}
              </Elenco>
              <Elenco vuoto="Niente da guardare." titolo={<p className="text-sm font-medium">Da guardare una per una ({daGuardare.length})</p>}>
                {daGuardare.map((r) => riga(r))}
              </Elenco>
            </TabsContent>
            <TabsContent value="collegati">
              <Elenco vuoto="Nessun collegamento ancora.">{perScheda("collegati").map((r) => riga(r))}</Elenco>
            </TabsContent>
            <TabsContent value="annullati">
              <Elenco vuoto="Nessun collegamento annullato o rifiutato.">{perScheda("annullati").map((r) => riga(r))}</Elenco>
            </TabsContent>
            {data.troncato && <p className="mt-2 text-xs text-muted-foreground">Sono mostrati gli ultimi {righe.length}: aprilo da una fattura per vederne solo i suoi.</p>}
          </Tabs>
        )}
        {!puoModificare && <p className="text-xs text-muted-foreground">Puoi guardare i collegamenti; per confermarli serve il permesso sui costi o sugli acquisti.</p>}
      </DialogContent>
    </Dialog>
  );
}
