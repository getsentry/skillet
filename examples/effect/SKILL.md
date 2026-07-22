---
name: effect
description: Guides production TypeScript work with current Effect APIs and explicit Effect architecture; use when implementing, reviewing, debugging, or refactoring Effect schemas, services, layers, config, schedules, caches, streams, HTTP clients, or tests, but not for non-Effect TypeScript or an explicitly older API surface.
spec_hash: 42534c7af095
---

# Effect

Ground every recommendation in the target project. Inspect repository instructions, the pinned `effect` version, installed package source, and local conventions before choosing APIs. Prefer project evidence over remembered signatures.

## Choose the Relevant Guidance

Read only the references needed for the task, and combine them when concerns overlap:

- Schema, records, variants, brands, and typed errors: `references/SCHEMA.md`
- Services, layers, modules, scope ownership, and `Effect.fn`: `references/SERVICES_LAYERS.md`
- Configuration and providers: `references/CONFIG.md`
- Schedules, retry, repeat, polling, and pacing: `references/SCHEDULING.md`
- Cache, memoization, in-flight dedupe, and request batching: `references/CACHING.md`
- Streams, queues, PubSub, SubscriptionRef, and long-lived consumers: `references/STREAMS.md`
- HTTP clients, decoding, retries, and rate limits: `references/HTTP_CLIENTS.md`
- Effect-aware tests, TestClock, layers, and synchronization: `references/TESTING.md`

## Model Data and Failures

- Use `Schema.Struct(...)` for application records.
- Use brands for scalar IDs and constrained values.
- Use tagged Schema variants and unions for values that cross boundaries.
- Decode unknown boundary data with `Schema.decodeUnknownEffect(...)`.
- Model expected failures with `Schema.TaggedErrorClass`.
- Never use casts or throwing construction to skip validation at untrusted boundaries.

## Build Explicit Services and Layers

- Keep business rules in named workflows and services.
- Represent dependencies explicitly in the Effect environment.
- Build implementations with layers that own resource lifetime.
- Keep HTTP and transport handlers focused on decoding, context, invocation, and response mapping.
- Wrap public or non-trivial service methods with named `Effect.fn` calls.
- Do not hide required authority, credentials, persistence, or transports behind defaults.

## Choose Runtime Primitives by Meaning

- Use `Config` for runtime configuration and override it with providers in tests.
- Use `Schedule` for retry, repeat, polling, pacing, and backoff.
- Use `Cache` or Effect memoization when their ownership and eviction model fit.
- Use request batching only when the backend exposes a real batch operation.
- Use Queue, PubSub, SubscriptionRef, and Stream according to producer, consumer, broadcast, and backpressure needs.
- Keep long-lived fibers scoped to the layer or resource that owns them.

## Keep Boundaries Truthful

- Wrap HTTP clients, SDKs, CLIs, and external systems in named Effect boundaries.
- Decode persisted and external values before treating them as domain data.
- Preserve distinct transport, status, decode, and domain failures.
- Retry only proven transient failures on idempotent operations with a bounded policy.
- Keep exhausted failures visible unless the boundary has a real fallback.
- Keep provider and network calls outside authoritative database transactions.

## Test Deterministically

- Use Effect-aware tests and explicit test layers.
- Fork time-dependent work before advancing `TestClock`.
- Coordinate concurrent work with Deferred, Queue, Latch, Ref, fibers, or explicit hooks.
- Never add arbitrary real sleeps when deterministic synchronization can express the condition.

## Preserve Types and Dependencies

Solve missing requirements through explicit service and layer composition. Do not use `as any`, non-null assertions, broad cause recovery, `Layer.mergeAll`, `provideMerge`, or default authority merely to make code compile.

## Before Editing

1. Identify every Effect concern in the task.
2. Read the matching references and project-local source.
3. Choose APIs supported by the pinned version.
4. Make the smallest architecture-preserving change.
5. Run the project's typecheck and focused tests.
