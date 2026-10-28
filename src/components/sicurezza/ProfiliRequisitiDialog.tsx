import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useArchiviaProfiloRequisiti,
  useProfiliRequisiti,
  useSalvaProfiloRequisiti,
} from "@/hooks/useProfiliRequisiti";
import {
  cercaProfili,
  datiProfiloVuoto,
  erroreProfilo,
  nuovoRequisitoProfilo,
  type DatiProfiloRequisiti,
  type ProfiloRequisiti,
} from "@/lib/sicurezza/profiliRequisiti";
import { CATALOGO_DOCUMENTI } from "@/lib/sicurezza/catalogoDocumenti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
const messaggio = (e: unknown) =>
  typeof e === "object" && e && "message" in e
    ? String(e.message)
    : "Operazione non riuscita. Riprova dopo avere riletto la libreria.";
type Modulo = {
  id: string;
  precedente: string | null;
  dati: DatiProfiloRequisiti;
};
/** Versioned technical checklists, not automatically applicable legal obligations. */
export function ProfiliRequisitiDialog({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const p = usePermissions();
  const q = useProfiliRequisiti(companyId);
  const salva = useSalvaProfiloRequisiti(companyId);
  const archivia = useArchiviaProfiloRequisiti(companyId);
  const [modulo, setModulo] = useState<Modulo | null>(null);
  const [cerca, setCerca] = useState("");
  const [archiviati, setArchiviati] = useState(false);
  const [errore, setErrore] = useState("");
  const [voce, setVoce] = useState("");
  const pending = salva.isPending || archivia.isPending;
  const cambia = (patch: Partial<DatiProfiloRequisiti>) =>
    setModulo((m) =>
      m ? { ...m, dati: { ...m.dati, testi_generici: false, ...patch } } : m,
    );
  function nuovaVersione(profilo?: ProfiloRequisiti) {
    setErrore("");
    setVoce("");
    setModulo({
      id: crypto.randomUUID(),
      precedente: profilo?.id ?? null,
      dati: profilo
        ? {
            nome: profilo.nome,
            attivita: profilo.attivita,
            ruoli: profilo.ruoli,
            limiti: profilo.limiti,
            criteri: profilo.criteri.map((c) => ({ ...c })),
            testi_generici: false,
          }
        : datiProfiloVuoto(),
    });
  }
  async function registra() {
    if (!modulo) return;
    const errore = erroreProfilo(modulo.dati);
    if (errore) {
      setErrore(errore);
      return;
    }
    setErrore("");
    try {
      await salva.mutateAsync({
        id: modulo.id,
        precedente: modulo.precedente,
        dati: modulo.dati,
      });
      setModulo(null);
      toast.success("Nuova versione del profilo salvata");
    } catch (e) {
      setErrore(messaggio(e));
    }
  }
  async function cambiaArchivio(v: ProfiloRequisiti) {
    setErrore("");
    try {
      await archivia.mutateAsync(v);
      toast.success(
        v.archiviato ? "Versione ripristinata" : "Versione archiviata",
      );
    } catch (e) {
      setErrore(messaggio(e));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !pending) onClose();
      }}
    >
      <DialogContent
        className="max-w-4xl flex flex-col gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b p-5 pr-12">
          <DialogTitle>
            {modulo
              ? modulo.precedente
                ? "Nuova versione del profilo"
                : "Nuovo profilo requisiti"
              : "Profili requisiti aziendali"}
          </DialogTitle>
          <DialogDescription>
            Attività, ruoli e criteri riutilizzabili. Ogni cantiere richiede una
            scelta esplicita e una valutazione dell’applicabilità; il profilo
            non costituisce un esito ITP.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {modulo ? (
            <fieldset
              disabled={pending || p.solaLettura}
              className="min-w-0 space-y-4"
            >
              <label className="block text-sm">
                Nome del profilo
                <Input
                  maxLength={120}
                  value={modulo.dati.nome}
                  onChange={(e) => cambia({ nome: e.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Attività previste
                  <Textarea
                    maxLength={4000}
                    value={modulo.dati.attivita}
                    onChange={(e) => cambia({ attivita: e.target.value })}
                    placeholder="Descrivi le lavorazioni a cui può servire"
                  />
                </label>
                <label className="text-sm">
                  Ruoli e soggetti interessati
                  <Textarea
                    maxLength={4000}
                    value={modulo.dati.ruoli}
                    onChange={(e) => cambia({ ruoli: e.target.value })}
                    placeholder="Es. impresa esecutrice, preposto, addetti alla posa"
                  />
                </label>
              </div>
              <label className="block text-sm">
                Condizioni e limiti d’impiego
                <Textarea
                  maxLength={4000}
                  value={modulo.dati.limiti}
                  onChange={(e) => cambia({ limiti: e.target.value })}
                />
              </label>
              <div className="space-y-2">
                <h3 className="font-medium">
                  Criteri del profilo · {modulo.dati.criteri.length}/50
                </h3>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Voce del catalogo per il profilo"
                    className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                    value={voce}
                    onChange={(e) => setVoce(e.target.value)}
                  >
                    <option value="">Scegli dal catalogo sicurezza…</option>
                    {CATALOGO_DOCUMENTI.voci
                      .filter((v) => v.destinazione === "sicurezza")
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.titolo}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={!voce || modulo.dati.criteri.length >= 50}
                    onClick={() => {
                      const v = CATALOGO_DOCUMENTI.voci.find(
                        (v) => v.id === voce,
                      );
                      if (v)
                        cambia({
                          criteri: [
                            ...modulo.dati.criteri,
                            {
                              ...nuovoRequisitoProfilo(),
                              titolo: v.titolo,
                              catalogo_id: v.id,
                              catalogo_versione: v.versione,
                            },
                          ],
                        });
                      setVoce("");
                    }}
                  >
                    Aggiungi voce
                  </Button>
                  <Button
                    variant="outline"
                    disabled={modulo.dati.criteri.length >= 50}
                    onClick={() =>
                      cambia({
                        criteri: [
                          ...modulo.dati.criteri,
                          nuovoRequisitoProfilo(),
                        ],
                      })
                    }
                  >
                    Aggiungi criterio libero
                  </Button>
                </div>
              </div>
              {modulo.dati.criteri.map((c, i) => {
                const modifica = (patch: Partial<typeof c>) =>
                  cambia({
                    criteri: modulo.dati.criteri.map((x) =>
                      x.id === c.id ? { ...x, ...patch } : x,
                    ),
                  });
                return (
                  <div className="rounded-lg border p-3 space-y-2" key={c.id}>
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1 text-sm">
                        Titolo del criterio {i + 1}
                        <Input
                          maxLength={300}
                          value={c.titolo}
                          disabled={!!c.catalogo_id}
                          onChange={(e) => modifica({ titolo: e.target.value })}
                        />
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          cambia({
                            criteri: modulo.dati.criteri.filter(
                              (x) => x.id !== c.id,
                            ),
                          })
                        }
                      >
                        Rimuovi criterio {i + 1}
                      </Button>
                    </div>
                    <label className="block text-sm">
                      Riferimento da esaminare
                      <Input
                        maxLength={1000}
                        value={c.riferimento}
                        onChange={(e) =>
                          modifica({ riferimento: e.target.value })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Indicazioni per chi valuta
                      <Textarea
                        maxLength={2000}
                        value={c.indicazioni}
                        onChange={(e) =>
                          modifica({ indicazioni: e.target.value })
                        }
                      />
                    </label>
                  </div>
                );
              })}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={modulo.dati.testi_generici}
                  onChange={(e) => cambia({ testi_generici: e.target.checked })}
                />
                <span>
                  Ho verificato che i testi siano generici, riutilizzabili e
                  privi di dati personali o riferimenti a un singolo cantiere.
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Il salvataggio crea una nuova versione. Non aggiorna i criteri
                nelle valutazioni esistenti, non verifica documenti e non invia
                richieste.
              </p>
            </fieldset>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Cerca profili per attività o ruolo"
                  value={cerca}
                  onChange={(e) => setCerca(e.target.value)}
                  placeholder="Cerca profilo, attività o ruolo…"
                  className="flex-1"
                />
                {!p.solaLettura && (
                  <Button onClick={() => nuovaVersione()}>Nuovo profilo</Button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={archiviati}
                  onChange={(e) => setArchiviati(e.target.checked)}
                />
                Mostra versioni archiviate
              </label>
              {q.isError ? (
                <p role="alert">
                  Profili non disponibili.{" "}
                  <Button variant="link" onClick={() => void q.refetch()}>
                    Riprova
                  </Button>
                </p>
              ) : q.isLoading ? (
                <p>Caricamento profili…</p>
              ) : (
                <div className="space-y-3">
                  {cercaProfili(q.data ?? [], cerca)
                    .filter((v) => archiviati || !v.archiviato)
                    .map((v) => {
                      const ultima = !(q.data ?? []).some(
                        (x) =>
                          x.famiglia_id === v.famiglia_id &&
                          x.versione > v.versione,
                      );
                      return (
                        <article
                          key={v.id}
                          className="rounded-lg border p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold">
                              {v.nome}{" "}
                              <span className="font-normal text-muted-foreground">
                                v{v.versione}
                              </span>
                            </h3>
                            <Badge variant="outline">
                              {v.archiviato
                                ? "Archiviato"
                                : ultima
                                  ? "Ultima versione"
                                  : "Versione precedente"}
                            </Badge>
                          </div>
                          <p className="text-sm">
                            <strong>Attività:</strong> {v.attivita}
                          </p>
                          <p className="text-sm">
                            <strong>Ruoli:</strong> {v.ruoli}
                          </p>
                          <p className="text-sm">
                            <strong>Limiti:</strong> {v.limiti}
                          </p>
                          <details className="text-sm">
                            <summary className="cursor-pointer">
                              Criteri da esaminare · {v.criteri.length}
                            </summary>
                            <ul className="mt-2 space-y-2">
                              {v.criteri.map((c) => (
                                <li className="border-l-2 pl-2" key={c.id}>
                                  <p className="font-medium">{c.titolo}</p>
                                  <p>{c.riferimento}</p>
                                  <p className="text-muted-foreground">
                                    {c.indicazioni}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </details>
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                            <p className="text-xs text-muted-foreground">
                              Creato il{" "}
                              {new Date(v.creato_il).toLocaleString("it-IT")}
                            </p>
                            {!p.solaLettura && (
                              <div className="flex gap-2">
                                {ultima && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => nuovaVersione(v)}
                                  >
                                    Nuova versione
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending}
                                  onClick={() => void cambiaArchivio(v)}
                                >
                                  {v.archiviato
                                    ? "Ripristina versione"
                                    : "Archivia versione"}
                                </Button>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  {!cercaProfili(q.data ?? [], cerca).some(
                    (v) => archiviati || !v.archiviato,
                  ) && (
                    <p className="text-sm text-muted-foreground">
                      Nessun profilo con questi filtri. I profili vengono
                      definiti dall’azienda; non sono stati creati obblighi
                      automatici dal catalogo.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {errore && (
            <p role="alert" className="text-sm text-destructive">
              {errore}
            </p>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4">
          {modulo ? (
            <>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setModulo(null);
                  setErrore("");
                }}
              >
                Annulla modifica
              </Button>
              <Button
                disabled={pending || p.solaLettura}
                onClick={() => void registra()}
              >
                {salva.isPending ? "Salvataggio…" : "Salva nuova versione"}
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Chiudi profili
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PulsanteProfiliRequisiti({ companyId }: { companyId: string }) {
  const p = usePermissions();
  const [aperto, setAperto] = useState(false);
  if (!companyId || !p.canViewSicurezzaCantiere) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAperto(true)}>
        Profili requisiti
      </Button>
      {aperto && (
        <ProfiliRequisitiDialog
          key={companyId}
          companyId={companyId}
          onClose={() => setAperto(false)}
        />
      )}
    </>
  );
}
