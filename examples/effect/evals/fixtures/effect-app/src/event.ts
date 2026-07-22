import { Effect } from "effect"

type Event =
  | { readonly type: "started"; readonly runId: string }
  | { readonly type: "finished"; readonly runId: string; readonly result: unknown }

export class InvalidEvent extends Error {}

export const decodeEvent = (input: unknown): Effect.Effect<Event, InvalidEvent> =>
  Effect.succeed(input as Event)
