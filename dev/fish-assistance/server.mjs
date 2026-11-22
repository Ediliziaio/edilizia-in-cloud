import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createLeadTrials } from "./lead-trials.mjs";
import { createAssistanceLab } from "./runtime.mjs";
import { createPhoneTrials } from "./phone-trials.mjs";
import {
  createLocalFishVoice,
  LocalVoiceError,
  AUDIO_TYPES,
  MAX_LOCAL_AUDIO,
} from "./voice.mjs";
const BASE = "/__local-assistance";
export function createAssistanceHttpServer(
  lab,
  {
    uiPort = 8086,
    voice = createLocalFishVoice(),
    phoneTrials = createPhoneTrials(),
    leadTrials,
  } = {},
) {
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(JSON.stringify(body));
    };
    const sendSpeech = async (text) => {
      const audio = await voice.speech(text);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Local-Assistance-Mode": "local",
        "X-Fish-Speech-Model": "drama-3",
      });
      return res.end(audio);
    };
    const sendTrial = (trial) =>
      send(200, { mode: "local", productionConnected: false, trial });
    const port = server.address()?.port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      ) ||
      !hosts.includes(req.headers.host)
    )
      return send(403, { error: "Accesso solo dal computer locale." });
    const allowedOrigins = [
      `http://127.0.0.1:${uiPort}`,
      `http://localhost:${uiPort}`,
      ...hosts.map((host) => "http://" + host),
    ];
    if (
      (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      req.headers.authorization
    )
      return send(403, {
        error: "Richiesta non consentita nel collaudo locale.",
      });
    const path = new URL(req.url, "http://" + req.headers.host).pathname;
    if (!path.startsWith(BASE + "/"))
      return send(404, { error: "Operazione locale non disponibile." });
    try {
      if (req.method === "GET" && path === BASE + "/bootstrap")
        return send(200, {
          ...(await lab.bootstrap()),
          token,
          voice: voice.status(),
          phoneSetup: phoneTrials.setup(),
        });
      const supplied = Buffer.from(
          String(req.headers["x-local-assistance-token"] || ""),
        ),
        expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return send(403, {
          error: "Riapri il collaudo locale per aggiornare il collegamento.",
        });
      if (
        path === BASE + "/lead-trials" ||
        path.startsWith(BASE + "/lead-trials/")
      ) {
        if (!leadTrials)
          return send(404, { error: "Collaudo lead locale non disponibile." });
        const matchLead = path.match(
          /^\/__local-assistance\/lead-trials\/([a-f0-9-]{36})(?:\/(tool|transcript))?$/i,
        );
        const leads = await leadTrials();
        const local = (key, data) =>
          send(200, { mode: "local", productionConnected: false, [key]: data });
        if (req.method === "GET") {
          if (path === BASE + "/lead-trials")
            return local("setup", leads.setup());
          if (matchLead && !matchLead[2])
            return local("trial", await leads.snapshot(matchLead[1]));
          return send(404, { error: "Prova lead non trovata." });
        }
        if (
          req.method !== "POST" ||
          !req.headers["content-type"]?.startsWith("application/json")
        )
          return send(415, { error: "Formato richiesta non valido." });
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 64_000)
            return send(413, {
              error: "Trascrizione di collaudo troppo lunga.",
            });
        }
        const body = JSON.parse(raw);
        if (path === BASE + "/lead-trials") {
          if (!leads.setup().ready)
            return send(503, {
              error: "Configura la chiave Fish sul server locale.",
            });
          return local("preview", await leads.open(body.scenario));
        }
        if (matchLead?.[2] === "tool")
          return local("result", await leads.execute(matchLead[1], body));
        if (matchLead?.[2] === "transcript")
          return local(
            "result",
            await leads.saveTranscript(matchLead[1], body.transcript),
          );
        return send(404, { error: "Operazione lead non disponibile." });
      }
      const match = path.match(
        /^\/__local-assistance\/sessions\/([a-f0-9-]{36})(\/turn)?$/i,
      );
      const voiceMatch = path.match(
        /^\/__local-assistance\/sessions\/([a-f0-9-]{36})\/(speech|transcribe)$/i,
      );
      const phoneMatch = path.match(
        /^\/__local-assistance\/phone-trials\/([a-f0-9-]{36})(\/speech)?$/i,
      );
      if (voiceMatch && req.method === "POST") {
        const snapshot = await lab.snapshot(voiceMatch[1]);
        if (voiceMatch[2] === "transcribe") {
          if (["done", "needs_office"].includes(snapshot.session.phase))
            return send(409, { error: "Questo collaudo è già concluso." });
          const mime = (req.headers["content-type"] || "")
            .split(";")[0]
            .toLowerCase();
          if (!AUDIO_TYPES.has(mime))
            return send(415, { error: "Formato audio non supportato." });
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > MAX_LOCAL_AUDIO)
              return send(413, { error: "Registrazione troppo lunga." });
            chunks.push(chunk);
          }
          // Transcription alone never advances the session or grants consent.
          return send(200, {
            mode: "local",
            productionConnected: false,
            ...(await voice.transcribe(Buffer.concat(chunks), mime)),
          });
        }
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(415, { error: "Formato richiesta non valido." });
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 1000)
            return send(413, { error: "Richiesta troppo lunga." });
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !body ||
          Object.keys(body).length !== 1 ||
          typeof body.messageId !== "string"
        )
          return send(400, { error: "Scegli una risposta dell’assistente." });
        const message = snapshot.session.messages.find(
          (m) => m.id === body.messageId && m.role === "agent",
        );
        if (!message)
          return send(400, { error: "Risposta dell’assistente non trovata." });
        return await sendSpeech(message.text);
      }
      if (req.method === "GET" && phoneMatch && !phoneMatch[2])
        return sendTrial(phoneTrials.snapshot(phoneMatch[1]));
      if (req.method === "GET" && match && !match[2])
        return send(200, await lab.snapshot(match[1]));
      if (req.method !== "POST")
        return send(405, { error: "Metodo non disponibile." });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "Formato richiesta non valido." });
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12_000)
          return send(413, { error: "Risposta troppo lunga." });
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const keys =
        path === BASE + "/phone-trials"
          ? ["requestId", "officeSeconds", "outboundEnabled"]
          : phoneMatch
            ? phoneMatch[2]
              ? ["version"]
              : ["version", "action"]
            : path === BASE + "/sessions"
              ? ["requestId", "customerId", "scenario", "calendarId"]
              : ["requestId", "text"];
      if (
        !body ||
        Array.isArray(body) ||
        typeof body !== "object" ||
        Object.keys(body).some((key) => !keys.includes(key))
      )
        return send(400, {
          error: "Sono consentiti soltanto i dati della prova locale.",
        });
      if (path === BASE + "/phone-trials")
        return sendTrial(phoneTrials.start(body));
      if (phoneMatch?.[2])
        return await sendSpeech(
          phoneTrials.speech(phoneMatch[1], body.version),
        );
      if (phoneMatch)
        return sendTrial(phoneTrials.advance(phoneMatch[1], body));
      if (path === BASE + "/sessions") return send(200, await lab.start(body));
      if (match?.[2]) return send(200, await lab.turn(match[1], body));
      return send(404, { error: "Operazione locale non disponibile." });
    } catch (error) {
      console.warn(
        "[assistenza-locale]",
        error.code || "richiesta_non_completata",
      );
      return send(error instanceof LocalVoiceError ? error.status : 400, {
        error:
          error instanceof LocalVoiceError
            ? error.message
            : "Operazione di collaudo non completata. Controlla i dati o riprova lo stesso invio.",
      });
    }
  });
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.ASSISTANCE_LOCAL_PORT || 8798),
    uiPort = Number(process.env.ASSISTANCE_UI_PORT || 8086);
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !Number.isInteger(uiPort) ||
    uiPort < 1024 ||
    uiPort > 65535
  )
    throw new Error("Porte locali non valide.");
  // Reserve the loopback port before opening a file-backed database. A second
  // launch must fail without opening the database used by the running process.
  const dataDir = resolve(
    port === 8798
      ? ".tmp/fish-assistance-v1"
      : `.tmp/fish-assistance-v1-${port}`,
  );
  const ready = Promise.withResolvers();
  ready.promise.catch(() => {});
  let lab;
  const deferred = Object.fromEntries(
    ["bootstrap", "snapshot", "start", "turn"].map((name) => [
      name,
      (...args) => ready.promise.then((instance) => instance[name](...args)),
    ]),
  );
  let leadRuntime;
  const leadTrials = async () => {
    const instance = await ready.promise;
    leadRuntime ??= createLeadTrials(instance.db, {
      apiKey: process.env.FISH_API_KEY || "",
    });
    return leadRuntime;
  };
  const server = createAssistanceHttpServer(deferred, {
    uiPort,
    leadTrials,
    voice: createLocalFishVoice(process.env.FISH_API_KEY || ""),
  });
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "La porta del backend locale è occupata."
        : "Avvio del backend locale non riuscito.",
    );
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", async () => {
    try {
      lab = await createAssistanceLab({ dataDir });
      ready.resolve(lab);
      console.log(
        `Backend assistenza locale pronto su http://127.0.0.1:${port}`,
      );
      console.log(
        "Database isolato di test. Fish solo per voce e trascrizione, se attivati. Nessuna connessione a Supabase o calendari esterni.",
      );
    } catch (error) {
      ready.reject(error);
      console.error("Database locale non disponibile:", error.message);
      server.close();
      process.exitCode = 1;
    }
  });
  const close = () =>
    server.close(async () => {
      const instance = lab || (await ready.promise.catch(() => null));
      await instance?.close();
      process.exit(0);
    });
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
