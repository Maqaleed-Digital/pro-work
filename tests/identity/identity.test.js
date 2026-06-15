'use strict';
const test = require('node:test');
const assert = require('node:assert');
const tokenService = require('../../app/modules/identity/identity_token_service');
const projectExecutionProfile = require('../../app/modules/identity/execution_profile_projection');
const generateReputationSnapshot = require('../../app/modules/identity/reputation_snapshot');
const seedIdentityGraph = require('../../app/modules/identity/identity_graph_seed');

test('identity token issuance returns token type', () => {
  const token = tokenService.issueToken({
    token_id: 'tok-1',
    owner_user_id: 'user-1',
    token_type: 'PROJECT_COMPLETION_TOKEN',
    payload_hash: 'sha256-1'
  });
  assert.equal(token.token_type, 'PROJECT_COMPLETION_TOKEN');
  assert.equal(token.owner_user_id, 'user-1');
});

test('execution profile projection aggregates records', () => {
  const profile = projectExecutionProfile([
    { type: 'PROJECT_COMPLETED' },
    { type: 'PHR_APPROVED' },
    { type: 'TEAM_LEAD' },
    { type: 'COMPLIANCE_VERIFIED' }
  ]);
  assert.equal(profile.completed_projects, 1);
  assert.equal(profile.approved_reviews, 1);
  assert.equal(profile.leadership_acts, 1);
  assert.equal(profile.compliance_verifications, 1);
});

test('reputation snapshot returns expected rank', () => {
  const snapshot = generateReputationSnapshot({
    completed_projects: 3,
    approved_reviews: 2,
    leadership_acts: 1,
    compliance_verifications: 1
  });
  assert.equal(snapshot.score, 51);
  assert.equal(snapshot.rank, 'ELITE');
});

test('identity graph seed returns edge count', () => {
  const graph = seedIdentityGraph([
    { user_id: 'u1', relation: 'worked_on', to_ref: 'project-1' },
    { user_id: 'u1', relation: 'used_agent', to_ref: 'agent-1' }
  ]);
  assert.equal(graph.edge_count, 2);
});
