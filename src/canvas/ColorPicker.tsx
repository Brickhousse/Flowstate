import { fillOf, TINTS } from '../model/color';
import { ColorInput, ToolButton } from '../ui/controls';

export function ColorSwatch({ color, line }: { color: string | null; line?: boolean }) {
  const fill = fillOf(color);
  const name = fill?.kind === 'tint' ? fill.tint : 'none';
  return <span className={`fs-swatch swatch-${name} ${line ? 'is-line' : ''}`} style={fill?.kind === 'hex' ? { background: fill.hex } : undefined} />;
}

export function ColorRow({ value, line, onPick }: { value: string | null; line?: boolean; onPick: (color: string | null) => void }) {
  return (
    <div className="fs-toolbar-row">
      {[null, ...TINTS].map((c) => (
        <ToolButton key={c ?? 'none'} title={c ?? 'Default'} active={value === c} onClick={() => onPick(c)}>
          <ColorSwatch color={c} line={line} />
        </ToolButton>
      ))}
      <ColorInput label="Custom colour" value={value} className="fs-color-input" onPick={onPick} />
    </div>
  );
}
