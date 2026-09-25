import { ChevronDown, Plus, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listProjects, saveProject } from '../api/projects';
import { openProject } from '../boot';
import { createProject } from '../model/factory';
import type { Project, ProjectMeta } from '../model/types';
import { flowStore, useFlow } from '../store/store';
import { FieldInput } from './controls';
import { MenuButton } from './Popover';
import { notify } from './toast';

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function ProjectMenu() {
  const name = useFlow((s) => s.project.name);
  return (
    <MenuButton
      className="project-menu"
      title="Projects"
      label={
        <>
          <Workflow size={15} className="brand" />
          <span className="project-name">{name}</span>
          <ChevronDown size={13} />
        </>
      }
    >
      {(close) => <ProjectPanel close={close} />}
    </MenuButton>
  );
}

function ProjectPanel({ close }: { close: () => void }) {
  const project = useFlow((s) => s.project);
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  useEffect(() => {
    listProjects().then(setList, (err: unknown) => notify(errorText(err)));
  }, []);

  const switchTo = async (target: Project | string) => {
    close();
    try {
      await openProject(target);
    } catch (err) {
      notify(errorText(err));
    }
  };

  const create = async () => {
    const fresh = createProject();
    try {
      await saveProject(fresh);
      await switchTo(fresh);
    } catch (err) {
      notify(errorText(err));
    }
  };

  return (
    <div className="project-panel">
      <FieldInput
        label="Project name"
        width={240}
        value={project.name}
        onCommit={(name) => {
          if (!name) return;
          flowStore.getState().change((p) => {
            p.name = name;
          });
        }}
      />
      <div className="menu-section">Projects</div>
      {list === null ? (
        <div className="menu-empty">Loading</div>
      ) : (
        list.map((m) => (
          <button key={m.id} type="button" role="menuitem" className={`menu-item ${m.id === project.id ? 'is-current' : ''}`} onClick={() => m.id !== project.id && switchTo(m.id)}>
            {m.name}
          </button>
        ))
      )}
      <div className="menu-sep" />
      <button type="button" role="menuitem" className="menu-item" onClick={create}>
        <Plus size={13} /> New project
      </button>
    </div>
  );
}
