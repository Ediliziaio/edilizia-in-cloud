import { describe, expect, it, vi } from "vitest";
import {
  classificaErroreMapsGoogle,
  diagnosticaMapsGoogle,
  messaggioMapsGoogle,
  scaricaMappaStatica,
  testaGoogleMaps,
} from "../../../supabase/functions/_shared/mapsGoogle";

const png = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { "content-type": "image/png; charset=binary" },
  });

describe("diagnosi Google Maps senza esposizione delle credenziali", () => {
  it.each([
    [
      403,
      "You must enable Billing on the Google Cloud Project",
      "fatturazione",
    ],
    [403, "The provided API key is invalid.", "chiave_non_valida"],
    [
      403,
      "This API project is not authorized to use this API.",
      "api_non_abilitata",
    ],
    [
      403,
      "API has not been used in project before or it is disabled.",
      "api_non_abilitata",
    ],
    [
      403,
      "This IP address is not authorized to use this API key.",
      "restrizioni",
    ],
    [429, "", "quota"],
    [200, "OVER_QUERY_LIMIT", "quota"],
    [503, "provider unavailable", "non_disponibile"],
    [403, "Your request cannot be served because satellite and hybrid map types are not available for your account and region.", "satellite_static_non_disponibile"],
  ])(
    "classifica %s senza rimandare il testo del provider",
    (status, testo, codice) => {
      expect(classificaErroreMapsGoogle(Number(status), String(testo))).toBe(
        codice,
      );
    },
  );

  it("normalizza il MIME con parametri in un data URL accettato dal wizard", async () => {
    const fetcher = vi.fn().mockResolvedValue(png());
    const r = await scaricaMappaStatica(
      "https://maps.googleapis.com/maps/api/staticmap?key=riservata",
      fetcher,
    );
    expect(r.dataUrl).toBe("data:image/png;base64,iVBORw==");
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("conserva la causa del rifiuto e scarta chiave, URL e corpo della risposta", async () => {
    const key = "segreto-di-collaudo";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(`Billing disabled for https://example.invalid/?key=${key}`, {
        status: 403,
      }),
    );
    const r = await scaricaMappaStatica(
      `https://maps.googleapis.com/maps/api/staticmap?key=${key}`,
      fetcher,
    );
    expect(r).toMatchObject({ dataUrl: null, codice: "fatturazione", status: 403 });
    expect(JSON.stringify(r)).not.toContain(key);
    expect(JSON.stringify(r)).not.toContain("https://");
    expect(messaggioMapsGoogle(r.codice!)).toContain("fatturazione");
  });

  it("non trasforma una risposta HTML 200 in una mappa riuscita", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<html>blocked</html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    expect(
      (await scaricaMappaStatica(
        "https://maps.googleapis.com/maps/api/staticmap",
        fetcher,
      )).dataUrl,
    ).toBeNull();
  });

  it("interrompe una chiamata lenta entro la propria scadenza", async () => {
    const fetcher = vi.fn((_u, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("scaduto", "AbortError")),
        );
      })
    );
    expect(
      await scaricaMappaStatica(
        "https://maps.googleapis.com/maps/api/staticmap",
        fetcher,
        5,
      ),
    )
      .toEqual({ dataUrl: null, codice: "timeout", status: 0 });
  });

  it("non espone l’URL contenuto in un errore del trasporto", async () => {
    const fetcher = vi.fn().mockRejectedValue(
      Error("fetch failed https://example.invalid?key=secret"),
    );
    const r = await scaricaMappaStatica(
      "https://maps.googleapis.com/maps/api/staticmap",
      fetcher,
    );
    expect(r).toEqual({ dataUrl: null, codice: "non_disponibile", status: 0 });
  });

  it("usa la credenziale risolta e prova anche la vista satellitare", async () => {
    const key = "chiave-vault-demo", leggi = vi.fn().mockResolvedValue(key);
    const fetcher = vi.fn().mockResolvedValueOnce(
      Response.json({ status: "OK", results: [] }),
    ).mockResolvedValueOnce(png());
    const r = await testaGoogleMaps(leggi, fetcher);
    expect(leggi).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map((u) => u.pathname)).toEqual([
      "/maps/api/geocode/json",
      "/maps/api/staticmap",
    ]);
    expect(urls.every((u) => u.searchParams.get("key") === key)).toBe(true);
    expect(r).toMatchObject({
      ok: true,
      message: "Google Maps: geocoding e vista satellitare funzionanti.",
    });
    expect(JSON.stringify(r)).not.toContain(key);
    expect(JSON.stringify(r)).not.toContain("https://");
  });

  it("rimuove dai dettagli server chiave, URL e riferimenti di posizione", () => {
    const key = "chiave-demo-da-non-registrare";
    const r = diagnosticaMapsGoogle(
      `<html>Errore ${key} da 12.34.56.78, 2001:db8::1 e 45.46378. Vedi https://example.invalid/?key=${key}</html>`,
      `https://maps.googleapis.com/maps/api/staticmap?key=${key}`,
    );
    expect(r).not.toContain(key);
    expect(r).not.toContain("https://");
    expect(r).not.toContain("12.34.56.78");
    expect(r).not.toContain("2001:db8::1");
    expect(r).not.toContain("45.46378");
    expect(r).not.toContain("<html>");
  });

  it("segnala fatturazione anche quando il geocoding riesce", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      Response.json({ status: "OK" }),
    )
      .mockResolvedValueOnce(
        new Response("Billing account disabled", { status: 403 }),
      );
    const r = await testaGoogleMaps(async () => "chiave-demo", fetcher);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("fatturazione");
  });

  it("non invoca Google quando manca la credenziale", async () => {
    const fetcher = vi.fn();
    expect((await testaGoogleMaps(async () => "", fetcher)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("i rifiuti del geocoding non fanno passare il test né espongono la risposta", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        status: "REQUEST_DENIED",
        error_message: "API key is invalid. key=riservata",
      }),
    );
    const r = await testaGoogleMaps(async () => "riservata", fetcher);
    expect(r).toEqual({
      ok: false,
      message: messaggioMapsGoogle("chiave_non_valida"),
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(r.message).not.toContain("riservata");
  });
});
