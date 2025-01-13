import {
  Option,
  Data,
  Duration,
  Effect,
  Queue,
  Ref,
  Schedule,
  Schema,
  Sink,
  Stream,
} from "effect";
import { FileSystem } from "@effect/platform";
import { Env } from "@/services/Environment";
import { NumberFromString } from "effect/Schema";
import { BunFileSystem } from "@effect/platform-bun";

export class Cursor extends Effect.Service<Cursor>()("Cursor ", {
  accessors: true,
  dependencies: [Env.Default, BunFileSystem.layer],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const env = yield* Env;
    const { labelerCursorFilepath } = env;

    const initialValue = yield* fs.readFileString(labelerCursorFilepath).pipe(
      Effect.flatMap(decodeCursor),
      Effect.tap((cursor) => Effect.log("Loaded cursor from file: ", cursor)),
      Effect.catchTag("SystemError", noFileFallback)
    );

    const cursorRef = yield* Ref.make(initialValue);

    const q = yield* Queue.unbounded<number>();

    const start = Stream.fromQueue(q).pipe(
      // emit values at most once per second
      Stream.aggregateWithin(
        Sink.last<number>(),
        Schedule.spaced(Duration.seconds(1))
      ),
      Stream.filter(Option.isSome),
      Stream.map((o) => o.value),
      Stream.runForEach(writeCursor(env, fs)),
      Stream.runDrain
    );

    const set = (value: number) =>
      Effect.gen(function* () {
        yield* Ref.update(cursorRef, () => value);
        yield* q.offer(value);
      });

    return {
      set,
      get: cursorRef.get,
      start,
    };
  }),
}) {}

const CursorSchema = NumberFromString.pipe(Schema.greaterThanOrEqualTo(0));
const decodeCursor = Schema.decode(CursorSchema);

const writeCursor = (env: Env, fs: FileSystem.FileSystem) => (cursor: number) =>
  Effect.gen(function* () {
    yield* Effect.log("Writing cursor to file: ", cursor);
    const { labelerCursorFilepath } = env;
    yield* Effect.tryPromise({
      try: () => Bun.write(labelerCursorFilepath, cursor.toString()),
      catch: (cause) =>
        new CursorError({ message: "Failed to write cursor", cause }),
    });
    yield* fs.writeFileString(labelerCursorFilepath, cursor.toString());
  }).pipe(Effect.catchAllCause(Effect.logError));

const noFileFallback = () =>
  Effect.gen(function* () {
    yield* Effect.logWarning("No cursor file found, starting from 0");
    return 0;
  });

export class CursorError extends Data.TaggedError("CursorError")<{
  message: string;
  cause?: unknown;
}> {}
