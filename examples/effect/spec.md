# Effect

## Intent

Guide agents that build, review, debug, or refactor production TypeScript applications using current Effect APIs. The skill keeps architecture explicit, grounds API advice in the target project, models data and failures with Schema, and chooses Effect runtime primitives from the behavior and lifecycle the code requires.

The skill exists to prevent remembered APIs, unchecked casts, hidden dependencies, ad hoc concurrency, and recovery behavior that changes the truth of an external boundary.

## Triggers

- **SHOULD** apply to TypeScript work using Effect workflows, schemas, services, layers, configuration, schedules, caches, streams, HTTP clients, or Effect-aware tests
- **SHOULD** apply when the user asks how to model an application boundary or choose an Effect primitive
- **SHOULD NOT** apply to TypeScript work that does not use Effect or request an Effect-based design
- **SHOULD NOT** replace an explicitly required older Effect API surface with a newer one

## Behaviors

### Behavior: Ground Advice in the Project

The agent SHALL inspect repository instructions, the installed or pinned Effect version, available package source, and local conventions before choosing uncertain APIs.

#### Scenario: Replace a Retry Loop

- **WHEN** a project pins Effect and the user asks to replace a hand-written retry loop with a Schedule
- **THEN** the agent verifies the installed Schedule API and uses a signature supported by that project instead of relying on memory

### Behavior: Load Guidance by Concern

The agent SHALL identify every Effect concern in the task and read only the matching reference files, including multiple references when a change crosses concerns.

#### Scenario: Service Owns a Stream Consumer

- **WHEN** the user asks for a service layer that owns a long-lived event consumer
- **THEN** the agent applies both service/layer guidance and stream lifetime guidance

### Behavior: Model Data and Failures With Schema

The agent SHALL use Effect Schema for application records, untrusted boundary decoding, brands, tagged variants, unions, and expected typed failures.

#### Scenario: Decode an Untrusted Event

- **WHEN** an HTTP adapter receives an unknown tagged payload
- **THEN** the agent defines a Schema union, decodes the unknown value effectfully, and maps parse failure into a typed Effect error without unchecked casts

### Behavior: Build Explicit Services and Layers

The agent SHALL keep business rules in named Effect workflows and services, represent dependencies explicitly, construct implementations in layers, and keep transport handlers thin.

#### Scenario: Extract Logic From a Handler

- **WHEN** an HTTP handler reads configuration, calls a provider, writes persistence, and maps domain failures directly
- **THEN** the agent moves the workflow behind an explicit service and layer while leaving the handler responsible for transport concerns

### Behavior: Choose Native Runtime Primitives

The agent SHALL choose Config, Schedule, Cache or memoization, request batching, Queue, PubSub, SubscriptionRef, and Stream according to the operation's semantics and lifecycle.

#### Scenario: Replace a TTL Map

- **WHEN** code uses a Map with timestamps and in-flight promises for provider lookups
- **THEN** the agent uses an Effect cache with bounded ownership and exit-aware TTL, without adding batching unless the backend has a real batch endpoint

### Behavior: Keep External Boundaries Truthful

The agent SHALL wrap external integrations in named Effect boundaries, decode untrusted responses, preserve typed transport, status, and decode failures, and add retries or fallbacks only when the operation and recovery policy justify them.

#### Scenario: Retry an Idempotent Provider Request

- **WHEN** an idempotent GET can return rate limits, transport failures, non-success status, or malformed JSON
- **THEN** the agent separates failure types, retries only bounded transient failures, and keeps exhausted failures visible

### Behavior: Test Effect Code Deterministically

The agent SHALL use Effect-aware tests, explicit layers, virtual time, and deterministic synchronization instead of global mutation or arbitrary real sleeps.

#### Scenario: Test a Delayed Worker

- **WHEN** a test must prove that a forked worker retries after a delay and publishes once
- **THEN** the agent advances TestClock and coordinates the fiber with Deferred, Queue, Latch, Ref, or another deterministic primitive

### Behavior: Preserve Types and Visible Dependencies

The agent SHALL solve type and dependency errors at their source without unchecked casts, non-null assertions, broad cause recovery, hidden authority defaults, or blind layer merging.

#### Scenario: Missing Service Requirement

- **WHEN** a workflow fails to typecheck because a persistence service is missing
- **THEN** the agent wires the service through explicit Effect and Layer composition instead of weakening types or hiding the requirement

## Constraints

### Constraint: No Invented APIs

The agent MUST NOT present an uncertain remembered API as valid without checking the pinned package or current source.

### Constraint: No Validation Bypasses

The agent MUST NOT use `as any`, unchecked casts, non-null assertions, or throwing construction at untrusted boundaries to silence type or decoding errors.

### Constraint: No Dishonest Recovery

The agent MUST NOT retry non-idempotent operations, swallow exhausted failures, catch defects as ordinary typed errors, or invent fallback values without a real recovery policy.

### Constraint: No Ad Hoc Replacements

The agent MUST NOT replace fitting Effect primitives with manual sleep synchronization, hand-rolled caches, blind layer merging, or direct `process.env` reads in application workflows.
