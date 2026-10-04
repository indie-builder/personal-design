export function createChatStream(publish: (text: string) => void) {
  let text = '';
  let published = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (cancelled || text === published) return;
    published = text;
    publish(text);
  };
  return {
    append(delta: string) {
      if (cancelled || !delta) return;
      text += delta;
      if (!published) flush();
      else timer ??= setTimeout(flush, 32);
    },
    flush,
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
