import { Label } from "@/schema"
import { Config, Effect } from "effect"

export class Env extends Effect.Service<Env>()("Env", {
  accessors: true,
  effect: Effect.gen(function*() {
    const labelerSocketUrl = yield* Config.url("LABELER_SOCKET_URL")
    const bskyService = yield* Config.url("BSKY_SERVICE")
    const labelerDid = yield* Config.string("LABELER_DID")
    const labelerPassword = yield* Config.redacted("LABELER_APP_PASSWORD")
    const labelerCursorFilepath = yield* Config.string(
      "LABELER_CURSOR_FILEPATH",
    ).pipe(Config.withDefault("cursor.txt"))
    const labelsToList = yield* Config.array(Config.string(), "LABELS_TO_LIST")
      .pipe(Effect.map((v) => v.map((l) => Label.make(l))))

    return {
      labelerSocketUrl,
      bskyService,
      labelerDid,
      labelerPassword,
      labelerCursorFilepath,
      labelsToList,
    }
  }),
}) {}
