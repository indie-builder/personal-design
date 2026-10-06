import type { SavedChat } from '@personal-design/ai-chat';

function createThrottledWriter<T>(
  write: (snapshot: T) => void,
  interval: number,
  onError?: (error: unknown) => void,
) {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const cancel = () => {
    closed = true;
    clearTimeout(timer);
    timer = undefined;
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending || closed) return;
    const { value } = pending;
    pending = undefined;
    try {
      write(value);
    } catch (error) {
      if (!onError) throw error;
      cancel();
      onError(error);
    }
  };
  return {
    schedule(value: T, deferred: boolean) {
      if (closed) return;
      pending = { value };
      if (!deferred) flush();
      else timer ??= setTimeout(flush, interval);
    },
    flush,
    cancel,
  };
}

export function createChatStream(publish: (text: string) => void) {
  let text = '';
  const writer = createThrottledWriter(publish, 32);
  return {
    append(delta: string) {
      if (!delta) return;
      const deferred = !!text;
      text += delta;
      writer.schedule(text, deferred);
    },
    flush: writer.flush,
    cancel: writer.cancel,
  };
}

export function createChatPersistence(
  write: (saved: SavedChat) => void,
  onError: (error: unknown) => void,
) {
  return createThrottledWriter(write, 500, onError);
}
