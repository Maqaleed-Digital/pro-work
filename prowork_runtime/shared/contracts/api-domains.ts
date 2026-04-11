export const API_DOMAINS = [
  "identity",
  "intake",
  "pipeline",
  "command",
  "allocation",
  "resilience",
  "federation",
  "assurance",
  "accountability",
  "certification"
] as const;

export type ApiDomain = (typeof API_DOMAINS)[number];
