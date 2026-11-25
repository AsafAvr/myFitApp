import { registerArchetype } from '../passes/entities.js';
import { glsl } from '../shaderlib.js';

registerArchetype({
  id: 'arrow', boundY: 0.0, boundR: 0.4, steps: 40,
  glsl: glsl`
mat2 aTilt;
void entPose() { aTilt = rot2(-ePose.x); }
float entMap(vec3 p, out float mat) {
  vec3 q = p;
  q.yz = aTilt * q.yz;
  float shaft = sdCapsule(q, vec3(0.0, 0.0, -0.3), vec3(0.0, 0.0, 0.2), 0.017);
  vec3 h = q - vec3(0.0, 0.0, 0.18);
  float head = max(length(h.xy) - 0.052 * (1.0 - h.z / 0.15), max(-h.z, h.z - 0.15)) * 0.8;
  vec3 f = q - vec3(0.0, 0.0, -0.24);
  float sweep = 0.5 * clamp(f.z + 0.07, 0.0, 0.14);
  float fl = min(sdBox(f, vec3(0.05 - sweep, 0.004, 0.07)), sdBox(f, vec3(0.004, 0.05 - sweep, 0.07)));
  mat = 0.0;
  float d = shaft;
  if (head < d) { d = head; mat = 1.0; }
  if (fl < d) { d = fl; mat = 2.0; }
  return d;
}
void entSurf(vec3 p, float mat, inout Surf s) {
  if (mat < 0.5) { s.albedo = P_BARK; s.cover = 0.75; }
  else if (mat < 1.5) { s.albedo = P_SLATE; s.cover = 0.25; }
  else { s.albedo = eColA; s.cover = 0.9; }
}
`,
});
