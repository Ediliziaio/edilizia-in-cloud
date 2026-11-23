// I campi del cliente per la fattura, secondo il tipo (lotto 1, 15/11/2026).
//   privato: nome, cognome, codice fiscale, indirizzo, paese, contatti
//   azienda: ragione sociale, P.IVA, CF se diverso, sede, PEC, codice destinatario, contatti amministrativi
//   PA:      denominazione, CF obbligatorio, P.IVA facoltativa, sede, PEC, contatti amministrativi,
//            codice IPA, split payment sì/no/come azienda (+ primo ufficio alla creazione)
// `soloExtra` mostra solo i campi che la creazione cliente non ha già (PEC, codici, split…).

import type { ReactNode } from "react";
import { Building2, Landmark, User as UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ETICHETTA_TIPO_CLIENTE,
  TIPI_SCEGLIBILI,
  type ClienteFiscaleForm,
  type SceltaSplit,
  type TipoClienteFiscale,
} from "@/lib/clienti/clienteFiscale";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ICONA: Record<string, ReactNode> = {
  B2C: <UserIcon className="h-3.5 w-3.5 mr-1.5" />,
  B2B: <Building2 className="h-3.5 w-3.5 mr-1.5" />,
  PA: <Landmark className="h-3.5 w-3.5 mr-1.5" />,
};

export function SceltaTipoCliente({
  value,
  onChange,
  disabled,
}: {
  value: TipoClienteFiscale;
  onChange: (t: TipoClienteFiscale) => void;
  disabled?: boolean;
}) {
  const tipi = value === "Estero" ? [...TIPI_SCEGLIBILI, "Estero" as const] : TIPI_SCEGLIBILI;
  return (
    <Tabs value={value} onValueChange={(v) => !disabled && onChange(v as TipoClienteFiscale)}>
      <TabsList className={`grid w-full ${tipi.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {tipi.map((t) => (
          <TabsTrigger key={t} value={t} disabled={disabled} className="text-xs sm:text-sm">
            {ICONA[t]}
            {t === "PA" ? (
              <>
                <span className="sm:hidden" aria-hidden="true">PA</span>
                <span className="sr-only sm:not-sr-only">{ETICHETTA_TIPO_CLIENTE[t]}</span>
              </>
            ) : (
              ETICHETTA_TIPO_CLIENTE[t]
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface Props {
  value: ClienteFiscaleForm;
  onChange: (v: ClienteFiscaleForm) => void;
  errori?: Record<string, string>;
  soloExtra?: boolean;
  /** PA alla creazione: chiede anche il primo ufficio. */
  conUfficio?: boolean;
  disabled?: boolean;
}

export function CampiClienteFiscale({ value, onChange, errori = {}, soloExtra = false, conUfficio = false, disabled }: Props) {
  const t = useT();
  const f = value;
  const set = (patch: Partial<ClienteFiscaleForm>) => onChange({ ...f, ...patch });
  const privato = f.tipo === "B2C";
  const pa = f.tipo === "PA";

  const campo = (
    chiave: keyof ClienteFiscaleForm,
    etichetta: string,
    opz: { placeholder?: string; mono?: boolean; maiuscolo?: boolean; type?: string; aiuto?: string; maxLength?: number; className?: string } = {},
  ) => (
    <div className={`space-y-1.5 ${opz.className ?? ""}`}>
      <Label htmlFor={`cf-${chiave}`}>{etichetta}</Label>
      <Input
        id={`cf-${chiave}`}
        type={opz.type ?? "text"}
        value={(f[chiave] as string) ?? ""}
        onChange={(e) => set({ [chiave]: e.target.value } as Partial<ClienteFiscaleForm>)}
        placeholder={opz.placeholder}
        maxLength={opz.maxLength}
        disabled={disabled}
        className={opz.mono ? "font-mono" : undefined}
        style={opz.maiuscolo ? { textTransform: "uppercase" } : undefined}
        aria-invalid={!!errori[chiave]}
      />
      {errori[chiave] ? (
        <p className="text-xs text-destructive">{errori[chiave]}</p>
      ) : opz.aiuto ? (
        <p className="text-xs text-muted-foreground">{opz.aiuto}</p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      {!soloExtra && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {privato ? (
              <>
                {campo("nome", t("Nome *"), { placeholder: "Mario" })}
                {campo("cognome", t("Cognome *"), { placeholder: "Rossi" })}
                {campo("codiceFiscale", "Codice fiscale", { mono: true, maiuscolo: true, placeholder: "RSSMRA80A01H501U", maxLength: 16 })}
              </>
            ) : (
              <>
                {campo("ragioneSociale", pa ? t("Denominazione dell'ente *") : t("Ragione sociale *"), {
                  placeholder: pa ? "Comune di …" : "Rossi Costruzioni S.r.l.",
                  className: "sm:col-span-2",
                })}
                {campo("partitaIva", pa ? "Partita IVA (facoltativa)" : "Partita IVA", { mono: true, placeholder: "01234567890", maxLength: 13 })}
                {campo("codiceFiscale", pa ? "Codice fiscale dell'ente *" : "Codice fiscale (se diverso)", {
                  mono: true,
                  placeholder: pa ? "80012345678" : "",
                  maxLength: 16,
                })}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-6">
            {campo("indirizzoVia", privato ? t("Indirizzo") : t("Sede"), { className: "sm:col-span-6", placeholder: "Via Roma 1" })}
            {campo("indirizzoCap", "CAP", { className: "sm:col-span-1", mono: true, maxLength: 5 })}
            {campo("indirizzoComune", t("Comune"), { className: "sm:col-span-3" })}
            {campo("indirizzoProvincia", "Prov.", { className: "sm:col-span-1", maxLength: 2 })}
            {campo("indirizzoNazione", t("Paese"), { className: "sm:col-span-1", maxLength: 2, aiuto: "IT, FR…" })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {campo("email", t("Email"), { type: "email" })}
            {campo("telefono", t("Telefono"), { type: "tel" })}
          </div>
        </>
      )}

      {!privato && (
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("pec", "PEC", { type: "email", placeholder: pa ? "protocollo@pec.comune.it" : "amministrazione@pec.it" })}
          {!pa &&
            campo("codiceDestinatario", "Codice destinatario (SDI)", {
              maiuscolo: true,
              mono: true,
              maxLength: 7,
              placeholder: "ABC1234",
              aiuto: t("7 caratteri. Senza codice si usa la PEC."),
            })}
          {campo("referenteAmministrativo", t("Referente amministrativo"), { placeholder: t("Ufficio ragioneria, sig.ra Bianchi") })}
          {campo("emailAmministrazione", "Email amministrazione (fatture)", { type: "email" })}
        </div>
      )}

      {pa && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("codiceIpa", "Codice IPA dell'ente", {
              mono: true,
              placeholder: "c_h501",
              aiuto: t("Il codice dell'ente su indicepa.gov.it. Non è il codice dell'ufficio."),
            })}
            <div className="space-y-1.5">
              <Label>{t("Split payment")}</Label>
              <RadioGroup
                value={f.split ?? "azienda"}
                onValueChange={(v) => set({ split: v as SceltaSplit })}
                className="flex flex-wrap gap-4 pt-1.5"
                disabled={disabled}
              >
                {(
                  [
                    ["si", t("Sì")],
                    ["no", t("No")],
                    ["azienda", t("Come l'impostazione dell'azienda")],
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <RadioGroupItem value={v} id={`split-${v}`} /> {l}
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">{t("Non tutte le PA sono in split payment: controlla sul contratto o sull'ordine.")}</p>
            </div>
          </div>
          {conUfficio && (
            <div className="grid gap-3 sm:grid-cols-2">
              {campo("ufficioCodice", "Codice univoco ufficio", {
                maiuscolo: true,
                mono: true,
                maxLength: 6,
                placeholder: "UFXXXX",
                aiuto: t("6 caratteri, dall'ordine o da indicepa.gov.it. Altri uffici si aggiungono dalla scheda."),
              })}
              {campo("ufficioDescrizione", t("Nome dell'ufficio"), { placeholder: t("Lavori pubblici") })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
