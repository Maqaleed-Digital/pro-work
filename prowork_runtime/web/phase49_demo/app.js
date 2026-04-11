const BASE = "http://127.0.0.1:43149";
const ACTOR = { "x-actor-id": "operator-001", "x-actor-role": "board_operator" };

let currentWorkItemId = "";

function display(id, data) {
  document.getElementById(id).textContent = JSON.stringify(data, null, 2);
}

async function apiGet(path) {
  const res = await fetch(BASE + path);
  return res.json();
}

async function apiPost(path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

async function refresh() {
  const state = await apiGet("/api/command-center/state");
  display("out-state", state);
  if (currentWorkItemId) {
    const artifacts = await apiGet(`/api/work-items/${currentWorkItemId}/delivery-artifacts`);
    display("out-artifacts", artifacts);
  }
}

document.getElementById("btn-setup").addEventListener("click", async () => {
  const intake = await apiPost("/api/intake", { tenantId: "tenant-alpha", requesterId: "user-001", title: "Delivery Evidence Initiative", summary: "Governed initiative for delivery evidence artifact activation" });
  const oppId = intake?.data?.opportunity?.opportunityId || "";
  await apiPost(`/api/opportunities/${oppId}/advance`, { toStage: "BOARD_REVIEW" }, ACTOR);
  await apiPost(`/api/opportunities/${oppId}/approve`, { reason: "Approved for delivery evidence activation" }, ACTOR);
  const wi = await apiPost(`/api/opportunities/${oppId}/work-items`, { title: "Execution Closure Pack", summary: "Assemble and complete the execution closure pack" }, ACTOR);
  currentWorkItemId = wi?.data?.item?.workItemId || "";
  await apiPost(`/api/work-items/${currentWorkItemId}/start`, null, ACTOR);
  await apiPost(`/api/work-items/${currentWorkItemId}/complete`, null, ACTOR);
  display("out-setup", { opportunityId: oppId, workItemId: currentWorkItemId, status: "COMPLETED" });
  await refresh();
});

document.getElementById("btn-delivery").addEventListener("click", async () => {
  const result = await apiPost(`/api/work-items/${currentWorkItemId}/delivery-artifacts`, {
    title: document.getElementById("in-title").value,
    summary: document.getElementById("in-summary").value,
    artifactType: document.getElementById("in-type").value
  }, ACTOR);
  display("out-delivery", result);
  await refresh();
});

document.getElementById("btn-refresh").addEventListener("click", refresh);
document.getElementById("btn-events").addEventListener("click", async () => {
  display("out-events", await apiGet("/api/events"));
});

refresh();
