import { formatDuration } from '../model/duration';
import type { BoardNode, Flag, Project } from '../model/types';

const q = (s: string) => JSON.stringify(s);

function describeFlags(flags: Flag[]): string {
  if (flags.length === 0) return '';
  const items = flags.map((f) => `${f.kind} ${f.id} ${q(f.text)}${f.resolved ? ' (resolved)' : ''}`);
  return ` flags=[${items.join('; ')}]`;
}

function describeStep(n: BoardNode): string {
  const parts = [n.id, `[${n.shape}${n.actor ? `|${n.actor}` : ''}]`, q(n.title || '(untitled)')];
  if (n.owner) parts.push(`owner=${q(n.owner)}`);
  if (n.durationMin !== null) parts.push(`dur=${formatDuration(n.durationMin)}`);
  if (n.status) parts.push(`status=${n.status}`);
  if (n.laneId) parts.push(`lane=${n.laneId}`);
  if (n.note) parts.push(`note=${q(n.note)}`);
  if (n.replaces) parts.push(`replaces=${q(n.replaces)}`);
  return parts.join(' ') + describeFlags(n.flags);
}

export function summarizeBoard(project: Project, boardId: string): string {
  const b = project.boards.find((x) => x.id === boardId);
  if (!b) return `No board ${boardId}.`;
  const others = project.boards.filter((x) => x.id !== b.id).map((x) => q(x.name));
  const lines = [`Board ${q(b.name)} (id ${b.id}, direction ${b.direction}).${others.length ? ` Other boards: ${others.join(', ')}.` : ''}`];
  if (b.lanes.length) {
    const lanes = [...b.lanes].sort((a, c) => a.order - c.order);
    lines.push(`Lanes: ${lanes.map((l) => `${l.id} ${q(l.name)}`).join(', ')}`);
  }
  const groups = b.nodes.filter((n) => n.kind === 'group');
  if (groups.length) {
    lines.push('Groups:');
    for (const g of groups) {
      const members = b.nodes.filter((n) => n.groupId === g.id).map((n) => n.id);
      lines.push(`${g.id} ${q(g.title)}: ${members.join(', ') || '(empty)'}`);
    }
  }
  const steps = b.nodes.filter((n) => n.kind === 'step');
  lines.push(steps.length ? 'Steps:' : 'Steps: none');
  for (const s of steps) lines.push(describeStep(s));
  const texts = b.nodes.filter((n) => n.kind === 'text');
  if (texts.length) {
    lines.push('Text notes:');
    for (const t of texts) lines.push(`${t.id} ${q(t.title)}`);
  }
  if (b.edges.length) {
    lines.push('Arrows:');
    for (const e of b.edges) {
      const drawn = `${e.separate ? ' separate' : ''}${e.bends.length ? ' hand-shaped' : ''}`;
      lines.push(`${e.id}: ${e.source} -> ${e.target} ${e.type}${e.label ? ` ${q(e.label)}` : ''}${drawn}${describeFlags(e.flags)}`);
    }
  }
  return lines.join('\n');
}
