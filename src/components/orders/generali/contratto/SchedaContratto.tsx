// src/components/orders/generali/contratto/SchedaContratto.tsx
// La scheda «Contratto e SAL» della commessa generale (tappe 1 e 4 del piano): in alto il valore
// aggiornato, quanto è a SAL e quanto manca (Previsto · Reale · A finire), ritenute e anticipazione;
// ogni numero si apre sulle righe da cui viene. Sotto: contratto, SAL, elenco prezzi, misure.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import {
  TIPI_ATTO, anticipazione, fineAggiornata, oggiIso, penaleMaturata, ritenute, salEmesso, scadenzeContratto, totaliSal, valoreContratto,
  type DatiContratto,
} from "@/lib/orders/generali/contratto";
import { cn } from "@/lib/utils";
import { AttiAggiuntivi } from "./AttiAggiuntivi";
import { DatiContrattoDialog } from "./DatiContrattoDialog";
import { ElencoPrezzi } from "./ElencoPrezzi";
import { Garanzie } from "./Garanzie";
import { MisureOrdini } from "./MisureOrdini";
import { FattureContratto, SalContratto } from "./SalContratto";
import { NumeroCheSiApre, ProssimoPasso, type RigaOrigine } from "./campi";
import { dataIt, euro, percentoIt } from "./formato";

const SEZIONI = ["contratto", "sal", "elenco", "misure"] as const;
type Sezione = typeof SEZIONI[number];

export function SchedaContratto({ riepilogo, puoModificare }: PropsScheda) {
  const generaleId = riepilogo.generale.id;
  const { data: dati, isLoading, isError, refetch } = useDatiContratto(generaleId);
  const [parametri, setParametri] = useSearchParams();
  const [modifica, setModifica] = useState(false);

  if (isLoading) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full rounded-lg" /><Skeleton className="h-64 w-full rounded-lg" /></div>;
  }
  if (isError || !dati) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        Non riesco a leggere il contratto.
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }
  if (!dati.permessi.importi) {
    return <ProssimoPasso testo="Il contratto è fatto di importi: lo vede chi ha il permesso di vedere gli importi delle commesse." />;
  }

  const modifiche = puoModificare && dati.permessi.modifica;
  const richiesta = parametri.get("sezione");
  const sezione: Sezione = (SEZIONI as readonly string[]).includes(richiesta ?? "") ? (richiesta as Sezione) : "contratto";
  const apriSezione = (s: string) => {
    const dopo = new URLSearchParams(parametri);
    if (s === "contratto") dopo.delete("sezione"); else dopo.set("sezione", s);
    setParametri(dopo, { replace: true });
  };
  const scadenze = scadenzeContratto(dati, oggiIso());

  return (
    <div className="space-y-4">
      {dati.contratto?.importoBase != null ? (
        <NumeriContratto dati={dati} />
      ) : (
        <ProssimoPasso
          testo="Inserisci il valore del contratto per vedere quanto resta da mettere a SAL: diventa il valore della commessa generale."
          azione={modifiche ? <Button size="sm" onClick={() => setModifica(true)}>Compila il contratto</Button> : undefined}
        />
      )}

      {scadenze.length > 0 && (
        <section aria-label="Scadenze del contratto" className="space-y-1.5">
          {scadenze.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                s.tono === "attenzione" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" : "bg-muted/40",
              )}
            >
              {s.tono === "attenzione" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span>{s.testo}</span>
            </div>
          ))}
        </section>
      )}

      <Tabs value={sezione} onValueChange={apriSezione}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="contratto">Contratto</TabsTrigger>
          <TabsTrigger value="sal">SAL{dati.sal.length > 0 ? ` · ${dati.sal.length}` : ""}</TabsTrigger>
          <TabsTrigger value="elenco">Elenco prezzi{dati.elencoVoci > 0 ? ` · ${dati.elencoVoci}` : ""}</TabsTrigger>
          <TabsTrigger value="misure">Misure</TabsTrigger>
        </TabsList>

        <TabsContent value="contratto" className="mt-4 space-y-4">
          {dati.contratto && <RiepilogoDati dati={dati} onModifica={modifiche ? () => setModifica(true) : undefined} />}
          <AttiAggiuntivi generaleId={generaleId} atti={dati.atti} puoModificare={modifiche && !!dati.contratto} />
          <Garanzie generaleId={generaleId} garanzie={dati.garanzie} puoModificare={modifiche} />
        </TabsContent>
        <TabsContent value="sal" className="mt-4 space-y-4">
          <SalContratto generaleId={generaleId} dati={dati} figlie={riepilogo.figlie} puoModificare={modifiche} apriContratto={() => setModifica(true)} />
          <FattureContratto dati={dati} />
        </TabsContent>
        <TabsContent value="elenco" className="mt-4">
          {sezione === "elenco" && <ElencoPrezzi generaleId={generaleId} ribassoPct={dati.contratto?.ribassoPct ?? 0} puoModificare={modifiche} />}
        </TabsContent>
        <TabsContent value="misure" className="mt-4">
          {sezione === "misure" && (
            <MisureOrdini generaleId={generaleId} figlie={riepilogo.figlie} ribassoPct={dati.contratto?.ribassoPct ?? 0} sal={dati.sal} puoModificare={modifiche} />
          )}
        </TabsContent>
      </Tabs>

      {modifiche && (
        <DatiContrattoDialog open={modifica} onOpenChange={setModifica} generaleId={generaleId} contratto={dati.contratto} atti={dati.atti} />
      )}
    </div>
  );
}

/** Previsto · Reale · A finire del contratto, più ritenute e anticipazione: ognuno si apre sulle sue righe. */
function NumeriContratto({ dati }: { dati: DatiContratto }) {
  const v = valoreContratto(dati.contratto, dati.atti);
  if (!v) return null;
  const t = totaliSal(dati.sal);
  const emessi = dati.sal.filter((s) => s.diContratto && salEmesso(s)).sort((a, b) => a.numero - b.numero);
  const r = ritenute(dati.sal);
  const ant = anticipazione(dati.contratto, dati.sal);
  const aFinire = Math.round((v.aggiornato - t.aSal) * 100) / 100;

  const righeValore: RigaOrigine[] = [
    { etichetta: "Lavori a base del contratto", valore: euro(v.base) },
    { etichetta: `Ribasso ${percentoIt(dati.contratto!.ribassoPct)}`, valore: euro(-v.ribasso), tono: "meno" },
    { etichetta: "Oneri della sicurezza", valore: euro(v.sicurezza), nota: "non soggetti a ribasso" },
    ...dati.atti.filter((a) => a.importo !== 0).map((a) => ({
      etichetta: `${TIPI_ATTO[a.tipo]}${a.numero ? ` n. ${a.numero}` : ""}`, valore: euro(a.importo), nota: `${dataIt(a.data)} · ${a.descrizione}`,
    })),
    { etichetta: "Valore aggiornato", valore: euro(v.aggiornato), tono: "totale" },
  ];
  const righeSal: RigaOrigine[] = [
    ...emessi.map((s) => ({ etichetta: `SAL n. ${s.numero}`, valore: euro(s.lordo), nota: s.al ? `lavori al ${dataIt(s.al)}` : undefined })),
    { etichetta: "A SAL", valore: euro(t.aSal), tono: "totale" },
  ];
  const righeRitenute: RigaOrigine[] = [
    ...emessi.filter((s) => s.ritenuta > 0).map((s) => ({
      etichetta: `SAL n. ${s.numero} · ${percentoIt(s.ritenutaPct)}`,
      valore: euro(s.ritenuta),
      nota: s.registro?.stato === "svincolata" ? "svincolata" : s.registro ? "nel registro delle ritenute" : "non ancora nel registro",
    })),
    { etichetta: "Svincolate", valore: euro(-r.svincolate), tono: "meno" },
    { etichetta: "Da svincolare", valore: euro(r.daSvincolare), tono: "totale" },
  ];
  const righeAnticipazione: RigaOrigine[] = [
    { etichetta: "Anticipazione ricevuta", valore: euro(ant.importo), nota: dati.contratto?.anticipazioneData ? `il ${dataIt(dati.contratto.anticipazioneData)}` : undefined },
    ...emessi.filter((s) => s.recupero > 0).map((s) => ({ etichetta: `Recuperata col SAL n. ${s.numero}`, valore: euro(-s.recupero), tono: "meno" as const })),
    { etichetta: "Da recuperare", valore: euro(ant.daRecuperare), tono: "totale" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <NumeroCheSiApre etichetta="Previsto · valore aggiornato" valore={euro(v.aggiornato)} righe={righeValore} titolo="Da dove viene il valore del contratto" nota={dati.atti.some((a) => a.importo !== 0) ? "con gli atti aggiuntivi" : undefined} />
      <NumeroCheSiApre etichetta="Reale · a SAL" valore={euro(t.aSal)} righe={emessi.length > 0 ? righeSal : undefined} titolo="I SAL emessi" nota={emessi.length === 0 ? "nessun SAL emesso" : `${emessi.length} SAL`} />
      <NumeroCheSiApre
        etichetta="A finire"
        valore={euro(aFinire)}
        tono={aFinire < 0 ? "rosso" : undefined}
        righe={[{ etichetta: "Valore aggiornato", valore: euro(v.aggiornato) }, { etichetta: "A SAL", valore: euro(-t.aSal), tono: "meno" }, { etichetta: "A finire", valore: euro(aFinire), tono: "totale" }]}
        nota={aFinire < 0 ? "oltre il contratto" : "ancora da mettere a SAL"}
      />
      <NumeroCheSiApre etichetta="Ritenute da svincolare" valore={euro(r.daSvincolare)} righe={r.trattenute > 0 ? righeRitenute : undefined} nota={r.trattenute > 0 ? `trattenute ${euro(r.trattenute)}` : `${percentoIt(dati.contratto!.ritenutaPct)} su ogni SAL`} />
      <NumeroCheSiApre etichetta="Anticipazione da recuperare" valore={euro(ant.daRecuperare)} righe={ant.importo > 0 ? righeAnticipazione : undefined} nota={ant.importo > 0 ? `su ${euro(ant.importo)} ricevuti` : "nessuna anticipazione"} />
    </div>
  );
}

function Voce({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** I dati del contratto in lettura, con «Modifica». */
function RiepilogoDati({ dati, onModifica }: { dati: DatiContratto; onModifica?: () => void }) {
  const c = dati.contratto!;
  const fine = fineAggiornata(c, dati.atti);
  const penale = penaleMaturata(c, dati.atti, oggiIso());
  const iva = c.splitPayment ? "Scissione dei pagamenti" : c.reverseCharge ? "Inversione contabile" : "Ordinaria";
  return (
    <section aria-labelledby="dati-contratto-titolo" className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 id="dati-contratto-titolo" className="text-sm font-semibold">Il contratto{c.riferimento ? ` · ${c.riferimento}` : ""}</h3>
        {onModifica && <Button size="sm" variant="outline" onClick={onModifica}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica</Button>}
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-4">
        <Voce etichetta="Firmato il">{dataIt(c.dataFirma)}</Voce>
        <Voce etichetta="Consegna dei lavori">{dataIt(c.dataConsegnaLavori)}</Voce>
        <Voce etichetta="Fine lavori">
          {fine.data ? <>{dataIt(fine.data)}{fine.giorni > 0 && <span className="block text-xs text-muted-foreground">prevista {dataIt(c.dataFinePrevista)} + {fine.giorni} giorni di proroga</span>}</> : "—"}
        </Voce>
        <Voce etichetta="Ultimati il">{dataIt(c.dataUltimazione)}</Voce>
        <Voce etichetta="Penale">
          {c.penaleGiornaliera ? <>{euro(c.penaleGiornaliera)} al giorno<span className="block text-xs text-muted-foreground">tetto {percentoIt(c.penaleMassimaPct)}{penale ? ` · maturata ${euro(penale.importo)}` : ""}</span></> : "—"}
        </Voce>
        <Voce etichetta="Anticipazione">
          {c.anticipazionePct > 0 ? <>{percentoIt(c.anticipazionePct)}{c.anticipazioneImporto !== null && <span className="block text-xs text-muted-foreground">{euro(c.anticipazioneImporto)} ricevuti{c.anticipazioneData ? ` il ${dataIt(c.anticipazioneData)}` : ""}</span>}</> : "—"}
        </Voce>
        <Voce etichetta="Ritenuta di garanzia">{percentoIt(c.ritenutaPct)}</Voce>
        <Voce etichetta="IVA">{iva}</Voce>
        <Voce etichetta="CIG">{c.cig ?? "—"}</Voce>
        <Voce etichetta="CUP">{c.cup ?? "—"}</Voce>
      </dl>
      {c.note && <p className="border-t px-4 py-2 text-sm text-muted-foreground">{c.note}</p>}
    </section>
  );
}
