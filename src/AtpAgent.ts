import { Env } from "@/services/Environment"
import { Agent, CredentialSession } from "@atproto/api"
import type { SessionManager } from "@atproto/api/dist/session-manager"
import { Data, Effect, Redacted } from "effect"

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

  if (!session.did) {
    throw new Error("Login failed")
  }

  // TODO: strict Typescript rules complain about the session not having
  // a did property, but it does. This is a workaround.
  const agent = new Agent(session as SessionManager)
  return { agent }
})

export class AtpAgent extends Effect.Service<AtpAgent>()(
  "LabelerAtpAgent",
  {
    effect: makeAgent,
  },
) {}

export class AtpError extends Data.TaggedError("AtpError")<{
  message: string
  cause?: unknown
}> {}
