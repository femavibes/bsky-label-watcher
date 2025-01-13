import { Effect, Ref } from "effect"
import type { AtUriSchemaType, Label } from "./schema.js"

/**
 * Records a map of list label ids to AtUris for each list.
 */
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
