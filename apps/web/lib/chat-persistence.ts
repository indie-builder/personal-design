import type { SavedChat } from '@personal-design/ai-chat';

export function createChatPersistence(
  write: (saved: SavedChat) => void,
  onError: (error: unknown) => void,
) {
  let pending: SavedChat | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending || failed) return;
    const snapshot = pending;
    pending = undefined;
    try {
      write(snapshot);
    } catch (error) {
      failed = true;
      onError(error);
    }
  };
  return {
    schedule(saved: SavedChat, streaming: boolean) {
      if (failed) return;
      pending = saved;
      if (!streaming) flush();
      // Keep a bounded interval even when deltas arrive continuously.
      else timer ??= setTimeout(flush, 500);
    },
    flush,
  };
}
