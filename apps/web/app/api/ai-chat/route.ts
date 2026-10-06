import { requestSchema } from '@personal-design/ai-chat';
import { Effect } from 'effect';
import {
  chatErrorMessage,
  ConversationFormatError,
  CrossSiteRequestError,
  MissingApiKeyError,
  MissingQuestionError,
  RequestBodyTooLargeError,
  RequestFormatError,
} from '@/lib/chat-error';
import { createChatResponse } from '@/lib/chat-response';

export const maxDuration = 120;

export async function POST(request: Request) {
  const respond = Effect.gen(function* () {
    const origin = request.headers.get('origin');
    // TLS may terminate at portless / the deployment proxy. Compare the public host.
    const host =
      request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
      request.headers.get('host') ||
      new URL(request.url).host;
    if (origin) {
      const source = yield* Effect.try({
        try: () => new URL(origin),
        catch: () => new CrossSiteRequestError(),
      });
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== host) {
        return yield* Effect.fail(new CrossSiteRequestError());
      }
    }
    const reader = request.body?.getReader();
    if (!reader) return yield* Effect.fail(new MissingQuestionError());
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = yield* Effect.tryPromise({
        try: () => reader.read(),
        catch: (cause) => new RequestFormatError({ cause }),
      });
      if (done) break;
      size += value.byteLength;
      if (size > 512_000) {
        yield* Effect.tryPromise({
          try: () => reader.cancel(),
          catch: (cause) => new RequestFormatError({ cause }),
        });
        return yield* Effect.fail(new RequestBodyTooLargeError());
      }
      chunks.push(value);
    }
    const payload: unknown = yield* Effect.try({
      try: () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
      catch: (cause) => new RequestFormatError({ cause }),
    });
    const parsed = yield* Effect.try({
      try: () => requestSchema.safeParse(payload),
      catch: (cause) => {
        if (cause instanceof RangeError) return new ConversationFormatError();
        throw cause;
      },
    });
    if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') {
      return yield* Effect.fail(new ConversationFormatError());
    }
    if (!process.env.ZHIPU_API_KEY) {
      return yield* Effect.fail(new MissingApiKeyError());
    }
    return yield* createChatResponse(request, parsed.data);
  });
  return Effect.runPromise(
    Effect.catch(respond, (error) => {
      if ('status' in error)
        return Effect.succeed(new Response(error.message, { status: error.status }));
      if (!request.signal.aborted) console.error('[ai-chat] request:', chatErrorMessage(error));
      return Effect.succeed(new Response('问答服务暂时不可用，请稍后重试。', { status: 502 }));
    }),
  );
}
