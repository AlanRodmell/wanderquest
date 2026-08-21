(function exposeRouteProgress(root, factory) {
  const progress = factory();
  if (typeof module === 'object' && module.exports) module.exports = progress;
  root.WanderQuestRouteProgress = progress;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRouteProgress() {
  const EARTH_RADIUS_METRES = 6371000;

  function validPoint(point) {
    return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon));
  }

  function metresBetween(a, b) {
    if (!validPoint(a) || !validPoint(b)) return Infinity;
    const toRadians = value => value * Math.PI / 180;
    const lat1 = toRadians(Number(a.lat));
    const lat2 = toRadians(Number(b.lat));
    const deltaLat = lat2 - lat1;
    const deltaLon = toRadians(Number(b.lon) - Number(a.lon));
    const h = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function checkpoint(point, label, kind) {
    return {...point, label, kind};
  }

  function distanceRouteCheckpoints(plan = {}) {
    const points = Array.isArray(plan.points) ? plan.points.filter(validPoint) : [];
    const origin = validPoint(plan.origin) ? plan.origin : points[0];

    if (plan.shape === 'point') {
      const finish = validPoint(plan.end) ? plan.end : points[points.length - 1];
      return validPoint(finish)
        ? [checkpoint(finish, plan.place?.name || 'Route finish', 'finish')]
        : [];
    }

    if (plan.shape === 'outback') {
      const turnaround = validPoint(plan.turnaround) ? plan.turnaround : points[1];
      const result = [];
      if (validPoint(turnaround)) result.push(checkpoint(turnaround, plan.place?.name || 'Turnaround point', 'turnaround'));
      if (validPoint(origin)) result.push(checkpoint(origin, 'Starting point', 'finish'));
      return result;
    }

    if (plan.shape === 'loop') {
      const middle = points.slice(1, -1).filter((point, index, candidates) => (
        !validPoint(origin)
        || (metresBetween(origin, point) > 30
          && candidates.slice(0, index).every(existing => metresBetween(existing, point) > 30))
      ));
      const routePoints = middle.length ? middle : (validPoint(plan.place) ? [plan.place] : []);
      const result = routePoints.map((point, index) => checkpoint(
        point,
        index === 0 && plan.place?.name ? plan.place.name : `Waypoint ${index + 1}`,
        'waypoint'
      ));
      if (validPoint(origin)) result.push(checkpoint(origin, 'Starting point', 'finish'));
      return result;
    }

    return [];
  }

  function checkpointArrivalRadius(location, baseRadius = 80) {
    const accuracy = Math.max(0, Number(location?.accuracy) || 0);
    return Math.min(150, Math.max(baseRadius, accuracy + 40));
  }

  function advanceDistanceCheckpoint(plan, currentIndex, location) {
    const checkpoints = distanceRouteCheckpoints(plan);
    const index = Math.max(0, Math.min(checkpoints.length, Number(currentIndex) || 0));
    const next = checkpoints[index] || null;
    if (!next) return {index, checkpoints, next:null, reached:null, complete:true, distance:0, threshold:0};

    const distance = metresBetween(location, next);
    const threshold = checkpointArrivalRadius(location);
    if (distance > threshold) {
      return {index, checkpoints, next, reached:null, complete:false, distance, threshold};
    }

    const nextIndex = index + 1;
    return {
      index:nextIndex,
      checkpoints,
      next:checkpoints[nextIndex] || null,
      reached:next,
      complete:nextIndex >= checkpoints.length,
      distance,
      threshold
    };
  }

  return {
    metresBetween,
    distanceRouteCheckpoints,
    checkpointArrivalRadius,
    advanceDistanceCheckpoint
  };
}));
