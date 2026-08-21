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

  function routeCoordinates(data) {
    const geometry = data?.features?.[0]?.geometry;
    if (!geometry) return [];
    const lines = geometry.type === 'LineString' ? [geometry.coordinates]
      : geometry.type === 'MultiLineString' ? geometry.coordinates
        : [];
    return lines.flat().map(coordinates => ({
      lat:Number(coordinates?.[1]),
      lon:Number(coordinates?.[0])
    })).filter(validPoint);
  }

  function distanceToSegment(point, start, end) {
    if (!validPoint(point) || !validPoint(start) || !validPoint(end)) return Infinity;
    const referenceLat = Number(point.lat) * Math.PI / 180;
    const metresPerLonDegree = 111320 * Math.cos(referenceLat);
    const metresPerLatDegree = 110540;
    const ax = (Number(start.lon) - Number(point.lon)) * metresPerLonDegree;
    const ay = (Number(start.lat) - Number(point.lat)) * metresPerLatDegree;
    const bx = (Number(end.lon) - Number(point.lon)) * metresPerLonDegree;
    const by = (Number(end.lat) - Number(point.lat)) * metresPerLatDegree;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    return Math.hypot(ax + dx * ratio, ay + dy * ratio);
  }

  function routeSteps(data) {
    const properties = data?.features?.[0]?.properties || {};
    const legs = Array.isArray(properties.legs) ? properties.legs : [];
    return legs.flatMap(leg => Array.isArray(leg.steps) ? leg.steps : []).map(step => {
      const instruction = typeof step.instruction === 'string' ? step.instruction
        : step.instruction?.text || step.instruction?.transition_instruction
          || step.text || step.name || 'Continue along the highlighted route.';
      const fromIndex = Number(step.from_index ?? step.fromIndex ?? 0);
      const toIndex = Number(step.to_index ?? step.toIndex ?? fromIndex);
      return {
        instruction,
        fromIndex:Number.isFinite(fromIndex) ? fromIndex : 0,
        toIndex:Number.isFinite(toIndex) ? toIndex : fromIndex,
        distance:Number(step.distance) || 0
      };
    });
  }

  function routeGuidance(data, location) {
    const coordinates = routeCoordinates(data);
    if (!coordinates.length || !validPoint(location)) return null;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    coordinates.forEach((coordinate, index) => {
      const distance = metresBetween(location, coordinate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    let offRouteDistance = nearestDistance;
    for (let index = 1; index < coordinates.length; index++) {
      offRouteDistance = Math.min(offRouteDistance,distanceToSegment(location,coordinates[index - 1],coordinates[index]));
    }
    const progress = coordinates.length > 1 ? nearestIndex / (coordinates.length - 1) : 1;
    const steps = routeSteps(data);
    const step = steps.find(candidate => candidate.toIndex >= nearestIndex) || steps[steps.length - 1] || null;
    const cuePoint = step ? coordinates[Math.min(coordinates.length - 1,Math.max(0,step.toIndex))] : null;
    const totalDistance = Number(data?.features?.[0]?.properties?.distance) || 0;
    return {
      instruction:step?.instruction || 'Continue along the highlighted route.',
      distanceToCue:cuePoint ? metresBetween(location,cuePoint) : 0,
      offRouteDistance,
      progress:Math.min(1,Math.max(0,progress)),
      remainingDistance:Math.max(0,totalDistance * (1 - progress)),
      nearestIndex
    };
  }

  return {
    metresBetween,
    distanceRouteCheckpoints,
    checkpointArrivalRadius,
    advanceDistanceCheckpoint,
    routeCoordinates,
    routeGuidance
  };
}));
