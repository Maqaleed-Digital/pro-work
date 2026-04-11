export type BaseRequestContext = {
  actorId: string;
  actorRole: string;
  entityScope?: string;
  correlationId?: string;
};

export type InvalidityResult = {
  blocked: boolean;
  reasons: string[];
};

export type AuditMetadata = {
  eventType: string;
  emittedAt: string;
  actorId: string;
};

export type GovernedResponseEnvelope<T> = {
  ok: boolean;
  data?: T;
  invalidity?: InvalidityResult;
  audit?: AuditMetadata;
};
