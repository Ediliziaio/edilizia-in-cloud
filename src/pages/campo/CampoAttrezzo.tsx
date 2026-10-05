/**
 * /campo/mezzi/scansione/:codice — l'attrezzo appena inquadrato, dal telefono
 * di chi sta in cantiere: cos'è, dov'è adesso, e i bottoni per dire cosa se ne
 * fa (lo prendo io, lo lascio in cantiere, lo carico sul furgone, riportato in
 * magazzino, non lo trovo). Per i ponteggi e le altre attrezzature a quantità:
 * quanto è stato montato qui, quanto è rientrato.
 *
 * Tutto passa dalle funzioni del database (mezzo_da_codice,
 * campo_attrezzo_azione): l'operaio non legge le tabelle dei mezzi, e i
 * permessi (lavori su quel cantiere? guidi quel furgone?) li controlla lì.
 */
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDownToLine, ArrowLeft, HardHat, Loader2, MapPin, PackageCheck, PackageSearch, ScanLine, Truck, User,
  Warehouse, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { SegnalaProblemaDialog } from "@/components/mezzi/SegnalaProblemaDialog";
import { useAzioneAttrezzo, useCodiceMezzo, useCopertineMezzi } from "@/hooks/useMezzi";
import { formatData, formatQuantita, numeroLetto, unitaBreve, type SchedaCampoAttrezzo } from "@/types/mezzi";
import { cn } from "@/lib/utils";

type Scelta =
  | { tipo: "cantiere" }
  | { tipo: "furgone" }
  | { tipo: "smarrito" }
  | { tipo: "monta" }
  | { tipo: "rientra"; montaggio: SchedaCampoAttrezzo["montaggi"][number] };

export default function CampoAttrezzo() {
  const { codice } = useParams<{ codice: string }>();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("c");
  const { data: esito, isLoading, isError, error, refetch } = useCodiceMezzo(codice, companyId);
  const azione = useAzioneAttrezzo();
  const [scelta, setScelta] = useState<Scelta | null>(null);
  const [segnala, setSegnala] = useState(false);

  // Dopo un'azione la scheda arriva aggiornata nella cache (useAzioneAttrezzo).
  const scheda = esito?.esito === "trovato" && esito.vista === "campo" ? esito.mezzo : null;
  const { data: link } = useCopertineMezzi(scheda?.foto_path ? [scheda.foto_path] : []);

  const indietro = (
    <Link to="/campo/mezzi" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <ArrowLeft className="h-4 w-4" />I miei mezzi
    </Link>
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-28">
        {indietro}
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isError || !esito) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-28">
        {indietro}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-bold">Codice non letto</p>
          <p className="mt-1 text-xs">{error instanceof Error ? error.message : "La richiesta non ha risposto."}</p>
          <Button variant="outline" className="mt-3 h-11 bg-background" onClick={() => refetch()}>Riprova</Button>
        </div>
      </div>
    );
  }

  if (esito.esito !== "trovato" || esito.vista !== "campo") {
    const libero = esito.esito === "libero";
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-28">
        {indietro}
        <div className="rounded-2xl border bg-background p-5 text-center">
          <PackageSearch className="mx-auto mb-2 h-10 w-10 text-muted-foreground/60" />
          <p className="font-mono text-lg font-bold">{(esito.esito !== "trovato" && esito.codice) || codice}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {libero
              ? "Questa etichetta non è ancora collegata a un attrezzo: avvisa l'ufficio."
              : esito.esito === "trovato"
                ? "Questo lo gestisce l'ufficio: aprilo dall'area aziendale."
                : "Nessun attrezzo della tua azienda ha questo codice."}
          </p>
        </div>
      </div>
    );
  }

  const m = esito.mezzo;
  const aQuantita = m.gestione === "quantita";
  const copertina = m.foto_path ? link?.get(m.foto_path) : undefined;
  const cantieri = esito.cantieri;
  const veicoli = esito.miei_veicoli;

  const esegui = async (input: Parameters<typeof azione.mutateAsync>[0]) => {
    try {
      await azione.mutateAsync(input);
      setScelta(null);
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  const doveTesto: Record<SchedaCampoAttrezzo["dove"], string> = {
    magazzino: "In magazzino",
    cantiere: `In cantiere${m.dove_nome ? `: ${m.dove_nome}` : ""}`,
    persona: m.con_me ? "Con te" : `In carico a ${m.dove_nome ?? "qualcuno"}`,
    mezzo: `Sul ${m.dove_nome ?? "furgone"}`,
  };
  const DoveIcona = { magazzino: Warehouse, cantiere: HardHat, persona: User, mezzo: Truck }[m.dove];

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-28">
      {indietro}

      <section className="overflow-hidden rounded-2xl border bg-background shadow-sm" aria-label={m.nome}>
        {copertina ? (
          <img src={copertina} alt={`Foto di ${m.nome}`} className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-20 items-center justify-center bg-slate-100">
            <IconaMezzo tipo={m.tipo} className="h-9 w-9 text-slate-400" />
          </div>
        )}
        <div className="space-y-3 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold leading-tight">{m.nome}</h1>
              {m.codice && <span className="rounded border px-1.5 font-mono text-xs text-muted-foreground">{m.codice}</span>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[m.categoria, [m.marca, m.modello].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Attrezzatura"}
            </p>
          </div>

          {aQuantita ? (
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p>
                <span className="font-semibold">{formatQuantita(m.disponibile, m.unita_misura)}</span> in magazzino
                <span className="text-muted-foreground"> su {formatQuantita(m.quantita_totale, m.unita_misura)}</span>
              </p>
            </div>
          ) : (
            <p className={cn("flex items-center gap-2 rounded-xl p-3 text-sm font-medium", m.con_me ? "bg-emerald-50 text-emerald-800" : "bg-muted/50")}>
              <DoveIcona className="h-4 w-4 shrink-0" aria-hidden="true" />{doveTesto[m.dove]}
            </p>
          )}

          {m.stato !== "in_servizio" && (
            <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />{m.stato === "in_officina" ? "Risulta in officina." : "Risulta fuori servizio: non usarlo."}
            </p>
          )}
          {m.segnalazioni_aperte > 0 && (
            <p className="text-xs text-amber-800">
              {m.segnalazioni_aperte === 1 ? "C'è una segnalazione aperta" : `Ci sono ${m.segnalazioni_aperte} segnalazioni aperte`} su questo attrezzo.
            </p>
          )}
        </div>
      </section>

      {m.veicolo ? (
        <p className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
          Furgoni e auto seguono chi li guida: se è in carico a te lo trovi in <Link to="/campo/mezzi" className="font-medium text-foreground underline">I miei mezzi</Link>.
        </p>
      ) : aQuantita ? (
        <div className="space-y-3">
          <Button className="h-14 w-full gap-2 text-base" onClick={() => setScelta({ tipo: "monta" })} disabled={azione.isPending || cantieri.length === 0 || (m.disponibile ?? 0) <= 0}>
            <HardHat className="h-5 w-5" />Montati in cantiere
          </Button>
          {m.montaggi.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Dove è montato</h2>
              <ul className="divide-y rounded-xl border bg-background">
                {m.montaggi.map((g) => {
                  const mio = !!g.order_id && cantieri.some((c) => c.id === g.order_id);
                  return (
                    <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{g.cantiere ?? g.luogo ?? "Altro posto"}</span>
                        <span className="block text-xs text-muted-foreground">{formatQuantita(g.quantita, m.unita_misura)} dal {formatData(g.dal)}</span>
                      </span>
                      {mio && (
                        <Button size="sm" variant="outline" className="h-10 shrink-0 gap-1" onClick={() => setScelta({ tipo: "rientra", montaggio: g })} disabled={azione.isPending}>
                          <ArrowDownToLine className="h-4 w-4" />Rientrato
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {cantieri.length === 0 && (
            <p className="text-xs text-muted-foreground">Non risulti su nessun cantiere aperto: montaggi e rientri li segna l'ufficio.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Bottone
            icona={User}
            testo={m.con_me && m.dove === "persona" ? "Ce l'ho io" : "Lo prendo io"}
            attivo={m.con_me && m.dove === "persona"}
            disabled={azione.isPending || !esito.ho_profilo || (m.con_me && m.dove === "persona")}
            onClick={() => esegui({ mezzoId: m.id, azione: "prendo" })}
          />
          <Bottone
            icona={HardHat}
            testo="Lo lascio in cantiere"
            disabled={azione.isPending || cantieri.length === 0}
            onClick={() =>
              cantieri.length === 1
                ? esegui({ mezzoId: m.id, azione: "cantiere", orderId: cantieri[0].id })
                : setScelta({ tipo: "cantiere" })
            }
          />
          <Bottone
            icona={Truck}
            testo="Lo carico sul furgone"
            disabled={azione.isPending || veicoli.length === 0}
            onClick={() =>
              veicoli.length === 1
                ? esegui({ mezzoId: m.id, azione: "carico_su", suMezzoId: veicoli[0].id })
                : setScelta({ tipo: "furgone" })
            }
          />
          <Bottone
            icona={PackageCheck}
            testo="Riportato in magazzino"
            attivo={m.dove === "magazzino"}
            disabled={azione.isPending || m.dove === "magazzino"}
            onClick={() => esegui({ mezzoId: m.id, azione: "magazzino" })}
          />
        </div>
      )}

      {/* Problemi: chi l'ha appena letto può segnalarlo anche se non è suo. */}
      <div className={cn("grid gap-2", !m.veicolo && !aQuantita ? "grid-cols-2" : "grid-cols-1")}>
        <button
          type="button"
          onClick={() => setSegnala(true)}
          disabled={azione.isPending}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-dashed px-2 text-center text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          <Wrench className="h-4 w-4 shrink-0" />È rotto o danneggiato
        </button>
        {!m.veicolo && !aQuantita && (
          <button
            type="button"
            onClick={() => setScelta({ tipo: "smarrito" })}
            disabled={azione.isPending}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-dashed px-2 text-center text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <PackageSearch className="h-4 w-4 shrink-0" />Non lo trovo
          </button>
        )}
      </div>

      {azione.isPending && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Segno…</p>
      )}

      <Link to="/campo/mezzi?scansiona=1" className="flex h-12 items-center justify-center gap-2 rounded-xl border bg-background text-sm font-medium">
        <ScanLine className="h-4 w-4" />Scansiona un altro
      </Link>

      {segnala && (
        <SegnalaProblemaDialog
          mezzoId={m.id}
          companyId={m.company_id}
          nome={m.nome}
          targa={null}
          onClose={() => setSegnala(false)}
        />
      )}
      {scelta?.tipo === "cantiere" && (
        <DialogScegli
          titolo="In quale cantiere lo lasci?"
          voci={cantieri.map((c) => ({ id: c.id, nome: c.nome }))}
          icona={MapPin}
          onScegli={(id) => esegui({ mezzoId: m.id, azione: "cantiere", orderId: id })}
          onClose={() => setScelta(null)}
          inAttesa={azione.isPending}
        />
      )}
      {scelta?.tipo === "furgone" && (
        <DialogScegli
          titolo="Su quale mezzo lo carichi?"
          voci={veicoli.map((v) => ({ id: v.id, nome: v.targa ? `${v.nome} · ${v.targa}` : v.nome }))}
          icona={Truck}
          onScegli={(id) => esegui({ mezzoId: m.id, azione: "carico_su", suMezzoId: id })}
          onClose={() => setScelta(null)}
          inAttesa={azione.isPending}
        />
      )}
      {scelta?.tipo === "smarrito" && (
        <DialogNota
          titolo="Non lo trovi?"
          descrizione="Arriva subito all'ufficio, con dove doveva essere."
          etichetta="Dove l'hai cercato (facoltativo)"
          bottone="Avvisa l'ufficio"
          onConferma={(nota) => esegui({ mezzoId: m.id, azione: "smarrito", nota })}
          onClose={() => setScelta(null)}
          inAttesa={azione.isPending}
        />
      )}
      {scelta?.tipo === "monta" && (
        <DialogMonta
          scheda={m}
          cantieri={cantieri}
          onConferma={(orderId, quantita) => esegui({ mezzoId: m.id, azione: "monta", orderId, quantita })}
          onClose={() => setScelta(null)}
          inAttesa={azione.isPending}
        />
      )}
      {scelta?.tipo === "rientra" && (
        <DialogRientra
          scheda={m}
          montaggio={scelta.montaggio}
          onConferma={(quantita) => esegui({ mezzoId: m.id, azione: "rientra", allocazioneId: scelta.montaggio.id, quantita })}
          onClose={() => setScelta(null)}
          inAttesa={azione.isPending}
        />
      )}
    </div>
  );
}

function Bottone({ icona: Icona, testo, onClick, disabled, attivo }: {
  icona: typeof User; testo: string; onClick: () => void; disabled?: boolean; attivo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-sm font-semibold transition-colors disabled:opacity-50",
        attivo ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-background hover:bg-muted",
      )}
    >
      <Icona className="h-5 w-5" aria-hidden="true" />
      {testo}
    </button>
  );
}

function DialogScegli({ titolo, voci, icona: Icona, onScegli, onClose, inAttesa }: {
  titolo: string; voci: Array<{ id: string; nome: string }>; icona: typeof User;
  onScegli: (id: string) => void; onClose: () => void; inAttesa: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {voci.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                disabled={inAttesa}
                onClick={() => onScegli(v.id)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Icona className="h-4 w-4 shrink-0 text-muted-foreground" />{v.nome}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function DialogNota({ titolo, descrizione, etichetta, bottone, onConferma, onClose, inAttesa }: {
  titolo: string; descrizione: string; etichetta: string; bottone: string;
  onConferma: (nota: string) => void; onClose: () => void; inAttesa: boolean;
}) {
  const [nota, setNota] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{descrizione}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="campo-attrezzo-nota">{etichetta}</Label>
          <Textarea id="campo-attrezzo-nota" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => onConferma(nota)} disabled={inAttesa}>
            {inAttesa && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{bottone}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogMonta({ scheda, cantieri, onConferma, onClose, inAttesa }: {
  scheda: SchedaCampoAttrezzo; cantieri: Array<{ id: string; nome: string }>;
  onConferma: (orderId: string, quantita: number) => void; onClose: () => void; inAttesa: boolean;
}) {
  const [orderId, setOrderId] = useState(cantieri.length === 1 ? cantieri[0].id : "");
  const [quantita, setQuantita] = useState("");
  const n = numeroLetto(quantita);
  const disponibile = scheda.disponibile ?? 0;
  const troppo = n != null && n > disponibile;
  const valido = !!orderId && n != null && n > 0 && !troppo;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quanto avete montato?</DialogTitle>
          <DialogDescription>In magazzino ce ne sono {formatQuantita(disponibile, scheda.unita_misura)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {cantieri.length > 1 && (
            <div className="space-y-2">
              <Label>Cantiere</Label>
              {cantieri.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOrderId(c.id)}
                  aria-pressed={orderId === c.id}
                  className={cn("flex min-h-[44px] w-full items-center rounded-xl border px-3 text-left text-sm", orderId === c.id ? "border-orange-400 bg-orange-50 font-medium" : "")}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="campo-monta-q">{unitaBreve(scheda.unita_misura) || "Quantità"}</Label>
            <Input id="campo-monta-q" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value)} className="h-12 text-lg" />
            {troppo && <p className="text-xs text-red-700">Ce ne sono solo {formatQuantita(disponibile, scheda.unita_misura)}.</p>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => valido && onConferma(orderId, n!)} disabled={!valido || inAttesa}>
            {inAttesa && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Segna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogRientra({ scheda, montaggio, onConferma, onClose, inAttesa }: {
  scheda: SchedaCampoAttrezzo; montaggio: SchedaCampoAttrezzo["montaggi"][number];
  onConferma: (quantita: number) => void; onClose: () => void; inAttesa: boolean;
}) {
  const [quantita, setQuantita] = useState(String(montaggio.quantita).replace(".", ","));
  const n = numeroLetto(quantita);
  const valido = n != null && n > 0 && n <= montaggio.quantita;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quanto è rientrato?</DialogTitle>
          <DialogDescription>
            Da {montaggio.cantiere ?? montaggio.luogo ?? "questo cantiere"}: montati {formatQuantita(montaggio.quantita, scheda.unita_misura)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="campo-rientra-q">{unitaBreve(scheda.unita_misura) || "Quantità"}</Label>
          <Input id="campo-rientra-q" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value)} className="h-12 text-lg" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => valido && onConferma(n!)} disabled={!valido || inAttesa}>
            {inAttesa && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Segna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
