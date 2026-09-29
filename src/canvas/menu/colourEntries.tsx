import { TINTS } from '../../model/color';
import { ColorInput } from '../../ui/controls';
import { ColorSwatch } from '../ColorPicker';
import type { MenuEntry } from './MenuList';

type Paint = (color: string | null) => void;

export function colourEntries(current: string | null, paint: Paint, { line = false }: { line?: boolean } = {}): MenuEntry[] {
  return [
    { kind: 'item', label: 'Default', icon: <ColorSwatch color={null} line={line} />, run: () => paint(null) },
    ...TINTS.map((t): MenuEntry => ({ kind: 'item', label: t[0].toUpperCase() + t.slice(1), icon: <ColorSwatch color={t} line={line} />, run: () => paint(t) })),
    {
      kind: 'custom',
      id: 'custom-colour',
      render: (close) => (
        <ColorInput
          label="Custom colour"
          value={current}
          className="menu-item fs-color-input"
          onPick={(hex) => {
            paint(hex);
            close();
          }}
        >
          Custom…
        </ColorInput>
      ),
    },
  ];
}
