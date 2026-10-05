// The dependencies of a runbook as a graph: one node per step with a readable id (the first step with an id, when two
// share it), and one edge from a step to each step it depends on that is in the runbook. Every walk of the graph is
// iterative, with no recursion, and reads each node and edge a fixed number of times, so a long chain of steps or a
// wide fan cannot exhaust the stack or the time. Every order is the order of the file, so the same runbook always gives
// the same cycles and the same critical path.

// The graph of a list of steps: { nodes: [step], index: Map of id to node, deps: [[node]], users: [[node]] (the nodes
// that depend on each node), unknown: [[id]] }.
export function buildGraph(steps) {
  const index = new Map();
  const nodes = [];
  for (const s of steps) {
    if (s.id === '' || index.has(s.id)) continue;
    index.set(s.id, nodes.length);
    nodes.push(s);
  }
  const deps = nodes.map(() => []);
  const users = nodes.map(() => []);
  const unknown = nodes.map(() => []);
  nodes.forEach((s, i) => {
    for (const d of s.dependsOn) {
      if (index.has(d)) {
        deps[i].push(index.get(d));
        users[index.get(d)].push(i);
      } else unknown[i].push(d);
    }
  });
  return { nodes, index, deps, users, unknown };
}

// Every node a node depends on, directly or through others, as a set of nodes; the node itself only when it is in a
// cycle.
export function ancestorsOf(graph, start) {
  const seen = new Set();
  const queue = [...graph.deps[start]];
  for (let k = 0; k < queue.length; k += 1) {
    const v = queue[k];
    if (seen.has(v)) continue;
    seen.add(v);
    for (const w of graph.deps[v]) if (!seen.has(w)) queue.push(w);
  }
  return seen;
}

// Every node that depends, directly or through others, on one of the start nodes, as a set: one walk for all of them,
// so the steps after the backup or after a gate are found at once. A start node is in the set only when it depends on a
// start node itself.
export function descendantsOf(graph, starts) {
  const seen = new Set();
  const queue = starts.flatMap((v) => graph.users[v]);
  for (let k = 0; k < queue.length; k += 1) {
    const v = queue[k];
    if (seen.has(v)) continue;
    seen.add(v);
    for (const w of graph.users[v]) if (!seen.has(w)) queue.push(w);
  }
  return seen;
}

// The strongly connected parts of the graph (Tarjan, written with a stack of its own), each a sorted list of nodes, in
// the order of their first node.
export function components(graph) {
  const succ = graph.deps;
  const n = succ.length;
  const index = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  const on = new Array(n).fill(false);
  const stack = [];
  const out = [];
  let next = 0;
  for (let s = 0; s < n; s += 1) {
    if (index[s] !== -1) continue;
    index[s] = next;
    low[s] = next;
    next += 1;
    stack.push(s);
    on[s] = true;
    const work = [[s, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0];
      if (top[1] < succ[v].length) {
        const w = succ[v][top[1]];
        top[1] += 1;
        if (index[w] === -1) {
          index[w] = next;
          low[w] = next;
          next += 1;
          stack.push(w);
          on[w] = true;
          work.push([w, 0]);
        } else if (on[w]) low[v] = Math.min(low[v], index[w]);
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low[u] = Math.min(low[u], low[v]);
      }
      if (low[v] === index[v]) {
        const part = [];
        let w;
        do {
          w = stack.pop();
          on[w] = false;
          part.push(w);
        } while (w !== v);
        out.push(part.sort((a, b) => a - b));
      }
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// The cycles of the graph: one per strongly connected part of more than one node, or of one node that depends on
// itself. Each is { nodes, path }, where path is a shortest way from the first node of the part back to it, following
// the dependencies.
export function cyclesOf(graph) {
  const cycles = [];
  for (const part of components(graph)) {
    const first = part[0];
    if (part.length === 1 && !graph.deps[first].includes(first)) continue;
    const inside = new Set(part);
    const from = new Map();
    const queue = [first];
    let end = -1;
    for (let k = 0; k < queue.length && end < 0; k += 1) {
      const v = queue[k];
      for (const w of graph.deps[v]) {
        if (!inside.has(w)) continue;
        if (w === first) {
          end = v;
          break;
        }
        if (!from.has(w)) {
          from.set(w, v);
          queue.push(w);
        }
      }
    }
    const back = [];
    for (let v = end; v !== first; v = from.get(v)) back.push(v);
    cycles.push({ nodes: part, path: [first, ...back.reverse(), first] });
  }
  return cycles;
}

// The longest chain of dependencies by the weight of its nodes, with the edges inside a cycle left out: { weight,
// chain }, where chain is the list of nodes from the first step to the last. Between chains of the same weight, the one
// whose last node and whose earlier nodes come first in the file wins.
export function longestPath(graph, weightOf) {
  const n = graph.nodes.length;
  const part = new Array(n).fill(-1);
  for (const c of cyclesOf(graph)) for (const v of c.nodes) part[v] = c.nodes[0];
  const keep = (v, w) => part[v] === -1 || part[v] !== part[w];
  const users = graph.nodes.map(() => []);
  const waiting = new Array(n).fill(0);
  for (let v = 0; v < n; v += 1) {
    for (const w of graph.deps[v]) {
      if (!keep(v, w)) continue;
      users[w].push(v);
      waiting[v] += 1;
    }
  }
  const total = new Array(n).fill(0);
  const best = new Array(n).fill(-1);
  const queue = [];
  for (let v = 0; v < n; v += 1) if (waiting[v] === 0) queue.push(v);
  for (let k = 0; k < queue.length; k += 1) {
    const v = queue[k];
    let from = -1;
    for (const w of graph.deps[v]) {
      if (!keep(v, w)) continue;
      if (from === -1 || total[w] > total[from] || (total[w] === total[from] && w < from)) from = w;
    }
    best[v] = from;
    total[v] = weightOf(graph.nodes[v]) + (from === -1 ? 0 : total[from]);
    for (const u of users[v]) {
      waiting[u] -= 1;
      if (waiting[u] === 0) queue.push(u);
    }
  }
  let end = -1;
  for (let v = 0; v < n; v += 1) if (end === -1 || total[v] > total[end]) end = v;
  if (end === -1) return { weight: 0, chain: [] };
  const chain = [];
  for (let v = end; v !== -1; v = best[v]) chain.push(v);
  return { weight: total[end], chain: chain.reverse() };
}
