'use strict';

class CredentialStakingRegistry {
  constructor() {
    this.stakes = new Map();
  }

  stake(credentialId, amount) {
    this.stakes.set(credentialId, amount);
    return { credential_id: credentialId, staked_amount: amount };
  }

  getStake(credentialId) {
    return this.stakes.get(credentialId) || 0;
  }
}

module.exports = new CredentialStakingRegistry();
