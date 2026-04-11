export type GovernedStatus =
  | "draft"
  | "active"
  | "blocked"
  | "escalated"
  | "resolved"
  | "certified"
  | "invalid";

export type EvidenceRef = {
  evidenceId?: string;
  manifestPath?: string;
};

export type InvalidityState = {
  isInvalid: boolean;
  reasons: string[];
};

export type EscalationState = {
  isEscalated: boolean;
  escalationLevel?: "local" | "shared" | "executive" | "board";
};

export type BaseGovernedObject = {
  id: string;
  objectType: string;
  status: GovernedStatus;
  ownerScope: string;
  evidence: EvidenceRef;
  invalidity: InvalidityState;
  escalation: EscalationState;
  createdAt: string;
  updatedAt: string;
};

export type Entity = BaseGovernedObject & { objectType: "entity"; entityCode: string };
export type IntakeRecord = BaseGovernedObject & { objectType: "intake_record"; sourceClass: string };
export type Opportunity = BaseGovernedObject & { objectType: "opportunity"; opportunityName: string };
export type Deal = BaseGovernedObject & { objectType: "deal"; dealName: string };
export type AllocationDecision = BaseGovernedObject & { objectType: "allocation_decision"; allocationClass: string };
export type ScenarioState = BaseGovernedObject & { objectType: "scenario_state"; scenarioClass: string };
export type ReserveAction = BaseGovernedObject & { objectType: "reserve_action"; reserveClass: string };
export type EscalationRecord = BaseGovernedObject & { objectType: "escalation_record"; issueClass: string };
export type InterventionRecord = BaseGovernedObject & { objectType: "intervention_record"; interventionClass: string };
export type AssurancePack = BaseGovernedObject & { objectType: "assurance_pack"; audienceClass: string };
export type CertificationState = BaseGovernedObject & { objectType: "certification_state"; certificationClass: string };
export type AccountabilityCase = BaseGovernedObject & { objectType: "accountability_case"; breachClass: string };
export type RemediationCycle = BaseGovernedObject & { objectType: "remediation_cycle"; remediationOwner: string };
export type PortfolioCommandState = BaseGovernedObject & { objectType: "portfolio_command_state"; commandScope: string };
