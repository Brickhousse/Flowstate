import { Bot, CircleQuestionMark, OctagonX, Server, TriangleAlert, User } from 'lucide-react';
import type { Actor, EdgeType, FlagKind, Shape } from '../model/types';

export const ACTOR_LABEL: Record<Actor, string> = { person: 'Person', system: 'System', agent: 'AI agent' };
export const FLAG_LABEL: Record<FlagKind, string> = { blocker: 'Blocker', warning: 'Warning', question: 'Question' };
export const FLAG_KEY: Record<FlagKind, string> = { blocker: 'B', warning: 'W', question: 'Q' };
export const EDGE_LABEL: Record<EdgeType, string> = { flow: 'Flow', dependency: 'Dependency', handoff: 'Handoff' };
export const SHAPE_LABEL: Record<Shape, string> = {
  process: 'Process',
  decision: 'Decision',
  terminal: 'Start / End',
  data: 'Data',
  document: 'Document',
  database: 'Database',
  preparation: 'Preparation',
  connector: 'Connector',
  sticky: 'Sticky note',
};

export function ActorIcon({ actor, size = 12 }: { actor: Actor; size?: number }) {
  const Icon = actor === 'person' ? User : actor === 'system' ? Server : Bot;
  return <Icon size={size} strokeWidth={2.2} />;
}

export function FlagIcon({ kind, size = 11 }: { kind: FlagKind; size?: number }) {
  const Icon = kind === 'blocker' ? OctagonX : kind === 'warning' ? TriangleAlert : CircleQuestionMark;
  return <Icon size={size} strokeWidth={2.4} />;
}

export function EdgeTypeIcon({ type }: { type: EdgeType }) {
  const dash = type === 'dependency' ? '4 3' : type === 'handoff' ? '1 3' : undefined;
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden>
      <path d="M1 5 H15" stroke="currentColor" strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />
      <path d="M14 1.5 L19 5 L14 8.5 Z" fill="currentColor" />
    </svg>
  );
}
