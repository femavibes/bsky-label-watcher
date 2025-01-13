import { Cursor } from "@/Cursor"
import { Effect } from "effect"

const resetCursor = Effect.gen(function*() {
  const { get, setImmediate } = yield* Cursor

  const current = yield* get

  yield* setImmediate(0)

  yield* Effect.log(`Reset cursor from ${current} to 0`)
}).pipe(
  Effect.provide(Cursor.Default),
)

Effect.runPromise(resetCursor)
