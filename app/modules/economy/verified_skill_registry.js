'use strict';

class VerifiedSkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(userId, skill) {
    const list = this.skills.get(userId) || [];
    list.push(skill);
    this.skills.set(userId, list);
    return { user_id: userId, skill_registered: skill };
  }

  getSkills(userId) {
    return this.skills.get(userId) || [];
  }
}

module.exports = new VerifiedSkillRegistry();
