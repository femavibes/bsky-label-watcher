import { PlatformLogger } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Layer, Logger } from "effect"

const fileLogger = Logger.logfmtLogger.pipe(PlatformLogger.toFile("log.txt"))

// Combine the pretty logger for console output with the file logger
const combinedLogger = Effect.map(
  fileLogger,
  (fileLogger) => Logger.zip(Logger.prettyLoggerDefault, fileLogger),
)

/**
 * Logs to both the console and "log.txt" file.
 */
export const LoggerLive = Logger.replaceScoped(
  Logger.defaultLogger,
  combinedLogger,
).pipe(Layer.provide(BunFileSystem.layer))

export const LoggerDev = Logger.pretty
