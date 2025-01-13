import { ServerApiLive } from "@/HttpApi"
import { LabelWatcher } from "@/LabelWatcher"
import { LoggerLive } from "@/logger"
import { Env } from "@/services/Environment"
import { Layer, ManagedRuntime } from "effect"

// import { DevTools } from "@effect/experimental"
// import { BunSocket } from "@effect/platform-bun"

// const DevToolsLive = DevTools.layerWebSocket().pipe(
//   Layer.provide(BunSocket.layerWebSocketConstructor),
// )

export const AppLiveLayer = Layer.mergeAll(
  Env.Default,
  LabelWatcher.Default,
  ServerApiLive,
)

const WithLogger = Layer.provide(AppLiveLayer, LoggerLive)

export const AppRuntime = ManagedRuntime.make(WithLogger)
