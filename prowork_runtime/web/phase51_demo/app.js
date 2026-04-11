const API = "http://localhost:43151";

function headers() {
  return {
    "content-type": "application/json",
    "x-actor-id": document.getElementById("actorId").value.trim(),
    "x-actor-role": document.getElementById("actorRole").value
  };
}

async function api(method, path, body) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function show(id, result) {
  document.getElementById(id).textContent = JSON.stringify(result, null, 2);
}

document.getElementById("btnCreateCert").addEventListener("click", async () => {
  const epId = document.getElementById("evidencePackId").value.trim();
  if (!epId) { show("certResult", { error: "Evidence Pack ID required" }); return; }
  const r = await api("POST", `/api/evidence-packs/${epId}/certifications`, {
    title: document.getElementById("certTitle").value.trim(),
    summary: document.getElementById("certSummary").value.trim(),
    certificationType: document.getElementById("certType").value
  });
  show("certResult", r);
});

document.getElementById("btnAuditExport").addEventListener("click", async () => {
  const certId = document.getElementById("certIdExport").value.trim();
  if (!certId) { show("auditResult", { error: "Certification ID required" }); return; }
  const r = await api("GET", `/api/certifications/${certId}/audit-export`);
  show("auditResult", r);
});

document.getElementById("btnGetCerts").addEventListener("click", async () => {
  const r = await api("GET", "/api/certifications");
  show("certsResult", r);
});

document.getElementById("btnGetState").addEventListener("click", async () => {
  const r = await api("GET", "/api/state");
  show("stateResult", r);
});
