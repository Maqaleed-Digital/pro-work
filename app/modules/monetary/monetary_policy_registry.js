'use strict';

function clone(v){ return JSON.parse(JSON.stringify(v)); }

class MonetaryPolicyRegistry {

  constructor(){
    this.policies = new Map();
  }

  registerPolicy(input){

    const id = input.policy_id;
    if(!id) throw new Error("POLICY_ID_REQUIRED");

    const rec = {
      policy_id: id,
      inflation_target: Number(input.inflation_target || 0.02),
      liquidity_growth_cap: Number(input.liquidity_growth_cap || 0.15),
      reserve_floor_ratio: Number(input.reserve_floor_ratio || 1),
      created_at: new Date().toISOString()
    };

    this.policies.set(id,rec);
    return clone(rec);
  }

  getPolicy(id){
    const p = this.policies.get(id);
    return p ? clone(p) : null;
  }

  listPolicies(){
    return Array.from(this.policies.values()).map(clone);
  }

}

module.exports = {
  MonetaryPolicyRegistry
};
