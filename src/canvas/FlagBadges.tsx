import { FLAG_KINDS, type Flag } from '../model/types';
import { FLAG_LABEL, FlagIcon } from './labels';

export function FlagBadges({ flags, onClick }: { flags: Flag[]; onClick?: () => void }) {
  const groups = FLAG_KINDS.map((kind) => ({ kind, items: flags.filter((f) => f.kind === kind && !f.resolved) })).filter((g) => g.items.length);
  if (groups.length === 0) return null;
  return (
    <div className="fs-flags">
      {groups.map(({ kind, items }) => (
        <button
          key={kind}
          type="button"
          className={`fs-flag flag-${kind} nodrag`}
          title={items.map((f) => f.text || FLAG_LABEL[kind]).join('\n')}
          aria-label={`${items.length} ${FLAG_LABEL[kind].toLowerCase()}`}
          onClick={onClick}
        >
          <FlagIcon kind={kind} />
          {items.length > 1 && <span>{items.length}</span>}
        </button>
      ))}
    </div>
  );
}
