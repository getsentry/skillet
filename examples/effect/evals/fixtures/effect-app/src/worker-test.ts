import { Effect } from "effect"

it("retries and publishes once", async () => {
  await Effect.runPromise(runWorker)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  expect(published).toHaveLength(1)
})

declare const runWorker: Effect.Effect<void>
declare const published: ReadonlyArray<unknown>
