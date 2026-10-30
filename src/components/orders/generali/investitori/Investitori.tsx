// src/components/orders/generali/investitori/Investitori.tsx
// La scheda «Investitori» della commessa generale (piano §3.3, §B; tappa 5): da dove
// arrivano i soldi dell'operazione, il capitale di ogni fonte contro il capitale massimo
// impegnato del piano, la regola con cui si divide l'utile, i movimenti di ogni fonte e
// quanto le spetta a fine operazione, il rendiconto PDF da mandare e lo storico degli invii.
// Dati sensibili: la vede chi vede i margini. Da tablet e computer (telefono: false).
import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, CreditCard, FileText, Landmark, Loader2, Pencil, Plus, Trash2, User, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { TONI, dataBreve, euro, nomeMese, nomePiano, percento } from "@/components/orders/generali/piano/formato";
import { FonteDialog } from "@/components/orders/generali/investitori/FonteDialog";
import { MovimentoDialog } from "@/components/orders/generali/investitori/MovimentoDialog";
import { RendicontoDialog } from "@/components/orders/generali/investitori/RendicontoDialog";
import { RendimentoLeva } from "@/components/orders/generali/investitori/RendimentoLeva";
import {
  linkPdfRendiconto, messaggioInvestitori, useEliminaFonte, useEliminaMovimento, useGeneraleInvestitori,
  useRendicontiInviati, useVenditeGenerale,
} from "@/hooks/useGeneraleInvestitori";
import {
  NOMI_FONTE, NOMI_FORMA, NOMI_MOVIMENTO, NOMI_RIMBORSO, aCapitale, aDebito, nomeVersamento, spiegaRegola,
  type Colonne, type ContiInvestitori, type ContoFonte, type Fonte, type TipoFonte,
} from "@/lib/orders/generali/investitoriConti";
import { cn } from "@/lib/utils";

const ICONE: Record<TipoFonte, typeof User> = { propri: Wallet, capitale: User, prestito: User, banca: Landmark, finanziamento: CreditCard };
const COLORI_GRUPPO = { propri: "bg-slate-500", investitori: "bg-sky-600", debito: "bg-amber-500" } as const;

export function Investitori({ riepilogo, puoModificare }: PropsScheda) {
  const g = riepilogo.generale;
  const inv = useGeneraleInvestitori(riepilogo);
  const figlieIds = useMemo(() => riepilogo.figlie.map((f) => f.id), [riepilogo.figlie]);
  const vendite = useVenditeGenerale(g.id, figlieIds, riepilogo.permessi.margini);
  const [aperta, setAperta] = useState<string | null>(null);
  const [modifica, setModifica] = useState<{ fonte: Fonte | null; tipo?: TipoFonte } | null>(null);
  const [movimentoPer, setMovimentoPer] = useState<Fonte | null>(null);
  const [rendicontoPer, setRendicontoPer] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<Fonte | null>(null);
  const eliminaFonte = useEliminaFonte(g.id);

  if (!riepilogo.permessi.margini) {
    return (
      <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
        Gli investitori mostrano capitali, utili e quanto spetta a ciascuno: li vede chi ha il permesso di vedere i margini. Se ti serve, chiedilo al titolare.
      </div>
    );
  }
  if (inv.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        Non riesco a leggere le fonti di finanziamento.
        <Button size="sm" variant="outline" onClick={inv.refetch}>Riprova</Button>
      </div>
    );
  }
  if (inv.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const conti = inv.conti;
  const nuova = (tipo?: TipoFonte) => setModifica({ fonte: null, tipo });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Fonti e investitori</h2>
          <p className="text-sm text-muted-foreground">
            Chi mette i soldi nell'operazione, quanto ha versato e quanto gli spetta a fine operazione, dalla stima di {nomePiano(g.modello)}.
          </p>
        </div>
        {puoModificare && conti.fonti.length > 0 && (
          <Button size="sm" onClick={() => nuova()}><Plus className="mr-1.5 h-4 w-4" /> Aggiungi fonte</Button>
        )}
      </div>

      {(inv.pianoVuoto || inv.pianoInBozza) && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {inv.pianoVuoto
            ? `Senza ${nomePiano(g.modello)} non c'è una stima dell'utile né del capitale massimo: scrivilo nella scheda «Piano economico».`
            : `I numeri vengono dalla bozza ${nomePiano(g.modello).replace("il ", "del ")}, non ancora approvata.`}
        </p>
      )}

      {conti.avvisi.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {conti.avvisi.map((a) => (
            <li key={a} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a}</li>
          ))}
        </ul>
      )}

      {conti.fonti.length === 0 ? (
        <PrimoPasso puoModificare={puoModificare} onNuova={nuova} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <CoperturaCapitale conti={conti} capitaleMassimo={inv.numeri?.capitaleMassimo ?? null} meseMassimo={inv.numeri?.meseCapitaleMassimo ?? null} investitoOggi={inv.numeri?.capitaleInvestitoOggi ?? null} />
            <RegolaUtile conti={conti} haPiano={!!inv.numeri} />
          </div>

          <RendimentoLeva conti={conti} fonti={inv.fonti} movimenti={inv.movimenti} numeri={inv.numeri} oggi={inv.oggi} />

          <section aria-label="Le fonti" className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-left font-medium">Fonte</th>
                  <th colSpan={3} className="border-l px-3 pt-2 text-center font-medium">Capitale</th>
                  <th colSpan={3} className="border-l px-3 pt-2 text-center font-medium">Utile o interessi</th>
                  <th rowSpan={2} className="border-l px-3 py-2 text-right font-medium">Gli spetta<br />a fine operazione</th>
                </tr>
                <tr>
                  {[0, 1].map((i) => (
                    <Fragment key={i}>
                      <Intestazione tono="previsto" bordo>Previsto</Intestazione>
                      <Intestazione tono="reale">Ad oggi</Intestazione>
                      <Intestazione tono="aFinire">A finire</Intestazione>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conti.fonti.map((c) => (
                  <RigaFonte
                    key={c.fonte.id}
                    c={c}
                    aperta={aperta === c.fonte.id}
                    onApri={() => setAperta(aperta === c.fonte.id ? null : c.fonte.id)}
                  >
                    <DettaglioFonte
                      c={c}
                      generaleId={g.id}
                      puoModificare={puoModificare}
                      onMovimento={() => setMovimentoPer(c.fonte)}
                      onRendiconto={() => setRendicontoPer(c.fonte.id)}
                      onModifica={() => setModifica({ fonte: c.fonte })}
                      onElimina={() => setDaEliminare(c.fonte)}
                    />
                  </RigaFonte>
                ))}
              </tbody>
              <tfoot className="border-t font-medium">
                <tr>
                  <td className="px-3 py-2">Totale</td>
                  <Cifre col={somma(conti.fonti.map((c) => c.capitale))} bordo />
                  <Cifre col={somma(conti.fonti.map((c) => c.rendimento))} bordo />
                  <td className="border-l px-3 py-2 text-right tabular-nums">{euro(conti.totali.spettaAFine)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Capitale: previsto è l'impegno, ad oggi quello versato e non ancora rimborsato, a finire quello ancora da versare.
              Utile o interessi: previsto dal piano approvato, ad oggi già pagato, a finire ancora da ricevere secondo la stima. Tocca una fonte per i movimenti e il rendiconto.
            </p>
          </section>

          <Storico generaleId={g.id} fonti={conti.fonti.map((c) => c.fonte)} />
        </>
      )}

      <FonteDialog open={!!modifica} onOpenChange={(o) => !o && setModifica(null)} generaleId={g.id} fonte={modifica?.fonte ?? null} tipoIniziale={modifica?.tipo} />
      {movimentoPer && (
        <MovimentoDialog
          open onOpenChange={(o) => !o && setMovimentoPer(null)} generaleId={g.id} fonte={movimentoPer} oggi={inv.oggi}
          unita={riepilogo.figlie.map((f) => ({ id: f.id, nome: f.codice ? `${f.codice} · ${f.nome}` : f.nome }))}
        />
      )}
      {rendicontoPer && (
        <RendicontoDialog
          open
          onOpenChange={(o) => !o && setRendicontoPer(null)}
          riepilogo={riepilogo}
          fonteId={rendicontoPer}
          conti={conti}
          numeriPiano={inv.numeriPiano}
          vendite={vendite.data ?? null}
          oggi={inv.oggi}
          puoInviare={puoModificare}
        />
      )}
      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {daEliminare?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Spariscono anche i suoi versamenti e rimborsi. I rendiconti già inviati restano nello storico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!daEliminare) return;
                eliminaFonte.mutate(daEliminare.id, {
                  onSuccess: () => toast.success("Fonte eliminata"),
                  onError: (e) => toast.error(messaggioInvestitori(e, "la fonte")),
                });
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const somma = (c: Colonne[]): Colonne => ({
  previsto: c.reduce((t, x) => t + x.previsto, 0),
  adOggi: c.reduce((t, x) => t + x.adOggi, 0),
  aFinire: c.reduce((t, x) => t + x.aFinire, 0),
  stima: c.reduce((t, x) => t + x.stima, 0),
});

function Intestazione({ tono, bordo, children }: { tono: keyof typeof TONI; bordo?: boolean; children: ReactNode }) {
  return (
    <th className={cn("px-3 pb-2 text-right font-normal", bordo && "border-l")}>
      <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", TONI[tono].punto)} />{children}</span>
    </th>
  );
}

function Cifre({ col, bordo }: { col: Colonne; bordo?: boolean }) {
  return (
    <>
      <td className={cn("px-3 py-2 text-right tabular-nums", bordo && "border-l")}>{euro(col.previsto)}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", TONI.reale.testo)}>{euro(col.adOggi)}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", TONI.aFinire.testo, col.aFinire < 0 && "text-destructive")}>{euro(col.aFinire)}</td>
    </>
  );
}

function descrizioneFonte(f: Fonte): string {
  const parti: string[] = [aDebito(f.tipo) && f.forma ? NOMI_FORMA[f.forma] : NOMI_FONTE[f.tipo].nome];
  if (aCapitale(f.tipo)) parti.push(f.quotaUtilePct !== null ? `quota fissa ${percento(f.quotaUtilePct / 100, 2)}` : "pro quota");
  else {
    if (f.tassoPct !== null) parti.push(`${percento(f.tassoPct / 100, 2)} annuo`);
    if (f.rimborso && f.rimborso !== "scadenza") parti.push(NOMI_RIMBORSO[f.rimborso].nome.toLowerCase());
    if (f.scadenza) parti.push(`scade il ${dataBreve(f.scadenza)}`);
  }
  return parti.join(" · ");
}

function RigaFonte({ c, aperta, onApri, children }: { c: ContoFonte; aperta: boolean; onApri: () => void; children: ReactNode }) {
  const Icona = c.fonte.soggetto === "societa" && c.fonte.tipo !== "banca" && c.fonte.tipo !== "propri" ? Building2 : ICONE[c.fonte.tipo];
  return (
    <>
      <tr className={cn("border-b last:border-b-0 hover:bg-muted/40", aperta && "bg-muted/40")}>
        <td className="px-3 py-2">
          <button type="button" onClick={onApri} aria-expanded={aperta} className="flex w-full items-start gap-2 text-left">
            {aperta ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
            <Icona className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.fonte.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{descrizioneFonte(c.fonte)}</span>
            </span>
          </button>
        </td>
        <Cifre col={c.capitale} bordo />
        <Cifre col={c.rendimento} bordo />
        <td className="border-l px-3 py-2 text-right">
          <span className="block font-semibold tabular-nums">{euro(c.spettaAFine)}</span>
          {c.rendimentoPct !== null && (
            <span className={cn("block text-xs", c.rendimentoPct < 0 ? "text-destructive" : "text-muted-foreground")}>
              rendimento {percento(c.rendimentoPct)}
            </span>
          )}
          {c.tir !== null && <span className="block text-xs text-muted-foreground">TIR {percento(c.tir)} l'anno</span>}
        </td>
      </tr>
      {aperta && (
        <tr className="border-b bg-muted/20">
          <td colSpan={8} className="px-4 py-3">{children}</td>
        </tr>
      )}
    </>
  );
}

function DettaglioFonte({
  c, generaleId, puoModificare, onMovimento, onRendiconto, onModifica, onElimina,
}: {
  c: ContoFonte; generaleId: string; puoModificare: boolean;
  onMovimento: () => void; onRendiconto: () => void; onModifica: () => void; onElimina: () => void;
}) {
  const elimina = useEliminaMovimento(generaleId);
  const nome = (t: string) => (t === "versamento" ? nomeVersamento(c.fonte.tipo) : NOMI_MOVIMENTO[t as keyof typeof NOMI_MOVIMENTO]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Movimenti</h3>
          {puoModificare && (
            <Button size="sm" variant="outline" onClick={onMovimento}><Plus className="mr-1.5 h-3.5 w-3.5" /> Registra movimento</Button>
          )}
        </div>
        {c.movimenti.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun movimento. Registra il primo {nomeVersamento(c.fonte.tipo).toLowerCase()} con la data: da lì contano il capitale{aCapitale(c.fonte.tipo) ? " e il tempo" : " e gli interessi"}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {c.movimenti.map((m) => (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="py-1.5 pr-3 tabular-nums">{dataBreve(m.data)}</td>
                  <td className="py-1.5 pr-3">{nome(m.tipo)}{m.nota && <span className="text-muted-foreground"> · {m.nota}</span>}</td>
                  <td className={cn("py-1.5 pr-3 text-right tabular-nums", m.tipo === "versamento" ? "" : "text-emerald-700 dark:text-emerald-400")}>
                    {m.tipo === "versamento" ? "" : "− "}{euro(m.importo)}
                  </td>
                  {puoModificare && (
                    <td className="w-8 py-1.5 text-right">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7" aria-label={`Elimina ${nome(m.tipo).toLowerCase()} del ${dataBreve(m.data)}`}
                        disabled={elimina.isPending}
                        onClick={() => elimina.mutate(m.id, { onError: (e) => toast.error(messaggioInvestitori(e, "il movimento")) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{c.regola}</p>
        {c.interessiMaturati !== null && (
          <p>Interessi maturati fino a oggi: <span className="font-medium tabular-nums">{euro(c.interessiMaturati)}</span></p>
        )}
        {c.spese && c.spese.stima > 0 && (
          <p>Spese: <span className="font-medium tabular-nums">{euro(c.spese.stima)}</span>{c.spese.aFinire > 0 && <span className="text-muted-foreground"> (da pagare {euro(c.spese.aFinire)})</span>}</p>
        )}
        {c.costoAnnuo !== null && <p>Costo effettivo, interessi e spese: <span className="font-medium tabular-nums">{percento(c.costoAnnuo)} l'anno</span></p>}
        {c.daVersare - c.daUsare >= 1 && (
          <p className="text-muted-foreground">Secondo il piano dell'impegno serviranno {euro(c.daUsare)} su {euro(c.daVersare)} ancora da versare.</p>
        )}
        {c.fonte.email && <p className="truncate text-muted-foreground">Rendiconti a {c.fonte.email}</p>}
        {c.fonte.nota && <p className="whitespace-pre-wrap text-muted-foreground">{c.fonte.nota}</p>}
        <div className="flex flex-wrap gap-2">
          {c.fonte.tipo !== "propri" && (
            <Button size="sm" onClick={onRendiconto}><FileText className="mr-1.5 h-3.5 w-3.5" /> Rendiconto</Button>
          )}
          {puoModificare && <Button size="sm" variant="outline" onClick={onModifica}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica</Button>}
          {puoModificare && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onElimina}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Elimina</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PrimoPasso({ puoModificare, onNuova }: { puoModificare: boolean; onNuova: (t: TipoFonte) => void }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-4 py-6">
      <p className="font-medium">Da dove arrivano i soldi dell'operazione?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Aggiungi le fonti: i mezzi propri, gli investitori (a capitale o a prestito), la banca o il mutuo e gli altri finanziamenti. Vedrai se coprono il capitale massimo del piano, quanto costa il debito, quanto spetta a ciascuno e quanto rendono i tuoi soldi.
      </p>
      {puoModificare ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNuova("propri")}><Wallet className="mr-1.5 h-4 w-4" /> Mezzi propri</Button>
          <Button size="sm" variant="outline" onClick={() => onNuova("capitale")}><User className="mr-1.5 h-4 w-4" /> Investitore</Button>
          <Button size="sm" variant="outline" onClick={() => onNuova("banca")}><Landmark className="mr-1.5 h-4 w-4" /> Banca o mutuo</Button>
          <Button size="sm" variant="outline" onClick={() => onNuova("finanziamento")}><CreditCard className="mr-1.5 h-4 w-4" /> Fido, prestito soci, leasing</Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Le fonti le aggiunge chi può modificare la commessa.</p>
      )}
    </div>
  );
}

/** Capitale per fonte (propri · investitori · banca) contro il capitale massimo impegnato del piano. */
export function CoperturaCapitale({ conti, capitaleMassimo, meseMassimo, investitoOggi }: {
  conti: ContiInvestitori; capitaleMassimo: number | null; meseMassimo: string | null; investitoOggi: number | null;
}) {
  const scala = Math.max(capitaleMassimo ?? 0, conti.totali.impegno, 1);
  const coperto = capitaleMassimo === null || conti.scoperto < 1;
  return (
    <section aria-label="Capitale per fonte" className="rounded-lg border bg-card px-4 py-3">
      <h3 className="text-sm font-semibold">Capitale per fonte</h3>
      <p className="text-xs text-muted-foreground">
        {capitaleMassimo === null
          ? "Impegni delle fonti. Con il piano economico vedrai il capitale massimo da coprire."
          : `Impegni delle fonti contro il capitale massimo impegnato${meseMassimo ? `, a ${nomeMese(meseMassimo)}` : ""}.`}
      </p>
      <div className="relative mt-3 h-4 w-full overflow-hidden rounded bg-muted" role="img" aria-label={`Impegni ${euro(conti.totali.impegno)}${capitaleMassimo !== null ? ` su ${euro(capitaleMassimo)}` : ""}`}>
        <div className="flex h-full">
          {conti.copertura.map((g) => (
            <div key={g.gruppo} className={cn("h-full", COLORI_GRUPPO[g.gruppo])} style={{ width: `${(g.impegno / scala) * 100}%` }} />
          ))}
        </div>
        {capitaleMassimo !== null && capitaleMassimo > 0 && (
          <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `calc(${Math.min(100, (capitaleMassimo / scala) * 100)}% - 1px)` }} title="Capitale massimo impegnato" />
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {conti.copertura.map((g) => (
          <div key={g.gruppo} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", COLORI_GRUPPO[g.gruppo])} />{g.nome}</dt>
            <dd className="font-medium tabular-nums">{euro(g.impegno)}</dd>
            <dd className="text-xs text-muted-foreground tabular-nums">versati {euro(g.dentro)}</dd>
          </div>
        ))}
      </dl>
      {capitaleMassimo !== null && (
        <p className={cn("mt-2 text-sm", coperto ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
          {coperto
            ? `Le fonti coprono il picco di ${euro(capitaleMassimo)}.`
            : `Mancano ${euro(conti.scoperto)} per coprire il picco di ${euro(capitaleMassimo)}.`}
          {investitoOggi !== null && <span className="text-muted-foreground"> A oggi l'operazione ha assorbito {euro(investitoOggi)}.</span>}
        </p>
      )}
    </section>
  );
}

function RegolaUtile({ conti, haPiano }: { conti: ContiInvestitori; haPiano: boolean }) {
  return (
    <section aria-label="Come si divide l'utile" className="rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Come si divide l'utile</h3>
        {haPiano && (
          <p className="text-sm">
            Utile da dividere: <span className="font-medium tabular-nums">{euro(conti.utile.stima)}</span>
            <span className="text-xs text-muted-foreground"> (previsto {euro(conti.utile.previsto)})</span>
          </p>
        )}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {spiegaRegola(conti).map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">La regola di ogni fonte (pro quota o quota fissa) si sceglie in «Modifica».</p>
    </section>
  );
}

function Storico({ generaleId, fonti }: { generaleId: string; fonti: Fonte[] }) {
  const rendiconti = useRendicontiInviati(generaleId);
  const [apro, setApro] = useState<string | null>(null);
  const elenco = Array.isArray(rendiconti.data) ? rendiconti.data : [];
  const nomi = new Map(fonti.map((f) => [f.id, f.nome]));

  const apri = async (id: string, path: string) => {
    setApro(id);
    try {
      window.open(await linkPdfRendiconto(path), "_blank", "noopener");
    } catch {
      toast.error("Non riesco ad aprire il PDF. Riprova tra poco.");
    } finally {
      setApro(null);
    }
  };

  return (
    <section aria-label="Rendiconti inviati" className="rounded-lg border bg-card">
      <h3 className="border-b px-4 py-2 text-sm font-semibold">Rendiconti inviati</h3>
      {rendiconti.isLoading ? (
        <Skeleton className="m-4 h-8" />
      ) : elenco.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nessun rendiconto inviato. Apri una fonte e premi «Rendiconto».</p>
      ) : (
        <ul className="divide-y">
          {elenco.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{nomi.get(r.fonteId ?? "") ?? r.fonteNome}</span>
                <span className="text-muted-foreground"> · {r.destinatario} · {dataBreve((r.inviatoIl ?? r.creatoIl).slice(0, 10))}</span>
                {r.stato === "fallito" && r.errore && <span className="block text-xs text-destructive">{r.errore}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={r.stato === "fallito" ? "destructive" : r.stato === "inviato" ? "secondary" : "outline"} className="font-normal">
                  {r.stato === "inviato" ? "Inviato" : r.stato === "fallito" ? "Non partito" : "In invio"}
                </Badge>
                {r.pdfPath && (
                  <Button size="sm" variant="ghost" className="h-7" disabled={apro === r.id} onClick={() => void apri(r.id, r.pdfPath!)}>
                    {apro === r.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />} PDF
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
