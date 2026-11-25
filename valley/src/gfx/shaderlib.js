import { WORLD, RENDER } from '../config.js';

export const glsl = (strings, ...values) => strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');

const chunks = new Map();

export function registerChunk(name, source) {
  chunks.set(name, typeof source === 'function' ? source : () => source);
}

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

function defines(extra = {}) {
  const all = {
    WORLD_TEX: WORLD.TEX.toFixed(1),
    CELL: WORLD.CELL.toFixed(1),
    CELLS: (WORLD.TEX / WORLD.CELL) | 0,
    SEA: WORLD.SEA.toFixed(2),
    PROP_HMAX: WORLD.PROP_HMAX.toFixed(2),
    VIEW_DIST: WORLD.VIEW.toFixed(1),
    MAX_CASTERS: RENDER.MAX_CASTERS,
    MAX_LIGHTS: RENDER.MAX_LIGHTS,
    MAX_BLIPS: RENDER.MAX_BLIPS,
    ...extra,
  };
  return Object.entries(all).map(([k, v]) => `#define ${k} ${v}`).join('\n') + '\n';
}

export function assemble(source, extraDefines) {
  const seen = new Set();
  const expand = (src) => src.replace(/^[ \t]*#include <([\w./-]+)>[ \t]*$/gm, (_, name) => {
    if (seen.has(name)) return '';
    seen.add(name);
    const chunk = chunks.get(name);
    if (!chunk) throw new Error(`Unknown shader chunk <${name}>`);
    return expand(chunk());
  });
  return HEADER + defines(extraDefines) + expand(source);
}
