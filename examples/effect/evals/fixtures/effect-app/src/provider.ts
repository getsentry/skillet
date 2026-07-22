import { Effect } from "effect"

export interface Account {
  readonly id: string
  readonly plan: "free" | "pro"
}

export const getAccount = (accountId: string): Effect.Effect<Account> =>
  Effect.tryPromise(() =>
    fetch(`https://provider.example/accounts/${accountId}`).then((response) =>
      response.json() as Promise<Account>,
    ),
  ).pipe(Effect.retry({ times: 20 }))
