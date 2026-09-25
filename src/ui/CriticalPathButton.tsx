import { Route } from 'lucide-react';
import { useMemo } from 'react';
import { criticalPath } from '../analysis/criticalPath';
import { formatDuration } from '../model/duration';
import { flowStore, selectActiveBoard, useFlow } from '../store/store';

export function CriticalPathButton() {
  const on = useFlow((s) => s.criticalPath);
  const board = useFlow(selectActiveBoard);
  const cp = useMemo(() => (on ? criticalPath(board) : null), [on, board]);
  const loops = cp?.ignoredEdgeIds.length ?? 0;
  return (
    <div className="cp-group">
      <button type="button" className={`topbar-btn ${on ? 'is-on' : ''}`} title="Critical path (C)" aria-pressed={on} onClick={() => flowStore.getState().toggleCriticalPath()}>
        <Route size={14} />
        <span>Critical path</span>
        {cp && <strong className="cp-total">{formatDuration(cp.totalMin)}</strong>}
      </button>
      {cp && cp.missingDuration.length > 0 && (
        <span className="cp-note" title="Steps on the path without a duration count as zero">
          {cp.missingDuration.length} without duration
        </span>
      )}
      {loops > 0 && (
        <span className="cp-note" title="Arrows that loop back are ignored for the calculation">
          {loops} {loops === 1 ? 'loop' : 'loops'} ignored
        </span>
      )}
    </div>
  );
}
