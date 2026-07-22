import { Effect } from "effect"

export const pollUntilReady = Effect.gen(function* () {
  while (true) {
    const ready = yield* checkReady
    if (ready) return
    yield* Effect.sleep("250 millis")
  }
})

declare const checkReady: Effect.Effect<boolean>
