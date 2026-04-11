const API = "http://localhost:43150";

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

document.getElementById("btnCreatePack").addEventListener("click", async () => {
  const daId = document.getElementById("deliveryArtifactId").value.trim();
  if (!daId) { show("packResult", { error: "Delivery Artifact ID required" }); return; }
  const r = await api("POST", `/api/delivery-artifacts/${daId}/evidence-packs`, {
    title: document.getElementById("packTitle").value.trim(),
    summary: document.getElementById("packSummary").value.trim(),
    packType: document.getElementById("packType").value
  });
  show("packResult", r);
});

document.getElementById("btnGetPacks").addEventListener("click", async () => {
  const r = await api("GET", "/api/evidence-packs");
  show("packsResult", r);
});

document.getElementById("btnGetArtifacts").addEventListener("click", async () => {
  const r = await api("GET", "/api/delivery-artifacts");
  show("artifactsResult", r);
});

document.getElementById("btnGetState").addEventListener("click", async () => {
  const r = await api("GET", "/api/state");
  show("stateResult", r);
});
