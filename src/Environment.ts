import { Label } from "@/schema";
import { Config, Effect } from "effect";

export class Env extends Effect.Service<Env>()("Env", {
  accessors: true,
  effect: Effect.gen(function* () {
    const labelerSocketUrl = yield* Config.url("LABELER_SOCKET_URL");
    const bskyService = yield* Config.url("BSKY_SERVICE");
    const labelerCursorFilepath = yield* Config.nonEmptyString(
      "LABELER_CURSOR_FILEPATH"
    ).pipe(Config.withDefault("cursor.txt"));
    // reverse the list because bluesky orders them based on latest creation
    const labelsToList = yield* Config.array(
      Config.string(),
      "LABELS_TO_LIST"
    ).pipe(Effect.map((v) => v.reverse().map((l) => Label.make(l))));

    return {
      labelerSocketUrl,
      bskyService,
      labelerCursorFilepath,
      labelsToList,
    };
  }),
}) {}
