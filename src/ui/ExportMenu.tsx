import { Download } from 'lucide-react';
import { exportBoardImage } from '../io/exportImage';
import { exportProjectJson } from '../io/exportJson';
import { flowStore } from '../store/store';
import { MenuButton } from './Popover';
import { errorText } from './ProjectMenu';
import { notify } from './toast';

const attempt = (fn: () => Promise<void> | void) => {
  Promise.resolve()
    .then(fn)
    .catch((err: unknown) => notify(`Export failed: ${errorText(err)}`));
};

export function ExportMenu() {
  return (
    <MenuButton title="Export" label={<Download size={14} />}>
      {(close) => (
        <>
          <button type="button" role="menuitem" className="menu-item" onClick={() => (close(), attempt(() => exportBoardImage('png')))}>
            PNG image
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => (close(), attempt(() => exportBoardImage('svg')))}>
            SVG image
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => (close(), attempt(() => exportProjectJson(flowStore.getState().project)))}>
            Project JSON
          </button>
        </>
      )}
    </MenuButton>
  );
}
