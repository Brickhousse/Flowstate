import { describe, expect, it, vi } from 'vitest';
import { readSSE } from './sse';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('readSSE', () => {
  it('parses events split across chunks and joins multi-line data', async () => {
    const out = [];
    for await (const ev of readSSE(streamOf(['event: text\nda', 'ta: {"delta":"a"}\n\nevent: done\ndata: 1\ndata: 2\n\n', 'data: tail\n\n']))) out.push(ev);
    expect(out).toEqual([
      { event: 'text', data: '{"delta":"a"}' },
      { event: 'done', data: '1\n2' },
      { event: 'message', data: 'tail' },
    ]);
  });

  it('cancels the stream when the consumer stops early', async () => {
    const cancel = vi.fn();
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(enc.encode('data: x\n\n'));
      },
      cancel,
    });
    for await (const ev of readSSE(body)) {
      expect(ev.data).toBe('x');
      break;
    }
    expect(cancel).toHaveBeenCalled();
  });
});
