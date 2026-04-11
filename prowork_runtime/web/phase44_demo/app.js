async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function refreshState() {
  const stateEl = document.getElementById("command-state");
  const oppEl = document.getElementById("opportunity-list");

  const state = await getJson("/api/command-center/state");
  const opps = await getJson("/api/opportunities");

  stateEl.textContent = JSON.stringify(state.data, null, 2);
  oppEl.textContent = JSON.stringify(opps.data, null, 2);
}

async function submitIntake(event) {
  event.preventDefault();
  const form = event.target;
  const resultEl = document.getElementById("intake-result");
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const result = await getJson("/api/intake", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  resultEl.textContent = JSON.stringify({
    ok: result.ok,
    status: result.status,
    body: result.data
  }, null, 2);

  await refreshState();
}

document.getElementById("intake-form").addEventListener("submit", submitIntake);
document.getElementById("refresh-state").addEventListener("click", refreshState);
refreshState();
