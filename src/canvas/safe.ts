import { OpError } from '../ops/errors';
import { notify } from '../ui/toast';

export function runSafely<R>(fn: () => R): R | undefined {
  try {
    return fn();
  } catch (err) {
    if (err instanceof OpError) {
      notify(err.message);
      return undefined;
    }
    throw err;
  }
}
