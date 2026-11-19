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
| `realtime-messaging` | Low-latency delivery to connected clients: chat, presence, live updates. Storing chat history is not delivery |
| `feed-fanout` | One write distributed to many readers' timelines or inboxes |
| `ledger-payments` | Money movement and balances where double-application is unacceptable |
| `multi-tenant-data` | Many customers' data in shared infrastructure, where the source treats them as tenants |
| `search-indexing` | Building and querying a secondary search index |
| `read-cache` | A serving layer whose main job is absorbing reads, including static files behind a CDN |
| `rate-limiting` | Admission control and quota enforcement |
| `blob-pipeline` | Storing and transforming large objects: media, files, backups. Serving small static files is `read-cache` |
| `analytics-pipeline` | Batch or streaming aggregation for reporting |
| `control-plane` | Configuration, orchestration and metadata that other systems depend on. Tag the card by what its system is, not by one component |
| `auth-session` | Authentication, sessions and tokens |
| `coordination` | Leader election, locks, consensus and membership |
| `traffic-routing` | Carrying other systems' traffic to the right place: DNS, anycast and route announcement, load balancing, proxies |
| `ml-serving` | Producing and serving model output in production: feature, training and inference pipelines, embeddings, ranking and recommendation. Reporting and aggregation without a model is `analytics-pipeline` |

## Topics

The design question a record answers.

| Value | The question |
|---|---|
| `service-boundaries` | One deployable or several, and where the lines go. Not on-premises against cloud (`capacity-cost`), and not a rollout mechanism (`deployment-rollout`) |
| `datastore-choice` | Which kind of store, or moving from one to another |
| `datastore-partitioning` | Splitting one store: sharding, partitioning, tenant placement |
| `replication-failover` | Replicas, promotion, and multi-region placement |
| `consistency-transactions` | What must be atomic or strongly consistent, and how |
| `async-processing` | Moving work off the request path: queues, logs, schedulers |
| `delivery-idempotency` | Retries, duplicates, ordering and exactly-once effects |
| `caching` | Whether to cache a read path, and invalidation |
| `load-shedding-backpressure` | Behaviour past capacity: limits, timeouts, queue bounds. Not every overload: the record must be about what the system does at the limit |
| `tenant-isolation` | Keeping one customer's load or failure from reaching others. Isolation between event types or internal pipelines is `dependency-failure` |
| `schema-data-migration` | Changing schemas or moving data while serving traffic |
| `deployment-rollout` | Shipping changes and configuration safely |
| `capacity-cost` | Sizing, headroom and spend |
| `observability` | Detecting and diagnosing problems |
| `dependency-failure` | Behaviour when something the system relies on degrades |
| `backup-restore` | Backups, restores and recovering deleted or corrupted data. Rebooting a site and failing over are `replication-failover` |
