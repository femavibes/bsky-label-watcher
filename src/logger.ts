import { PlatformLogger } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Config, Effect, Layer, Logger, LogLevel } from "effect"

const fileLogger = Logger.logfmtLogger.pipe(PlatformLogger.toFile("log.txt"))

// Combine the pretty logger for console output with the file logger
const combinedLogger = Effect.map(
  fileLogger,
  (fileLogger) => Logger.zip(Logger.prettyLoggerDefault, fileLogger),
)

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
  combinedLogger,
).pipe(Layer.provide(BunFileSystem.layer), Layer.provide(LogLevelLive))

export const LoggerDev = Logger.pretty
