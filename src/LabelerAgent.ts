import { makeAgent } from "#/packages/shared/AtProto/AtpAgent"
import { Effect } from "effect"

export class LabelerAgent extends Effect.Service<LabelerAgent>()(
  "LabelerAtpAgent",
  {
    effect: Effect.gen(function* () {
      const agent = yield* makeAgent({
        identifierVar: "LABELER_DID",
        passwordVar: "LABELER_PASSWORD",
      })

      return { agent }
    }),
  },
) {}
