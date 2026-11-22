import {
  buildFishSipPlan,
  fishPhone,
} from "../../supabase/functions/_shared/fishAudio";

export const FISH_SIP_ORIGINATION =
  "sip:1pv316az391.sip.livekit.cloud;transport=tcp";
export const SIP_GUIDE = "https://docs.fish.audio/agents/telephony/byo-sip";
export const SIP_TRANSPORTS = ["auto", "tcp", "tls", "udp"] as const;
export type SipTransport = (typeof SIP_TRANSPORTS)[number];

export interface SipPilotInput {
  number: string;
  testCaller: string;
  officeGroup: string;
  officeSeconds: number;
  terminationHost: string;
  terminationTransport: SipTransport;
}

export function buildSipPilot(input: SipPilotInput) {
  const number = fishPhone(input.number);
  const testCaller = input.testCaller.trim()
    ? fishPhone(input.testCaller)
    : null;
  if (number === testCaller)
    throw new Error(
      "Usa un telefono di prova diverso dal numero dell’ufficio.",
    );
  if (
    !Number.isInteger(input.officeSeconds) ||
    input.officeSeconds < 5 ||
    input.officeSeconds > 30
  ) {
    throw new Error("Scegli un tempo di squillo tra 5 e 30 secondi.");
  }
  const officeGroup = input.officeGroup.trim();
  if (!officeGroup || officeGroup.length > 80 || /[\r\n]/.test(officeGroup))
    throw new Error("Indica il gruppo o interno dell’ufficio.");
  const host = input.terminationHost.trim();
  if (host) {
    const [domain, port] = host.split(":");
    const labels = domain.split(".");
    if (
      host.split(":").length > 2 ||
      labels.length < 2 ||
      domain.length > 253 ||
      labels.some(
        (label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label),
      ) ||
      (port !== undefined &&
        (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535))
    ) {
      throw new Error(
        "Inserisci un host SIP pubblico, eventualmente seguito dalla porta. Esempio sip.operatore.it:5061.",
      );
    }
  }
  if (!SIP_TRANSPORTS.includes(input.terminationTransport))
    throw new Error("Trasporto SIP non valido.");

  const fish = buildFishSipPlan(number, undefined, host || undefined);
  const body = {
    ...fish.body,
    ...(host ? { termination_transport: input.terminationTransport } : {}),
  };
  const plan = {
    mode: "draft" as const,
    carrier: {
      inbound: {
        number,
        testCaller,
        officeGroup,
        officeSeconds: input.officeSeconds,
        when: "no_answer",
        fishDestination: FISH_SIP_ORIGINATION,
        preserveOriginalCaller: true,
        preserveDialedNumber: true,
      },
      outbound: {
        callerId: number,
        allowedPilotDestination: testCaller,
        afterConsentAndHangup: true,
      },
    },
    fish: {
      request: { method: fish.method, url: fish.url, body },
      readyToSubmit: fish.readyToSubmit,
      requiredBeforeSubmit: fish.requiredBeforeSubmit,
    },
  };
  const requestToCarrier = [
    `Vorrei verificare un collaudo SIP sul nostro numero ${number}, mantenendo il contratto e il centralino attuali. Al momento chiedo solo compatibilità e dati tecnici.`,
    `1. Possiamo far squillare il gruppo ${officeGroup} per ${input.officeSeconds} secondi e mandare la chiamata a Fish via SIP solo se nessuno risponde, prima della segreteria? La regola si configura sul vostro portale oppure sul centralino aziendale? Destinazione Fish ${FISH_SIP_ORIGINATION}.`,
    "2. Nell’inoltro SIP potete conservare sia il numero del chiamante originale sia il numero aziendale chiamato, in formato internazionale? Quali campi SIP usate per ciascuno?",
    `3. Possiamo effettuare il richiamo attraverso il vostro trunk mostrando esattamente ${number}? Indicate la procedura di autorizzazione del numero come CLI e quale intestazione SIP vi aspettate.`,
    "4. Quali sono host e porta del trunk in uscita, trasporto, codec e autenticazione? Per la tratta verso Fish potete usare autenticazione Digest o indicare gli IP sorgente autorizzabili? Indicate il canale sicuro per ricevere eventuali credenziali.",
    testCaller
      ? `5. Possiamo limitare il pilota alle chiamate in entrata dal telefono ${testCaller} e ai richiami verso quel solo telefono?`
      : "5. Possiamo limitare il pilota a un solo telefono concordato, sia per l’entrata sia per il richiamo?",
    "6. Quali sono costi, limiti di canali contemporanei e procedura per tornare alla regola di risposta attuale?",
  ].join("\n\n");
  return { plan, requestToCarrier };
}
