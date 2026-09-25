import type { BoardNode } from '../model/types';

interface Props {
  node: BoardNode;
  editable: boolean;
  className?: string;
  placeholder?: string;
}

export function StepTitle({ node, className = 'fs-title', placeholder = 'Untitled' }: Props) {
  return <div className={className}>{node.title || <span className="fs-placeholder">{placeholder}</span>}</div>;
}
