import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ui, closePanel, type PanelId, getGame } from './store';
import type { ItemInstance } from '../game/rules/items';
import { affixLines, armorOf, canEquip, displayName, itemPower, powerText, requiredLevel, sellValue, typeLine, weaponOf } from '../game/rules/items';
import { BASE, RARITY_INFO, UNIQUE } from '../game/content/items';
import { CLASSES } from '../game/content/classes';
import { compareItem, fmtDelta } from './compare';
import { compareTarget } from '../game/rules/inventory';
import { glyph } from './icons';
import { itemArt } from './art';
import { RARITY_COLORS } from '../settings/settings';
import type { Rarity } from '../game/types';

export const Icon = ({ svg, class: cls }: { svg: string; class?: string }) =>
  <span class={`ico ${cls ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;

export const rarityColor = (r: Rarity): string => RARITY_COLORS[getGame().settings.colorVision][r];

export function Painting({ paint, deps, class: cls }: { paint: (px: number) => HTMLCanvasElement; deps: string; class: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const px = Math.max(24, Math.round((el.clientWidth || 64) * Math.min(3, window.devicePixelRatio || 1)));
    const src = paint(px);
    if (el.width !== src.width) el.width = src.width;
    if (el.height !== src.height) el.height = src.height;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(src, 0, 0);
  }, [deps]);
  return <canvas ref={ref} class={cls} aria-hidden="true" />;
}

export function Panel(props: { id: PanelId; title: string; side?: string; wide?: boolean; children: ComponentChildren; actions?: ComponentChildren }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], .body button:not(:disabled), .body input, .body select');
    if (first && getGame().input.lastDevice !== 'mouse') first.focus({ preventScroll: true });
  }, []);
  return (
    <section ref={ref} class={`panel plate ${props.side ?? ''} ${props.wide ? 'wide' : ''} p-${props.id}`} role="dialog" aria-label={props.title}>
      <header>
        <h2>{props.title}</h2>
        <div class="head-actions">
          {props.actions}
          <button type="button" class="x" aria-label={`Close ${props.title}`} onClick={() => closePanel(props.id)}>×</button>
        </div>
      </header>
      <div class="body">{props.children}</div>
    </section>
  );
}

export function useTip(render: () => ComponentChildren, wide = false) {
  return {
    onPointerEnter: (e: PointerEvent) => { ui.tip.value = { rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), render, wide }; },
    onPointerLeave: () => { ui.tip.value = null; },
    onFocus: (e: FocusEvent) => { ui.tip.value = { rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), render, wide }; },
    onBlur: () => { ui.tip.value = null; },
  };
}

export function TooltipHost() {
  const tip = ui.tip.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -9999, y: -9999 });
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const r = tip.rect, box = ref.current.getBoundingClientRect();
    let x = r.right + 10, y = r.top;
    if (x + box.width > innerWidth - 8) x = r.left - box.width - 10;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - box.width - 8, r.left));
    if (x === r.left || x < r.left && x + box.width > r.left) y = r.bottom + 8;
    if (y + box.height > innerHeight - 8) y = Math.max(8, innerHeight - box.height - 8);
    setPos({ x, y });
  }, [tip]);
  if (!tip) return null;
  return <div ref={ref} class={`tooltip plate ${tip.wide ? 'wide' : ''}`} role="tooltip" style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>{tip.render()}</div>;
}

export function ItemTooltip({ item, compare = true, worn = false }: { item: ItemInstance; compare?: boolean; worn?: boolean }) {
  const g = getGame(), c = g.player.char;
  const base = BASE[item.base];
  const w = weaponOf(item), armor = armorOf(item);
  const lines = affixLines(item);
  const power = powerText(item);
  const can = canEquip(CLASSES[c.classId], item, c.level);
  const ranges = g.controls.showLabels || g.input.held('AltLeft');
  const other = compare && !worn ? compareTarget(c, item) : null;
  const deltas = compare && !worn && can.ok ? compareItem(c, item) : [];
  const unique = item.unique ? UNIQUE[item.unique] : null;
  return (
    <div class="itip" style={{ '--rc': rarityColor(item.rarity) } as JSX.CSSProperties}>
      <div class="itip-head">
        <Painting class="itip-art" deps={`${item.uid}|${item.rarity}|${g.settings.colorVision}`} paint={(px) => itemArt(item, g.settings.colorVision, px)} />
        <div>
          <div class="itip-name">{displayName(item)}</div>
          <div class="itip-type">{RARITY_INFO[item.rarity].name} {typeLine(item)}{base?.hands === 2 ? ' · two-handed' : ''}</div>
          <div class="itip-power">Item power {itemPower(item)}</div>
        </div>
      </div>
      {w && <div class="itip-main"><b>{w.min}–{w.max}</b> damage per hit · {w.speed.toFixed(2)} attacks a second</div>}
      {armor > 0 && <div class="itip-main"><b>{armor}</b> armor</div>}
      {lines.length > 0 && <ul class="itip-affixes">
        {lines.map((l) => <li class={l.implicit ? 'implicit' : l.greater ? 'greater' : ''}>{l.text}{ranges && l.range ? <span class="dim"> [{l.range}]</span> : null}{l.greater ? <span class="sr"> (a near-perfect roll)</span> : null}</li>)}
      </ul>}
      {power && <p class="itip-legend">{power}</p>}
      {unique && <p class="itip-flavor">“{unique.flavor}”</p>}
      <div class="itip-foot">
        <span class={can.ok ? 'dim' : 'bad'}>{can.ok ? `Requires level ${requiredLevel(item)}` : can.reason}</span>
        <span class="coin">{sellValue(item)}</span>
      </div>
      {item.junk && <div class="bad">Marked as junk</div>}
      {deltas.length > 0 && <div class="itip-compare">
        <div class="label">{other ? `Compared with ${displayName(other)}` : 'If worn'}</div>
        <ul>{deltas.map((d) => <li class={(d.after > d.before) === d.better ? 'good' : 'bad'}>{fmtDelta(d)} {d.label}</li>)}</ul>
      </div>}
      {!ranges && lines.some((l) => l.range) && <div class="dim small">Hold Alt to see the ranges each line can roll.</div>}
    </div>
  );
}

export function ItemCell(props: {
  item: ItemInstance | null | undefined; label?: string; selected?: boolean; worn?: boolean; empty?: string;
  onClick?: (e: MouseEvent) => void; onUse?: () => void; index?: number; dim?: boolean;
}) {
  const { item } = props;
  const tip = useTip(() => (item ? <ItemTooltip item={item} worn={props.worn} /> : <span>{props.empty ?? 'Empty'}</span>), true);
  if (!item) {
    return <button type="button" class={`cell empty ${props.selected ? 'sel' : ''}`} aria-label={props.label ? `${props.label}: empty` : 'Empty'} onClick={props.onClick} data-index={props.index}>
      {props.empty && <Icon svg={glyph(props.empty, '#e8e2d4')} class="ghost" />}
    </button>;
  }
  return (
    <button
      type="button"
      class={`cell r-${item.rarity} ${props.selected ? 'sel' : ''} ${props.worn ? 'worn' : ''} ${item.junk ? 'junk' : ''} ${props.dim ? 'dim' : ''}`}
      style={{ '--rc': rarityColor(item.rarity) } as JSX.CSSProperties}
      aria-label={`${props.label ? props.label + ': ' : ''}${displayName(item)}, ${RARITY_INFO[item.rarity].name}, item power ${itemPower(item)}`}
      aria-pressed={props.selected}
      data-index={props.index}
      onClick={props.onClick}
      onDblClick={props.onUse}
      onContextMenu={(e) => { e.preventDefault(); props.onUse?.(); }}
      {...tip}
    >
      <Painting class="art" deps={`${item.uid}|${item.rarity}|${getGame().settings.colorVision}`} paint={(px) => itemArt(item, getGame().settings.colorVision, px)} />
      {item.fresh && <span class="new" aria-hidden="true">✦</span>}
    </button>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="setting toggle">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function Slider({ label, hint, value, min, max, step, onChange, fmt }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  const show = fmt ? fmt(value) : `${Math.round(value * 100)}%`;
  return (
    <label class="setting slider">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-valuetext={show} onInput={(e) => onChange(+(e.currentTarget as HTMLInputElement).value)} />
      <output>{show}</output>
    </label>
  );
}

export function Choice<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="setting choice" role="radiogroup" aria-label={label}>
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <div class="chips">
        {options.map(([v, text]) => (
          <button type="button" role="radio" aria-checked={v === value} class={`chip ${v === value ? 'on' : ''}`} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: [T, string][]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map(([id, text]) => (
        <button type="button" role="tab" aria-selected={id === value} class={`tab ${id === value ? 'on' : ''}`} onClick={() => onChange(id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex(([t]) => t === value);
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(i + 1) % tabs.length][0]); }
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(i - 1 + tabs.length) % tabs.length][0]); }
          }}>{text}</button>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const c = ui.confirm.value;
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => { yes.current?.focus(); }, [c]);
  if (!c) return null;
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) ui.confirm.value = null; }}>
      <section class="confirm plate" role="alertdialog" aria-modal="true" aria-label={c.title}>
        <h2>{c.title}</h2>
        <p>{c.body}</p>
        <div class="pair">
          <button type="button" class="btn" onClick={() => (ui.confirm.value = null)}>{c.no ?? 'Cancel'}</button>
          <button ref={yes} type="button" class={`btn ${c.danger ? 'danger' : 'primary'}`} onClick={() => { ui.confirm.value = null; c.onYes(); }}>{c.yes}</button>
        </div>
      </section>
    </div>
  );
}

export const confirmThen = (title: string, body: string, yes: string, onYes: () => void, danger = false) => {
  ui.confirm.value = { title, body, yes, onYes, danger };
};
