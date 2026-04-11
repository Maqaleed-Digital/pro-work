const BASE = "http://127.0.0.1:43148";
const ACTOR = { "x-actor-id": "operator-001", "x-actor-role": "board_operator" };

let oppId = "";
let wiAId = "";
let wiBId = "";

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
  const [queue, state] = await Promise.all([apiGet("/api/execution/queue"), apiGet("/api/command-center/state")]);
  display("out-queue", queue);
  display("out-state", state);
}

document.getElementById("btn-setup").addEventListener("click", async () => {
  const intake = await apiPost("/api/intake", { tenantId: "tenant-alpha", requesterId: "user-001", title: "Lifecycle Test Initiative", summary: "Governed initiative for lifecycle transition testing" });
  oppId = intake?.data?.opportunity?.opportunityId || "";
  await apiPost(`/api/opportunities/${oppId}/advance`, { toStage: "BOARD_REVIEW" }, ACTOR);
  await apiPost(`/api/opportunities/${oppId}/approve`, { reason: "Approved for lifecycle activation" }, ACTOR);
  display("out-setup", { opportunityId: oppId, stage: "APPROVED" });
  await refresh();
});

document.getElementById("btn-create-a").addEventListener("click", async () => {
  const res = await apiPost(`/api/opportunities/${oppId}/work-items`, { title: "Execution Command Pack", summary: "Assemble and complete the operational execution pack" }, ACTOR);
  wiAId = res?.data?.item?.workItemId || "";
  display("out-create", { workItemA: wiAId });
  await refresh();
});

document.getElementById("btn-create-b").addEventListener("click", async () => {
  const res = await apiPost(`/api/opportunities/${oppId}/work-items`, { title: "Dependency Collection", summary: "Collect delivery dependency inputs then move to blocked" }, ACTOR);
  wiBId = res?.data?.item?.workItemId || "";
  display("out-create", { workItemB: wiBId });
  await refresh();
});

document.getElementById("btn-start-a").addEventListener("click", async () => {
  display("out-lifecycle", await apiPost(`/api/work-items/${wiAId}/start`, null, ACTOR));
  await refresh();
});

document.getElementById("btn-start-b").addEventListener("click", async () => {
  display("out-lifecycle", await apiPost(`/api/work-items/${wiBId}/start`, null, ACTOR));
  await refresh();
});

document.getElementById("btn-complete-a").addEventListener("click", async () => {
  display("out-lifecycle", await apiPost(`/api/work-items/${wiAId}/complete`, null, ACTOR));
  await refresh();
});

document.getElementById("btn-block-b").addEventListener("click", async () => {
  display("out-lifecycle", await apiPost(`/api/work-items/${wiBId}/block`, null, ACTOR));
  await refresh();
});

document.getElementById("btn-refresh").addEventListener("click", refresh);
document.getElementById("btn-events").addEventListener("click", async () => {
  display("out-events", await apiGet("/api/events"));
});

refresh();
