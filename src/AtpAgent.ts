import { Env } from "@/Environment";
import { ListService } from "@/ListService";
import { AtUriSchema, Did, type AtUriSchemaType, type Label } from "@/schema";
import { Agent, type AppBskyGraphList } from "@atproto/api";
import { AtUri, CredentialSession } from "@atproto/api";
import { isLabelerViewDetailed } from "@atproto/api/dist/client/types/app/bsky/labeler/defs";
import type { SessionManager } from "@atproto/api/dist/session-manager";
import { Config, Data, Effect, Layer, Option, Schema } from "effect";

const makeLogging = Effect.gen(function* () {
  const { labelsToList } = yield* Env;
  const { set } = yield* ListService;

  for (const label of labelsToList) {
    yield* set(label, `at://list/${label}`);
    yield* Effect.log(`Created list ${label} for label: ${label}`);
  }
  return {
    addUserToList: (did: Did, label: string) =>
      Effect.log(`Adding ${did} to ${label}`),
    removeUserFromList: (did: Did, label: string) =>
      Effect.log(`Removing ${did} from ${label}`),
  };
});
export class AtpLabelerAgent extends Effect.Service<AtpLabelerAgent>()(
  "@labelwatcher/AtpLabelerAgent",
  {
    effect: Effect.gen(function* () {
      const service = yield* Config.url("BSKY_SERVICE");
      const did = yield* Schema.Config("LABELER_DID", Did);
      const password = yield* Config.string("LABELER_APP_PASSWORD");

      return yield* make({ service, did, password });
    }),
  }
) {}

export class AtpListAccountAgent extends Effect.Service<AtpListAccountAgent>()(
  "@labelwatcher/AtpListAccountAgent",
  {
    dependencies: [ListService.Default, Env.Default, AtpLabelerAgent.Default],
    effect: Effect.gen(function* () {
      const service = yield* Config.url("BSKY_SERVICE");
      const did = yield* Schema.Config("LIST_ACCOUNT_DID", Did);
      const password = yield* Config.string("LIST_ACCOUNT_APP_PASSWORD");

      const agent = yield* make({ service, did, password });
      const env = yield* Env;
      const { get, set } = yield* ListService;

      const labelerAgent = yield* AtpLabelerAgent;
      yield* setupLists(agent, labelerAgent, env, set);

      return {
        addUserToList: addUserToList(agent, env, get),
        removeUserFromList: removeUserFromList(agent, env, get),
      };
    }),
  }
) {
  static Logging = Layer.effect(
    AtpListAccountAgent,
    makeLogging.pipe(
      Effect.map(
        (v) => ({ ...v, _tag: "@labelwatcher/AtpListAccountAgent" } as const)
      )
    )
  ).pipe(Layer.provide(Layer.merge(ListService.Default, Env.Default)));
}

export class AtpError extends Data.TaggedError("AtpError")<{
  message: string;
  cause?: unknown;
}> {}

export const make = (options: { service: URL; did: Did; password: string }) =>
  Effect.gen(function* () {
    const session = new CredentialSession(options.service);

    yield* Effect.tryPromise({
      try: () =>
        session.login({
          identifier: options.did,
          password: options.password,
        }),
      catch: (cause) =>
        new AtpError({ message: "Failed to login to ATProto", cause }),
    });
    yield* Effect.log(`Connected to ATProto as ${session.session?.handle}`);

    // TODO: strict Typescript rules complain about the session not having
    // a did property, but it does. This is a workaround.
    const agent = new Agent(session as SessionManager);
    return agent;
  });

const setupLists = (
  listAccountAgent: Agent,
  labelerAgent: Agent,
  env: Env,
  setList: (label: Label, uri: AtUriSchemaType) => Effect.Effect<void>
) =>
  Effect.gen(function* () {
    const { labelsToList } = env;
    yield* Effect.logDebug(`Setting up lists for ${labelsToList}`);

    const labelerDid = labelerAgent.did;
    if (!labelerDid) {
      return yield* new AtpError({
        message: "Labeler did is not set",
      });
    }

    const service = yield* Effect.tryPromise({
      try: () =>
        labelerAgent.app.bsky.labeler.getServices({
          dids: [labelerDid],
          detailed: true,
        }),
      catch: (cause) =>
        new AtpError({ message: "Failed to get labeler info", cause }),
    });

    const view = service.data.views[0];
    if (!isLabelerViewDetailed(view) || !view.policies.labelValueDefinitions) {
      return yield* new AtpError({
        message: `Labeler definition is either missing a view or missing "labelValuesDefinitions". Check the output of: https://public.api.bsky.app/xrpc/app.bsky.labeler.getServices?dids=${labelerDid}&detailed=true`,
      });
    }
    const labelDefs = view.policies.labelValueDefinitions;

    // get the users lists
    // TODO: fetch multiple pages of lists, if there are more than 100
    const lists = yield* Effect.tryPromise({
      try: () =>
        listAccountAgent.app.bsky.graph.getLists({
          actor: labelerDid,
          limit: 100,
        }),
      catch: (cause) => new AtpError({ message: "Failed to get lists", cause }),
    }).pipe(Effect.map((r) => r.data.lists));

    for (const label of labelsToList) {
      const def = labelDefs.find((d) => d.identifier === label);
      if (!def) {
        yield* Effect.logWarning(
          `Label "${label}" not found, skipping list creation.`
        );
        continue;
      }
      const { description, name } = def.locales[0];
      const existingList = lists.find((l) => l.name === name);
      if (existingList) {
        const uri = Schema.decodeUnknownSync(AtUriSchema)(existingList.uri);
        yield* setList(label, uri);
        yield* Effect.log(`Existing list linked for label: ${label}`);
        continue;
      }
      // create a list if there is none
      const record: AppBskyGraphList.Record = {
        purpose: "app.bsky.graph.defs#curatelist",
        name,
        description,
        createdAt: new Date().toISOString(),
      };
      const result = yield* Effect.tryPromise(() =>
        listAccountAgent.app.bsky.graph.list.create(
          {
            repo: labelerDid,
          },
          record
        )
      ).pipe(
        Effect.catchTag("UnknownException", (cause) =>
          Effect.logError(`Failed to create list for label: ${label}`, cause)
        )
      );
      if (!result) continue;

      const uri = Schema.decodeUnknownOption(AtUriSchema)(result.uri);
      if (Option.isNone(uri)) {
        yield* Effect.logError("Failed to decode list uri", result.uri);
        continue;
      }
      // add the list to our listmap
      yield* setList(label, uri.value);
      yield* Effect.log(`Created list ${name} for label: ${label}`);
    }
  }).pipe(Effect.asVoid);

const removeUserFromList =
  (
    agent: Agent,
    env: Env,
    getList: (label: Label) => Effect.Effect<AtUriSchemaType | undefined>
  ) =>
  (did: Did, label: Label) =>
    Effect.gen(function* () {
      const listAccountDid = agent.did;
      if (!listAccountDid) {
        return yield* new AtpError({
          message: "List account did is not set",
        });
      }
      const listUri = yield* getList(label);
      if (!listUri) {
        yield* Effect.log(`No list found for label: ${label}`);
        return;
      }

      yield* Effect.logDebug(`Removing user ${did} from list ${label}`);

      // get the list first so we can get the membershipUri
      const list = yield* Effect.tryPromise({
        try: () => agent.app.bsky.graph.getList({ list: listUri }),
        catch: (cause) =>
          new AtpError({ message: "Failed to get list", cause }),
      });
      const membership = list.data.items.find((i) => i.subject.did === did);
      if (!membership) {
        yield* Effect.log(`User ${did} not found in list: ${label}`);
        return;
      }
      const membershipUri = new AtUri(membership.uri);

      yield* Effect.tryPromise({
        try: () =>
          agent.app.bsky.graph.listitem.delete({
            repo: listAccountDid,
            rkey: membershipUri.rkey,
          }),
        catch: (cause) =>
          new AtpError({ message: "Failed to remove user from list", cause }),
      });
      yield* Effect.log(`Removed user ${did} from list ${label}`);
    }).pipe(
      Effect.catchAll(logOrWarn(`Failed to remove ${did} from list ${label}`))
    );

const addUserToList =
  (
    agent: Agent,
    env: Env,
    getList: (label: Label) => Effect.Effect<AtUriSchemaType | undefined>
  ) =>
  (userToAdd: Did, label: Label) =>
    Effect.gen(function* () {
      const listUri = yield* getList(label);
      const listAccountDid = agent.did;
      if (!listAccountDid) {
        return yield* new AtpError({
          message: "List account did is not set",
        });
      }

      yield* Effect.logDebug(`Adding user ${userToAdd} to list ${label}`);
      if (!listUri) {
        yield* Effect.log(`No list found for label: ${label}`);
        return;
      }

      yield* Effect.tryPromise({
        try: () =>
          agent.app.bsky.graph.listitem.create(
            { repo: listAccountDid },
            {
              subject: userToAdd,
              list: listUri,
              createdAt: new Date().toISOString(),
            }
          ),
        catch: (cause) =>
          new AtpError({ message: "Failed to add user to list", cause }),
      });
      yield* Effect.log(`Added user ${userToAdd} to list ${label}`);
    }).pipe(
      Effect.catchAll(logOrWarn(`Failed to add ${userToAdd} to list ${label}`))
    );

const logOrWarn = (message: string) => (e: unknown) =>
  Effect.gen(function* () {
    yield* Effect.logWarning(message);
    yield* Effect.logDebug(e);
  });

export class LabelNotFound extends Data.TaggedError("LabelNotFound")<{
  message?: string;
  labelValue: string;
  cause?: unknown;
}> {
  message = `Label not found: ${this.labelValue}`;
}
