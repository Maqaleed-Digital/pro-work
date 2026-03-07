'use strict';

function seedIdentityGraph(activities) {
  const edges = [];

  for (const activity of activities) {
    edges.push({
      from_user_id: activity.user_id,
      relation: activity.relation,
      to_ref: activity.to_ref
    });
  }

  return { edge_count: edges.length, edges };
}

module.exports = seedIdentityGraph;
