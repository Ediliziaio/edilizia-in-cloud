// src/components/orders/generali/contratto/SchedaContratto.tsx
// La scheda «Contratto e SAL» della commessa generale (tappe 1 e 4 del piano): in alto il valore
// aggiornato, quanto è a SAL e quanto manca (Previsto · Reale · A finire), ritenute e anticipazione;
// ogni numero si apre sulle righe da cui viene. Sotto: contratto, SAL, elenco prezzi, misure.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileCheck2, FolderOpen, Info, Pencil } from "lucide-react";
import { IntestazioneScheda } from "../design/ElementiScheda";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubappaltiContratto } from "@/components/orders/generali/subappalti/SubappaltiContratto";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import {
  SEZIONI_CONTRATTO, TIPI_ATTO, anticipazione, fineAggiornata, oggiIso, penaleMaturata, ritenute, salEmesso, scadenzeContratto, totaliSal, valoreContratto,
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Sezione = typeof SEZIONI_CONTRATTO[number];

export function SchedaContratto({ riepilogo, puoModificare }: PropsScheda) {
  const t = useT();
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
        {t("Non riesco a leggere il contratto.")}
        <Button size="sm" variant="outline" onClick={() => void refetch()}>{t("Riprova")}</Button>
      </div>
    );
  }
  if (!dati.permessi.importi) {
    return <ProssimoPasso testo={t("Il contratto è fatto di importi: lo vede chi ha il permesso di vedere gli importi delle commesse.")} />;
  }

  const modifiche = puoModificare && dati.permessi.modifica;
  const richiesta = parametri.get("sezione");
  const sezione: Sezione = (SEZIONI_CONTRATTO as readonly string[]).includes(richiesta ?? "") ? (richiesta as Sezione) : "contratto";
  const apriSezione = (s: string) => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "contratto");
    if (s === "contratto") dopo.delete("sezione"); else dopo.set("sezione", s);
    setParametri(dopo, { replace: true });
  };
  const scadenze = scadenzeContratto(dati, oggiIso());

  return (
    <div className="generale-sheet generale-contratto space-y-4">
      <IntestazioneScheda icona={FileCheck2} titolo={t("Contratto e SAL")} descrizione={t("Valore aggiornato, avanzamento contrattuale, ritenute e scadenze dell'appalto.")} />
      {dati.contratto?.importoBase != null ? (
        <NumeriContratto dati={dati} />
      ) : (
        <ProssimoPasso
          testo={t("Inserisci il valore del contratto per vedere quanto resta da mettere a SAL: diventa il valore della commessa generale.")}
          azione={modifiche ? <Button size="sm" onClick={() => setModifica(true)}>{t("Compila il contratto")}</Button> : undefined}
        />
      )}

      {scadenze.length > 0 && (
        <section aria-label={t("Scadenze del contratto")} className="space-y-1.5">
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
        <TabsList className="generale-subtabs h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="contratto">{t("Contratto")}</TabsTrigger>
          <TabsTrigger value="sal">SAL{dati.sal.length > 0 ? ` · ${dati.sal.length}` : ""}</TabsTrigger>
          <TabsTrigger value="elenco">{t("Elenco prezzi")}{dati.elencoVoci > 0 ? ` · ${dati.elencoVoci}` : ""}</TabsTrigger>
          <TabsTrigger value="misure">{t("Misure")}</TabsTrigger>
          <TabsTrigger value="subappalti">{t("Subappalti")}</TabsTrigger>
        </TabsList>

        <TabsContent value="contratto" className="mt-4 space-y-4">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to={`/azienda/ordini/${generaleId}?scheda=documenti#contratto-appalto`}>
              <FolderOpen className="size-4" aria-hidden="true" /> {t("Contratto originale nei Documenti")}
            </Link>
          </Button>
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
        <TabsContent value="subappalti" className="mt-4">
          {sezione === "subappalti" && <SubappaltiContratto generaleId={generaleId} dati={dati} puoModificare={modifiche} />}
        </TabsContent>
        <TabsContent value="misure" className="mt-4">
          {sezione === "misure" && (
            <MisureOrdini generaleId={generaleId} figlie={riepilogo.figlie} ribassoPct={dati.contratto?.ribassoPct ?? 0} sal={dati.sal} puoModificare={modifiche} />
          )}
        </TabsContent>
      </Tabs>

      {modifiche && (
        <DatiContrattoDialog open={modifica || parametri.get("importa-contratto") === "1"} avviaImportAi={parametri.get("importa-contratto") === "1"} onOpenChange={o => { setModifica(o); if (!o && parametri.has("importa-contratto")) { const p = new URLSearchParams(parametri); p.delete("importa-contratto"); setParametri(p, { replace: true }); } }} generaleId={generaleId} valoreGenerale={riepilogo.generale.valore} contratto={dati.contratto} atti={dati.atti} />
      )}
    </div>
  );
}

/** Previsto · Reale · A finire del contratto, più ritenute e anticipazione: ognuno si apre sulle sue righe. */
function NumeriContratto({ dati }: { dati: DatiContratto }) {
  const tr = useT();
  const v = valoreContratto(dati.contratto, dati.atti);
  if (!v) return null;
  const t = totaliSal(dati.sal);
  const emessi = dati.sal.filter((s) => s.diContratto && salEmesso(s)).sort((a, b) => a.numero - b.numero);
  const r = ritenute(dati.sal);
  const ant = anticipazione(dati.contratto, dati.sal);
  const aFinire = Math.round((v.aggiornato - t.aSal) * 100) / 100;

  const righeValore: RigaOrigine[] = [
    { etichetta: tr("Lavori a base del contratto"), valore: euro(v.base) },
    { etichetta: tr("Ribasso {perc}", { perc: percentoIt(dati.contratto!.ribassoPct) }), valore: euro(-v.ribasso), tono: "meno" },
    { etichetta: tr("Oneri della sicurezza"), valore: euro(v.sicurezza), nota: tr("non soggetti a ribasso") },
    ...dati.atti.filter((a) => a.importo !== 0).map((a) => ({
      etichetta: `${tr(TIPI_ATTO[a.tipo])}${a.numero ? ` n. ${a.numero}` : ""}`, valore: euro(a.importo), nota: `${dataIt(a.data)} · ${a.descrizione}`,
    })),
    { etichetta: tr("Valore aggiornato"), valore: euro(v.aggiornato), tono: "totale" },
  ];
  const righeSal: RigaOrigine[] = [
    ...emessi.map((s) => ({ etichetta: tr("SAL n. {numero}", { numero: s.numero }), valore: euro(s.lordo), nota: s.al ? tr("lavori al {data}", { data: dataIt(s.al) }) : undefined })),
    { etichetta: tr("A SAL"), valore: euro(t.aSal), tono: "totale" },
  ];
  const righeRitenute: RigaOrigine[] = [
    ...emessi.filter((s) => s.ritenuta > 0).map((s) => ({
      etichetta: tr("SAL n. {numero} · {perc}", { numero: s.numero, perc: percentoIt(s.ritenutaPct) }),
      valore: euro(s.ritenuta),
      nota: s.registro?.stato === "svincolata" ? tr("svincolata") : s.registro ? tr("nel registro delle ritenute") : tr("non ancora nel registro"),
    })),
    { etichetta: tr("Svincolate"), valore: euro(-r.svincolate), tono: "meno" },
    { etichetta: tr("Da svincolare"), valore: euro(r.daSvincolare), tono: "totale" },
  ];
  const righeAnticipazione: RigaOrigine[] = [
    { etichetta: tr("Anticipazione ricevuta"), valore: euro(ant.importo), nota: dati.contratto?.anticipazioneData ? tr("il {data}", { data: dataIt(dati.contratto.anticipazioneData) }) : undefined },
    ...emessi.filter((s) => s.recupero > 0).map((s) => ({ etichetta: tr("Recuperata col SAL n. {numero}", { numero: s.numero }), valore: euro(-s.recupero), tono: "meno" as const })),
    { etichetta: tr("Da recuperare"), valore: euro(ant.daRecuperare), tono: "totale" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <NumeroCheSiApre etichetta={tr("Previsto · valore aggiornato")} valore={euro(v.aggiornato)} righe={righeValore} titolo={tr("Da dove viene il valore del contratto")} nota={dati.atti.some((a) => a.importo !== 0) ? tr("con gli atti aggiuntivi") : undefined} />
      <NumeroCheSiApre etichetta={tr("Reale · a SAL")} valore={euro(t.aSal)} righe={emessi.length > 0 ? righeSal : undefined} titolo={tr("I SAL emessi")} nota={emessi.length === 0 ? tr("nessun SAL emesso") : tr("{n} SAL", { n: emessi.length })} />
      <NumeroCheSiApre
        etichetta={tr("A finire")}
        valore={euro(aFinire)}
        tono={aFinire < 0 ? "rosso" : undefined}
        righe={[{ etichetta: tr("Valore aggiornato"), valore: euro(v.aggiornato) }, { etichetta: tr("A SAL"), valore: euro(-t.aSal), tono: "meno" }, { etichetta: tr("A finire"), valore: euro(aFinire), tono: "totale" }]}
        nota={aFinire < 0 ? tr("oltre il contratto") : tr("ancora da mettere a SAL")}
      />
      <NumeroCheSiApre etichetta={tr("Ritenute da svincolare")} valore={euro(r.daSvincolare)} righe={r.trattenute > 0 ? righeRitenute : undefined} nota={r.trattenute > 0 ? tr("trattenute {importo}", { importo: euro(r.trattenute) }) : tr("{perc} su ogni SAL", { perc: percentoIt(dati.contratto!.ritenutaPct) })} />
      <NumeroCheSiApre etichetta={tr("Anticipazione da recuperare")} valore={euro(ant.daRecuperare)} righe={ant.importo > 0 ? righeAnticipazione : undefined} nota={ant.importo > 0 ? tr("su {importo} ricevuti", { importo: euro(ant.importo) }) : tr("nessuna anticipazione")} />
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
  const t = useT();
  const c = dati.contratto!;
  const fine = fineAggiornata(c, dati.atti);
  const penale = penaleMaturata(c, dati.atti, oggiIso());
  const iva = c.splitPayment ? t("Scissione dei pagamenti") : c.reverseCharge ? t("Inversione contabile") : t("Ordinaria");
  return (
    <section aria-labelledby="dati-contratto-titolo" className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 id="dati-contratto-titolo" className="text-sm font-semibold">{t("Il contratto")}{c.riferimento ? ` · ${c.riferimento}` : ""}</h3>
        {onModifica && <Button size="sm" variant="outline" onClick={onModifica}><Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("Modifica")}</Button>}
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 md:grid-cols-4">
        <Voce etichetta={t("Firmato il")}>{dataIt(c.dataFirma)}</Voce>
        <Voce etichetta={t("Consegna dei lavori")}>{dataIt(c.dataConsegnaLavori)}</Voce>
        <Voce etichetta={t("Fine lavori")}>
          {fine.data ? <>{dataIt(fine.data)}{fine.giorni > 0 && <span className="block text-xs text-muted-foreground">{t("prevista {data} + {n} giorni di proroga", { data: dataIt(c.dataFinePrevista), n: fine.giorni })}</span>}</> : "—"}
        </Voce>
        <Voce etichetta={t("Ultimati il")}>{dataIt(c.dataUltimazione)}</Voce>
        <Voce etichetta={t("Penale")}>
          {c.penaleGiornaliera ? <>{t("{importo} al giorno", { importo: euro(c.penaleGiornaliera) })}<span className="block text-xs text-muted-foreground">{t("tetto {perc}", { perc: percentoIt(c.penaleMassimaPct) })}{penale ? t(" · maturata {importo}", { importo: euro(penale.importo) }) : ""}</span></> : "—"}
        </Voce>
        <Voce etichetta={t("Anticipazione")}>
          {c.anticipazionePct > 0 ? <>{percentoIt(c.anticipazionePct)}{c.anticipazioneImporto !== null && <span className="block text-xs text-muted-foreground">{c.anticipazioneData ? t("{importo} ricevuti il {data}", { importo: euro(c.anticipazioneImporto), data: dataIt(c.anticipazioneData) }) : t("{importo} ricevuti", { importo: euro(c.anticipazioneImporto) })}</span>}</> : "—"}
        </Voce>
        <Voce etichetta={t("Ritenuta di garanzia")}>{percentoIt(c.ritenutaPct)}</Voce>
        <Voce etichetta="IVA">{iva}</Voce>
        <Voce etichetta="CIG">{c.cig ?? "—"}</Voce>
        <Voce etichetta="CUP">{c.cup ?? "—"}</Voce>
        {/* Dai documenti dell'appalto (lettura dai documenti, lotto 5): solo quelli che ci sono. */}
        {c.daiDocumenti?.durataGiorni != null && <Voce etichetta={t("Durata")}>{t("{n} giorni", { n: c.daiDocumenti.durataGiorni })}</Voce>}
        {c.daiDocumenti?.aCorpoMisura && <Voce etichetta={t("Corpo o misura")}>{c.daiDocumenti.aCorpoMisura}</Voce>}
        {c.daiDocumenti?.costoManodopera != null && <Voce etichetta={t("Manodopera")}>{euro(c.daiDocumenti.costoManodopera)}</Voce>}
        {(c.daiDocumenti?.salSogliaImporto != null || c.daiDocumenti?.salCadenzaGiorni != null) && (
          <Voce etichetta="SAL">{[c.daiDocumenti.salSogliaImporto != null && t("ogni {importo}", { importo: euro(c.daiDocumenti.salSogliaImporto) }), c.daiDocumenti.salCadenzaGiorni != null && t("ogni {n} giorni", { n: c.daiDocumenti.salCadenzaGiorni })].filter(Boolean).join(t(" o "))}</Voce>
        )}
        {c.daiDocumenti?.terminiPagamentoGiorni != null && <Voce etichetta={t("Pagamento")}>{t("a {n} giorni", { n: c.daiDocumenti.terminiPagamentoGiorni })}</Voce>}
        {c.daiDocumenti?.tettoAccordo != null && <Voce etichetta={t("Tetto dell'accordo quadro")}>{euro(c.daiDocumenti.tettoAccordo)}</Voce>}
        {c.daiDocumenti?.quotaPct != null && (
          <Voce etichetta={t("Quota nel raggruppamento")}>{percentoIt(c.daiDocumenti.quotaPct)}{c.daiDocumenti.importoTotaleAppalto != null && <span className="block text-xs text-muted-foreground">{t("su {importo} dell'appalto", { importo: euro(c.daiDocumenti.importoTotaleAppalto) })}</span>}</Voce>
        )}
        {c.daiDocumenti?.revisionePrezzi && <Voce etichetta={t("Revisione prezzi")}>{c.daiDocumenti.revisionePrezzi}</Voce>}
      </dl>
      {c.note && <p className="border-t px-4 py-2 text-sm text-muted-foreground">{c.note}</p>}
    </section>
  );
}
