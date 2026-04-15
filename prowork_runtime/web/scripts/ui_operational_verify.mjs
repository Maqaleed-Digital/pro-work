import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.split("=");
    return [k.replace(/^--/, ""), rest.join("=")];
  })
);

const baseUrl = args.get("base-url");
const frontendRoot = args.get("frontend-root");
const reportJson = args.get("report-json");
const reportMd = args.get("report-md");
const routerMode = args.get("router-mode");
const concurrency = Number(args.get("concurrency") || 10);
const rounds = Number(args.get("rounds") || 5);

if (!baseUrl || !frontendRoot || !reportJson || !reportMd || !routerMode) {
  console.error("Missing required args");
  process.exit(1);
}

const publicRoot = path.join(frontendRoot, "public", "prowork-wave1");

const fileChecks = [
  "README.md","styles.css","app.js","index.html",
  "control-tower.html","operations.html","verticals.html","onboarding.html",
].map((name) => path.join(publicRoot, name));

const routeFileChecks = routerMode === "app"
  ? [
      path.join(frontendRoot, "src", "app", "page.tsx"),
      path.join(frontendRoot, "src", "app", "control-tower", "page.tsx"),
      path.join(frontendRoot, "src", "app", "operations", "page.tsx"),
      path.join(frontendRoot, "src", "app", "verticals", "page.tsx"),
      path.join(frontendRoot, "src", "app", "onboarding", "page.tsx"),
    ]
  : [
      path.join(frontendRoot, "pages", "index.tsx"),
      path.join(frontendRoot, "pages", "control-tower.tsx"),
      path.join(frontendRoot, "pages", "operations.tsx"),
      path.join(frontendRoot, "pages", "verticals.tsx"),
      path.join(frontendRoot, "pages", "onboarding.tsx"),
    ];

const liveRouteExpectations = [
  { route: "/", iframeSrc: "/prowork-wave1/index.html" },
  { route: "/control-tower", iframeSrc: "/prowork-wave1/control-tower.html" },
  { route: "/operations", iframeSrc: "/prowork-wave1/operations.html" },
  { route: "/verticals", iframeSrc: "/prowork-wave1/verticals.html" },
  { route: "/onboarding", iframeSrc: "/prowork-wave1/onboarding.html" },
];

const staticPageExpectations = [
  {
    page: "/prowork-wave1/index.html",
    markers: [
      "One platform to orchestrate work, govern AI, prove trust, and activate revenue.",
      "Product packages","Outcome-first product narrative","Start Tenant Demo",
    ],
    navHrefs: ["control-tower.html","operations.html","verticals.html","onboarding.html"],
  },
  {
    page: "/prowork-wave1/control-tower.html",
    markers: ["Executive command across work, AI, trust, and revenue.","KPI command","Decision center","Board view"],
    navHrefs: ["index.html","operations.html","verticals.html","onboarding.html"],
  },
  {
    page: "/prowork-wave1/operations.html",
    markers: ["Live operations across workflows, playbooks, AI operators, and trust evidence.","Playbook registry","AI operator console","Trust"],
    navHrefs: ["index.html","control-tower.html","verticals.html","onboarding.html"],
  },
  {
    page: "/prowork-wave1/verticals.html",
    markers: ["Vertical solutions packaged for real buyers.","Consulting","Fintech / Credit","Industrial / Fertilizer / Supply Chain"],
    navHrefs: ["index.html","control-tower.html","operations.html","onboarding.html"],
  },
  {
    page: "/prowork-wave1/onboarding.html",
    markers: ["From signed buyer to live tenant activation.","Onboarding flow","Tenant onboarding form","Submit onboarding demo"],
    navHrefs: ["index.html","control-tower.html","operations.html","verticals.html"],
  },
];

const assetExpectations = [
  "/prowork-wave1/styles.css","/prowork-wave1/app.js","/prowork-wave1/index.html",
  "/prowork-wave1/control-tower.html","/prowork-wave1/operations.html",
  "/prowork-wave1/verticals.html","/prowork-wave1/onboarding.html",
];

function exists(p) { return fs.existsSync(p); }

async function fetchText(url) {
  const started = Date.now();
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  return { url, status: res.status, ok: res.ok, ms: Date.now() - started, text, contentType: res.headers.get("content-type") || "" };
}

const results = {
  timestamp: new Date().toISOString(), baseUrl, frontendRoot, routerMode,
  fileChecks: [], routeFileChecks: [], liveRoutes: [], staticPages: [], assets: [],
  concurrency: { concurrency, rounds, totalRequests: 0, failures: 0, avgMs: 0, maxMs: 0, results: [] },
  summary: { pass: true, failures: [] },
};

for (const p of fileChecks) {
  const ok = exists(p);
  results.fileChecks.push({ path: p, ok });
  if (!ok) { results.summary.pass = false; results.summary.failures.push(`Missing public runtime asset: ${p}`); }
}

for (const p of routeFileChecks) {
  const ok = exists(p);
  results.routeFileChecks.push({ path: p, ok });
  if (!ok) { results.summary.pass = false; results.summary.failures.push(`Missing production route file: ${p}`); }
}

for (const item of liveRouteExpectations) {
  const out = await fetchText(`${baseUrl}${item.route}`);
  const iframeOk = out.text.includes(`src="${item.iframeSrc}"`) || out.text.includes(`src='${item.iframeSrc}'`);
  const pass = out.ok && iframeOk;
  results.liveRoutes.push({ route: item.route, status: out.status, ms: out.ms, iframeSrcExpected: item.iframeSrc, iframeOk, pass });
  if (!pass) { results.summary.pass = false; results.summary.failures.push(`Live route wrapper failed: ${item.route}`); }
}

for (const item of staticPageExpectations) {
  const out = await fetchText(`${baseUrl}${item.page}`);
  const markerMisses = item.markers.filter((m) => !out.text.includes(m));
  const navMisses = item.navHrefs.filter((href) => !out.text.includes(`href="${href}"`) && !out.text.includes(`href='${href}'`));
  const pass = out.ok && markerMisses.length === 0 && navMisses.length === 0;
  results.staticPages.push({ page: item.page, status: out.status, ms: out.ms, markerMisses, navMisses, pass });
  if (!pass) { results.summary.pass = false; results.summary.failures.push(`Static page content failed: ${item.page}`); }
}

for (const asset of assetExpectations) {
  const out = await fetchText(`${baseUrl}${asset}`);
  results.assets.push({ asset, status: out.status, ms: out.ms, pass: out.ok });
  if (!out.ok) { results.summary.pass = false; results.summary.failures.push(`Asset fetch failed: ${asset}`); }
}

const concurrencyTargets = [
  "/","/control-tower","/operations","/verticals","/onboarding",
  "/prowork-wave1/index.html","/prowork-wave1/control-tower.html",
  "/prowork-wave1/operations.html","/prowork-wave1/verticals.html","/prowork-wave1/onboarding.html",
];

for (let r = 0; r < rounds; r++) {
  const batch = [];
  for (let c = 0; c < concurrency; c++) {
    const target = concurrencyTargets[(r * concurrency + c) % concurrencyTargets.length];
    batch.push(
      fetchText(`${baseUrl}${target}`)
        .then((out) => ({ target, status: out.status, ms: out.ms, ok: out.ok }))
        .catch((err) => ({ target, status: 0, ms: 0, ok: false, error: String(err) }))
    );
  }
  results.concurrency.results.push(...await Promise.all(batch));
}

results.concurrency.totalRequests = results.concurrency.results.length;
results.concurrency.failures = results.concurrency.results.filter((x) => !x.ok).length;
const allLatencies = results.concurrency.results.map((x) => x.ms).filter((x) => typeof x === "number");
results.concurrency.avgMs = allLatencies.length > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : 0;
results.concurrency.maxMs = allLatencies.length > 0 ? Math.max(...allLatencies) : 0;

if (results.concurrency.failures > 0) {
  results.summary.pass = false;
  results.summary.failures.push(`Concurrency failures detected: ${results.concurrency.failures}`);
}

fs.writeFileSync(reportJson, JSON.stringify(results, null, 2));

const md = [];
md.push("# UI Operational Verification Report");
md.push("");
md.push(`- Base URL: ${baseUrl}`);
md.push(`- Frontend Root: ${frontendRoot}`);
md.push(`- Router Mode: ${routerMode}`);
md.push(`- Overall Status: ${results.summary.pass ? "PASS" : "FAIL"}`);
md.push("");
md.push("## Live Route Wrapper Checks");
for (const x of results.liveRoutes) {
  md.push(`- ${x.route} :: status=${x.status} iframeOk=${x.iframeOk} pass=${x.pass} latencyMs=${x.ms}`);
}
md.push("");
md.push("## Static Page Surface Checks");
for (const x of results.staticPages) {
  md.push(`- ${x.page} :: status=${x.status} pass=${x.pass} markerMisses=${x.markerMisses.length} navMisses=${x.navMisses.length} latencyMs=${x.ms}`);
}
md.push("");
md.push("## Asset Checks");
for (const x of results.assets) {
  md.push(`- ${x.asset} :: status=${x.status} pass=${x.pass} latencyMs=${x.ms}`);
}
md.push("");
md.push("## Concurrency");
md.push(`- requests=${results.concurrency.totalRequests}`);
md.push(`- failures=${results.concurrency.failures}`);
md.push(`- avgMs=${results.concurrency.avgMs}`);
md.push(`- maxMs=${results.concurrency.maxMs}`);
md.push("");
if (results.summary.failures.length > 0) {
  md.push("## Failures");
  for (const f of results.summary.failures) md.push(`- ${f}`);
}
fs.writeFileSync(reportMd, md.join("\n"));

if (!results.summary.pass) {
  console.error("VERIFICATION_FAILED");
  process.exit(1);
}
console.log("VERIFICATION_PASSED");
