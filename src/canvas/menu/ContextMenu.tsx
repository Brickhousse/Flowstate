import { MenuList, type MenuEntry } from './MenuList';
import { Popup, type MenuAnchor } from './Popup';

type Props = { at: MenuAnchor; entries: MenuEntry[]; label?: string; onClose: () => void };

export function ContextMenu({ at, entries, label, onClose }: Props) {
  return (
    <Popup at={at} onClose={onClose} wheelInside="close">
      <MenuList entries={entries} close={onClose} label={label} />
    </Popup>
  );
}
