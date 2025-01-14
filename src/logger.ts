import { PlatformLogger } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Config, Effect, Layer, Logger, LogLevel } from "effect"

const fileLogger = Effect.gen(function*() {
  const path = yield* Config.string("LOG_FILEPATH")
  return yield* Logger.logfmtLogger.pipe(PlatformLogger.toFile(path))
})

const LogLevelLive = Config.logLevel("LOG_LEVEL").pipe(
  Config.withDefault(LogLevel.Info),
  Effect.andThen((level) =>
    // Set the minimum log level
    Logger.minimumLogLevel(level)
  ),
  Layer.unwrapEffect, // Convert the effect into a layer
)

/**
 * Logs to both the console and "log.txt" file.
 */
export const LoggerLive = Logger.replaceScoped(
  Logger.defaultLogger,
  fileLogger,
).pipe(Layer.provide(BunFileSystem.layer), Layer.provide(LogLevelLive))

export const LoggerDev = Logger.pretty
