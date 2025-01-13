import { Api } from "@/HttpApi"
import { LabelWatcher } from "@/LabelWatcher"
import { AppRuntime } from "@/services/AppRuntime"
import { Effect } from "effect"

const main = Effect.gen(function*() {
  yield* Effect.log("Starting Pro Cycling Server...")
  const { run } = yield* LabelWatcher
  yield* run.pipe(Effect.fork)

  const { runApi } = yield* Api
  // start the http server
  yield* runApi
})

AppRuntime.runPromise(main)
