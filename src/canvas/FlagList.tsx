import { Check, X } from 'lucide-react';
import type { Flag } from '../model/types';
import { removeFlag, setFlagResolved, updateFlagText } from '../ops/flags';
import { FieldInput, ToolButton } from '../ui/controls';
import { editBoard } from './boardChange';
import { FLAG_LABEL } from './labels';

export function FlagList({ flags }: { flags: Flag[] }) {
  return (
    <div className="fs-flaglist">
      {flags.map((f) => (
        <div key={f.id} className={`fs-flagrow ${f.resolved ? 'is-resolved' : ''}`}>
          <span className={`fs-flag-dot flag-${f.kind}`} aria-hidden />
          <FieldInput
            label={`${FLAG_LABEL[f.kind]} text`}
            width={230}
            placeholder={`Describe the ${FLAG_LABEL[f.kind].toLowerCase()}`}
            value={f.text}
            focusKey={`flag:${f.id}`}
            onCommit={(text) => editBoard((b) => updateFlagText(b, f.id, text))}
          />
          <ToolButton title={f.resolved ? 'Reopen' : 'Resolve'} active={f.resolved} onClick={() => editBoard((b) => setFlagResolved(b, f.id, !f.resolved))}>
            <Check size={13} />
          </ToolButton>
          <ToolButton title="Remove flag" onClick={() => editBoard((b) => removeFlag(b, f.id))}>
            <X size={13} />
          </ToolButton>
        </div>
      ))}
    </div>
  );
}
