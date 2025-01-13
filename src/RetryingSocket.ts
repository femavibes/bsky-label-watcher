import { Socket } from "@effect/platform"
import type { SocketError } from "@effect/platform/Socket"
import { Data, Effect, Schedule, Stream } from "effect"

/**
 * A stream that will reconnect to the websocket on error
 */
const wsStream = ({ url }: { url: string | URL }) =>
  Stream.asyncPush<Uint8Array<ArrayBufferLike>, SocketError>((emit) =>
    Effect.gen(function*() {
      yield* Effect.log("Connecting to websocket at: ", url.toString())
      const socket = yield* Socket.makeWebSocket(url.toString(), {
        closeCodeIsError: (_) => true,
      })

      const e = socket
        .run((d) =>
          Effect.gen(function*() {
            const didEmit = emit.single(d)
            if (!didEmit) {
              yield* new BufferOverflowError({
                message: "Socket buffer overflowed, failed to emit a message.",
              })
            }
          })
        )
        .pipe(
          Effect.catchTag("SocketError", (e) => Effect.succeed(emit.fail(e))),
          Effect.fork,
        )

      yield* e
    }).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal))
  ).pipe(
    Stream.tapErrorCause(Effect.logError),
    Stream.retry(Schedule.spaced("1 second")),
  )

export class BufferOverflowError extends Data.TaggedError(
  "BufferOverflowError",
)<{
  message: string
  cause?: unknown
}> {}

export class RetryingSocket extends Effect.Service<RetryingSocket>()(
  "RetryingSocket",
  {
    succeed: wsStream,
  },
) {}
