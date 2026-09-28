import type { XY } from '../../model/types';
import { MenuList, type MenuEntry } from './MenuList';
import { Popup } from './Popup';

type Props = { at: XY; entries: MenuEntry[]; label?: string; onClose: () => void };

export function ContextMenu({ at, entries, label, onClose }: Props) {
  return (
    <Popup at={at} onClose={onClose} wheelInside="close">
      <MenuList entries={entries} close={onClose} label={label} />
    </Popup>
  );
}
