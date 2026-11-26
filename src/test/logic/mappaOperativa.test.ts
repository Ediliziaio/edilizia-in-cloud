import { afterEach, describe, expect, it, vi } from "vitest";
import { appuntamentiMappa, cantieriMappa, tappeOperative, timbratureDellaVisita } from "@/components/calendar/mappa/dati";
import type { AppuntamentoMappa } from "@/components/calendar/mappa/dati";
import {
  cercaVicini, coordinate, kmDocumentati, metriInLinea, normalizzaIndirizzo, ordineTappe,
  partiNelFuso, riepilogoPercorso, stimaRientro, type Candidato, type Tappa,
} from "../../../shared/mappa-operativa/calcoli";
import type { CalendarOrder } from "@/types/calendar";
import { erroreFasciaVicini, fasciaInizialeVicini } from "@/components/calendar/mappa/fasce";
import { cercaIndirizzo, decodeFlexiblePolyline, matriceHere, matriceOsrm, percorsoHere, percorsoOsrm } from "../../../supabase/functions/mappa-operativa/provider";

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

  it("usa una base personale compatibile solo per il proprio appuntamento", () => {
    const calendario: Parameters<typeof appuntamentiMappa>[2][number] = {
      id: "calendario", owner_id: "commerciale", calendar_type: "personal", duration_minutes: 30,
      base_lat: altro.lat, base_lng: altro.lng, base_place_id: null,
    };
    const appuntamenti = [a("proprio"), a("collega", { assigned_to: "collega" })];
    expect(appuntamentiMappa(appuntamenti, giorno, [calendario], "commerciale").map(v => v.base)).toEqual([altro, null]);
    expect(appuntamentiMappa(appuntamenti, giorno, [calendario], "collega").map(v => v.base)).toEqual([null, null]);
    expect(appuntamentiMappa([a("proprio")], giorno, [{ ...calendario, base_place_id: "google" }], "commerciale")[0].base).toBeNull();
  });

  it("riporta il pezzo successivo di un impegno oltre mezzanotte e usa l’ora italiana", () => {
    const notturno = a("notturno", { appointment_date: "2026-11-21", appointment_time: "23:30", appointment_end_time: "01:30" });
    expect(appuntamentiMappa([notturno], giorno, [])).toMatchObject([{ inizio: 0, fine: 90 }]);
    expect(partiNelFuso("2026-11-21T23:15:00Z")).toEqual({ giorno: "2026-11-22", ora: "00:15" });
  });

  it("propone una fascia utile in ora italiana, conserva quella futura e passa all’indomani a fine giornata", () => {
    const adesso = new Date("2026-11-22T13:07:00Z");
    expect(fasciaInizialeVicini(giorno, adesso, "09:00", "09:45")).toEqual({ giorno, inizio: "14:15", fine: "15:00" });
    expect(fasciaInizialeVicini(giorno, adesso, "16:10", "17:20")).toEqual({ giorno, inizio: "16:10", fine: "17:20" });
    expect(fasciaInizialeVicini(giorno, new Date("2026-11-22T22:50:00Z"))).toEqual({
      giorno: "2026-11-23", inizio: "09:00", fine: "10:00",
    });
    expect(erroreFasciaVicini(giorno, "14:07", "15:00", adesso)).toContain("successivo");
    expect(erroreFasciaVicini(giorno, "14:15", "15:00", adesso)).toBe("");
  });

  it("rispetta le ore della squadra e mantiene il ritorno al cantiere dopo una tappa intermedia", () => {
    const commessa = (id: string, fasce: [string, string][], punto: { lat: number; lng: number }): CalendarOrder => ({
      id, order_code: id, description: id, indirizzo_lavori: "Via demo 1", work_lat: punto.lat, work_lng: punto.lng,
      work_start_date: giorno, work_end_date: giorno, work_start_time: "08:00", work_end_time: "18:00",
      expected_date: null, warehouse_arrival_date: null, created_at: giorno, customer_id: "cliente",
      customer: { first_name: "", last_name: "" }, current_status_id: null, status: null,
      resource_bookings: fasce.map(([start_time, end_time]) => ({
        resourceId: "squadra", resourceName: "Squadra A", resourceType: "team",
        start_date: giorno, end_date: giorno, start_time, end_time,
      })),
    });
    const cantieri = cantieriMappa([
      commessa("A", [["08:00", "09:00"], ["09:00", "10:00"], ["14:00", "16:00"]], milano),
      commessa("B", [["11:00", "12:00"]], altro),
    ], giorno, false, true);
    expect(cantieri).toHaveLength(2);
    const tappe = tappeOperative(cantieri, a => a.risorse.some(r => r.id === "squadra"));
    expect(tappe.map(t => [t.voce?.id, t.inizio, t.fine, t.voce?.attivita.length])).toEqual([
      ["A", 480, 600, 2], ["B", 660, 720, 1], ["A", 840, 960, 1],
    ]);
    expect(new Set(tappe.map(t => t.id)).size).toBe(3);
    expect(riepilogoPercorso(tappe, [{ metri: 3000, secondi: 480 }, { metri: 3000, secondi: 480 }])
      .every(t => t.conflitto == null)).toBe(true);
  });

  it("lascia esplicite le tratte mancanti, verifica i conflitti e non duplica il viaggio del mezzo", () => {
    const tappe: Tappa[] = [
      { id: "a", titolo: "A", punto: milano, inizio: 540, fine: 600 },
      { id: "b", titolo: "B", punto: altro, inizio: 610, fine: 660 },
      { id: "c", titolo: "C", punto: null, inizio: 650, fine: 700 },
    ];
    expect(riepilogoPercorso(tappe, [{ metri: 5500, secondi: 900 }, null])).toMatchObject([
      { conflitto: "Trasferimento incompatibile", ritardoMinuti: 5 }, { conflitto: "Sovrapposizione", tratta: null, ritardoMinuti: null },
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
    const fallisceDopo = vi.fn().mockResolvedValueOnce({ andata: [], dopo: [] })
      .mockRejectedValue(new Error("timeout"));
    const ripiego = await cercaVicini(candidati, milano, 600, 630, fallisceDopo);
    expect(ripiego.metodo).toBe("linea");
    expect(ripiego.risultati.map(r => r.candidato.id)).toEqual(["5", "6", "7"]);
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
    expect(calcolo.esclusi).toMatchObject([{ motivo: "rientro", margineArrivo: 5, margineRientro: -5 }]);
    expect(calcolo.risultati[0]).toMatchObject({ margineArrivo: 70, margineRientro: null });
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
    expect(chiamate.at(-1)?.searchParams.get("overview")).toBe("full");
    expect(chiamate[0].searchParams.get("sources")).toBe("1;2");
    expect(chiamate[0].searchParams.get("destinations")).toBe("0");
    expect(chiamate[0].toString()).not.toMatch(/Candidato|Cantiere|test@/);
  });

  it("mantiene separate le geometrie OSRM delle tratte anche quando l’itinerario torna al punto iniziale", async () => {
    const primo = [9.19, 45.46], secondo = [9.22, 45.48], curvaAndata = [9.2, 45.47], curvaRitorno = [9.21, 45.45];
    const step = (...coordinates: number[][]) => ({ geometry: { coordinates } });
    const fetchPercorso = vi.fn(async () => Response.json({ code: "Ok", routes: [{
      legs: [
        { distance: 6000, duration: 500, steps: [step(primo, curvaAndata), step(curvaAndata, secondo)] },
        { distance: 7000, duration: 600, steps: [step(secondo, curvaRitorno, primo), step(primo, primo)] },
      ],
      geometry: { coordinates: [primo, curvaAndata, secondo, curvaRitorno, primo] },
    }] }));
    vi.stubGlobal("fetch", fetchPercorso);
    const esito = await percorsoOsrm("https://routing.fixture", "driving", [milano, altro, milano]);
    expect(esito.tratte).toEqual([{ metri: 6000, secondi: 500 }, { metri: 7000, secondi: 600 }]);
    expect(esito.geometrieTratte).toEqual([[primo, curvaAndata, secondo], [secondo, curvaRitorno, primo]]
      .map(tratta => tratta.map(([lng, lat]) => ({ lat, lng }))));
    expect(fetchPercorso).toHaveBeenCalledWith(expect.objectContaining({ search: expect.stringContaining("steps=true") }), expect.anything());
  });

  it("distingue NoSegment e NoRoute del provider dai guasti e scarta un punto agganciato troppo lontano", async () => {
    const risposta = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: "NoSegment", message: "Could not find a matching segment for coordinate 1" }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ code: "NoRoute" }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ code: "Ok",
        waypoints: [{ location: [9.19, 45.4642], distance: 0 }, { location: [9.50, 45.50], distance: 20500 }],
        routes: [{ legs: [{ distance: 6000, duration: 400 }] }],
      }))
      .mockResolvedValueOnce(Response.json({ code: "InvalidOptions" }, { status: 400 }));
    vi.stubGlobal("fetch", risposta);
    const calcola = () => percorsoOsrm("https://routing.fixture", "driving", [milano, altro]);
    expect(await calcola()).toMatchObject({ problema: "fuori_copertura", puntiFuoriCopertura: [1], tratte: [null] });
    expect(await calcola()).toMatchObject({ problema: "nessun_percorso", tratte: [null] });
    expect(await calcola()).toMatchObject({ problema: "fuori_copertura", puntiFuoriCopertura: [1], tratte: [null] });
    await expect(calcola()).rejects.toThrow("Provider cartografico non disponibile");
    expect((risposta.mock.calls[0][0] as URL).searchParams.get("radiuses")).toBe("500;500");
  });

  it("propaga i ritardi nel rientro, conserva la durata delle visite e usa le pause disponibili", () => {
    const tappa = (id: string, inizio: number, fine: number): Tappa => ({ id, titolo: id, punto: milano, inizio, fine });
    const a = tappa("a", 780, 840), b = tappa("b", 840, 845), c = tappa("c", 875, 900);
    const tratta = { metri: 4000, secondi: 480 };
    expect(stimaRientro([a, b], [tratta, tratta, tratta], true)).toEqual({ arrivoMinuti: 861, ritardoMinuti: 8 });
    expect(stimaRientro([a, b, c], [tratta, tratta, tratta], false)).toEqual({ arrivoMinuti: 908, ritardoMinuti: 0 });
    expect(stimaRientro([tappa("notte", 1380, 1438)], [tratta], false)).toEqual({ arrivoMinuti: 1446, ritardoMinuti: 0 });
    expect(stimaRientro([a, b], [null, tratta, tratta], true)).toBeNull();
  });

  it("filtra le timbrature per persona e fascia, anche quando la visita termina dopo mezzanotte", () => {
    const eventi = [
      { user_id: "alba", tipo: "uscita", ora: "2026-11-22T12:01:00+01:00" },
      { user_id: "bruno", tipo: "entrata", ora: "2026-11-22T14:08:00+01:00" },
      { user_id: "alba", tipo: "entrata", ora: "2026-11-22T14:02:00+01:00" },
      { user_id: "alba", tipo: "uscita", ora: "2026-11-23T00:10:00+01:00" },
      { user_id: "alba", tipo: "entrata", ora: "2026-11-23T00:10:00+01:00" },
    ];
    const utenti = new Set(["alba"]);
    expect(timbratureDellaVisita(eventi, { inizio: 840, fine: 960 }, giorno, utenti)).toEqual([eventi[2]]);
    expect(timbratureDellaVisita(eventi, { inizio: 1380, fine: 1450 }, giorno, utenti)).toEqual([eventi[3]]);
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

  it("HERE: polyline decodificata (esempio ufficiale) e richieste senza traffico", async () => {
    expect(decodeFlexiblePolyline("BFoz5xJ67i1B1B7PzIhaxL7Y")).toEqual([
      { lat: 50.10228, lng: 8.69821 }, { lat: 50.10201, lng: 8.69567 },
      { lat: 50.10063, lng: 8.6915 }, { lat: 50.09878, lng: 8.68752 },
    ]);
    const chiamate: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      chiamate.push(String(url) + (init?.body ? ` ${init.body}` : ""));
      if (String(url).includes("matrix")) {
        return new Response(JSON.stringify({ matrix: { numDestinations: 1, travelTimes: [600], distances: [9000] } }));
      }
      return new Response(JSON.stringify({ routes: [{ sections: [{ summary: { length: 54505, duration: 2462 }, polyline: "BFoz5xJ67i1B1B7PzIhaxL7Y" }] }] }));
    }));
    const esito = await percorsoHere("k", "auto", [{ lat: 50.10228, lng: 8.69821 }, { lat: 50.09878, lng: 8.68752 }]);
    expect(esito.tratte).toEqual([{ metri: 54505, secondi: 2462 }]);
    expect(esito.geometrieTratte?.[0]).toHaveLength(4);
    expect(new URL(chiamate[0]).searchParams.get("departureTime")).toBe("any");
    await matriceHere("k", "auto", [{ lat: 50.1, lng: 8.69 }], { lat: 50.09, lng: 8.68 });
    expect(JSON.parse(chiamate[1].slice(chiamate[1].indexOf(" ") + 1)).departureTime).toBe("any");
  });
});
