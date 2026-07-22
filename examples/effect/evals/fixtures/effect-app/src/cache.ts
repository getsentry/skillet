import { Effect } from "effect"

const entries = new Map<string, { value: string; expiresAt: number }>()
const inFlight = new Map<string, Promise<string>>()

export const resolveChannel = (channelId: string) =>
  Effect.promise(async () => {
    const cached = entries.get(channelId)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const pending = inFlight.get(channelId) ?? fetchChannel(channelId)
    inFlight.set(channelId, pending)
    const value = await pending
    entries.set(channelId, { value, expiresAt: Date.now() + 60_000 })
    inFlight.delete(channelId)
    return value
  })

declare const fetchChannel: (channelId: string) => Promise<string>
