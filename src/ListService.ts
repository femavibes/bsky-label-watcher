import { Effect, Ref } from "effect"
import type { AtUriSchemaType, Label } from "./schema.js"

/**
 * Records a map of list label ids to AtUris and list types for each list.
 */
export class ListService extends Effect.Service<ListService>()("ListService", {
  accessors: true,
  effect: Effect.gen(function*() {
    const ref = yield* Ref.make<Record<Label, { uri: AtUriSchemaType; listType: "curate" | "mod" }>>({})
    const get = (label: Label) =>
      ref.get.pipe(
        Effect.map((map) => map[label]?.uri as AtUriSchemaType | undefined),
      )

    const getListType = (label: Label) =>
      ref.get.pipe(
        Effect.map((map) => map[label]?.listType as "curate" | "mod" | undefined),
      )

    const set = (label: Label, uri: AtUriSchemaType, listType: "curate" | "mod") =>
      Ref.update(ref, (map) => ({ ...map, [label]: { uri, listType } }))

    return { get, set, getListType }
  }),
}) {
}
