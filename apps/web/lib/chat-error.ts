/** Log only diagnostic messages: never serialize provider payloads or request history. */
export function chatErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : 'Unknown error';
  const key = process.env.ZHIPU_API_KEY;
  if (key) message = message.replaceAll(key, '[REDACTED]');
  return message
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(api[_-]?key|authorization|token|secret|password)(["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&,;]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\bsk-[\w-]+/g, '[REDACTED]')
    .slice(0, 2000);
}
