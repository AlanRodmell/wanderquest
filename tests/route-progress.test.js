const test = require('node:test');
const assert = require('node:assert/strict');
const {
  distanceRouteCheckpoints,
  checkpointArrivalRadius,
  advanceDistanceCheckpoint,
  routeCoordinates,
  routeGuidance
} = require('../route-progress.js');

const origin = {lat:54.955,lon:-1.8803};
const first = {lat:54.959,lon:-1.875};
const second = {lat:54.957,lon:-1.868};

test('loop routes require every waypoint before returning to the start', () => {
  const plan = {shape:'loop',origin,points:[origin,first,second,origin]};
  const checkpoints = distanceRouteCheckpoints(plan);
  assert.deepEqual(checkpoints.map(point => point.label), ['Waypoint 1','Waypoint 2','Starting point']);

  const atStart = advanceDistanceCheckpoint(plan, 0, {...origin,accuracy:5});
  assert.equal(atStart.index, 0);
  assert.equal(atStart.complete, false);
  assert.equal(atStart.next.label, 'Waypoint 1');

  const atFirst = advanceDistanceCheckpoint(plan, 0, {...first,accuracy:5});
  assert.equal(atFirst.index, 1);
  assert.equal(atFirst.reached.label, 'Waypoint 1');
  const atSecond = advanceDistanceCheckpoint(plan, atFirst.index, {...second,accuracy:5});
  assert.equal(atSecond.index, 2);
  const returned = advanceDistanceCheckpoint(plan, atSecond.index, {...origin,accuracy:5});
  assert.equal(returned.complete, true);
  assert.equal(returned.reached.kind, 'finish');
});

test('out-and-back routes require the turnaround before the return', () => {
  const plan = {shape:'outback',origin,points:[origin,first],turnaround:first,place:{...first,name:'Old Mill'}};
  assert.deepEqual(distanceRouteCheckpoints(plan).map(point => point.label), ['Old Mill','Starting point']);
  assert.equal(advanceDistanceCheckpoint(plan, 0, origin).index, 0);
  const turned = advanceDistanceCheckpoint(plan, 0, first);
  assert.equal(turned.index, 1);
  assert.equal(advanceDistanceCheckpoint(plan, turned.index, origin).complete, true);
});

test('point-to-point routes complete only at their finish', () => {
  const plan = {shape:'point',origin,points:[origin,second],end:second,place:{...second,name:'Station'}};
  assert.equal(advanceDistanceCheckpoint(plan, 0, origin).complete, false);
  const finished = advanceDistanceCheckpoint(plan, 0, {...second,accuracy:12});
  assert.equal(finished.complete, true);
  assert.equal(finished.reached.label, 'Station');
});

test('arrival radius accounts for GPS accuracy but remains bounded', () => {
  assert.equal(checkpointArrivalRadius({accuracy:5}), 80);
  assert.equal(checkpointArrivalRadius({accuracy:70}), 110);
  assert.equal(checkpointArrivalRadius({accuracy:500}), 150);
});

test('guided mode derives instructions, progress and off-route distance', () => {
  const route = {
    type:'FeatureCollection',
    features:[{
      geometry:{type:'LineString',coordinates:[[-1.8803,54.955],[-1.8793,54.955],[-1.8783,54.955]]},
      properties:{
        distance:200,
        legs:[{steps:[
          {from_index:0,to_index:1,instruction:{text:'Continue east'}},
          {from_index:1,to_index:2,instruction:{text:'Turn right'}}
        ]}]
      }
    }]
  };
  assert.equal(routeCoordinates(route).length,3);
  const start=routeGuidance(route,{...origin,accuracy:5});
  assert.equal(start.instruction,'Continue east');
  assert.equal(start.progress,0);
  assert.ok(start.remainingDistance>190);
  const offRoute=routeGuidance(route,{lat:54.957,lon:-1.8793,accuracy:5});
  assert.ok(offRoute.offRouteDistance>150);
});
