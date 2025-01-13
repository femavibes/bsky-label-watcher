import { Api } from "@/HttpApi"
import { LabelWatcher } from "@/LabelWatcher"
import { AppRuntime } from "@/Runtime"
import { Effect } from "effect"
import "dotenv/config"

/**
 * TODO
 *   - Readme
 *   - Allow configuring labels to create lists for
 *   - Automatically create lists based on label names
 *   - Export as package
 *   - Allow passing in a custom label map
 *
 * v1:
 *  - Subscribes to websocket with cursor
 *  - Retries the socket on failure
 *  - Validates payloads as label messages
 *  - Adds or removes users from lists in order of labeling
 *    - Does not resolve net changes before applying, so adding a label then removing the label will
 *      result in two actions when it could be none.
 *  - Saves cursor state to filesystem every 1 second to reconnect at the last known value
 *  - Has a basic HttpApi:
 *    - GET /health
 *    - GET /cursor
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

const main = Effect.gen(function*() {
  yield* Effect.log("Starting Label Watcher...")
  const { run } = yield* LabelWatcher
  yield* run.pipe(Effect.fork)

  const { runApi } = yield* Api
  // start the http server
  yield* runApi
})

AppRuntime.runPromise(main)
