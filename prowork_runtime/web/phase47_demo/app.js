const BASE = "http://127.0.0.1:43147";
const ACTOR = { "x-actor-id": "operator-001", "x-actor-role": "board_operator" };

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
    body: JSON.stringify(body)
  });
  return res.json();
}

document.getElementById("btn-state").addEventListener("click", async () => {
  display("out-state", await apiGet("/api/command-center/state"));
});

document.getElementById("btn-intake").addEventListener("click", async () => {
  const body = {
    tenantId: document.getElementById("in-tenant").value,
    requesterId: document.getElementById("in-requester").value,
    title: document.getElementById("in-title").value,
    summary: document.getElementById("in-summary").value
  };
  const result = await apiPost("/api/intake", body);
  display("out-intake", result);
  if (result.data && result.data.opportunity) {
    const oppId = result.data.opportunity.opportunityId;
    document.getElementById("in-advance-opp").value = oppId;
    document.getElementById("in-approve-opp").value = oppId;
    document.getElementById("in-wi-opp").value = oppId;
  }
});

document.getElementById("btn-advance").addEventListener("click", async () => {
  const oppId = document.getElementById("in-advance-opp").value;
  display("out-advance", await apiPost(
    `/api/opportunities/${oppId}/advance`,
    { toStage: "BOARD_REVIEW" },
    ACTOR
  ));
});

document.getElementById("btn-approve").addEventListener("click", async () => {
  const oppId = document.getElementById("in-approve-opp").value;
  const reason = document.getElementById("in-approve-reason").value;
  display("out-approve", await apiPost(
    `/api/opportunities/${oppId}/approve`,
    { reason },
    ACTOR
  ));
});

document.getElementById("btn-wi").addEventListener("click", async () => {
  const oppId = document.getElementById("in-wi-opp").value;
  const body = {
    title: document.getElementById("in-wi-title").value,
    summary: document.getElementById("in-wi-summary").value
  };
  display("out-wi", await apiPost(
    `/api/opportunities/${oppId}/work-items`,
    body,
    ACTOR
  ));
});

document.getElementById("btn-queue").addEventListener("click", async () => {
  display("out-queue", await apiGet("/api/execution/queue"));
});

document.getElementById("btn-work-items").addEventListener("click", async () => {
  display("out-work-items", await apiGet("/api/work-items"));
});

document.getElementById("btn-events").addEventListener("click", async () => {
  display("out-events", await apiGet("/api/events"));
});
