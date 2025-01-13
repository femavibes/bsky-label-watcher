import { Api } from "@/HttpApi"
import { LabelWatcher } from "@/LabelWatcher"
import { LoggerLive } from "@/logger"
import { Layer, ManagedRuntime } from "effect"

export const AppLiveLayer = Layer.mergeAll(
  LabelWatcher.Default,
  Api.Default,
)

const WithLogger = Layer.provide(AppLiveLayer, LoggerLive)

export const AppRuntime = ManagedRuntime.make(WithLogger)
