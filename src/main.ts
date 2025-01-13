import { AppRuntime } from "@/AppRuntime"
import { Api } from "@/HttpApi"
import { LabelWatcher } from "@/LabelWatcher"
import { Effect } from "effect"
import "dotenv/config"

/**
 * TODO
 *   - Move ListManager into AtpAgent
 *   - Readme
 *   - Allow configuring labels to create lists for
 *   - Automatically create lists based on label names
 *   - Export as package
 *   - Allow passing in a custom label map
 */

const main = Effect.gen(function*() {
  yield* Effect.log("Starting Label Watcher...")
  const { run } = yield* LabelWatcher
  yield* run.pipe(Effect.fork)

  const { runApi } = yield* Api
  // start the http server
  yield* runApi
})

AppRuntime.runPromise(main)
