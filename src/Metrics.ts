import { Effect, Ref } from "effect"
import type { Did, Label } from "./schema.js"

export interface MetricsData {
  usersAdded: number
  usersRemoved: number
  addFailures: number
  removeFailures: number
  addRetries: number
  removeRetries: number
  labelStats: Record<string, {
    added: number
    removed: number
    addFailures: number
    removeFailures: number
  }>
}

export class Metrics extends Effect.Service<Metrics>()("Metrics", {
  accessors: true,
  effect: Effect.gen(function*() {
    const ref = yield* Ref.make<MetricsData>({
      usersAdded: 0,
      usersRemoved: 0,
      addFailures: 0,
      removeFailures: 0,
      addRetries: 0,
      removeRetries: 0,
      labelStats: {}
    })

    const recordUserAdded = (label: Label) =>
      Ref.update(ref, (metrics) => ({
        ...metrics,
        usersAdded: metrics.usersAdded + 1,
        labelStats: {
          ...metrics.labelStats,
          [label]: {
            added: (metrics.labelStats[label]?.added || 0) + 1,
            removed: metrics.labelStats[label]?.removed || 0,
            addFailures: metrics.labelStats[label]?.addFailures || 0,
            removeFailures: metrics.labelStats[label]?.removeFailures || 0,
          }
        }
      }))

    const recordUserRemoved = (label: Label) =>
      Ref.update(ref, (metrics) => ({
        ...metrics,
        usersRemoved: metrics.usersRemoved + 1,
        labelStats: {
          ...metrics.labelStats,
          [label]: {
            added: metrics.labelStats[label]?.added || 0,
            removed: (metrics.labelStats[label]?.removed || 0) + 1,
            addFailures: metrics.labelStats[label]?.addFailures || 0,
            removeFailures: metrics.labelStats[label]?.removeFailures || 0,
          }
        }
      }))

    const recordAddFailure = (label: Label) =>
      Ref.update(ref, (metrics) => ({
        ...metrics,
        addFailures: metrics.addFailures + 1,
        labelStats: {
          ...metrics.labelStats,
          [label]: {
            added: metrics.labelStats[label]?.added || 0,
            removed: metrics.labelStats[label]?.removed || 0,
            addFailures: (metrics.labelStats[label]?.addFailures || 0) + 1,
            removeFailures: metrics.labelStats[label]?.removeFailures || 0,
          }
        }
      }))

    const recordRemoveFailure = (label: Label) =>
      Ref.update(ref, (metrics) => ({
        ...metrics,
        removeFailures: metrics.removeFailures + 1,
        labelStats: {
          ...metrics.labelStats,
          [label]: {
            added: metrics.labelStats[label]?.added || 0,
            removed: metrics.labelStats[label]?.removed || 0,
            addFailures: metrics.labelStats[label]?.addFailures || 0,
            removeFailures: (metrics.labelStats[label]?.removeFailures || 0) + 1,
          }
        }
      }))

    const recordAddRetry = () =>
      Ref.update(ref, (metrics) => ({
        ...metrics,
        addRetries: metrics.addRetries + 1
      }))

    const recordRemoveRetry = () =>
      Ref.update(ref, (metrics) => ({
        ...metrics,
        removeRetries: metrics.removeRetries + 1
      }))

    const getMetrics = ref.get

    return {
      recordUserAdded,
      recordUserRemoved,
      recordAddFailure,
      recordRemoveFailure,
      recordAddRetry,
      recordRemoveRetry,
      getMetrics
    }
  }),
}) {}