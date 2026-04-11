const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.resolve(__dirname, "../../data");
const STATE_FILE = path.join(DATA_DIR, "phase49-runtime.json");

function nowIso() {
  return new Date().toISOString();
}

function ensureStateFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATE_FILE)) {
    const initialState = {
      version: "1.0",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      intakes: [],
      opportunities: [],
      approvals: [],
      workItems: [],
      workItemTransitions: [],
      deliveryArtifacts: [],
      events: []
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initialState, null, 2));
  }
}

function readState() {
  ensureStateFile();
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

function writeState(nextState) {
  ensureStateFile();
  nextState.updatedAt = nowIso();
  fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2));
  return nextState;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = { STATE_FILE, readState, writeState, id, nowIso };
