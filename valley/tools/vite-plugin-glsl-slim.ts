import type { Plugin } from 'vite';

const GLSL = /\bglsl`([^`]*)`/g;

export function glslSlim(): Plugin {
  let before = 0, after = 0;
  return {
    name: 'brushwild:glsl-slim',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/src\/.*\.(js|ts)$/.test(id) || !code.includes('glsl`')) return null;
      const out = code.replace(GLSL, (_, body: string) => {
        const slim = body.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
        before += body.length; after += slim.length;
        return '`\n' + slim + '\n`';
      });
      return { code: out, map: null };
    },
    buildEnd() {
      if (before) this.info(`shaders ${(before / 1000).toFixed(1)} kB -> ${(after / 1000).toFixed(1)} kB`);
    },
  };
}
