import { Effect, Layer } from "effect"

export const program = loadInvoices.pipe(
  Effect.provideMerge(Layer.empty),
) as any

declare const loadInvoices: Effect.Effect<ReadonlyArray<string>, Error, InvoiceRepo>
declare class InvoiceRepo {}
