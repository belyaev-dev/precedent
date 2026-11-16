# Vocabulary

The controlled values used in cards. Add a value only when a real source needs it and no existing value fits.

## Workloads

What the system does, by shape of load. Never an industry.

| Value | Meaning |
|---|---|
| `crud-app` | Request/response application over a transactional store; the default product backend |
| `job-queue` | Deferred or scheduled work pulled by workers |
| `webhook-delivery` | Pushing events to endpoints the operator does not control |
| `event-streaming` | Ordered, replayable log consumed by several readers |
| `realtime-messaging` | Low-latency delivery to connected clients: chat, presence, live updates |
| `feed-fanout` | One write distributed to many readers' timelines or inboxes |
| `ledger-payments` | Money movement and balances where double-application is unacceptable |
| `multi-tenant-data` | Many customers' data in shared infrastructure |
| `search-indexing` | Building and querying a secondary search index |
| `read-cache` | A serving layer whose main job is absorbing reads |
| `rate-limiting` | Admission control and quota enforcement |
| `blob-pipeline` | Storing and transforming large objects: media, files, backups |
| `analytics-pipeline` | Batch or streaming aggregation for reporting |
| `control-plane` | Configuration, orchestration and metadata that other systems depend on |
| `auth-session` | Authentication, sessions and tokens |
| `coordination` | Leader election, locks, consensus and membership |

## Topics

The design question a record answers.

| Value | The question |
|---|---|
| `service-boundaries` | One deployable or several, and where the lines go |
| `datastore-choice` | Which kind of store, or moving from one to another |
| `datastore-partitioning` | Splitting one store: sharding, partitioning, tenant placement |
| `replication-failover` | Replicas, promotion, and multi-region placement |
| `consistency-transactions` | What must be atomic or strongly consistent, and how |
| `async-processing` | Moving work off the request path: queues, logs, schedulers |
| `delivery-idempotency` | Retries, duplicates, ordering and exactly-once effects |
| `caching` | Whether to cache a read path, and invalidation |
| `load-shedding-backpressure` | Behaviour past capacity: limits, timeouts, queue bounds |
| `tenant-isolation` | Keeping one customer's load or failure from reaching others |
| `schema-data-migration` | Changing schemas or moving data while serving traffic |
| `deployment-rollout` | Shipping changes and configuration safely |
| `capacity-cost` | Sizing, headroom and spend |
| `observability` | Detecting and diagnosing problems |
| `dependency-failure` | Behaviour when something the system relies on degrades |
