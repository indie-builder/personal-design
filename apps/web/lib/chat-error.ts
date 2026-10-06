import { Data } from 'effect';

export class CrossSiteRequestError extends Data.TaggedError('CrossSiteRequestError') {
  readonly status = 403;
  override readonly message = '不允许跨站请求。';
}

export class MissingQuestionError extends Data.TaggedError('MissingQuestionError') {
  readonly status = 400;
  override readonly message = '请输入问题。';
}

export class RequestBodyTooLargeError extends Data.TaggedError('RequestBodyTooLargeError') {
  readonly status = 413;
  override readonly message = '对话内容过长，请新建对话。';
}

export class RequestFormatError extends Data.TaggedError('RequestFormatError')<{
  cause: unknown;
}> {
  readonly status = 400;
  override readonly message = '请求格式有误，请重新发送。';
}

export class ConversationFormatError extends Data.TaggedError('ConversationFormatError') {
  readonly status = 400;
  override readonly message = '对话格式有误或过长，请新建对话后重试。';
}

export class MissingApiKeyError extends Data.TaggedError('MissingApiKeyError') {
  readonly status = 503;
  override readonly message = '问答服务尚未配置，请配置智谱 API 密钥后重试。';
}

export class PiRuntimeError extends Data.TaggedError('PiRuntimeError')<{ cause: unknown }> {}
export class PiSessionError extends Data.TaggedError('PiSessionError')<{ cause: unknown }> {}
export class ProviderError extends Data.TaggedError('ProviderError')<{ cause: unknown }> {}
export class SummaryError extends Data.TaggedError('SummaryError')<{ message: string }> {}
export class GenerationError extends Data.TaggedError('GenerationError')<{ message: string }> {}
export class UiRepairError extends Data.TaggedError('UiRepairError')<{ message: string }> {}

/** Log only diagnostic messages: never serialize provider payloads or request history. */
export function chatErrorMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : 'Unknown error';
  if (
    error instanceof PiRuntimeError ||
    error instanceof PiSessionError ||
    error instanceof ProviderError
  ) {
    message = error.cause instanceof Error ? error.cause.message : 'Unknown error';
  }
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
