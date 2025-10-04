import { Env } from "@/Environment";
import { ListService } from "@/ListService";
import { Metrics } from "@/Metrics";
import { AtUriSchema, Did, type AtUriSchemaType, type Label } from "@/schema";
import { Agent, type AppBskyGraphList } from "@atproto/api";
import { AtUri, CredentialSession } from "@atproto/api";
import { isLabelerViewDetailed } from "@atproto/api/dist/client/types/app/bsky/labeler/defs";
import type { SessionManager } from "@atproto/api/dist/session-manager";
import { Config, Data, Effect, Layer, Option, Schedule, Schema } from "effect";

const makeLogging = Effect.gen(function* () {
  const { labelsToList } = yield* Env;
  const { set } = yield* ListService;

  for (const { label, listType } of labelsToList) {
    yield* set(label, `at://list/${label}`, listType);
    yield* Effect.log(`Created ${listType} list ${label} for label: ${label}`);
  }
  return {
    addUserToList: (did: Did, label: string) =>
      Effect.log(`Adding ${did} to ${label}`),
    removeUserFromList: (did: Did, label: string) =>
      Effect.log(`Removing ${did} from ${label}`),
  };
});
export class LabelerInfo extends Effect.Service<LabelerInfo>()(
  "@labelwatcher/LabelerInfo",
  {
    effect: Effect.gen(function* () {
      const service = yield* Config.url("BSKY_SERVICE");
      const did = yield* Schema.Config("LABELER_DID", Did);
      const password = yield* Config.string("LABELER_APP_PASSWORD");

      const agent = yield* make({ service, did, password });

      const serviceDoc = yield* Effect.tryPromise({
        try: () =>
          agent.app.bsky.labeler.getServices({
            dids: [did],
            detailed: true,
          }),
        catch: (cause) =>
          new AtpError({ message: "Failed to get labeler info", cause }),
      });

      return { view: serviceDoc.data.views[0], did };
    }),
  }
) {}

export class AtpListAccountAgent extends Effect.Service<AtpListAccountAgent>()(
  "@labelwatcher/AtpListAccountAgent",
  {
    dependencies: [ListService.Default, Env.Default, LabelerInfo.Default, Metrics.Default],
    effect: Effect.gen(function* () {
      const service = yield* Config.url("BSKY_SERVICE");
      const labelerDid = yield* Schema.Config("LABELER_DID", Did);
      const labelerPassword = yield* Config.string("LABELER_APP_PASSWORD");
      const did = yield* Schema.Config("LIST_ACCOUNT_DID", Did).pipe(
        Config.withDefault(labelerDid)
      );
      const password = yield* Config.string("LIST_ACCOUNT_APP_PASSWORD").pipe(
        Config.withDefault(labelerPassword)
      );

      const agent = yield* make({ service, did, password });
      const env = yield* Env;
      const { get, set } = yield* ListService;
      const metrics = yield* Metrics;

      const labelerInfo = yield* LabelerInfo;
      yield* setupLists(agent, labelerInfo, env, set);

      return {
        addUserToList: addUserToList(agent, env, get, metrics),
        removeUserFromList: removeUserFromList(agent, env, get, metrics),
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
  ).pipe(Layer.provide(Layer.mergeAll(ListService.Default, Env.Default, Metrics.Default)));
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
  labelerInfo: LabelerInfo,
  env: Env,
  setList: (label: Label, uri: AtUriSchemaType, listType: "curate" | "mod") => Effect.Effect<void>
) =>
  Effect.gen(function* () {
    const { labelsToList } = env;
    yield* Effect.logDebug(`Setting up lists for ${labelsToList}`);

    yield* Effect.log("LIST ACCOUNT", listAccountAgent.did);

    const listAccountDid = listAccountAgent.assertDid;
    const labelerDid = labelerInfo.did;
    const view = labelerInfo.view;
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
          actor: listAccountDid,
          limit: 100,
        }),
      catch: (cause) => new AtpError({ message: "Failed to get lists", cause }),
    }).pipe(Effect.map((r) => r.data.lists));

    for (const { label, listType } of labelsToList) {
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
        yield* setList(label, uri, listType);
        yield* Effect.log(`Existing ${listType} list linked for label: ${label}`);
        continue;
      }
      // create a list if there is none
      const purpose = listType === "mod" 
        ? "app.bsky.graph.defs#modlist" 
        : "app.bsky.graph.defs#curatelist";
      const record: AppBskyGraphList.Record = {
        $type: "app.bsky.graph.list",
        purpose,
        name,
        description,
        createdAt: new Date().toISOString(),
      };
      const result = yield* Effect.tryPromise(() =>
        listAccountAgent.app.bsky.graph.list.create(
          {
            repo: listAccountDid,
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
      yield* setList(label, uri.value, listType);
      yield* Effect.log(`Created ${listType} list ${name} for label: ${label}`);
    }
  }).pipe(Effect.asVoid);

const removeUserFromList =
  (
    agent: Agent,
    env: Env,
    getList: (label: Label) => Effect.Effect<AtUriSchemaType | undefined>,
    metrics: Metrics
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

      // find the user in the list to get the membershipUri
      const membership = yield* findUserInList(agent, listUri, did);
      if (!membership) {
        yield* Effect.log(`User ${did} not found in list: ${label}`);
        return;
      }
      const membershipUri = new AtUri(membership.uri);

      const removeOperation = Effect.tryPromise({
        try: () =>
          agent.app.bsky.graph.listitem.delete({
            repo: listAccountDid,
            rkey: membershipUri.rkey,
          }),
        catch: (cause) =>
          new AtpError({ message: "Failed to remove user from list", cause }),
      });

      yield* removeOperation.pipe(
        Effect.retry(Schedule.exponential("1 seconds").pipe(Schedule.compose(Schedule.recurs(2)))),
        Effect.tap(() => metrics.recordUserRemoved(label)),
        Effect.tap(() => Effect.log(`Removed user ${did} from list ${label}`)),
        Effect.catchAll((error) => 
          Effect.gen(function* () {
            yield* metrics.recordRemoveFailure(label);
            yield* Effect.logError(`Failed to remove ${did} from list ${label} after retries:`, error);
          })
        )
      );
    });

const addUserToList =
  (
    agent: Agent,
    env: Env,
    getList: (label: Label) => Effect.Effect<AtUriSchemaType | undefined>,
    metrics: Metrics
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

      // Check if user is already in the list
      const existingMembership = yield* findUserInList(agent, listUri, userToAdd);
      if (existingMembership) {
        yield* Effect.logDebug(`User ${userToAdd} already in list ${label}, skipping`);
        return;
      }

      const addOperation = Effect.tryPromise({
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

      yield* addOperation.pipe(
        Effect.retry(Schedule.exponential("1 seconds").pipe(Schedule.compose(Schedule.recurs(2)))),
        Effect.tap(() => metrics.recordUserAdded(label)),
        Effect.tap(() => Effect.log(`Added user ${userToAdd} to list ${label}`)),
        Effect.catchAll((error) => 
          Effect.gen(function* () {
            yield* metrics.recordAddFailure(label);
            yield* Effect.logError(`Failed to add ${userToAdd} to list ${label} after retries:`, error);
          })
        )
      );
    });

const findUserInList = (agent: Agent, listUri: AtUriSchemaType, userDid: Did) =>
  Effect.gen(function* () {
    let cursor: string | undefined;
    
    do {
      const response = yield* Effect.tryPromise({
        try: () => agent.app.bsky.graph.getList({ 
          list: listUri, 
          limit: 100,
          cursor 
        }),
        catch: (cause) =>
          new AtpError({ message: "Failed to get list", cause }),
      });
      
      const foundUser = response.data.items.find((i) => i.subject.did === userDid);
      if (foundUser) {
        return foundUser;
      }
      
      cursor = response.data.cursor;
    } while (cursor);
    
    return undefined;
  });

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
