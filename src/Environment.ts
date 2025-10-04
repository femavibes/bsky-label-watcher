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
    // Parse labels with optional list types (format: "label" or "label:curate" or "label:mod")
    const labelsToListRaw = yield* Config.array(
      Config.string(),
      "LABELS_TO_LIST"
    );
    
    const labelsToList = labelsToListRaw.reverse().map((entry) => {
      const [labelId, listType = "curate"] = entry.split(":");
      return {
        label: Label.make(labelId),
        listType: listType as "curate" | "mod"
      };
    });

    return {
      labelerSocketUrl,
      bskyService,
      labelerCursorFilepath,
      labelsToList,
    };
  }),
}) {}
