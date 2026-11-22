import { afterEach, describe, expect, it, vi } from "vitest";
import { appuntamentiMappa } from "@/components/calendar/mappa/dati";
import type { AppuntamentoMappa } from "@/components/calendar/mappa/dati";
import {
  cercaVicini, coordinate, kmDocumentati, metriInLinea, normalizzaIndirizzo, ordineTappe,
  partiNelFuso, riepilogoPercorso, type Candidato, type Tappa,
} from "../../../shared/mappa-operativa/calcoli";
import { cercaIndirizzo, matriceOsrm, percorsoOsrm } from "../../../supabase/functions/mappa-operativa/provider";

const milano = { lat: 45.4642, lng: 9.1900 };
const altro = { lat: 45.4842, lng: 9.2200 };
const giorno = "2026-11-22";
const dati: Omit<AppuntamentoMappa, "id"> = {
  title: "Sopralluogo", appointment_date: giorno, appointment_time: "09:00", calendar_id: "calendario",
  appointment_type: "sopralluogo", assigned_to: "commerciale", contact_id: null, description: null,
  status: "confermato", is_completed: false, lat: milano.lat, lng: milano.lng,
};
const a = (id: string, patch: Partial<AppuntamentoMappa> = {}): AppuntamentoMappa => ({ id, ...dati, ...patch });

afterEach(() => vi.unstubAllGlobals());

describe("Mappa operativa", () => {
  it("mantiene l’ordine e le voci prive di posizione, esclude dai pin remoto, annullati e coordinate con restrizioni", () => {
    const ordinati = ordineTappe(appuntamentiMappa([
      a("3", { appointment_time: "11:00" }),
      a("2", { appointment_time: "10:00", lat: null, lng: null }),
      a("1", { formatted_address: "Via Milano 1", address_line: "Indirizzo secondario" }),
      a("remoto", { meeting_provider: "google_meet" }),
      a("google", { place_id: "Google-artificiale" }),
      a("annullato", { status: "annullato" }),
      a("cliente", { calendar_id: null }),
    ], giorno, []));
    expect(ordinati.filter(t => t.punto).map(t => t.id)).toEqual(["1", "3"]);
    expect(ordinati.find(t => t.id === "1")).toMatchObject({ indirizzo: "Via Milano 1" });
    expect(ordinati).toHaveLength(6);
  });

  it("riporta il pezzo successivo di un impegno oltre mezzanotte e usa l’ora italiana", () => {
    const notturno = a("notturno", { appointment_date: "2026-11-21", appointment_time: "23:30", appointment_end_time: "01:30" });
    expect(appuntamentiMappa([notturno], giorno, [])).toMatchObject([{ inizio: 0, fine: 90 }]);
    expect(partiNelFuso("2026-11-21T23:15:00Z")).toEqual({ giorno: "2026-11-22", ora: "00:15" });
  });

  it("lascia esplicite le tratte mancanti, verifica i conflitti e non duplica il viaggio del mezzo", () => {
    const tappe: Tappa[] = [
      { id: "a", titolo: "A", punto: milano, inizio: 540, fine: 600 },
      { id: "b", titolo: "B", punto: altro, inizio: 610, fine: 660 },
      { id: "c", titolo: "C", punto: null, inizio: 650, fine: 700 },
    ];
    expect(riepilogoPercorso(tappe, [{ metri: 5500, secondi: 900 }, null])).toMatchObject([
      { conflitto: "Trasferimento incompatibile" }, { conflitto: "Sovrapposizione", tratta: null },
    ]);
    expect(kmDocumentati([{ id: "mezzo-a", metri: 12340 }, { id: "mezzo-a", metri: 12340 }, { id: "mezzo-b", metri: 8050 }])).toBe(20390);
    expect(coordinate(91, 9)).toBeNull();
  });

  it("valuta 5 candidati su 20, cambia l’ordine dopo i tempi stradali e amplia la rosa quando serve", async () => {
    const candidati: Candidato[] = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`, nome: `Candidato ${i}`, origine: { lat: milano.lat + (i + 1) / 1000, lng: milano.lng },
      fonte: "Sede assegnata", partenza: 500,
    }));
    const stima = vi.fn(async (rosa: Candidato[]) => ({
      andata: rosa.map((_, i) => ({ metri: 1000 + i, secondi: [900, 100, 500, 1100, 1200][i] })),
      dopo: [],
    }));
    const esito = await cercaVicini(candidati, milano, 600, 630, stima);
    expect(esito.risultati.map(r => r.candidato.id)).toEqual(["1", "2", "0"]);
    expect(esito.valutati).toBe(5);
    expect(stima).toHaveBeenCalledTimes(1);
    const parziale = vi.fn().mockResolvedValueOnce({ andata: [], dopo: [] })
      .mockResolvedValue({ andata: [100, 200, 300].map(secondi => ({ metri: 700, secondi })), dopo: [] });
    expect((await cercaVicini(candidati, milano, 600, 630, parziale)).valutati).toBe(10);
    expect(parziale).toHaveBeenCalledTimes(2);
  });

  it("verifica il successivo impegno e ripiega sulla distanza in linea d’aria se il servizio manca", async () => {
    const candidati = [
      { id: "1", nome: "A", origine: altro, fonte: "Precedente", partenza: 585, prossimo: milano, prossimoInizio: 635 },
      { id: "2", nome: "B", origine: milano, fonte: "Sede", partenza: 530 },
      { id: "3", nome: "C", origine: null, fonte: "Sede", partenza: 530 },
    ];
    const calcolo = await cercaVicini(candidati, milano, 600, 630, async () => ({
      andata: [{ metri: 0, secondi: 0 }, { metri: 1000, secondi: 600 }],
      dopo: [null, { metri: 1000, secondi: 600 }],
    }));
    expect(calcolo.risultati.map(r => r.candidato.id)).toEqual(["2"]);
    expect(calcolo.senzaOrigine).toEqual(["C"]);
    const fallback = await cercaVicini(candidati, milano, 600, 630, () => Promise.reject(new Error("timeout")));
    expect(fallback.metodo).toBe("linea");
    expect(fallback.risultati[1].candidato.linea).toBeCloseTo(metriInLinea(altro, milano));
  });

  it("invia a OSRM solo coordinate e profilo e conta gli elementi effettivamente richiesti", async () => {
    const chiamate: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      chiamate.push(url);
      return Response.json(url.pathname.includes("/table/") ? { code: "Ok", durations: [[300], [500]], distances: [[3000], [4000]] }
        : { code: "Ok", routes: [{ legs: [{ duration: 500, distance: 6000 }], geometry: { coordinates: [[9.19, 45.46], [9.22, 45.48]] } }] });
    }));
    expect(await matriceOsrm("https://routing.fixture", "driving", [altro, milano], milano)).toEqual([
      { metri: 3000, secondi: 300 }, { metri: 4000, secondi: 500 },
    ]);
    expect(await percorsoOsrm("https://routing.fixture", "driving", [milano, altro])).toMatchObject({ tratte: [{ metri: 6000, secondi: 500 }] });
    expect(chiamate[0].searchParams.get("sources")).toBe("1;2");
    expect(chiamate[0].searchParams.get("destinations")).toBe("0");
    expect(chiamate[0].toString()).not.toMatch(/Candidato|Cantiere|test@/);
  });

  it("normalizza indirizzi e rende disponibile la scelta fra più codifiche", async () => {
    expect(normalizzaIndirizzo(" VIA Roma  4 ,  20121 Milano , IT ")).toBe("via roma 4, 20121 milano, it");
    const fetchMock = vi.fn(async () => Response.json([
      { lat: "45.44", lon: "9.19", display_name: "Via Roma 4, Milano", address: { house_number: "4", postcode: "20121" } },
      { lat: "45.84", lon: "9.12", display_name: "Via Roma, Como" },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await cercaIndirizzo("https://geocoding.fixture", "Via Roma 4, 20121 Milano")).toMatchObject([
      { civico: "4", cap: "20121" }, { civico: null, cap: null },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
