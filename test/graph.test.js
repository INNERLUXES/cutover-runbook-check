import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestorsOf, buildGraph, components, cyclesOf, descendantsOf, longestPath } from '../src/index.js';

// The graph of the dependencies: duplicates and unknown ids, ancestors, cycles and the longest chain.

const steps = (spec) => spec.map(([id, deps = [], duration = 0]) => ({ id, dependsOn: deps, duration }));
const ids = (graph, list) => list.map((v) => graph.nodes[v].id);

test('graph: the first step with an id is the node, and unknown ids are kept apart', () => {
  const g = buildGraph([...steps([['a'], ['b', ['a', 'x']], ['a', ['b']]]), { id: '', dependsOn: ['a'], duration: 0 }]);
  assert.deepEqual(g.nodes.map((s) => s.id), ['a', 'b']);
  assert.deepEqual(g.deps, [[], [0]]);
  assert.deepEqual(g.unknown, [[], ['x']]);
  assert.equal(g.index.get('b'), 1);
});

test('graph: the ancestors of a step, directly and through others, and the step itself only in a cycle', () => {
  const g = buildGraph(steps([['a'], ['b', ['a']], ['c', ['b']], ['d', ['c', 'a']], ['e']]));
  assert.deepEqual(ids(g, [...ancestorsOf(g, 3)]).sort(), ['a', 'b', 'c']);
  assert.deepEqual([...ancestorsOf(g, 4)], []);
  const c = buildGraph(steps([['a', ['b']], ['b', ['a']]]));
  assert.deepEqual([...ancestorsOf(c, 0)].sort(), [0, 1]);
});

test('graph: strongly connected parts and cycles, with a shortest way round each, and a step that depends on itself', () => {
  const g = buildGraph(steps([['a', ['c']], ['b', ['a']], ['c', ['b', 'd']], ['d', ['e']], ['e', ['d']], ['f', ['f']], ['g', ['a']]]));
  assert.deepEqual(components(g).map((p) => ids(g, p)), [['a', 'b', 'c'], ['d', 'e'], ['f'], ['g']]);
  const cycles = cyclesOf(g);
  assert.deepEqual(cycles.map((c) => ids(g, c.path)), [['a', 'c', 'b', 'a'], ['d', 'e', 'd'], ['f', 'f']]);
  assert.deepEqual(cyclesOf(buildGraph(steps([['a'], ['b', ['a']]]))), []);
});

test('graph: the longest chain by weight, with ties going to the earlier steps', () => {
  const g = buildGraph(steps([['a', [], 10], ['b', ['a'], 5], ['c', ['a'], 5], ['d', ['b', 'c'], 1], ['e', [], 20]]));
  const p = longestPath(g, (s) => s.duration);
  assert.equal(p.weight, 20);
  assert.deepEqual(ids(g, p.chain), ['e']);
  const h = buildGraph(steps([['a', [], 10], ['b', ['a'], 5], ['c', ['a'], 5], ['d', ['c', 'b'], 1]]));
  assert.deepEqual(ids(h, longestPath(h, (s) => s.duration).chain), ['a', 'b', 'd'], 'b and c tie; b comes first in the file');
  assert.deepEqual(longestPath(buildGraph([]), () => 1), { weight: 0, chain: [] });
});

test('graph: the edges inside a cycle are left out of the longest chain, and the rest still counts', () => {
  const g = buildGraph(steps([['a', [], 10], ['b', ['a', 'c'], 5], ['c', ['b'], 7], ['d', ['c'], 1]]));
  const p = longestPath(g, (s) => s.duration);
  assert.equal(p.weight, 15);
  assert.deepEqual(ids(g, p.chain), ['a', 'b'], 'b no longer waits for c, and d starts from c alone (7 + 1)');
  assert.equal(longestPath(buildGraph(steps([['a', ['a'], 4]])), (s) => s.duration).weight, 4);
});

test('graph: the steps after a set of steps, in one walk, with a start step only when it comes after another', () => {
  const g = buildGraph(steps([['a'], ['b', ['a']], ['c', ['b']], ['d'], ['e', ['d', 'c']]]));
  assert.deepEqual(ids(g, [...descendantsOf(g, [0])]).sort(), ['b', 'c', 'e']);
  assert.deepEqual(ids(g, [...descendantsOf(g, [0, 1])]).sort(), ['b', 'c', 'e'], 'b is a start, and also after a');
  assert.deepEqual([...descendantsOf(g, [])], []);
  assert.deepEqual(g.users, [[1], [2], [4], [4], []]);
});
