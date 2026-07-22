import { Effect, Stream } from "effect"

export const startAuditConsumer = (events: Stream.Stream<string>) =>
  Effect.gen(function* () {
    yield* Effect.fork(
      Stream.runForEach(events, (event) => Effect.logInfo(event)),
    )
  })
