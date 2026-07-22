import { Effect } from "effect"

export const postInvoice = (request: Request) =>
  Effect.gen(function* () {
    const input = (yield* Effect.promise(() => request.json())) as {
      customerId: string
      amount: number
    }
    const token = process.env.BILLING_TOKEN!
    const response = yield* Effect.promise(() =>
      fetch("https://billing.example/invoices", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),
    )
    yield* saveInvoice(input.customerId, response.status)
    return new Response(null, { status: 202 })
  })

declare const saveInvoice: (
  customerId: string,
  status: number,
) => Effect.Effect<void>
