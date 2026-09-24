// Fatture dei fornitori da openapi: dal file ricevuto all'XML, e la scelta del
// file giusto tra gli allegati. Le buste firmate qui sotto sono vere: fatte con
// openssl (chiave EC usa e getta) sulla fattura FATTURA, una in DER e una in
// BER «a flusso» (-stream), le due forme in cui i .p7m arrivano dallo SDI.
import { describe, it, expect } from "vitest";
import {
  allegatoFattura,
  contenutoP7m,
  fatturaRicevutaPer,
  gettoneCallback,
  giroCompletoDovuto,
  idDaCallback,
  identificativoSdi,
  nomeFileSdi,
  percorsoOriginale,
  ricevutaIl,
  sembraFatturaPA,
  stessoGettone,
  vociElenco,
  xmlDaFile,
} from "../../../supabase/functions/_shared/ricevuteOpenapi";

const FATTURA = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"><FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdTrasmittente><ProgressivoInvio>A1</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>PIC7CPS</CodiceDestinatario></DatiTrasmissione><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Ferramenta Società Srl</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>33170</CAP><Comune>Pordenone</Comune><Provincia>PN</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore><CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01941970939</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>RENOVA SOLUTION S.R.L.</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Revedole 78/B</Indirizzo><CAP>33170</CAP><Comune>Pordenone</Comune><Provincia>PN</Provincia><Nazione>IT</Nazione></Sede></CessionarioCommittente></FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>2026-09-20</Data><Numero>77/A</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Viti inox</Descrizione><Quantita>10.00</Quantita><PrezzoUnitario>10.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>
`;

/** openssl smime -sign -binary -nodetach -outform DER -noattr */
const P7M_DER =
  "MIIJhgYJKoZIhvcNAQcCoIIJdzCCCXMCAQExCzAJBgUrDgMCGgUAMIIHzQYJKoZIhvcNAQcBoIIHvgSCB7o8P3htbCB2ZXJzaW9u" +
  "PSIxLjAiIGVuY29kaW5nPSJVVEYtOCI/Pgo8cDpGYXR0dXJhRWxldHRyb25pY2EgdmVyc2lvbmU9IkZQUjEyIiB4bWxuczpwPSJo" +
  "dHRwOi8vaXZhc2Vydml6aS5hZ2VuemlhZW50cmF0ZS5nb3YuaXQvZG9jcy94c2QvZmF0dHVyZS92MS4yIj48RmF0dHVyYUVsZXR0" +
  "cm9uaWNhSGVhZGVyPjxEYXRpVHJhc21pc3Npb25lPjxJZFRyYXNtaXR0ZW50ZT48SWRQYWVzZT5JVDwvSWRQYWVzZT48SWRDb2Rp" +
  "Y2U+MDEyMzQ1Njc4OTA8L0lkQ29kaWNlPjwvSWRUcmFzbWl0dGVudGU+PFByb2dyZXNzaXZvSW52aW8+QTE8L1Byb2dyZXNzaXZv" +
  "SW52aW8+PEZvcm1hdG9UcmFzbWlzc2lvbmU+RlBSMTI8L0Zvcm1hdG9UcmFzbWlzc2lvbmU+PENvZGljZURlc3RpbmF0YXJpbz5Q" +
  "SUM3Q1BTPC9Db2RpY2VEZXN0aW5hdGFyaW8+PC9EYXRpVHJhc21pc3Npb25lPjxDZWRlbnRlUHJlc3RhdG9yZT48RGF0aUFuYWdy" +
  "YWZpY2k+PElkRmlzY2FsZUlWQT48SWRQYWVzZT5JVDwvSWRQYWVzZT48SWRDb2RpY2U+MDEyMzQ1Njc4OTA8L0lkQ29kaWNlPjwv" +
  "SWRGaXNjYWxlSVZBPjxBbmFncmFmaWNhPjxEZW5vbWluYXppb25lPkZlcnJhbWVudGEgU29jaWV0w6AgU3JsPC9EZW5vbWluYXpp" +
  "b25lPjwvQW5hZ3JhZmljYT48UmVnaW1lRmlzY2FsZT5SRjAxPC9SZWdpbWVGaXNjYWxlPjwvRGF0aUFuYWdyYWZpY2k+PFNlZGU+" +
  "PEluZGlyaXp6bz5WaWEgUm9tYSAxPC9JbmRpcml6em8+PENBUD4zMzE3MDwvQ0FQPjxDb211bmU+UG9yZGVub25lPC9Db211bmU+" +
  "PFByb3ZpbmNpYT5QTjwvUHJvdmluY2lhPjxOYXppb25lPklUPC9OYXppb25lPjwvU2VkZT48L0NlZGVudGVQcmVzdGF0b3JlPjxD" +
  "ZXNzaW9uYXJpb0NvbW1pdHRlbnRlPjxEYXRpQW5hZ3JhZmljaT48SWRGaXNjYWxlSVZBPjxJZFBhZXNlPklUPC9JZFBhZXNlPjxJ" +
  "ZENvZGljZT4wMTk0MTk3MDkzOTwvSWRDb2RpY2U+PC9JZEZpc2NhbGVJVkE+PEFuYWdyYWZpY2E+PERlbm9taW5hemlvbmU+UkVO" +
  "T1ZBIFNPTFVUSU9OIFMuUi5MLjwvRGVub21pbmF6aW9uZT48L0FuYWdyYWZpY2E+PC9EYXRpQW5hZ3JhZmljaT48U2VkZT48SW5k" +
  "aXJpenpvPlZpYSBSZXZlZG9sZSA3OC9CPC9JbmRpcml6em8+PENBUD4zMzE3MDwvQ0FQPjxDb211bmU+UG9yZGVub25lPC9Db211" +
  "bmU+PFByb3ZpbmNpYT5QTjwvUHJvdmluY2lhPjxOYXppb25lPklUPC9OYXppb25lPjwvU2VkZT48L0Nlc3Npb25hcmlvQ29tbWl0" +
  "dGVudGU+PC9GYXR0dXJhRWxldHRyb25pY2FIZWFkZXI+PEZhdHR1cmFFbGV0dHJvbmljYUJvZHk+PERhdGlHZW5lcmFsaT48RGF0" +
  "aUdlbmVyYWxpRG9jdW1lbnRvPjxUaXBvRG9jdW1lbnRvPlREMDE8L1RpcG9Eb2N1bWVudG8+PERpdmlzYT5FVVI8L0RpdmlzYT48" +
  "RGF0YT4yMDI2LTA5LTIwPC9EYXRhPjxOdW1lcm8+NzcvQTwvTnVtZXJvPjxJbXBvcnRvVG90YWxlRG9jdW1lbnRvPjEyMi4wMDwv" +
  "SW1wb3J0b1RvdGFsZURvY3VtZW50bz48L0RhdGlHZW5lcmFsaURvY3VtZW50bz48L0RhdGlHZW5lcmFsaT48RGF0aUJlbmlTZXJ2" +
  "aXppPjxEZXR0YWdsaW9MaW5lZT48TnVtZXJvTGluZWE+MTwvTnVtZXJvTGluZWE+PERlc2NyaXppb25lPlZpdGkgaW5veDwvRGVz" +
  "Y3JpemlvbmU+PFF1YW50aXRhPjEwLjAwPC9RdWFudGl0YT48UHJlenpvVW5pdGFyaW8+MTAuMDA8L1ByZXp6b1VuaXRhcmlvPjxQ" +
  "cmV6em9Ub3RhbGU+MTAwLjAwPC9QcmV6em9Ub3RhbGU+PEFsaXF1b3RhSVZBPjIyLjAwPC9BbGlxdW90YUlWQT48L0RldHRhZ2xp" +
  "b0xpbmVlPjxEYXRpUmllcGlsb2dvPjxBbGlxdW90YUlWQT4yMi4wMDwvQWxpcXVvdGFJVkE+PEltcG9uaWJpbGVJbXBvcnRvPjEw" +
  "MC4wMDwvSW1wb25pYmlsZUltcG9ydG8+PEltcG9zdGE+MjIuMDA8L0ltcG9zdGE+PEVzaWdpYmlsaXRhSVZBPkk8L0VzaWdpYmls" +
  "aXRhSVZBPjwvRGF0aVJpZXBpbG9nbz48L0RhdGlCZW5pU2Vydml6aT48L0ZhdHR1cmFFbGV0dHJvbmljYUJvZHk+PC9wOkZhdHR1" +
  "cmFFbGV0dHJvbmljYT4KoIIBCzCCAQcwga4CCQCs1/cIrDqmJzAKBggqhkjOPQQDAjAMMQowCAYDVQQDDAFGMB4XDTI2MDkyNDEz" +
  "MjYxM1oXDTI2MDkyNTEzMjYxM1owDDEKMAgGA1UEAwwBRjBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABOZNobEmNNiZk0NR/3qW" +
  "9nAPgWAXcKwPLNOKp3pnYNsv8462iZ3OKuYzIg4PHSuyKqf9DoWJPtlWEzEXgzZlAmowCgYIKoZIzj0EAwIDSAAwRQIgGJWiOOhn" +
  "gq1itdqg0n9HGsb0ft6cTQnOBO8NJ0wMO+oCIQDBBPhWwqRVwbCpNMj5lSQvk1kmDxHv85B6iFldgucp3DGBgDB+AgEBMBkwDDEK" +
  "MAgGA1UEAwwBRgIJAKzX9wisOqYnMAkGBSsOAwIaBQAwCQYHKoZIzj0EAQRIMEYCIQDAkUjOu4Ou1kv427B7T26hwhRNbWyvr79M" +
  "j4OK982UIgIhALCFu4gPdU5UeXmTuim1Jp4f0n9dchLvuDwtUf8H/fC1";

/** Come sopra, con -stream: lunghezze indefinite (BER). */
const P7M_BER =
  "MIAGCSqGSIb3DQEHAqCAMIACAQExCzAJBgUrDgMCGgUAMIAGCSqGSIb3DQEHAaCAJIAEgge6PD94bWwgdmVyc2lvbj0iMS4wIiBl" +
  "bmNvZGluZz0iVVRGLTgiPz4KPHA6RmF0dHVyYUVsZXR0cm9uaWNhIHZlcnNpb25lPSJGUFIxMiIgeG1sbnM6cD0iaHR0cDovL2l2" +
  "YXNlcnZpemkuYWdlbnppYWVudHJhdGUuZ292Lml0L2RvY3MveHNkL2ZhdHR1cmUvdjEuMiI+PEZhdHR1cmFFbGV0dHJvbmljYUhl" +
  "YWRlcj48RGF0aVRyYXNtaXNzaW9uZT48SWRUcmFzbWl0dGVudGU+PElkUGFlc2U+SVQ8L0lkUGFlc2U+PElkQ29kaWNlPjAxMjM0" +
  "NTY3ODkwPC9JZENvZGljZT48L0lkVHJhc21pdHRlbnRlPjxQcm9ncmVzc2l2b0ludmlvPkExPC9Qcm9ncmVzc2l2b0ludmlvPjxG" +
  "b3JtYXRvVHJhc21pc3Npb25lPkZQUjEyPC9Gb3JtYXRvVHJhc21pc3Npb25lPjxDb2RpY2VEZXN0aW5hdGFyaW8+UElDN0NQUzwv" +
  "Q29kaWNlRGVzdGluYXRhcmlvPjwvRGF0aVRyYXNtaXNzaW9uZT48Q2VkZW50ZVByZXN0YXRvcmU+PERhdGlBbmFncmFmaWNpPjxJ" +
  "ZEZpc2NhbGVJVkE+PElkUGFlc2U+SVQ8L0lkUGFlc2U+PElkQ29kaWNlPjAxMjM0NTY3ODkwPC9JZENvZGljZT48L0lkRmlzY2Fs" +
  "ZUlWQT48QW5hZ3JhZmljYT48RGVub21pbmF6aW9uZT5GZXJyYW1lbnRhIFNvY2lldMOgIFNybDwvRGVub21pbmF6aW9uZT48L0Fu" +
  "YWdyYWZpY2E+PFJlZ2ltZUZpc2NhbGU+UkYwMTwvUmVnaW1lRmlzY2FsZT48L0RhdGlBbmFncmFmaWNpPjxTZWRlPjxJbmRpcml6" +
  "em8+VmlhIFJvbWEgMTwvSW5kaXJpenpvPjxDQVA+MzMxNzA8L0NBUD48Q29tdW5lPlBvcmRlbm9uZTwvQ29tdW5lPjxQcm92aW5j" +
  "aWE+UE48L1Byb3ZpbmNpYT48TmF6aW9uZT5JVDwvTmF6aW9uZT48L1NlZGU+PC9DZWRlbnRlUHJlc3RhdG9yZT48Q2Vzc2lvbmFy" +
  "aW9Db21taXR0ZW50ZT48RGF0aUFuYWdyYWZpY2k+PElkRmlzY2FsZUlWQT48SWRQYWVzZT5JVDwvSWRQYWVzZT48SWRDb2RpY2U+" +
  "MDE5NDE5NzA5Mzk8L0lkQ29kaWNlPjwvSWRGaXNjYWxlSVZBPjxBbmFncmFmaWNhPjxEZW5vbWluYXppb25lPlJFTk9WQSBTT0xV" +
  "VElPTiBTLlIuTC48L0Rlbm9taW5hemlvbmU+PC9BbmFncmFmaWNhPjwvRGF0aUFuYWdyYWZpY2k+PFNlZGU+PEluZGlyaXp6bz5W" +
  "aWEgUmV2ZWRvbGUgNzgvQjwvSW5kaXJpenpvPjxDQVA+MzMxNzA8L0NBUD48Q29tdW5lPlBvcmRlbm9uZTwvQ29tdW5lPjxQcm92" +
  "aW5jaWE+UE48L1Byb3ZpbmNpYT48TmF6aW9uZT5JVDwvTmF6aW9uZT48L1NlZGU+PC9DZXNzaW9uYXJpb0NvbW1pdHRlbnRlPjwv" +
  "RmF0dHVyYUVsZXR0cm9uaWNhSGVhZGVyPjxGYXR0dXJhRWxldHRyb25pY2FCb2R5PjxEYXRpR2VuZXJhbGk+PERhdGlHZW5lcmFs" +
  "aURvY3VtZW50bz48VGlwb0RvY3VtZW50bz5URDAxPC9UaXBvRG9jdW1lbnRvPjxEaXZpc2E+RVVSPC9EaXZpc2E+PERhdGE+MjAy" +
  "Ni0wOS0yMDwvRGF0YT48TnVtZXJvPjc3L0E8L051bWVybz48SW1wb3J0b1RvdGFsZURvY3VtZW50bz4xMjIuMDA8L0ltcG9ydG9U" +
  "b3RhbGVEb2N1bWVudG8+PC9EYXRpR2VuZXJhbGlEb2N1bWVudG8+PC9EYXRpR2VuZXJhbGk+PERhdGlCZW5pU2Vydml6aT48RGV0" +
  "dGFnbGlvTGluZWU+PE51bWVyb0xpbmVhPjE8L051bWVyb0xpbmVhPjxEZXNjcml6aW9uZT5WaXRpIGlub3g8L0Rlc2NyaXppb25l" +
  "PjxRdWFudGl0YT4xMC4wMDwvUXVhbnRpdGE+PFByZXp6b1VuaXRhcmlvPjEwLjAwPC9QcmV6em9Vbml0YXJpbz48UHJlenpvVG90" +
  "YWxlPjEwMC4wMDwvUHJlenpvVG90YWxlPjxBbGlxdW90YUlWQT4yMi4wMDwvQWxpcXVvdGFJVkE+PC9EZXR0YWdsaW9MaW5lZT48" +
  "RGF0aVJpZXBpbG9nbz48QWxpcXVvdGFJVkE+MjIuMDA8L0FsaXF1b3RhSVZBPjxJbXBvbmliaWxlSW1wb3J0bz4xMDAuMDA8L0lt" +
  "cG9uaWJpbGVJbXBvcnRvPjxJbXBvc3RhPjIyLjAwPC9JbXBvc3RhPjxFc2lnaWJpbGl0YUlWQT5JPC9Fc2lnaWJpbGl0YUlWQT48" +
  "L0RhdGlSaWVwaWxvZ28+PC9EYXRpQmVuaVNlcnZpemk+PC9GYXR0dXJhRWxldHRyb25pY2FCb2R5PjwvcDpGYXR0dXJhRWxldHRy" +
  "b25pY2E+CgAAAAAAAKCCAQswggEHMIGuAgkArNf3CKw6picwCgYIKoZIzj0EAwIwDDEKMAgGA1UEAwwBRjAeFw0yNjA5MjQxMzI2" +
  "MTNaFw0yNjA5MjUxMzI2MTNaMAwxCjAIBgNVBAMMAUYwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATmTaGxJjTYmZNDUf96lvZw" +
  "D4FgF3CsDyzTiqd6Z2DbL/OOtomdzirmMyIODx0rsiqn/Q6FiT7ZVhMxF4M2ZQJqMAoGCCqGSM49BAMCA0gAMEUCIBiVojjoZ4Kt" +
  "YrXaoNJ/RxrG9H7enE0JzgTvDSdMDDvqAiEAwQT4VsKkVcGwqTTI+ZUkL5NZJg8R7/OQeohZXYLnKdwxfzB9AgEBMBkwDDEKMAgG" +
  "A1UEAwwBRgIJAKzX9wisOqYnMAkGBSsOAwIaBQAwCQYHKoZIzj0EAQRHMEUCIHUPZfcQrXVW7Ew3p4CrYz+80qnjjpicplGT+vTM" +
  "mZFfAiEA0emJqXrNOOjAVajmmnXz/9aMzrwVY3XpZ0IVQGKymR4AAAAAAAA=";

const byte = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const utf8 = (s: string) => new TextEncoder().encode(s);
const unisci = (...parti: Uint8Array[]) => {
  const out = new Uint8Array(parti.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parti) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Un elemento DER a lunghezza definita. */
function der(tag: number, contenuto: Uint8Array): Uint8Array {
  const n = contenuto.length;
  const lunghezza = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff];
  return unisci(new Uint8Array([tag, ...lunghezza]), contenuto);
}
/** Un elemento BER a lunghezza indefinita: figli, poi 00 00. */
const ber = (tag: number, ...figli: Uint8Array[]) => unisci(new Uint8Array([tag, 0x80]), ...figli, new Uint8Array([0, 0]));

const OID_SIGNED = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]);
const OID_DATA = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]);

/** Busta costruita a mano col contenuto spezzato nei pezzi indicati. */
function bustaAPezzi(contenuto: Uint8Array, dimensioni: number[], oid = OID_SIGNED): Uint8Array {
  const pezzi: Uint8Array[] = [];
  let at = 0;
  for (const d of dimensioni) {
    pezzi.push(der(0x04, contenuto.subarray(at, at + d)));
    at += d;
  }
  pezzi.push(der(0x04, contenuto.subarray(at)));
  return ber(0x30, oid, ber(0xa0, ber(0x30,
    der(0x02, new Uint8Array([1])),
    der(0x31, new Uint8Array()),
    ber(0x30, OID_DATA, ber(0xa0, ber(0x24, ...pezzi))),
    der(0x31, new Uint8Array()),
  )));
}

describe("xmlDaFile: dal file ricevuto all'XML della fattura", () => {
  it("apre la busta .p7m in DER e restituisce la fattura intatta", () => {
    expect(xmlDaFile(byte(P7M_DER))).toBe(FATTURA);
  });

  it("apre la busta .p7m in BER a flusso (lunghezze indefinite)", () => {
    expect(xmlDaFile(byte(P7M_BER))).toBe(FATTURA);
  });

  it("ricuce il contenuto spezzato in più pezzi, anche annidati", () => {
    const xml = utf8(FATTURA);
    expect(xmlDaFile(bustaAPezzi(xml, [700, 700]))).toBe(FATTURA);
    // Un pezzo che è a sua volta spezzato: la forma più contorta ammessa.
    const annidata = ber(0x30, OID_SIGNED, ber(0xa0, ber(0x30,
      der(0x02, new Uint8Array([1])),
      der(0x31, new Uint8Array()),
      ber(0x30, OID_DATA, ber(0xa0, ber(0x24,
        der(0x04, xml.subarray(0, 100)),
        ber(0x24, der(0x04, xml.subarray(100, 900)), der(0x04, xml.subarray(900, 1500))),
        der(0x04, xml.subarray(1500)),
      ))),
    )));
    expect(xmlDaFile(annidata)).toBe(FATTURA);
  });

  it("contenutoP7m restituisce esattamente i byte firmati", () => {
    expect(new TextDecoder().decode(contenutoP7m(byte(P7M_DER))!)).toBe(FATTURA);
    expect(contenutoP7m(utf8(FATTURA))).toBeNull();
  });

  it("legge la busta anche scritta in base64, con o senza a capo", () => {
    expect(xmlDaFile(utf8(P7M_DER))).toBe(FATTURA);
    const aCapo = P7M_BER.replace(/(.{76})/g, "$1\r\n");
    expect(xmlDaFile(utf8(aCapo))).toBe(FATTURA);
    expect(xmlDaFile(utf8(btoa(String.fromCharCode(...utf8(FATTURA)))))).toBe(FATTURA);
  });

  it("l'XML in chiaro passa così com'è, senza il BOM", () => {
    const conBom = unisci(new Uint8Array([0xef, 0xbb, 0xbf]), utf8(FATTURA));
    expect(xmlDaFile(conBom)).toBe(FATTURA);
    expect(xmlDaFile(utf8("\n  " + FATTURA))).toBe("\n  " + FATTURA);
  });

  it("rispetta la codifica dichiarata: ISO-8859-1 non perde le accentate", () => {
    const latino = FATTURA.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"');
    const byteLatini = Uint8Array.from(latino, (c) => c.charCodeAt(0));
    expect(byteLatini.includes(0xe0)).toBe(true); // la «à» di Società, un byte solo
    expect(xmlDaFile(byteLatini)).toContain("Ferramenta Società Srl");
  });

  it("dichiarato UTF-8 ma scritto in Latin-1: si riprova, niente punti interrogativi", () => {
    const byteLatini = Uint8Array.from(FATTURA, (c) => c.charCodeAt(0));
    const letto = xmlDaFile(byteLatini)!;
    expect(letto).toContain("Ferramenta Società Srl");
    expect(letto).not.toContain("\uFFFD");
  });

  it("un XML che non è una fattura (una notifica dello SDI) non passa", () => {
    const notifica = '<?xml version="1.0"?><ns3:RicevutaConsegna xmlns:ns3="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/messaggi/v1.0"><IdentificativoSdI>1</IdentificativoSdI></ns3:RicevutaConsegna>';
    expect(xmlDaFile(utf8(notifica))).toBeNull();
    expect(sembraFatturaPA(FATTURA)).toBe(true);
    expect(sembraFatturaPA(notifica)).toBe(false);
  });

  it("file troncati, vuoti o costruiti per far male: null, mai un'eccezione", () => {
    const intero = byte(P7M_DER);
    expect(xmlDaFile(intero.subarray(0, 1000))).toBeNull();
    expect(xmlDaFile(new Uint8Array())).toBeNull();
    expect(xmlDaFile(new Uint8Array([0x30]))).toBeNull();
    expect(xmlDaFile(utf8("%PDF-1.7 non una fattura"))).toBeNull();
    // Mille livelli di lunghezze indefinite: si ferma, niente stack esaurito.
    const pozzo = new Uint8Array(2000);
    for (let i = 0; i < 2000; i += 2) {
      pozzo[i] = 0x30;
      pozzo[i + 1] = 0x80;
    }
    expect(() => xmlDaFile(pozzo)).not.toThrow();
    expect(xmlDaFile(pozzo)).toBeNull();
  });

  it("busta illeggibile con la fattura tutta di seguito: la trova come testo", () => {
    const strana = unisci(new Uint8Array([0x99, 0x01, 0x02]), utf8(FATTURA), new Uint8Array([0x00, 0xff]));
    // Dal prologo alla chiusura della radice: l'a capo finale resta fuori.
    expect(xmlDaFile(strana)).toBe(FATTURA.trimEnd());
  });

  it("busta illeggibile con la fattura spezzata: null, non una fattura guasta", () => {
    // Tipo sbagliato: la busta non si apre, e tra i pezzi ci sono byte di intestazione.
    const oidSbagliato = new Uint8Array([0x06, 0x03, 0x2a, 0x03, 0x04]);
    const rotta = bustaAPezzi(utf8(FATTURA), [700, 700], oidSbagliato);
    expect(xmlDaFile(rotta)).toBeNull();
  });
});

describe("gli allegati di una fattura openapi", () => {
  const fattura = (allegati: unknown[], sdi_filename?: string) => ({
    data: { id: "abc", details: { sdi_filename, sdi_id: 123456789 }, attachments: allegati },
  });
  const pdf = { fileName: "IT01234567890_A1.pdf", mimeType: "application/pdf", downloadUrl: "https://files.example/pdf" };
  const metadati = { fileName: "IT01234567890_A1_MT_001.xml", mimeType: "application/xml", downloadUrl: "https://files.example/mt" };
  const firmata = { fileName: "IT01234567890_A1.xml.p7m", mimeType: "application/pkcs7-mime", downloadUrl: "https://files.example/p7m" };

  it("prende il file che lo SDI ha consegnato, non il PDF né i metadati", () => {
    expect(allegatoFattura(fattura([pdf, metadati, firmata], "IT01234567890_A1.xml.p7m"))?.url).toBe("https://files.example/p7m");
    expect(allegatoFattura(fattura([pdf, metadati, firmata]))?.url).toBe("https://files.example/p7m");
  });

  it("senza un nome riconoscibile si guarda il tipo; senza fattura, null", () => {
    const anonimo = { fileName: "documento", mimeType: "text/xml", downloadUrl: "https://files.example/x" };
    expect(allegatoFattura(fattura([pdf, anonimo]))?.url).toBe("https://files.example/x");
    expect(allegatoFattura(fattura([pdf, metadati]))).toBeNull();
    expect(allegatoFattura({ data: { id: "abc" } })).toBeNull();
  });

  it("un indirizzo non https non si scarica", () => {
    expect(allegatoFattura(fattura([{ ...firmata, downloadUrl: "http://files.example/p7m" }]))).toBeNull();
    expect(allegatoFattura(fattura([{ ...firmata, downloadUrl: "file:///etc/passwd" }]))).toBeNull();
  });

  it("nome del file SDI e identificativo, solo se puliti", () => {
    expect(nomeFileSdi(fattura([], "IT01234567890_A1.xml.p7m"))).toBe("IT01234567890_A1.xml.p7m");
    expect(nomeFileSdi(fattura([], "../../altra-azienda/x.xml"))).toBeNull();
    expect(identificativoSdi(fattura([]))).toBe("123456789");
  });
});

describe("elenco e callback di openapi", () => {
  it("dall'elenco solo le ricevute con un id", () => {
    const risposta = {
      success: true,
      data: [
        { id: "r1", direction: "incoming", create_at: "2026-09-20T10:00:00Z" },
        { id: "e1", direction: "outgoing" },
        { direction: "incoming" },
        { uuid: "r2" },
        null,
      ],
    };
    expect(vociElenco(risposta)).toEqual([
      { id: "r1", creata: "2026-09-20T10:00:00Z" },
      { id: "r2", creata: null },
    ]);
    expect(vociElenco({ success: false, data: null })).toEqual([]);
  });

  it("una fattura emessa o di un'altra partita IVA non è una ricevuta nostra", () => {
    expect(fatturaRicevutaPer({ data: { direction: "incoming", fiscal_id: "01941970939" } }, "01941970939")).toBe(true);
    expect(fatturaRicevutaPer({ data: { direction: "outgoing", fiscal_id: "01941970939" } }, "01941970939")).toBe(false);
    expect(fatturaRicevutaPer({ data: { direction: "incoming", fiscal_id: "99999999999" } }, "01941970939")).toBe(false);
  });

  it("dal corpo della callback si prende solo l'id, in qualunque forma arrivi", () => {
    expect(idDaCallback({ id: "65f0c0ffee12" })).toBe("65f0c0ffee12");
    expect(idDaCallback({ data: { id: "65f0c0ffee12", state: "RECEIVED" } })).toBe("65f0c0ffee12");
    expect(idDaCallback({ data: JSON.stringify({ id: "65f0c0ffee12" }) })).toBe("65f0c0ffee12");
    expect(idDaCallback(JSON.stringify({ invoice: { id: "65f0c0ffee12" } }))).toBe("65f0c0ffee12");
    expect(idDaCallback({ id: "notifica-1", invoice_id: "65f0c0ffee12" })).toBe("65f0c0ffee12");
    expect(idDaCallback({ id: "../../IT-configurations" })).toBeNull();
    expect(idDaCallback("non json")).toBeNull();
    expect(idDaCallback(null)).toBeNull();
  });

  it("il gettone delle callback: stabile, legato alla chiave, confronto esatto", async () => {
    const a = await gettoneCallback("chiave-uno");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await gettoneCallback("chiave-uno")).toBe(a);
    expect(await gettoneCallback("chiave-due")).not.toBe(a);
    expect(stessoGettone(a, a)).toBe(true);
    expect(stessoGettone(a, a.slice(0, 63) + "0") && a.endsWith("0")).toBe(false);
    expect(stessoGettone("", "")).toBe(false);
  });
});

describe("il giro", () => {
  const adesso = new Date("2026-09-24T12:00:00Z");

  it("l'elenco intero si ripassa una volta al giorno, la prima pagina sempre", () => {
    expect(giroCompletoDovuto(null, adesso)).toBe(true);
    expect(giroCompletoDovuto("2026-09-24T11:00:00Z", adesso)).toBe(false);
    expect(giroCompletoDovuto("2026-09-23T15:00:00Z", adesso)).toBe(true);
    expect(giroCompletoDovuto("ieri", adesso)).toBe(true);
  });

  it("il file originale ha un percorso suo: due fatture «1» dello stesso fornitore non si sovrascrivono", () => {
    const c = "f2a16dd8-36c3-4d92-8d78-267d6374dcb5";
    expect(percorsoOriginale(c, "IT01234567890_A1.xml.p7m", "01234567890", "1", "2026-01-10", true))
      .toBe(`${c}/ricevute/IT01234567890_A1.xml.p7m`);
    const a = percorsoOriginale(c, null, "01234567890", "1", "2025-01-10", false);
    const b = percorsoOriginale(c, null, "01234567890", "1", "2026-01-10", false);
    expect(a).not.toBe(b);
    expect(percorsoOriginale(c, null, "01234567890", "77/A", "2026-09-20", true))
      .toBe(`${c}/ricevute/IT01234567890_77_A_2026-09-20.xml.p7m`);
  });
});

describe("data di ricezione dallo SDI", () => {
  it("dalla create_at della fattura openapi, in ISO; niente se manca o è storta", () => {
    expect(ricevutaIl({ data: { create_at: "2026-09-24T10:15:00Z" } })).toBe("2026-09-24T10:15:00.000Z");
    expect(ricevutaIl({ data: { create_at: 1790246100 } })).toBe(new Date(1790246100 * 1000).toISOString());
    expect(ricevutaIl({ data: {} })).toBeNull();
    expect(ricevutaIl({ data: { create_at: "ieri" } })).toBeNull();
  });
});

