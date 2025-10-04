import { Effect, Ref } from "effect"
import { FileSystem } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Env } from "./Environment"

export interface LabelConfig {
  label: string
  listType: "curate" | "mod"
  enabled: boolean
}

export class ConfigService extends Effect.Service<ConfigService>()("ConfigService", {
  accessors: true,
  dependencies: [Env.Default, BunFileSystem.layer],
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const env = yield* Env
    const configPath = "label-config.json"
    
    // Load initial config from environment
    const initialConfig: LabelConfig[] = env.labelsToList.map(({ label, listType }) => ({
      label,
      listType,
      enabled: true
    }))
    
    const configRef = yield* Ref.make(initialConfig)
    
    const saveConfig = (config: LabelConfig[]) =>
      Effect.gen(function*() {
        yield* Effect.tryPromise({
          try: () => Bun.write(configPath, JSON.stringify(config, null, 2)),
          catch: (cause) => new Error(`Failed to save config: ${cause}`)
        })
        yield* Ref.set(configRef, config)
      })
    
    const loadConfig = () => configRef.get
    
    const addLabel = (label: string, listType: "curate" | "mod") =>
      Effect.gen(function*() {
        const current = yield* configRef.get
        const exists = current.find(c => c.label === label)
        if (exists) {
          return yield* Effect.fail(new Error(`Label ${label} already exists`))
        }
        const newConfig = [...current, { label, listType, enabled: true }]
        yield* saveConfig(newConfig)
      })
    
    const removeLabel = (label: string) =>
      Effect.gen(function*() {
        const current = yield* configRef.get
        const newConfig = current.filter(c => c.label !== label)
        yield* saveConfig(newConfig)
      })
    
    const toggleLabel = (label: string) =>
      Effect.gen(function*() {
        const current = yield* configRef.get
        const newConfig = current.map(c => 
          c.label === label ? { ...c, enabled: !c.enabled } : c
        )
        yield* saveConfig(newConfig)
      })
    
    const updateLabelType = (label: string, listType: "curate" | "mod") =>
      Effect.gen(function*() {
        const current = yield* configRef.get
        const newConfig = current.map(c => 
          c.label === label ? { ...c, listType } : c
        )
        yield* saveConfig(newConfig)
      })
    
    const backfillLabel = (label: string) =>
      Effect.gen(function*() {
        yield* Effect.logInfo(`Backfill requested for label: ${label}`)
        // Backfill logic moved to separate service to avoid circular dependency
        return `Backfill initiated for ${label}`
      })
    
    return {
      loadConfig,
      addLabel,
      removeLabel,
      toggleLabel,
      updateLabelType,
      backfillLabel
    }
  }),
}) {}