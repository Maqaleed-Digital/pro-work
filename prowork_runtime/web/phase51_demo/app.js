const API = "";

let currentCertificationId = "";

function headers() {
  return {
    "content-type": "application/json",
    "x-actor-id": document.getElementById("actorId").value.trim(),
    "x-actor-role": document.getElementById("actorRole").value
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function refreshState() {
  const command = await requestJson(`${API}/api/command-center/state`);
  const events = await requestJson(`${API}/api/events`);
  let cert = { data: "No certification yet" };
  let audit = { data: "No audit export yet" };

  if (currentCertificationId) {
    cert = await requestJson(`${API}/api/certifications/${currentCertificationId}`);
    audit = await requestJson(`${API}/api/certifications/${currentCertificationId}/audit-export`);
  }

  document.getElementById("command-state").textContent = JSON.stringify(command.data, null, 2);
  document.getElementById("certification-detail").textContent = JSON.stringify(cert.data, null, 2);
  document.getElementById("audit-export").textContent = JSON.stringify(audit.data, null, 2);
  document.getElementById("events-list").textContent = JSON.stringify(events.data, null, 2);
}

document.getElementById("cert-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const epId = document.getElementById("epId").value.trim();
  if (!epId) { document.getElementById("cert-result").textContent = "Evidence Pack ID required"; return; }
  const r = await requestJson(`${API}/api/evidence-packs/${epId}/certifications`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: e.target.title.value.trim(),
      summary: e.target.summary.value.trim(),
      certificationType: e.target.certificationType.value.trim()
    })
  });
  document.getElementById("cert-result").textContent = JSON.stringify(r.data, null, 2);
  if (r.ok && r.data.data && r.data.data.item) {
    currentCertificationId = r.data.data.item.certificationId;
    refreshState();
  }
});

document.getElementById("refresh").addEventListener("click", refreshState);
refreshState();
