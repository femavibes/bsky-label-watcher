import { Env } from "@/Environment"
import { ListService } from "@/ListService"
import {
  AtUriSchema,
  type AtUriSchemaType,
  type Did,
  type Label,
} from "@/schema"
import { Agent, type AppBskyGraphList } from "@atproto/api"
import { AtUri, CredentialSession } from "@atproto/api"
import { isLabelerViewDetailed } from "@atproto/api/dist/client/types/app/bsky/labeler/defs"
import type { SessionManager } from "@atproto/api/dist/session-manager"
import { Data, Effect, Layer, Option, Redacted, Schema } from "effect"

export class AtpAgent extends Effect.Service<AtpAgent>()(
  "AtpAgent",
  {
    dependencies: [Env.Default],
    effect: Effect.gen(function*() {
      const { agent } = yield* makeAgent
      const env = yield* Env
      const { get, set } = yield* ListService
      return {
        addUserToList: addUserToList(agent, env, get),
        removeUserFromList: removeUserFromList(agent, env, get),
        setupLists: setupLists(agent, env, set),
      }
    }),
  },
) {
  static Logging = Layer.effect(
    AtpAgent,
    Effect.gen(function*() {
      const { labelsToList } = yield* Env
      return AtpAgent.of({
        _tag: "AtpAgent",
        addUserToList: (did, label) => Effect.log(`Adding ${did} to ${label}`),
        removeUserFromList: (did, label) =>
          Effect.log(`Adding ${did} to ${label}`),
        setupLists: Effect.gen(function*() {
          yield* Effect.log(`Setting up lists for ${labelsToList}`)
        }),
      })
    }),
  )
}

export class AtpError extends Data.TaggedError("AtpError")<{
  message: string
  cause?: unknown
}> {}

export const makeAgent = Effect.gen(function*() {
  const { bskyService, labelerDid, labelerPassword } = yield* Env

  const session = new CredentialSession(bskyService)

  yield* Effect.tryPromise({
    try: () =>
      session.login({
        identifier: labelerDid,
        password: Redacted.value(labelerPassword),
      }),
    catch: (cause) =>
      new AtpError({ message: "Failed to login to Atp", cause }),
  })
  yield* Effect.log(`Connected to ATProto as ${session.session?.handle}`)

  // TODO: strict Typescript rules complain about the session not having
  // a did property, but it does. This is a workaround.
  const agent = new Agent(session as SessionManager)
  return { agent }
})

const setupLists = (
  agent: Agent,
  env: Env,
  setList: (label: Label, uri: AtUriSchemaType) => Effect.Effect<void>,
) =>
  Effect.gen(function*() {
    const { labelerDid, labelsToList } = env
    yield* Effect.logDebug(`Setting up lists for ${labelsToList}`)

    const service = yield* Effect.tryPromise({
      try: () =>
        agent.app.bsky.labeler.getServices({
          dids: [labelerDid],
          detailed: true,
        }),
      catch: (cause) =>
        new AtpError({ message: "Failed to get labeler info", cause }),
    })

    const view = service.data.views[0]
    if (!isLabelerViewDetailed(view) || !view.policies.labelValueDefinitions) {
      return yield* new AtpError({
        message:
          `Labeler definition is either missing a view or missing "labelValuesDefinitions". Check the output of: https://public.api.bsky.app/xrpc/app.bsky.labeler.getServices?dids=${labelerDid}&detailed=true`,
      })
    }
    const labelDefs = view.policies.labelValueDefinitions

    // get the users lists
    // TODO: fetch multiple pages of lists, if there are more than 100
    const lists = yield* Effect.tryPromise({
      try: () =>
        agent.app.bsky.graph.getLists({
          "actor": labelerDid,
          limit: 100,
        }),
      catch: (cause) => new AtpError({ message: "Failed to get lists", cause }),
    }).pipe(
      Effect.map((r) => r.data.lists),
    )

    const makeListEffects = labelsToList.map((label) =>
      Effect.gen(function*() {
        const def = labelDefs.find((d) => d.identifier === label)
        if (!def) {
          return yield* new LabelNotFound({ labelValue: label })
        }
        const { description, name } = def.locales[0]
        const existingList = lists.find((l) => l.name === name)
        if (existingList) return

        // create a list if there is none
        const record: AppBskyGraphList.Record = {
          purpose: "app.bsky.graph.defs#curatelist",
          name,
          description,
          createdAt: new Date().toISOString(),
        }

        const result = yield* Effect.tryPromise({
          try: () =>
            agent.app.bsky.graph.list.create(
              {
                repo: labelerDid,
              },
              record,
            ),
          catch: (cause) =>
            new AtpError({ message: "Failed to create list", cause }),
        })
        const uri = Schema.decodeUnknownOption(AtUriSchema)(result.uri)
        if (Option.isNone(uri)) {
          yield* Effect.logError("Failed to decode list uri", result.uri)
          return
        }
        // add the list to our listmap
        yield* setList(label, uri.value)

        yield* Effect.log(`Created list ${name} for label: ${label}`)
      }).pipe(
        Effect.catchTag(
          "LabelNotFound",
          (e) =>
            Effect.logWarning(
              `Skipping list creation for label: ${e.labelValue}`,
            ),
        ),
        Effect.catchAll((e) => Effect.logError("Failed to create list", e)),
        Effect.asVoid,
      )
    )

    // create the lists, 8 at a time
    yield* Effect.all(makeListEffects, { concurrency: 8 })
  }).pipe(Effect.asVoid)

const removeUserFromList = (
  agent: Agent,
  env: Env,
  getList: (label: Label) => Effect.Effect<AtUriSchemaType | undefined>,
) =>
(did: Did, label: Label) =>
  Effect.gen(function*() {
    const { labelerDid } = env
    const listUri = yield* getList(label)
    if (!listUri) {
      yield* Effect.log(`No list found for label: ${label}`)
      return
    }

    yield* Effect.logDebug(`Removing user ${did} from list ${label}`)

    // get the list first so we can get the membershipUri
    const list = yield* Effect.tryPromise({
      try: () => agent.app.bsky.graph.getList({ list: listUri }),
      catch: (cause) => new AtpError({ message: "Failed to get list", cause }),
    })
    const membership = list.data.items.find((i) => i.subject.did === did)
    if (!membership) {
      yield* Effect.log(`User ${did} not found in list: ${label}`)
      return
    }
    const membershipUri = new AtUri(membership.uri)

    yield* Effect.tryPromise({
      try: () =>
        agent.app.bsky.graph.listitem.delete({
          repo: labelerDid,
          rkey: membershipUri.rkey,
        }),
      catch: (cause) =>
        new AtpError({ message: "Failed to remove user from list", cause }),
    })
    yield* Effect.log(`Removed user ${did} from list ${label}`)
  }).pipe(
    Effect.catchAll(
      logOrWarn(`Failed to remove ${did} from list ${label}`),
    ),
  )

const addUserToList = (
  agent: Agent,
  env: Env,
  getList: (label: Label) => Effect.Effect<AtUriSchemaType | undefined>,
) =>
(userToAdd: Did, label: Label) =>
  Effect.gen(function*() {
    const { labelerDid } = env
    const listUri = yield* getList(label)

    yield* Effect.logDebug(`Adding user ${userToAdd} to list ${label}`)
    if (!listUri) {
      yield* Effect.log(`No list found for label: ${label}`)
      return
    }

    yield* Effect.tryPromise({
      try: () =>
        agent.app.bsky.graph.listitem.create(
          { repo: labelerDid },
          {
            subject: userToAdd,
            list: listUri,
            createdAt: new Date().toISOString(),
          },
        ),
      catch: (cause) =>
        new AtpError({ message: "Failed to add user to list", cause }),
    })
    yield* Effect.log(`Added user ${userToAdd} to list ${label}`)
  }).pipe(
    Effect.catchAll(
      logOrWarn(`Failed to add ${userToAdd} to list ${label}`),
    ),
  )

const logOrWarn = (message: string) => (e: unknown) =>
  Effect.gen(function*() {
    yield* Effect.logWarning(message)
    yield* Effect.logDebug(e)
  })

export class LabelNotFound extends Data.TaggedError("LabelNotFound")<{
  message?: string
  labelValue: string
  cause?: unknown
}> {
  message = `Label not found: ${this.labelValue}`
}
