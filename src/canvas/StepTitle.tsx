import { useEffect, useRef } from 'react';
import type { BoardNode } from '../model/types';
import { updateSteps } from '../ops/steps';
import { addNext } from '../ops/structure';
import { flowStore, useFlow } from '../store/store';
import { runSafely } from './safe';

interface Props {
  node: BoardNode;
  editable: boolean;
  className?: string;
  placeholder?: string;
}

export function StepTitle({ node, editable, className = 'fs-title', placeholder = 'Untitled' }: Props) {
  const editing = useFlow((s) => editable && s.editingId === node.id);
  if (editing) return <TitleEditor node={node} className={className} />;
  return <div className={className}>{node.title || <span className="fs-placeholder">{placeholder}</span>}</div>;
}

function TitleEditor({ node, className }: { node: BoardNode; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    const seed = flowStore.getState().editSeed;
    if (seed !== null) el.value = seed;
    el.focus();
    if (seed !== null) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, []);

  const finish = (save: boolean, then?: 'next') => {
    if (done.current) return;
    done.current = true;
    const st = flowStore.getState();
    const value = ref.current!.value.trim();
    if (save && value !== node.title) runSafely(() => st.changeBoard((b) => updateSteps(b, [{ id: node.id, title: value }])));
    st.setEditing(null);
    if (then === 'next' && node.kind === 'step') {
      const id = runSafely(() => st.changeBoard((b) => addNext(b, node.id)));
      if (id) {
        st.select([id]);
        st.setEditing(id);
      }
    }
  };

  return (
    <textarea
      ref={ref}
      className={`${className} fs-title-input nodrag nopan nowheel`}
      defaultValue={node.title}
      rows={1}
      aria-label="Title"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(true, 'next');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
