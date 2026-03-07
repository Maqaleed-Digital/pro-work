'use strict';

class RBACService {

  constructor() {
    this.assignments = new Map();
  }

  assignRole(userId, role) {
    this.assignments.set(userId, role);
  }

  checkAccess(userId, requiredRole) {
    const role = this.assignments.get(userId);
    return role === requiredRole;
  }

}

module.exports = new RBACService();
