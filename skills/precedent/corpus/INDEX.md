# Precedent corpus index

Corpus version: `cc3129f691ae` (17 records from 7 cards)

Scale is the system's tier on three axes: T traffic, D data, O team (operators). `?` means the source gives no usable figure; such records have unknown scale and never count as a match for your tier. Shape is the deployed footprint the source states (single-node, single-database, single-site, partitioned, multi-region), which is often the only size signal a small system gives. Floor is the advisory minimum tier for copying a decision, where one exists. Tier definitions are in SKILL.md.

The first table lists the systems, one per card: use it to find examples of how a kind of system is built and to pick a baseline. The tables after it list the decision and failure records, grouped by the card's first workload. Open `cards/<card id>.yaml` for the full card before citing anything from it.

## Systems

| Card | System | As of | Scale | Shape | Workloads | Architecture |
|---|---|---|---|---|---|---|
| `37signals-2023-solid-queue` | 37signals: HEY background jobs (Active Job, Resque and Solid Queue) | 2023-12 | T? D? O? | - | job-queue | HEY runs its Active Job work on two backends at once: Resque on Redis, and the new database-backed Solid Queue, which at publication carried about a third of a stated total of roughly 18 million jobs a day, with more being moved. |
| `brandur-2015-postgres-job-queue` | Not named in the source (the author's employer): Postgres-backed job queue (Queue Classic, then Que) | undated | T? D? O? | - | job-queue | A job queue kept in a Postgres table, run first on the Queue Classic library and then on Que, whose workers lock jobs with Postgres advisory locks. |
| `healthchecks-2025-tarpit-outage` | Healthchecks.io: Load balancer rate limiting for the ping endpoints | 2025-11 | T? D? O? | - | rate-limiting | Rate limiting is layered to stop ping floods overloading the database: HAProxy on the load balancers applies a lax first limit, and NGINX on the application servers applies a stricter limit and geo-blocking before requests reach the application. |
| `notion-2021-postgres-sharding` | Notion: Postgres block store | 2021 | T? D? O? | partitioned | multi-tenant-data | Notion moved its block data, and every table related to it, from one Postgres monolith to 480 logical shards, each a Postgres schema, spread evenly over 32 physical databases; the application routes each query by workspace ID. |
| `sourcehut-2020-simple-infrastructure` | SourceHut: SourceHut code forge infrastructure | 2020-04 | T? D? O? | - | crud-app | SourceHut runs on 10 dedicated servers and about 30 virtual machines, all provisioned by hand, with no Kubernetes, Docker or CloudFormation. Its application is split into independent miniservices that can fail separately, and many pages make only one or two database round-trips. |
| `stackoverflow-2016-architecture` | Stack Overflow: Stack Overflow and the Stack Exchange network | 2016-02 | T3 D? O? | partitioned | crud-app, multi-tenant-data, read-cache | One multi-tenant ASP.NET application on IIS serves every Q&A site behind HAProxy load balancers. SQL Server is the single source of truth, with Redis, Elasticsearch and a tag engine fed from it, and everything is duplicated in a second data center. |
| `tosbourn-2023-client-rails-jobs` | Unnamed client of Tosbourn Ltd: Client Rails application background jobs | 2023 | T0 D? O? | - | job-queue | A small Rails application whose background jobs go through Active Job. Its jobs had just been moved from Sidekiq, which needs Redis, to GoodJob, which keeps them in Postgres alongside the app's data. |

## crud-app

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `sourcehut-2020-simple-infrastructure#d1` | decision | T? D? O? | - | - | deployment-rollout, capacity-cost | SourceHut, 2020-04: Provision plain servers by hand on minimal Alpine Linux and avoid Kubernetes, Docker and CloudFormation |
| `sourcehut-2020-simple-infrastructure#d2` | decision | T? D? O? | - | - | service-boundaries, dependency-failure | SourceHut, 2020-04: Split the forge into independent miniservices and use email so an outage does not stop users working |
| `stackoverflow-2016-architecture#d1` | decision | T3 D? O? | partitioned | - | service-boundaries, capacity-cost | Stack Overflow, 2016-02: Serve every Q&A site from one multi-tenant application and keep web servers overprovisioned |
| `stackoverflow-2016-architecture#d2` | decision | T3 D? O? | partitioned | - | datastore-choice, capacity-cost | Stack Overflow, 2016-02: Use Elasticsearch for search instead of SQL Server full-text search, because SQL CPUs are expensive |
| `stackoverflow-2016-architecture#d3` | decision | T3 D? O? | partitioned | - | caching | Stack Overflow, 2016-02: Cache in two layers, a web-server HTTP cache and Redis, and clear the first layer through Redis pub/sub |
| `stackoverflow-2016-architecture#d4` | decision | T3 D? O? | partitioned | - | capacity-cost, load-shedding-backpressure | Stack Overflow, 2016-02: Push updates to browsers over websockets, which are more efficient than polling, at the cost of load balancer port exhaustion |

## job-queue

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `37signals-2023-solid-queue#d1` | decision | T? D? O? | - | - | async-processing, datastore-choice | 37signals, 2023-12: Moved jobs from Resque on Redis to a database-backed queue, starting with the most critical ones |
| `37signals-2023-solid-queue#d2` | decision | T? D? O? | - | - | async-processing, datastore-choice | 37signals, 2023-12: Database queue design that keeps the polled table small and claims jobs with SKIP LOCKED |
| `brandur-2015-postgres-job-queue#d1` | decision | T? D? O? | - | - | consistency-transactions, async-processing | Not named in the source (the author's employer), undated: Keep jobs in Postgres so an enqueue commits or rolls back with the work that created it |
| `brandur-2015-postgres-job-queue#d2` | decision | T? D? O? | - | - | async-processing | Not named in the source (the author's employer), undated: Switched from Queue Classic to Que, which delayed but did not remove the degradation |
| `brandur-2015-postgres-job-queue#f1` | failure | T? D? O? | - | - | datastore-choice, async-processing, dependency-failure | Not named in the source (the author's employer), undated: A long-lived transaction pinned dead rows and made a Postgres job queue run away |
| `tosbourn-2023-client-rails-jobs#d1` | decision | T0 D? O? | - | - | datastore-choice, capacity-cost, async-processing | Unnamed client of Tosbourn Ltd, 2023: Removed Redis and Sidekiq for GoodJob on the existing Postgres database, to cut cost and parts |

## multi-tenant-data

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `notion-2021-postgres-sharding#d1` | decision | T? D? O? | partitioned | - | datastore-partitioning, datastore-choice | Notion, 2021: Shard the Postgres monolith in application code once autovacuum stalled, rather than scale up or adopt a packaged sharding product |
| `notion-2021-postgres-sharding#d2` | decision | T? D? O? | partitioned | - | datastore-partitioning, consistency-transactions | Notion, 2021: Partition by workspace ID and shard every table reachable from the block table |
| `notion-2021-postgres-sharding#d3` | decision | T? D? O? | partitioned | - | schema-data-migration, datastore-partitioning | Notion, 2021: Move to shards with an audit log and catch-up script, not logical replication, because the strained monolith left little room for extra load |

## rate-limiting

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `healthchecks-2025-tarpit-outage#f1` | failure | T? D? O? | - | - | load-shedding-backpressure, observability | Healthchecks.io, 2025-11: Tarpit rate limiting held sockets open until the load balancers ran out of connection slots and rejected real traffic |
| `healthchecks-2025-tarpit-outage#d1` | decision | T? D? O? | - | - | load-shedding-backpressure | Healthchecks.io, 2025-11: Answer rate-limited requests with an immediate HTTP 429 instead of tarpitting them |
