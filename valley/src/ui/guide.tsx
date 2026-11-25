import { useEffect, useState } from 'preact/hooks';
import { ui, getGame, log, toast } from './store';
import { bindingLabel } from './hud';
import { skillDef } from '../game/content/classes';

function words(id: string): string {
  const g = getGame(), c = g.player.char, touch = g.touch, pad = g.input.lastDevice === 'pad';
  const basic = skillDef(c.bar[0] ?? '')?.name ?? 'your first skill';
  const second = skillDef(c.bar[1] ?? '')?.name ?? 'your second skill';
  const k = bindingLabel;
  switch (id) {
    case 'walk': return touch ? 'Push the stick to walk to the ring, or tap the ground there.' : pad ? 'Push the left stick to walk to the ring.' : 'Click the ground to walk to the ring. W A S D walk too.';
    case 'look': return touch ? 'Drag the picture to turn the view. Pinch to zoom.' : pad ? 'Push the right stick to turn the view.' : 'Hold the right mouse button and drag to turn the view. The wheel zooms.';
    case 'fight': return touch ? `Tap the big button to attack the Sproutling with ${basic}.` : pad ? `Press ${k('interact')} to attack the Sproutling with ${basic}.` : `Click the Sproutling to attack it with ${basic}.`;
    case 'skill': return touch ? `Tap the ringed button: ${second}.` : `Press ${k('slot2')} for ${second}.`;
    case 'bounty': return touch ? 'Tap the warden and take a bounty from their board.' : 'Click the warden and take a bounty from their board.';
    case 'tip:dodge': return `Hatching on the ground means a blow is coming there. Step out of it, or press ${touch ? 'the Evade button' : k('evade')} to roll through.`;
    case 'tip:tonic': return touch ? 'Low on health: tap the red flask.' : `Low on health: press ${k('potion')} to drink a tonic.`;
    case 'tip:points': return touch ? 'A skill point to spend: open the skill tree.' : `A skill point to spend: press ${k('skills')} for the skill tree.`;
    case 'tip:loot': return touch ? 'You found gear: open your inventory to wear it.' : `You found gear: press ${k('inventory')} to compare it and wear it.`;
    default: return '';
  }
}
const HINTS: Record<string, [string | null, string | null]> = {
  fight: [null, '.slot.act'],
  skill: ['.slot.s1', '.slot.s0'],
  'tip:tonic': ['.slot.d0', '.slot.d0'],
  'tip:dodge': ['.slot.d1', '.slot.d1'],
  'tip:points': ['#menu button:nth-child(3)', '#menu button:nth-child(3)'],
  'tip:loot': ['#menu button:nth-child(2)', '#menu button:nth-child(2)'],
};

export function GuidePlate() {
  const g = getGame();
  const msg = ui.guide.value;
  useEffect(() => {
    document.body.classList.toggle('guiding', !!msg);
    const sel = msg && HINTS[msg.id] && HINTS[msg.id][g.touch ? 1 : 0];
    const el = sel ? document.querySelector(sel) : null;
    el?.setAttribute('data-hint', '1');
    return () => el?.removeAttribute('data-hint');
  }, [msg]);
  useEffect(() => g.bus.on('guide:done', (d) => {
    if (d.quiet) return;
    if (d.skipped) log('First steps skipped. The menu has them.');
    else toast('You know the way now', 'Esc opens the menu, and How to Play.', 4);
  }), []);
  if (!msg) return null;
  return (
    <section id="guide" class={`plate ${msg.tip ? 'tip' : ''}`} aria-label="What to try next">
      <div class="words">
        {!msg.tip && <div class="label">First steps · {(msg.index ?? 0) + 1} of {msg.total}</div>}
        <p role="status" aria-live="polite">{words(msg.id)}</p>
      </div>
      {!msg.tip && <button type="button" class="btn" aria-label="Skip the first steps" onClick={() => g.bus.emit('guide:skip')}>Skip</button>}
    </section>
  );
}

export function GuideArrow() {
  const g = getGame();
  const [arrow, setArrow] = useState<string | null>(null);
  useEffect(() => g.bus.on('frame', () => {
    const d = ui.guide.value;
    const goal = d && (d.entity || d.at);
    if (!goal) { if (arrowRef.current) setArrow((arrowRef.current = null)); return; }
    const cam = g.camera, W = g.renderer.size.cssW, H = g.renderer.size.cssH;
    const s = cam.project(goal.x, goal.y + ((goal as { height?: number }).height || 0) * 0.6, goal.z);
    if (s && s.x > 0.07 && s.x < 0.93 && s.y > 0.12 && s.y < 0.9) { if (arrowRef.current) setArrow((arrowRef.current = null)); return; }
    let dx: number, dy: number;
    if (s) { dx = (s.x - 0.5) * W; dy = (s.y - 0.5) * H; }
    else {
      const p = g.player, x = goal.x - p.x, z = goal.z - p.z, f = cam.fwd, fl = Math.hypot(f[0], f[2]) || 1;
      dx = x * cam.right[0] + z * cam.right[2]; dy = -(x * f[0] + z * f[2]) / fl;
    }
    const l = Math.hypot(dx, dy) || 1, k = Math.min((W / 2 - 46) / Math.abs(dx / l || 1e-6), (H / 2 - 46) / Math.abs(dy / l || 1e-6));
    const t = `translate(${(W / 2 + dx / l * k).toFixed(1)}px, ${(H / 2 + dy / l * k).toFixed(1)}px) translate(-50%, -50%) rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    if (t !== arrowRef.current) setArrow((arrowRef.current = t));
  }), []);
  if (!arrow) return null;
  return <div id="guide-arrow" aria-hidden="true" style={{ transform: arrow }}><svg viewBox="0 0 44 44"><path d="M6 22h26M22 10l12 12-12 12" fill="none" stroke="#f1ebdc" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" /><path d="M6 22h26M22 10l12 12-12 12" fill="none" stroke="#d64634" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" /></svg></div>;
}
const arrowRef: { current: string | null } = { current: null };
