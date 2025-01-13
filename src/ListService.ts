import { Context, Effect, Ref } from "effect"
import type { AtUriSchemaType, Label } from "./schema.js"

// export const labelToListUri: Record<Label, AtUriSchemaType> = {
//   [Label.make("cycling-fan")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfac5i2nxs2c",
//   [Label.make("cycling-superfan")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfac6d4fco27",
//   [Label.make("content-creator")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacbvc76o27",
//   [Label.make("cycling-business")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfac7vb3we26",
//   [Label.make("cycling-platform")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacanf2ia25",
//   [Label.make("pro-cyclist")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfaccllu3w27",
//   [Label.make("former-pro")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacdeiquc2c",
//   [Label.make("team")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lface3w7ab2c",
//   [Label.make("race")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacekyqfg2i",
//   [Label.make("cycling-media")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacf62jmq2c",
//   [Label.make("cycling-publication")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacfmmwtb2w",
//   [Label.make("team-insider")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfacghtjks2c",
//   [Label.make("tribute-account")]:
//     "at://did:plc:2qhdv5xwffbogrfoqcqzpady/app.bsky.graph.list/3lfach7p2er27",
// } as const

export class ListService extends Effect.Service<ListService>()("ListService", {
  accessors: true,
  effect: Effect.gen(function*() {
    const ref = yield* Ref.make<Record<Label, AtUriSchemaType>>({})
    const get = (label: Label) =>
      ref.get.pipe(
        Effect.map((map) => map[label] as AtUriSchemaType | undefined),
      )

    const set = (label: Label, uri: AtUriSchemaType) =>
      Ref.update(ref, (map) => ({ ...map, [label]: uri }))

    return { get, set }
  }),
}) {
}
