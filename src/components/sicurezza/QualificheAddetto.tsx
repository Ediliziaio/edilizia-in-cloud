import { useState } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useQualificheAddetto,
  useRegistraQualifica,
} from "@/hooks/useQualificheAddetto";
import {
  qualificaVuota,
  erroreQualifica,
  statoQualifica,
  ultimeQualifiche,
  type DatiQualifica,
  type QualificaAddetto,
  type TipoPersonaQualifica,
  type FonteQualifica,
} from "@/lib/sicurezza/qualificheAddetti";
import { oggiSicurezza } from "@/lib/sicurezza/fascicolo";
import { apriFileRiservato } from "@/lib/storagePrivato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  companyId: string;
  tipo: TipoPersonaQualifica;
  personaId: string;
  apertoIniziale?: boolean;
}
interface Form {
  richiesta: string;
  precedente: QualificaAddetto | null;
  revoca: boolean;
  fonte: string;
  dati: DatiQualifica;
  motivo: string;
}
export function QualificheAddetto({
  companyId,
  tipo,
  personaId,
  apertoIniziale = false,
}: Props) {
  const p = usePermissions();
  const [aperto, setAperto] = useState(apertoIniziale),
    [storico, setStorico] = useState(false),
    [form, setForm] = useState<Form | null>(null),
    [letto, setLetto] = useState<string | null>(null),
    [confermata, setConfermata] = useState<string | null>(null);
  const [dal, setDal] = useState(oggiSicurezza()),
    [al, setAl] = useState(oggiSicurezza());
  const q = useQualificheAddetto(companyId, tipo, personaId, aperto),
    salva = useRegistraQualifica(companyId, tipo, personaId);
  const legge =
    tipo === "hr"
      ? p.canViewPersone || p.canViewSicurezzaCantiere
      : p.canViewSicurezzaCantiere;
  const scrive =
    legge &&
    !p.solaLettura &&
    (tipo === "hr" ? p.canViewPersone : p.canViewSicurezzaCantiere) &&
    q.data?.puo_classificare === true;
  const leggeOriginali =
    tipo === "hr" ? p.canViewPersone : p.canViewSicurezzaCantiere;
  const fonti = leggeOriginali ? q.data?.fonti || [] : [];
  const registrazioni = legge ? q.data?.registrazioni || [] : [];
  const fonte = fonti.find((f) => f.foto?.id === form?.fonte),
    hash = fonte?.foto?.impronta;
  const cambia = <K extends keyof DatiQualifica>(k: K, v: DatiQualifica[K]) => {
    setConfermata(null);
    setForm((f) => (f ? { ...f, dati: { ...f.dati, [k]: v } } : f));
  };
  const inizia = (
    precedente: QualificaAddetto | null = null,
    revoca = false,
  ) => {
    setLetto(null);
    setConfermata(null);
    setForm({
      richiesta: crypto.randomUUID(),
      precedente,
      revoca,
      fonte: "",
      dati: precedente
        ? { ...precedente.dati, conferma_lettura: false }
        : qualificaVuota(),
      motivo: "",
    });
  };
  const apri = async (f: FonteQualifica) => {
    try {
      const id = f.foto?.id,
        bucket = tipo === "hr" ? "hr-documenti" : "fascicoli-cantiere",
        cartella = tipo === "hr" ? personaId : id;
      if (
        !leggeOriginali ||
        !id ||
        f.foto?.persona.id !== personaId ||
        f.foto.persona.tipo !== tipo ||
        f.bucket !== bucket ||
        !f.path ||
        !f.path.startsWith(`${companyId}/${cartella}/`) ||
        f.path.split("/").length !== 3 ||
        f.path.includes("\\") ||
        f.path.split("/").some((x) => !x || x === "." || x === "..")
      )
        throw new Error("Originale non pertinente alla persona");
      setConfermata(null);
      await apriFileRiservato(bucket, f.path);
      setLetto(f.foto.impronta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Originale non disponibile");
    }
  };
  const registra = async () => {
    if (!form || !scrive || q.isError || q.isFetching) return;
    const dati = Object.fromEntries(
      Object.entries(form.dati).map(([k, v]) => [
        k,
        typeof v === "string" ? v.trim() : v,
      ]),
    ) as unknown as DatiQualifica;
    dati.conferma_lettura = !!hash && letto === hash && confermata === hash;
    if (!form.revoca) {
      const errore = erroreQualifica(dati);
      if (errore) {
        toast.error(errore);
        return;
      }
    }
    try {
      await salva.mutateAsync({
        id: form.richiesta,
        precedente: form.precedente?.id || null,
        azione: form.revoca ? "revoca" : "riesamina",
        fonte: form.revoca ? null : form.fonte || null,
        impronta: form.revoca ? null : hash || null,
        dati: form.revoca ? null : dati,
        motivo: form.motivo.trim(),
      });
      setForm(null);
      toast.success(
        form.revoca
          ? "Revoca registrata nello storico"
          : "Riesame della qualifica registrato",
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Registrazione non completata: riprova con la stessa richiesta",
      );
    }
  };
  if (!legge) return null;
  const righe = storico ? registrazioni : ultimeQualifiche(registrazioni);
  return (
    <section className="rounded-lg border p-3 space-y-3">
      <button
        type="button"
        className="w-full text-left text-sm font-semibold"
        aria-expanded={aperto}
        onClick={() => setAperto(!aperto)}
      >
        Formazione, abilitazioni e addestramento {aperto ? "−" : "+"}
      </button>
      {aperto && (
        <>
          <p className="text-xs text-muted-foreground">
            Registra ciò che l’originale documenta, con ambito e limiti. Il
            riesame non attesta l’idoneità alla mansione o l’autorizzazione al
            cantiere. Le scadenze non sono dedotte dal titolo.
          </p>
          {q.isLoading ? (
            <p role="status" className="text-sm">
              Lettura qualifiche…
            </p>
          ) : q.isError ? (
            <div role="alert" className="text-sm">
              Qualifiche non disponibili.{" "}
              <Button variant="link" onClick={() => q.refetch()}>
                Riprova qualifiche
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor={`qual-dal-${personaId}`}>Periodo dal</Label>
                  <Input
                    id={`qual-dal-${personaId}`}
                    type="date"
                    value={dal}
                    onChange={(e) => setDal(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`qual-al-${personaId}`}>al</Label>
                  <Input
                    id={`qual-al-${personaId}`}
                    type="date"
                    value={al}
                    onChange={(e) => setAl(e.target.value)}
                  />
                </div>
                <label className="flex gap-2 items-center text-xs">
                  <input
                    type="checkbox"
                    checked={storico}
                    onChange={(e) => setStorico(e.target.checked)}
                  />
                  Mostra revisioni precedenti
                </label>
                {scrive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => inizia()}
                  >
                    Registra qualifica
                  </Button>
                )}
              </div>
              {!q.data?.persona.attivo && (
                <p className="text-xs text-amber-900">
                  Persona non attiva: queste registrazioni restano uno storico e
                  non ne determinano l’assegnabilità.
                </p>
              )}
              {righe.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessuna qualifica riesaminata. Gli attestati caricati restano
                  documenti da classificare.
                </p>
              ) : (
                <ul className="space-y-2">
                  {righe.map((r) => (
                    <li
                      key={r.id}
                      className="rounded border p-3 space-y-1 text-sm"
                    >
                      <p className="font-medium">
                        {r.dati.titolo} · Rev. {r.versione}
                      </p>
                      <p>
                        {r.dati.tipologia} · {r.dati.ambito}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.dati.ente} · {r.dati.validita_dal} →{" "}
                        {r.dati.validita_al || "Scadenza non indicata"}
                      </p>
                      {r.dati.motivazione_senza_scadenza && (
                        <p className="text-xs">
                          Assenza di scadenza:{" "}
                          {r.dati.motivazione_senza_scadenza}
                        </p>
                      )}
                      {r.dati.limitazioni && (
                        <p className="text-xs">Limiti: {r.dati.limitazioni}</p>
                      )}
                      <p className="text-xs">{statoQualifica(r, dal, al)}</p>
                      {r.motivo && (
                        <p className="text-xs">Motivo: {r.motivo}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Registrata il {r.registrato_il.slice(0, 10)}
                      </p>
                      {fonti.some((f) => f.foto?.id === r.fonte_id) && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => {
                            const f = fonti.find(
                              (f) => f.foto?.id === r.fonte_id,
                            );
                            if (f) void apri(f);
                          }}
                        >
                          Apri originale corrente
                        </Button>
                      )}
                      {scrive && !storico && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => inizia(r)}
                          >
                            Nuova revisione
                          </Button>
                          {r.stato !== "revocata" && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => inizia(r, true)}
                            >
                              Revoca qualifica
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {form && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o && !salva.isPending) setForm(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {form.revoca
                  ? "Revoca della qualifica"
                  : form.precedente
                    ? "Nuova revisione della qualifica"
                    : "Qualifica documentata dell’addetto"}
              </DialogTitle>
              <DialogDescription>
                {q.data?.persona.nome} {q.data?.persona.cognome} · Nessuna
                modifica dell’originale o delle revisioni precedenti.
              </DialogDescription>
            </DialogHeader>
            {form.revoca ? (
              <>
                <p className="text-sm">{form.precedente?.dati.titolo}</p>
                <Label htmlFor="qual-motivo">Motivo della revoca</Label>
                <Textarea
                  id="qual-motivo"
                  maxLength={2000}
                  value={form.motivo}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                />
              </>
            ) : (
              <>
                <Label htmlFor="qual-fonte">Originale della persona</Label>
                <select
                  id="qual-fonte"
                  className="h-10 rounded border bg-background px-2 text-sm w-full"
                  value={form.fonte}
                  onChange={(e) => {
                    setLetto(null);
                    setConfermata(null);
                    setForm({ ...form, fonte: e.target.value });
                  }}
                >
                  <option value="">Scegli un documento formativo</option>
                  {fonti
                    .filter((f) => f.foto)
                    .map((f) => (
                      <option key={f.foto!.id} value={f.foto!.id}>
                        {f.foto!.titolo || f.foto!.file_name} ·{" "}
                        {f.foto!.data_scadenza || "senza data di scadenza"}
                      </option>
                    ))}
                </select>
                {fonti.some((f) => f.non_disponibile) && (
                  <p className="text-xs text-amber-900">
                    Alcuni documenti non hanno un originale disponibile o
                    pertinente: correggili nell’archivio prima di selezionarli.
                  </p>
                )}
                {fonti.filter((f) => f.foto).length === 0 && (
                  <p className="text-sm">
                    Carica prima un corso/attestato nei Documenti della persona.
                    Visite mediche, contratti e identità non sono utilizzabili
                    qui.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={!fonte || q.isFetching || q.isError}
                  onClick={() => fonte && apri(fonte)}
                >
                  Apri originale da riesaminare
                </Button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="qual-tipologia">Tipo di evidenza</Label>
                    <select
                      id="qual-tipologia"
                      className="h-10 w-full rounded border bg-background px-2 text-sm"
                      value={form.dati.tipologia}
                      disabled={!!form.precedente}
                      onChange={(e) =>
                        cambia(
                          "tipologia",
                          e.target.value as DatiQualifica["tipologia"],
                        )
                      }
                    >
                      {[
                        "formazione",
                        "abilitazione",
                        "addestramento",
                        "qualifica",
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="qual-titolo">Titolo della qualifica</Label>
                    <Input
                      id="qual-titolo"
                      maxLength={180}
                      value={form.dati.titolo}
                      readOnly={!!form.precedente}
                      onChange={(e) => cambia("titolo", e.target.value)}
                    />
                  </div>
                </div>
                <Label htmlFor="qual-ambito">
                  Ambito documentato (attività, ruolo, attrezzatura)
                </Label>
                <Textarea
                  id="qual-ambito"
                  maxLength={2000}
                  value={form.dati.ambito}
                  readOnly={!!form.precedente}
                  onChange={(e) => cambia("ambito", e.target.value)}
                />
                <Label htmlFor="qual-ente">Soggetto/ente attestante</Label>
                <Input
                  id="qual-ente"
                  maxLength={300}
                  value={form.dati.ente}
                  onChange={(e) => cambia("ente", e.target.value)}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="qual-inizio">Decorrenza documentata</Label>
                    <Input
                      id="qual-inizio"
                      type="date"
                      value={form.dati.validita_dal}
                      onChange={(e) => cambia("validita_dal", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="qual-fine">Scadenza documentata</Label>
                    <Input
                      id="qual-fine"
                      type="date"
                      value={form.dati.validita_al}
                      onChange={(e) => cambia("validita_al", e.target.value)}
                    />
                  </div>
                </div>
                <Label htmlFor="qual-senza">
                  Motivazione documentata se manca la scadenza
                </Label>
                <Textarea
                  id="qual-senza"
                  maxLength={2000}
                  value={form.dati.motivazione_senza_scadenza}
                  onChange={(e) =>
                    cambia("motivazione_senza_scadenza", e.target.value)
                  }
                />
                <Label htmlFor="qual-limiti">Limitazioni e condizioni</Label>
                <Textarea
                  id="qual-limiti"
                  maxLength={2000}
                  value={form.dati.limitazioni}
                  onChange={(e) => cambia("limitazioni", e.target.value)}
                />
                <Label htmlFor="qual-riferimento">
                  Riferimento e metodo del riesame
                </Label>
                <Textarea
                  id="qual-riferimento"
                  maxLength={2000}
                  value={form.dati.riferimento}
                  onChange={(e) => cambia("riferimento", e.target.value)}
                />
                <label className="flex gap-2 items-start text-sm">
                  <input
                    type="checkbox"
                    disabled={
                      !hash || letto !== hash || q.isFetching || q.isError
                    }
                    checked={!!hash && confermata === hash}
                    onChange={(e) =>
                      setConfermata(e.target.checked ? hash || null : null)
                    }
                  />
                  Ho letto l’originale di questa persona e controllato ambito,
                  date e limiti. Non sto registrando dati sanitari o
                  un’autorizzazione al cantiere.
                </label>
              </>
            )}
            {(q.isError || q.isFetching) && (
              <p role="alert" className="text-sm">
                Attendi la rilettura delle fonti prima di registrare.
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={salva.isPending}
                onClick={() => setForm(null)}
              >
                Annulla
              </Button>
              <Button
                disabled={
                  !scrive ||
                  salva.isPending ||
                  q.isError ||
                  q.isFetching ||
                  (!form.revoca &&
                    (!hash || letto !== hash || confermata !== hash)) ||
                  (form.revoca && !form.motivo.trim())
                }
                onClick={registra}
              >
                {salva.isPending
                  ? "Registrazione…"
                  : form.revoca
                    ? "Registra revoca"
                    : "Registra riesame"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
