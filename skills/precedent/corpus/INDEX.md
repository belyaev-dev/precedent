# Precedent corpus index

Corpus version: `3531d085aca0` (28 records from 13 cards)

Scale is the system's tier on three axes: T traffic, D data, O team (operators). `?` means the source gives no usable figure; such records have unknown scale and never count as a match for your tier. Shape is the deployed footprint the source states (single-node, single-database, partitioned, multi-region), which is often the only size signal a small system gives. Floor is the advisory minimum tier for copying a decision, where one exists. Tier definitions are in SKILL.md.

The first table lists the systems, one per card: use it to find examples of how a kind of system is built and to pick a baseline. The tables after it list the decision and failure records, grouped by the card's first workload. Open `cards/<card id>.yaml` for the full card before citing anything from it.

## Systems

| Card | System | As of | Scale | Shape | Workloads | Architecture |
|---|---|---|---|---|---|---|
| `37signals-2023-solid-queue` | 37signals: HEY background jobs (Active Job, Resque and Solid Queue) | 2023-12 | T? D? O? | - | job-queue | HEY runs its Active Job work on two backends at once: Resque on Redis, and the new database-backed Solid Queue, which at publication carried about a third of a stated total of roughly 18 million jobs a day, with more being moved. |
| `37signals-2025-fizzy-database` | 37signals: Fizzy database layer | 2025 | T? D? O? | single-database | multi-tenant-data | Fizzy, a 37signals product, runs on one big MySQL database holding every customer's data. An earlier design giving each customer its own SQLite database ran only for staff and invited testers and was dropped before launch. |
| `atlassian-2022-site-deletion-restore` | Atlassian: Cloud multi-tenant platform | 2022-04 | T? D? O? | multi-region | multi-tenant-data | Atlassian's cloud products run on a multi-tenant microservice platform in which services and databases serve many customers, and each shard holds several tenants' data, kept isolated from one another. |
| `brandur-2015-postgres-job-queue` | Not named in the source (the author's employer): Postgres-backed job queue (Queue Classic, then Que) | undated | T? D? O? | - | job-queue | A job queue kept in a Postgres table, run first on the Queue Classic library and then on Que, whose workers lock jobs with Postgres advisory locks. |
| `dwolla-2019-webhooks` | Dwolla: Webhook notifications | 2019 | T? D? O? | - | webhook-delivery | Each subscribed customer has its own SQS queue and Lambda handler; events are looked up and sent to that customer's queue, and delivery results go to a separate queue for storage. |
| `marble-2026-webhooks` | Marble: Workspace event webhooks | 2026-05 | T? D? O? | - | webhook-delivery | A jobs worker takes workspace event IDs from one queue and creates one delivery row per matching endpoint with an upsert keyed by event and endpoint; a second queue drives the outbound HTTP requests. |
| `notion-2021-postgres-sharding` | Notion: Postgres block store | 2021 | T? D? O? | partitioned | multi-tenant-data | Notion moved its block data, and every table related to it, from one Postgres monolith to 480 logical shards, each a Postgres schema, spread evenly over 32 physical databases; the application routes each query by workspace ID. |
| `nylas-2018-webhooks` | Nylas: Webhook notifications for account changes | 2018 | T? D? O? | partitioned | webhook-delivery | After the rebuild there is one reader per shard, consuming an ordered change log from AWS Kinesis; everything else, such as backfilling a customer endpoint that had been down, reads from the database. |
| `onfido-2024-webhooks` | Onfido: Webhook delivery service | 2024-03 | T? D? O? | - | webhook-delivery | At the time of the incident all webhook messages were processed through a single queue at a cloud provider. |
| `slack-2017-job-queue` | Slack: Job queue | 2017 | T4 D? O? | partitioned | job-queue | Jobs are queued in Redis clusters and executed by worker pools. Slack added Kafka in front of Redis as a durable buffer rather than replacing Redis, keeping the existing enqueue and dequeue interfaces. |
| `tailscale-2021-control-plane-state` | Tailscale: Control plane (CONTROL) | undated | T? D? O? | single-node | control-plane | Tailscale's coordination server, CONTROL, runs as one Go process on one VM. Its data model was held in memory behind one mutex and persisted by writing the whole structure to disk as JSON on every edit, until the move to etcd described here. |
| `tosbourn-2023-client-rails-jobs` | Unnamed client of Tosbourn Ltd: Client Rails application background jobs | 2023 | T0 D? O? | - | job-queue | A small Rails application whose background jobs go through Active Job. Its jobs had just been moved from Sidekiq, which needs Redis, to GoodJob, which keeps them in Postgres alongside the app's data. |
| `workos-2025-directory-sync-webhooks` | WorkOS: Directory Sync webhook delivery | 2025-09 | T? D? O? | - | webhook-delivery | Directory Sync webhook delivery draws on a pool of worker capacity shared across customers. |

## control-plane

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `tailscale-2021-control-plane-state#d1` | decision | T? D? O? | single-node | - | datastore-choice, schema-data-migration | Tailscale, undated: Hold all state in memory behind one lock and rewrite a single JSON file on every change |
| `tailscale-2021-control-plane-state#d2` | decision | T? D? O? | single-node | - | datastore-choice, schema-data-migration | Tailscale, undated: Replace the rewritten JSON file with etcd as a minimal database for a single-process control plane |

## job-queue

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `37signals-2023-solid-queue#d1` | decision | T? D? O? | - | - | async-processing, datastore-choice | 37signals, 2023-12: Moved jobs from Resque on Redis to a database-backed queue, starting with the most critical ones |
| `37signals-2023-solid-queue#d2` | decision | T? D? O? | - | - | async-processing, datastore-choice | 37signals, 2023-12: Database queue design that keeps the polled table small and claims jobs with SKIP LOCKED |
| `brandur-2015-postgres-job-queue#d1` | decision | T? D? O? | - | - | consistency-transactions, async-processing | Not named in the source (the author's employer), undated: Keep jobs in Postgres so an enqueue commits or rolls back with the work that created it |
| `brandur-2015-postgres-job-queue#d2` | decision | T? D? O? | - | - | async-processing | Not named in the source (the author's employer), undated: Switched from Queue Classic to Que, which delayed but did not remove the degradation |
| `brandur-2015-postgres-job-queue#f1` | failure | T? D? O? | - | - | datastore-choice, async-processing, dependency-failure | Not named in the source (the author's employer), undated: A long-lived transaction pinned dead rows and made a Postgres job queue run away |
| `slack-2017-job-queue#f1` | failure | T4 D? O? | partitioned | - | load-shedding-backpressure, async-processing, dependency-failure | Slack, 2017: Database contention filled Redis memory, and a full Redis could neither accept nor release jobs |
| `slack-2017-job-queue#d1` | decision | T4 D? O? | partitioned | - | async-processing, load-shedding-backpressure | Slack, 2017: Added Kafka in front of the Redis job queue instead of replacing Redis |
| `slack-2017-job-queue#d2` | decision | T4 D? O? | partitioned | - | delivery-idempotency, consistency-transactions | Slack, 2017: Enqueue path acknowledges after the Kafka leader only, trading a small risk of lost jobs for latency |
| `tosbourn-2023-client-rails-jobs#d1` | decision | T0 D? O? | - | - | datastore-choice, capacity-cost, async-processing | Unnamed client of Tosbourn Ltd, 2023: Removed Redis and Sidekiq for GoodJob on the existing Postgres database, to cut cost and parts |

## multi-tenant-data

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `37signals-2025-fizzy-database#d1` | decision | T? D? O? | single-database | - | tenant-isolation, datastore-partitioning, datastore-choice | 37signals, 2025: Pre-launch design, never shipped: a SQLite database per customer on the app servers, to put data near users |
| `37signals-2025-fizzy-database#d2` | decision | T? D? O? | single-database | - | datastore-partitioning, tenant-isolation, datastore-choice | 37signals, 2025: Fall back to one shared MySQL database for all accounts days before launch |
| `atlassian-2022-site-deletion-restore#f1` | failure | T? D? O? | multi-region | - | deployment-rollout, backup-restore | Atlassian, 2022-04: A bulk deletion script fed site IDs instead of app IDs deleted 883 customer sites with no warning |
| `atlassian-2022-site-deletion-restore#f2` | failure | T? D? O? | multi-region | - | backup-restore, tenant-isolation | Atlassian, 2022-04: Restoring hundreds of sites out of shared multi-tenant data stores had no batch tooling and took up to two weeks |
| `notion-2021-postgres-sharding#d1` | decision | T? D? O? | partitioned | - | datastore-partitioning, datastore-choice | Notion, 2021: Shard the Postgres monolith in application code once autovacuum stalled, rather than scale up or adopt a packaged sharding product |
| `notion-2021-postgres-sharding#d2` | decision | T? D? O? | partitioned | - | datastore-partitioning, consistency-transactions | Notion, 2021: Partition by workspace ID and shard every table reachable from the block table |
| `notion-2021-postgres-sharding#d3` | decision | T? D? O? | partitioned | - | schema-data-migration, datastore-partitioning | Notion, 2021: Move to shards with an audit log and catch-up script, not logical replication, because the strained monolith left little room for extra load |

## webhook-delivery

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `dwolla-2019-webhooks#d1` | decision | T? D? O? | - | - | tenant-isolation, async-processing | Dwolla, 2019: Per-customer SQS queue and Lambda handler replace one shared RabbitMQ queue so slow or heavy customers stop delaying others |
| `dwolla-2019-webhooks#d2` | decision | T? D? O? | - | - | tenant-isolation, capacity-cost | Dwolla, 2019: Pre-create disabled per-customer resources and toggle the event source mapping instead of creating and deleting them on subscribe |
| `marble-2026-webhooks#d1` | decision | T? D? O? | - | - | observability, async-processing | Marble, 2026-05: Own the webhook pipeline after customers could not see what happened to a webhook, leaving a hosted queue |
| `marble-2026-webhooks#d2` | decision | T? D? O? | - | - | delivery-idempotency | Marble, 2026-05: Workers atomically claim a delivery before sending so overlapping workers or retried queue messages do not send duplicates |
| `nylas-2018-webhooks#d1` | decision | T? D? O? | partitioned | - | async-processing, capacity-cost | Nylas, 2018: One reader per shard replaces one reader thread per customer webhook after delays reached 10 minutes |
| `nylas-2018-webhooks#d2` | decision | T? D? O? | partitioned | - | async-processing, datastore-choice | Nylas, 2018: Kinesis chosen over the MySQL binlog and Kafka as the ordered source of changes, mainly for operational simplicity |
| `nylas-2018-webhooks#d3` | decision | T? D? O? | partitioned | - | deployment-rollout, observability | Nylas, 2018: New sender ran two months in a simulated mode that sent nothing, compared against the legacy sender, before cutover |
| `nylas-2018-webhooks#f1` | failure | T? D? O? | partitioned | - | consistency-transactions, delivery-idempotency | Nylas, 2018: Resuming from the last sent MySQL auto-increment id made the new webhook sender skip transactions in testing |
| `onfido-2024-webhooks#f1` | failure | T? D? O? | - | - | delivery-idempotency, load-shedding-backpressure, observability | Onfido, 2024-03: A surge of duplicate webhooks and the retry setup filled one queue's provider quota, so new events were not delivered for hours |
| `workos-2025-directory-sync-webhooks#f1` | failure | T? D? O? | - | - | tenant-isolation, load-shedding-backpressure | WorkOS, 2025-09: One customer's endpoint outage made deliveries time out, filled the shared worker pool and delayed Directory Sync webhooks for everyone |
