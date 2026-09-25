import ElkConstructor, { type ELK } from 'elkjs/lib/elk-api';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';

let instance: ELK | null = null;

export function getElk(): ELK {
  instance ??= new ElkConstructor({ workerUrl });
  return instance;
}
