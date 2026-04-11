async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function refreshState() {
  const command = await requestJson("/api/command-center/state");
  const board = await requestJson("/api/board/queue");
  const events = await requestJson("/api/events");

  document.getElementById("command-state").textContent = JSON.stringify(command.data, null, 2);
  document.getElementById("board-queue").textContent = JSON.stringify(board.data, null, 2);
  document.getElementById("events-list").textContent = JSON.stringify(events.data, null, 2);
}

async function submitIntake(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  const result = await requestJson("/api/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  document.getElementById("intake-result").textContent = JSON.stringify(result, null, 2);

  const opportunityId = result?.data?.data?.opportunity?.opportunityId;
  if (opportunityId) {
    document.querySelector('#advance-form input[name="opportunityId"]').value = opportunityId;
  }

  await refreshState();
}

async function submitAdvance(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  const opportunityId = payload.opportunityId;
  const actorId = payload.actorId;
  const actorRole = payload.actorRole;
  delete payload.opportunityId;
  delete payload.actorId;
  delete payload.actorRole;

  const result = await requestJson(`/api/opportunities/${opportunityId}/advance`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-actor-id": actorId,
      "x-actor-role": actorRole
    },
    body: JSON.stringify(payload)
  });

  document.getElementById("advance-result").textContent = JSON.stringify(result, null, 2);
  await refreshState();
}

document.getElementById("intake-form").addEventListener("submit", submitIntake);
document.getElementById("advance-form").addEventListener("submit", submitAdvance);
document.getElementById("refresh-state").addEventListener("click", refreshState);
refreshState();
