/**
 * node scripts/qa-assignment-dialog-browser.mjs [output-directory]
 * Real component, synthetic hooks, ephemeral loopback Vite, cached browsers only.
 * Does not load the app entry, its Vite config, .env files, or an existing session.
 */
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { chromium, webkit, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] || path.join(root, "output/assignment-dialog-20261028"));
const temporary = await mkdtemp(path.join(os.tmpdir(), "eic-assignment-dialog-qa-"));
const fixturePath = "/assignment-dialog-qa";
const virtualId = "\0assignment-dialog-qa-stubs";
const viewports = [
  { name: "desktop-short", width: 1280, height: 600 },
  { name: "desktop-compact", width: 1024, height: 480 },
  { name: "mobile-tall", width: 390, height: 844 },
  { name: "mobile-short", width: 375, height: 667 },
];

// One virtual module supplies only the named hooks imported by this dialog.
// The client stub fails closed even if an accidentally uncached query executes.
const stubs = `
export const fixtureState = {
  submissions: [], unexpectedOperations: [], queryFetches: [], companyRequests: [], seededQueryKeys: []
};
const forbidden = name => {
  fixtureState.unexpectedOperations.push(name);
  throw new Error('Forbidden in isolated assignment QA: ' + name);
};
export const supabase = new Proxy({}, { get: (_target, property) => (..._args) => forbidden('client.' + String(property)) });
export const useAuth = () => ({ effectiveCompany: { id: 'company' } });
export const usePermissions = () => ({
  canViewCosts: true, canViewMargins: true, canEditOrders: true,
  canEditOperai: true, canViewPersone: true, solaLettura: false
});
export const useAssignmentHourlyCost = () => ({
  allowed: true, data: { amount: 26 }, isLoading: false, isError: false,
  refetch: async () => ({ data: { amount: 26 } })
});
const companies = [
  { id: 'team-qa', label: 'Ditta QA attiva', kind: 'esterna' },
  { id: 'subappaltatore:sub-qa', label: 'Subappaltatore QA virtuale', kind: 'esterna', subappaltatoreId: 'sub-qa' }
];
export const useAssignmentCompanies = (companyId, enabled) => {
  if (companyId !== 'company') forbidden('unexpected fixture company');
  fixtureState.companyRequests.push({ companyId, enabled });
  return { data: companies, isLoading: false, isFetching: false, isError: false, refetch: async () => ({ data: companies }) };
};
export const oggiRoma = () => '2026-10-28';
export const messaggioErroreOperai = (_error, fallback) => fallback;
export const useSquadre = () => ({ data: [], isLoading: false, isError: false, refetch: async () => ({ data: [] }) });
export const useSquadreCommessa = useSquadre;
export const useSquadraSuCommessa = () => ({ mutate: () => forbidden('unexpected crew mutation') });
`;

const report = {
  startedAt: new Date().toISOString(),
  isolation: { fixturePath, host: "127.0.0.1", port: null, appEntryLoaded: false, environmentFilesLoaded: false, realBrowserSessionUsed: false },
  locale: "it-IT", deviceScaleFactor: 1,
  mobileNote: "Mobile-sized CSS viewports; wheel input. No physical iOS keyboard/touch claim.",
  sourceHashes: {}, browserDiscovery: {}, engines: [], results: [],
};
let server;
let failed = false;

async function executable(file) {
  try { await access(file, constants.X_OK); return true; } catch { return false; }
}

async function cachedExecutables(browserType) {
  const require = createRequire(import.meta.url);
  const cacheRoots = new Set([
    path.join(os.homedir(), "Library/Caches/ms-playwright"),
    path.join(os.homedir(), ".cache/ms-playwright"),
  ]);
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    cacheRoots.add(path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH));
  }
  // Also inspect the installed and bundled runtimes' hermetic browser caches.
  for (const packageName of ["playwright-core", path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/package.json")]) {
    try {
      const packageFile = require.resolve(packageName === "playwright-core" ? "playwright-core/package.json" : packageName);
      cacheRoots.add(path.join(path.dirname(packageFile), ".local-browsers"));
    } catch { /* Optional runtime is absent. Never install it. */ }
  }
  const expected = browserType.executablePath();
  const expectedRevision = expected.match(/(?:chromium|webkit)-(\d+)/)?.[1];
  const candidates = await executable(expected) ? [expected] : [];
  const checkedCaches = [];
  for (const cache of cacheRoots) {
    let entries;
    try { entries = await readdir(cache); } catch { checkedCaches.push({ cache, present: false }); continue; }
    const names = entries.filter(name => browserType === chromium ? /^chromium(?:_headless_shell)?-\d+$/.test(name) : /^webkit-\d+$/.test(name));
    checkedCaches.push({ cache, present: true, browserDirectories: names });
    for (const name of names.sort().reverse()) {
      const suffixes = browserType === webkit ? ["pw_run.sh"] : name.startsWith("chromium_headless_shell")
        ? ["chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-headless-shell-mac-x64/chrome-headless-shell", "chrome-headless-shell-linux64/chrome-headless-shell"]
        : ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-linux64/chrome"];
      for (const suffix of suffixes) {
        const candidate = path.join(cache, name, suffix);
        if (await executable(candidate) && !candidates.includes(candidate)) candidates.push(candidate);
      }
    }
  }
  // Prefer the installed Playwright revision; allow an older cached binary as a documented fallback.
  candidates.sort((a, b) => Number(b.includes(`-${expectedRevision}/`)) - Number(a.includes(`-${expectedRevision}/`)));
  report.browserDiscovery[browserType.name()] = { expected, expectedRevision, checkedCaches, candidates };
  return candidates;
}

async function wheelAtScroller(page, scroller, delta) {
  const box = await scroller.boundingBox();
  assert(box && box.height > 0, "Scroller must have a visible box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, delta);
}

async function wheelToEdge(page, scroller, direction) {
  await expect.poll(async () => {
    await wheelAtScroller(page, scroller, direction * 10000);
    return scroller.evaluate((el, direction) => direction < 0 ? el.scrollTop : el.scrollHeight - el.clientHeight - el.scrollTop, direction);
  }, { timeout: 5000 }).toBeLessThanOrEqual(2);
}

// Reveal controls with real wheel events, without scrollIntoView or scrollTop writes.
async function wheelReveal(page, scroller, control) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const [frame, box] = await Promise.all([scroller.boundingBox(), control.boundingBox()]);
    assert(frame && box, "Control and scroller must exist");
    if (box.y >= frame.y + 2 && box.y + box.height <= frame.y + frame.height - 2) return;
    await wheelAtScroller(page, scroller, box.y < frame.y + 2 ? -100 : 100);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  throw new Error("Could not reveal control using wheel events");
}

async function runViewport(browser, engine, viewport, origin) {
  const prefix = `${engine.name}-${viewport.width}x${viewport.height}`;
  const result = { engine: engine.name, version: engine.version, viewport, assertions: [], screenshots: [], passed: false };
  report.results.push(result);
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: "it-IT", deviceScaleFactor: 1, serviceWorkers: "block" });
  const externalRequests = [], pageErrors = [], consoleErrors = [], nativeDialogs = [], requests = [];
  await context.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(`${origin}/`)) { requests.push(new URL(url).pathname); return route.continue(); }
    externalRequests.push(url);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__qaWheelEvents = [];
    document.addEventListener("wheel", event => {
      const target = event.target;
      queueMicrotask(() => window.__qaWheelEvents.push({
        delta: event.deltaY, prevented: event.defaultPrevented,
        target: target instanceof Element ? `${target.tagName}.${target.className}` : String(target),
        scrollTop: document.querySelector('[data-testid="assignment-dialog-scroll"]')?.scrollTop,
      }));
    }, { passive: true });
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("dialog", async dialog => { nativeDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  const record = (name, details = true) => result.assertions.push({ name, details });
  const screenshot = async name => {
    const file = `${prefix}-${name}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: false });
    result.screenshots.push(file);
  };
  const footerInViewport = async () => {
    const footer = page.getByRole("button", { name: "Conferma assegnazione", exact: true }).locator("..");
    const box = await footer.boundingBox();
    assert(box && box.y >= -1 && box.y + box.height <= viewport.height + 1 && box.x >= -1 && box.x + box.width <= viewport.width + 1, `Footer outside viewport: ${JSON.stringify(box)}`);
    return box;
  };
  const openCompany = async label => {
    await page.goto(`${origin}${fixturePath}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.getByRole("button", { name: "Assegna", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Ditta", exact: true }).click();
    await page.getByRole("combobox", { name: "Scegli chi", exact: true }).click();
    await expect(page.getByRole("option", { name: "Ditta QA attiva", exact: true })).toBeEnabled();
    await expect(page.getByRole("option", { name: "Subappaltatore QA virtuale", exact: true })).toBeEnabled();
    await page.getByRole("option", { name: label, exact: true }).click();
    await page.getByText("Budget ditta e listino (facoltativo)", { exact: true }).click();
    await expect(page.getByText("Budget ditta e listino (facoltativo)", { exact: true }).locator("..")).toHaveAttribute("open", "");
    const scroller = page.getByTestId("assignment-dialog-scroll");
    const dimensions = await scroller.evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    assert(dimensions.scrollHeight > dimensions.clientHeight, "Expanded real content must overflow");
    await wheelToEdge(page, scroller, -1);
    const before = await scroller.evaluate(el => el.scrollTop);
    let wheelAttempts = 0;
    await expect.poll(async () => {
      wheelAttempts++;
      await wheelAtScroller(page, scroller, 240);
      return scroller.evaluate(el => el.scrollTop);
    }).toBeGreaterThan(before);
    const after = await scroller.evaluate(el => el.scrollTop);
    assert(after > 0, "Wheel must scroll before bottom input lookup or click");
    record(`${label}: real wheel changes scrollTop before bottom inputs`, { before, after, wheelAttempts, ...dimensions });
    record(`${label}: footer inside viewport after expansion`, await footerInViewport());
    await wheelToEdge(page, scroller, 1);
    record(`${label}: wheel reaches bottom`, await scroller.evaluate(el => ({ scrollTop: el.scrollTop, maximum: el.scrollHeight - el.clientHeight })));
    return scroller;
  };
  const submissions = () => page.evaluate(() => window.__assignmentDialogQA.submissions);
  const typeDraft = async (input, parts) => {
    await input.fill("");
    let draft = "";
    for (const part of parts) {
      await input.pressSequentially(part);
      draft += part;
      await expect(input).toHaveValue(draft);
    }
  };
  const expectDecimalText = async input => {
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveAttribute("inputmode", "decimal");
  };
  try {
    let scroller = await openCompany("Ditta QA attiva");
    // No bottom input locator is constructed until the first true-wheel assertion above passes.
    const tariff = page.getByRole("combobox").filter({ hasText: "Cerca una voce di listino…" });
    await wheelReveal(page, scroller, tariff);
    await tariff.click();
    await page.getByRole("option", { name: /Posa QA sintetica/ }).click();
    const quantity = page.getByRole("textbox", { name: "Quantità", exact: true });
    const budget = page.getByLabel("Costo previsto ditta · IVA inclusa €", { exact: true });
    const cost = page.getByLabel("Costo ditta già registrato · IVA inclusa €", { exact: true });
    for (const input of [quantity, budget, cost]) await expectDecimalText(input);
    await wheelReveal(page, scroller, quantity);
    await typeDraft(quantity, ["1", ",", "5"]);
    await expect(budget).toHaveValue("150,00");
    await expect(page.getByText(/vendita consigliata/)).toContainText(/225,00/);
    record("Quantity preserves 1 → 1, → 1,5; €100 × 1,5 = €150; suggested sale €225");
    await quantity.fill("1.5");
    for (const raw of ["1.50", "1.500", "1.5000"]) {
      await quantity.pressSequentially("0");
      await expect(quantity).toHaveValue(raw);
      await expect(budget).toHaveValue("150,00");
    }
    record("Quantity 1.50 → 1.500 → 1.5000 remains 1.5 and budget remains €150");
    for (const invalid of ["", "1,5x"]) {
      await quantity.fill(invalid);
      await expect(quantity).toHaveAttribute("aria-invalid", "true");
      await page.getByRole("button", { name: "Conferma assegnazione", exact: true }).click();
      assert.equal((await submissions()).length, 0, "Invalid quantity must not submit stale budget");
    }
    record("Empty and malformed quantities block submission of stale tariff budget");
    await wheelReveal(page, scroller, quantity);
    await typeDraft(quantity, ["1", ",", "5"]);
    await wheelReveal(page, scroller, cost);
    await typeDraft(cost, ["12", ",", "50"]);
    await expect(cost).toHaveValue("12,50");
    record("Recorded cost preserves decimal comma while typing");
    record("Footer stays inside viewport while editing costs", await footerInViewport());
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 8000 });
    await screenshot("tariff-comma");
    await page.getByRole("button", { name: "Conferma assegnazione", exact: true }).click();
    await expect.poll(async () => (await submissions()).length).toBe(1);
    const [tariffPayload] = await submissions();
    assert.equal(tariffPayload.external_team_id, "team-qa");
    assert.equal(tariffPayload.cost_preventivo, 150);
    assert.equal(tariffPayload.cost_consuntivo, 12.5);
    assert.equal(tariffPayload.hours, null);
    record("Tariff submission captured only in memory", tariffPayload);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const firstState = await page.evaluate(() => window.__assignmentDialogQA);

    // Reload resets the synthetic state, without opening or reusing any app session.
    scroller = await openCompany("Subappaltatore QA virtuale");
    const manualBudget = page.getByLabel("Costo previsto ditta · IVA inclusa €", { exact: true });
    const manualCost = page.getByLabel("Costo ditta già registrato · IVA inclusa €", { exact: true });
    await wheelReveal(page, scroller, manualBudget);
    await typeDraft(manualBudget, ["12", ",", "50"]);
    record("Manual budget preserves decimal comma and intermediate trailing comma");
    await manualBudget.fill("1.500");
    await manualBudget.press("Tab");
    await expect(manualBudget).toHaveValue("1.500,00");
    record("Money retains Italian grouping: 1.500 formats to 1.500,00");
    await typeDraft(manualBudget, ["1", ".", "234", ",", "56"]);
    await wheelReveal(page, scroller, manualCost);
    await typeDraft(manualCost, ["9", ".", "50"]);
    await expect(manualBudget).toHaveValue("1.234,56");
    await manualCost.press("Tab");
    await expect(manualCost).toHaveValue("9,50");
    record("Grouped cost 1.234,56 retained; dot decimal 9.50 formats to 9,50 on blur");
    record("Footer stays inside viewport with grouped costs", await footerInViewport());
    await screenshot("grouped-cost");
    await page.getByRole("button", { name: "Conferma assegnazione", exact: true }).click();
    await expect.poll(async () => (await submissions()).length).toBe(1);
    const [manualPayload] = await submissions();
    assert.equal(manualPayload.cost_preventivo, 1234.56);
    assert.equal(manualPayload.cost_consuntivo, 9.5);
    assert.equal(manualPayload.external_team_id, null);
    assert.equal(manualPayload.subappaltatore_id, "sub-qa");
    record("Grouped-cost submission captured only in memory", manualPayload);
    const secondState = await page.evaluate(() => window.__assignmentDialogQA);
    for (const state of [firstState, secondState]) {
      assert.deepEqual(state.unexpectedOperations, []);
      assert.deepEqual(state.queryFetches, []);
      assert.deepEqual(state.seededQueryKeys, [["tariffe-manodopera", "company"], ["tariffa-costi-varianti", "company"]]);
      assert(state.companyRequests.some(request => request.companyId === "company" && request.enabled));
    }
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(nativeDialogs, []);
    assert(!requests.some(url => /\/(?:src\/(?:main|App)\.|src\/(?:contexts\/AuthContext|hooks\/(?:useAssignmentCompanies|useOperai|usePermissions|useAssignmentHourlyCost))\.|src\/integrations\/supabase\/client\.)/.test(url)), "App entry or unstubbed data hook loaded");
    record("Cached tariff/variant queries; no client operations, external requests, app entry, native dialogs or browser errors");
    result.passed = true;
  } catch (error) {
    failed = true;
    result.error = error.stack || String(error);
    result.body = await page.locator("body").innerText().catch(() => "unavailable");
    result.wheelEvents = await page.evaluate(() => window.__qaWheelEvents).catch(() => []);
    await screenshot("failure").catch(() => {});
    console.error(`FAIL ${prefix}: ${error.message}`);
  } finally {
    result.externalRequests = externalRequests;
    result.pageErrors = pageErrors;
    result.consoleErrors = consoleErrors;
    result.nativeDialogs = nativeDialogs;
    await context.close();
  }
  console.log(`${result.passed ? "PASS" : "FAIL"} ${prefix}: ${result.assertions.length} assertions`);
}

try {
  await mkdir(output, { recursive: true });
  for (const file of ["src/components/orders/AddAssignmentDialog.tsx", "src/lib/orders/assignmentAmounts.ts", "src/components/ui/dialog.tsx", "src/index.css"]) {
    report.sourceHashes[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
  }
  server = await createServer({
    configFile: false, root, envDir: temporary, cacheDir: path.join(temporary, "vite-cache"),
    appType: "custom", logLevel: "error",
    optimizeDeps: { entries: ["scripts/assignment-dialog-browser-harness.tsx"] },
    define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://unused.invalid"), "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("synthetic-qa-no-service") },
    resolve: { alias: [
      { find: /^@\/(?:contexts\/AuthContext|hooks\/(?:usePermissions|useAssignmentCompanies|useOperai|useAssignmentHourlyCost)|integrations\/supabase\/client)$/, replacement: virtualId },
      { find: "assignment-dialog-qa-stubs", replacement: virtualId },
      { find: "@", replacement: path.join(root, "src") },
    ] },
    plugins: [react(), {
      name: "isolated-assignment-dialog-qa",
      resolveId: id => id === virtualId ? virtualId : undefined,
      load: id => id === virtualId ? stubs : undefined,
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] !== fixturePath) return next();
          const html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Isolated assignment QA</title></head><body><div id="root"></div><script type="module" src="/scripts/assignment-dialog-browser-harness.tsx"></script></body></html>';
          vite.transformIndexHtml(fixturePath, html).then(html => { res.setHeader("Content-Type", "text/html"); res.end(html); }).catch(error => { res.statusCode = 500; res.end(String(error)); });
        });
      },
    }],
    server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false },
  });
  // Vite's public listen() substitutes its default port for 0. The wrapped HTTP
  // listener still initializes Vite and lets the OS allocate an actual ephemeral port.
  await new Promise((resolve, reject) => {
    server.httpServer.once("error", reject);
    server.httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = server.httpServer.address();
  assert(address && typeof address !== "string");
  assert(![8080, 8081].includes(address.port), "Fixture must never use an application port");
  report.isolation.port = address.port;
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`Isolated fixture: ${origin}${fixturePath}`);
  for (const browserType of [chromium, webkit]) {
    const candidates = await cachedExecutables(browserType);
    const engine = { name: browserType.name(), status: "skipped", launchAttempts: [] };
    report.engines.push(engine);
    if (!candidates.length) {
      engine.reason = "No executable in installed or bundled browser caches; nothing installed or downloaded.";
      console.log(`SKIP ${engine.name}: ${engine.reason}`);
      if (browserType === chromium) failed = true;
      continue;
    }
    let browser;
    for (const candidate of candidates) {
      try {
        browser = await browserType.launch({ headless: true, executablePath: candidate, timeout: 20000 });
        engine.executable = candidate;
        engine.version = browser.version();
        engine.status = "tested";
        break;
      } catch (error) { engine.launchAttempts.push({ executable: candidate, error: error.message }); }
    }
    if (!browser) { engine.status = "failed"; failed = true; continue; }
    try { for (const viewport of viewports) await runViewport(browser, engine, viewport, origin); }
    finally { await browser.close(); }
  }
} catch (error) {
  failed = true;
  report.error = error.stack || String(error);
  console.error(error);
} finally {
  if (server) await server.close();
  await rm(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.passed = !failed && report.results.length > 0 && report.results.every(result => result.passed);
  await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${path.join(output, "browser-report.json")}`);
}
if (failed) process.exitCode = 1;
