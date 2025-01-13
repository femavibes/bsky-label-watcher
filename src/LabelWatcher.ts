import { Env } from "@/services/Environment"
import { decodeFirst } from "@atcute/cbor"
import { Context, Data, Effect, Layer, Schema, Stream } from "effect"
import { RetryingSocket } from "./RetryingSocket"
import { MessageLabels, parseSubscribeLabelsMessage } from "./schema"

import { ListManager } from "@/ListManager"
import { Cursor } from "./Cursor"

/**
 * v1:
 *  - Subscribes to websocket with cursor
 *  - Retries the socket on failure
 *  - Validates payloads as label messages
 *  - Adds or removes users from lists in order of labeling
 *    - Does not resolve net changes before applying, so adding a label then removing the label will
 *      result in two actions when it could be none.
 *  - Saves cursor state to filesystem every 1 second to reconnect at the last known value
 *
 * @NEXT v1.1
 *  - Telemetry
 *  - Error logging
 *
 * v1.2
 *  - Open source it?
 *  - Allow customizing list names
 *  - Listen for profile labels as well as account labels
 *  - Multi-tenency. Allow subscribing to multiple labelers. How would you do this?
 *    - One LabelWatcher per labeler? How do you configure it properly?
 */

const handleMessageError = (e: unknown) =>
  Effect.gen(function*() {
    yield* Effect.logError(e)
    return Effect.succeed(undefined)
  })

const makeRun = Effect.gen(function*() {
  const connect = yield* RetryingSocket
  const manager = yield* ListManager
  const cursor = yield* Cursor
  const initialCursor = yield* cursor.get
  const { labelerSocketUrl } = yield* Env
  labelerSocketUrl.searchParams.set("cursor", initialCursor.toString())

  const stream = connect({ url: labelerSocketUrl })

  const runStream = stream.pipe(
    Stream.mapEffect(parseMessage),
    Stream.catchAll(handleMessageError),
    Stream.filter(Schema.is(MessageLabels, { exact: false })),
    Stream.mapEffect(handleLabel(manager)),
    Stream.runForEach(cursor.set),
  )

  // run the stream and cursor concurrently
  const run = Effect.all(
    {
      stream: runStream,
      cursor: cursor.start,
    },
    { concurrency: 2 },
  )
  return { run }
})

interface ILabelWatcher {
  run: Effect.Effect<void>
}

export class LabelWatcher extends Context.Tag("LabelWatcher")<
  LabelWatcher,
  ILabelWatcher
>() {
  static Default = Layer.effect(LabelWatcher, makeRun).pipe(
    Layer.provide(RetryingSocket.Default),
    Layer.provide(Cursor.Default),
    Layer.provide(ListManager.Default),
    Layer.provide(Env.Default),
  )
}

/**
 * Handle each by adding or removing users from lists. Note we do not
 * run these in parallel because we need to run the operations in order
 * to ensure the correct state of the list.
 *
 * Returns the sequence to be saved as a cursor
 */
const handleLabel = (manager: ListManager) => (label: MessageLabels) =>
  Effect.gen(function*() {
    const labels = label.body.labels
    for (const label of labels) {
      if (label.neg) {
        yield* manager.removeUserFromList(label.uri, label.val)
        continue
      }
      yield* manager.addUserToList(label.uri, label.val)
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
