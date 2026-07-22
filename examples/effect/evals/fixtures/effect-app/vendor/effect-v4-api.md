# Local Effect API Notes

This fixture models the project's pinned Effect API surface for the eval tasks.

- `Schedule.spaced(duration)` creates a fixed-delay schedule.
- `Cache.makeWith({ capacity, lookup, timeToLive })` supports exit-aware TTL.
- `Schema.decodeUnknownEffect(schema)` validates unknown values in Effect.
- `Schema.TaggedErrorClass(tag, fields)` models typed expected failures.
- `Context.Service<Service, Shape>()(key)` defines an explicit service.
- `Layer.effect(Service, effect)` builds a service implementation.
- `Effect.fn(name)` names public and non-trivial workflows.
- `Effect.forkScoped(effect)` ties a fiber to the current scope.
- `TestClock.adjust(duration)` advances virtual time in tests.
