import { Env } from "@/Environment"
import { labelToListUri } from "@/lists"
import type { Did, Label } from "@/schema"
import { Agent, AtUri, CredentialSession } from "@atproto/api"
import type { SessionManager } from "@atproto/api/dist/session-manager"
import { Data, Effect, Layer, Redacted } from "effect"

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

export class AtpAgent extends Effect.Service<AtpAgent>()(
  "AtpAgent",
  {
    dependencies: [Env.Default],
    effect: Effect.gen(function*() {
      const { agent } = yield* makeAgent
      const env = yield* Env
      return {
        addUserToList: addUserToList(agent, env),
        removeUserFromList: removeUserFromList(agent, env),
      }
    }),
  },
) {
  static Logging = Layer.succeed(
    AtpAgent,
    AtpAgent.of({
      _tag: "AtpAgent",
      addUserToList: (did, label) => Effect.log(`Adding ${did} to ${label}`),
      removeUserFromList: (did, label) =>
        Effect.log(`Adding ${did} to ${label}`),
    }),
  )
}

export class AtpError extends Data.TaggedError("AtpError")<{
  message: string
  cause?: unknown
}> {}

const removeUserFromList =
  (agent: Agent, env: Env) => (did: Did, label: Label) =>
    Effect.gen(function*() {
      const { labelerDid } = env
      const listUri = labelToListUri[label]

      yield* Effect.logDebug(`Removing user ${did} from list ${label}`)

      // get the list first so we can get the membershipUri
      const list = yield* Effect.tryPromise({
        try: () => agent.app.bsky.graph.getList({ list: listUri }),
        catch: (cause) =>
          new AtpError({ message: "Failed to get list", cause }),
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

const addUserToList =
  (agent: Agent, env: Env) => (userToAdd: Did, label: Label) =>
    Effect.gen(function*() {
      const { labelerDid } = env
      const listUri = labelToListUri[label] as string | undefined

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
