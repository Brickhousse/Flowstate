import { describe, expect, it } from 'vitest';
import { createBoard, createProject } from '../model/factory';
import { connect } from '../ops/edges';
import { addFlag } from '../ops/flags';
import { groupSteps } from '../ops/groups';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { summarizeBoard } from './summary';

describe('summarizeBoard', () => {
  it('describes steps, arrows, lanes, groups, flags and other boards', () => {
    const project = createProject('P');
    const b = project.boards[0];
    b.name = 'Future v1';
    const other = createBoard('Current');
    project.boards.push(other);
    const [lane] = setLanes(b, ['Intake']);
    const s1 = addStep(b, { title: 'Collect "docs"', actor: 'agent', owner: 'Intake Agent', durationMin: 30, laneId: lane });
    const s2 = addStep(b, { title: 'Review', after: s1, edgeLabel: 'ok', status: 'planned', note: 'Human check' });
    addFlag(b, s2, 'blocker', 'No reviewer');
    groupSteps(b, [s1, s2], 'Phase 1');
    addText(b, { text: 'Draft', x: 0, y: -200 });

    expect(summarizeBoard(project, b.id)).toBe(
      [
        `Board "Future v1" (id ${b.id}, direction LR). Other boards: "Current".`,
        'Lanes: l1 "Intake"',
        'Groups:',
        'g6 "Phase 1": s2, s3',
        'Steps:',
        's2 [process|agent] "Collect \\"docs\\"" owner="Intake Agent" dur=30m lane=l1',
        's3 [process] "Review" status=planned lane=l1 note="Human check" flags=[blocker f5 "No reviewer"]',
        'Text notes:',
        't7 "Draft"',
        'Arrows:',
        'e4: s2 -> s3 flow "ok"',
      ].join('\n'),
    );
  });

  it('marks an empty board', () => {
    const project = createProject();
    expect(summarizeBoard(project, project.boards[0].id)).toContain('Steps: none');
  });

  it('marks separate and hand-shaped arrows', () => {
    const project = createProject('P');
    const b = project.boards[0];
    const s1 = addStep(b, { title: 'A', x: 0, y: 0 });
    const s2 = addStep(b, { title: 'B', x: 400, y: 0 });
    const s3 = addStep(b, { title: 'C', x: 400, y: 200 });
    connect(b, { source: s1, target: s2 });
    connect(b, { source: s1, target: s3 });
    b.edges[0].separate = true;
    b.edges[1].bends = [{ x: 300, y: 36 }];
    const text = summarizeBoard(project, b.id);
    expect(text).toContain('e4: s1 -> s2 flow separate');
    expect(text).toContain('e5: s1 -> s3 flow hand-shaped');
  });
});
