import { AtpAgent } from "@/AtpAgent"
import { Env } from "@/Environment"
import { decodeFirst } from "@atcute/cbor"
import { Data, Effect, Layer, Schema, Stream } from "effect"
import { Cursor } from "./Cursor"
import { RetryingSocket } from "./RetryingSocket"
import { MessageLabels, parseSubscribeLabelsMessage } from "./schema"

const handleMessageError = (e: unknown) =>
  Effect.gen(function*() {
    yield* Effect.logError(e)
    return yield* Effect.succeed(undefined).pipe(Effect.asVoid)
  })

const run = Effect.gen(function*() {
  const connect = yield* RetryingSocket
  const agent = yield* AtpAgent
  const cursor = yield* Cursor
  const initialCursor = yield* cursor.get
  const { labelerSocketUrl } = yield* Env
  labelerSocketUrl.searchParams.set("cursor", initialCursor.toString())

  const stream = connect({ url: labelerSocketUrl })

  const runStream = stream.pipe(
    Stream.mapEffect(parseMessage),
    Stream.catchAll(handleMessageError),
    Stream.filter(Schema.is(MessageLabels, { exact: false })),
    Stream.mapEffect(handleLabel(agent)),
    Stream.runForEach(cursor.set),
  )

  // run the stream and cursor concurrently
  const start = Effect.all(
    {
      stream: runStream,
      cursor: cursor.start,
    },
    { concurrency: 2 },
  ).pipe(Effect.asVoid)
  return yield* start
})

const LabelWatcherDeps = Layer.mergeAll(
  RetryingSocket.Default,
  AtpAgent.Default,
  Cursor.Default,
)

export const LabelWatcherLive = Layer.scopedDiscard(run).pipe(
  Layer.provide(LabelWatcherDeps),
)

/**
 * Handle each by adding or removing users from lists. Note we do not
 * run these in parallel because we need to run the operations in order
 * to ensure the correct state of the list.
 *
 * Returns the sequence to be saved as a cursor
 */
const handleLabel = (agent: AtpAgent) => (label: MessageLabels) =>
  Effect.gen(function*() {
    const labels = label.body.labels
    for (const label of labels) {
      if (label.neg) {
        yield* agent.removeUserFromList(label.uri, label.val)
        continue
      }
      yield* agent.addUserToList(label.uri, label.val)
    }
    return label.body.seq
  })

const parseMessage = (u: Uint8Array) =>
  Effect.gen(function*() {
    const [header, remainder] = decodeFirst(u)
    const [body, remainder2] = decodeFirst(remainder)
    if (remainder2.length > 0) {
      yield* new SocketDecodeError({ message: "Excess bytes in message" })
    }
    const message = yield* parseSubscribeLabelsMessage({ ...header, body })
    return message
  })

export class SocketDecodeError extends Data.TaggedError("SocketDecodeError")<{
  message: string
  cause?: unknown
}> {}
