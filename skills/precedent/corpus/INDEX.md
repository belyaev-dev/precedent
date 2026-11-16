# Precedent corpus index

Corpus version: `b6432b34e547` (83 records from 33 cards)

Scale is the system's tier on three axes: T traffic, D data, O team (operators). `?` means the source gives no usable figure; such records have unknown scale and never count as a match for your tier. Shape is the deployed footprint the source states (single-node, single-database, partitioned, multi-region), which is often the only size signal a small system gives. Floor is the advisory minimum tier for copying a decision, where one exists. Tier definitions are in SKILL.md.

The first table lists the systems, one per card: use it to find examples of how a kind of system is built and to pick a baseline. The tables after it list the decision and failure records, grouped by the card's first workload. Open `cards/<card id>.yaml` for the full card before citing anything from it.

## Systems

| Card | System | As of | Scale | Shape | Workloads | Architecture |
|---|---|---|---|---|---|---|
| `37signals-2023-datacenter-overview` | 37signals: Basecamp, HEY and heritage apps hosting | 2023-08 | T? D? O? | multi-region | crud-app | 37signals serves its apps, which have millions of users every day, from two datacenters, one in Ashburn, Virginia and one in Chicago. Both facilities are run by Deft, a provider the company has used for more than a decade. |
| `37signals-2023-solid-queue` | 37signals: HEY background jobs (Active Job, Resque and Solid Queue) | 2023-12 | T? D? O? | - | job-queue | HEY runs its Active Job work on two backends at once: Resque on Redis, and the new database-backed Solid Queue, which at publication carried about a third of a stated total of roughly 18 million jobs a day, with more being moved. |
| `37signals-2025-fizzy-database` | 37signals: Fizzy database layer | 2025 | T? D? O? | single-database | multi-tenant-data | Fizzy, a 37signals product, runs on one big MySQL database holding every customer's data. An earlier design giving each customer its own SQLite database ran only for staff and invited testers and was dropped before launch. |
| `atlassian-2022-site-deletion-restore` | Atlassian: Cloud multi-tenant platform | 2022-04 | T? D? O? | multi-region | multi-tenant-data | Atlassian's cloud products run on a multi-tenant microservice platform in which services and databases serve many customers, and each shard holds several tenants' data, kept isolated from one another. |
| `brandur-2015-postgres-job-queue` | Not named in the source (the author's employer): Postgres-backed job queue (Queue Classic, then Que) | undated | T? D? O? | - | job-queue | A job queue kept in a Postgres table, run first on the Queue Classic library and then on Que, whose workers lock jobs with Postgres advisory locks. |
| `dwolla-2019-webhooks` | Dwolla: Webhook notifications | 2019 | T? D? O? | - | webhook-delivery | Each subscribed customer has its own SQS queue and Lambda handler; events are looked up and sent to that customer's queue, and delivery results go to a separate queue for storage. |
| `ethicalads-2021-ad-server` | EthicalAds: Ad server | 2021 | T1 D? O? | single-database | crud-app | A separate Django ad server, split out of the Read the Docs code line in late 2019, with Postgres as the source of truth and Redis for caching. Most traffic is a few APIs such as requesting and viewing an ad. It runs on autoscaled VM scale sets, usually 3-4 instances. |
| `fathom-2020-viral-customer-backlog` | Fathom Analytics: Pageview queue and MySQL database | 2020-08 | T? D? O? | single-database | analytics-pipeline, job-queue | Fathom runs on serverless infrastructure (Lambda, SQS and similar, through Laravel Vapor), with pageviews processed from a background queue. |
| `fathom-2021-singlestore-database` | Fathom Analytics: Pageview ingest and application database | 2021-09 | T? D? O? | single-database | analytics-pipeline | Fathom's ingest point runs on Laravel Vapor and writes pageviews to SQS. SingleStore handles everything else over persistent connections, including tens of thousands of inserts per second, all key/value lookups and application rate limiting. |
| `figma-2026-caching-platform` | Figma: FigCache, the Redis caching and ephemeral data platform | 2026-03 | T? D? O? | partitioned | read-cache | FigCache is a stateless, RESP-wire-protocol proxy service backed by a fleet of Redis clusters on AWS ElastiCache, complemented by first-party client libraries. It multiplexes commands from far more client connections onto a finite number of outbound connections to Redis. |
| `gitlab-2017-database-outage` | GitLab: GitLab.com PostgreSQL database | 2017-01 | T? D? O? | single-database | crud-app | GitLab.com uses a single PostgreSQL primary and a single secondary in hot-standby mode that is used only for failover. One database therefore handles all the load, which the post calls not ideal and a single point of failure. |
| `govuk-2020-email-alert-lost-jobs` | GOV.UK: Email Alert API background processing | 2020-12 | T? D? O? | - | job-queue | Email Alert API uses Sidekiq, with jobs held in Redis, for background work including generating and sending email. Jobs can be lost when enqueueing fails or when a worker is killed while processing. |
| `grafana-2021-hosted-prometheus-outage` | Grafana Labs: Grafana Cloud Hosted Prometheus (Grafana Enterprise Metrics clusters) | 2021-03 | T? D? O? | multi-region | rate-limiting, multi-tenant-data | Grafana Cloud runs about 15 large multi-tenant Grafana Enterprise Metrics clusters on Kubernetes clusters around the world. Tenants share a cluster under per-tenant limits on how much data they can send and how quickly, and the clusters are sized from those limits. |
| `healthchecks-2019-hosting-setup` | Healthchecks.io: Hosting and operations setup | 2019-08 | T? D? O0 | single-database | crud-app | Healthchecks.io runs on Hetzner bare-metal machines, each with one role: two HAProxy load balancers, three application servers (Nginx, uWSGI, Django) and a PostgreSQL primary with a hot standby. There are no containers, no autoscaling and nothing serverless. |
| `healthchecks-2025-ping-ingest` | Healthchecks.io: Ping ingest endpoints (hc-ping.com) | 2025 | T4 D? O? | single-database | job-queue | The hosted service's ping endpoints run a closed-source Go application on three physical servers. Each request is validated and queued on an in-process channel, and workers write it to a PostgreSQL database that runs on a separate server. |
| `healthchecks-2025-tarpit-outage` | Healthchecks.io: Load balancer rate limiting for the ping endpoints | 2025-11 | T? D? O? | - | rate-limiting | Rate limiting is layered to stop ping floods overloading the database: HAProxy on the load balancers applies a lax first limit, and NGINX on the application servers applies a stricter limit and geo-blocking before requests reach the application. |
| `healthchecks-2026-object-storage` | Healthchecks.io: Ping request body storage (S3-compatible object storage) | 2026-04 | T2 D2 O0 | single-node | blob-pipeline | Healthchecks.io keeps the first 100kB of each ping request body: tiny bodies go in PostgreSQL, larger ones in S3-compatible object storage. That storage is now Versity S3 Gateway over a Btrfs filesystem on one dedicated server, instead of a managed provider. |
| `letsencrypt-2020-database-servers` | Let's Encrypt: Certificate issuance database | 2020 | T? D? O? | single-database | crud-app | The CA software, Boulder, runs against a single MariaDB database using InnoDB. Several replicas are kept and some read operations are sent to them to reduce load on the primary. |
| `marble-2026-webhooks` | Marble: Workspace event webhooks | 2026-05 | T? D? O? | - | webhook-delivery | A jobs worker takes workspace event IDs from one queue and creates one delivery row per matching endpoint with an upsert keyed by event and endpoint; a second queue drives the outbound HTTP requests. |
| `notion-2021-postgres-sharding` | Notion: Postgres block store | 2021 | T? D? O? | partitioned | multi-tenant-data | Notion moved its block data, and every table related to it, from one Postgres monolith to 480 logical shards, each a Postgres schema, spread evenly over 32 physical databases; the application routes each query by workspace ID. |
| `nylas-2018-webhooks` | Nylas: Webhook notifications for account changes | 2018 | T? D? O? | partitioned | webhook-delivery | After the rebuild there is one reader per shard, consuming an ordered change log from AWS Kinesis; everything else, such as backfilling a customer endpoint that had been down, reads from the database. |
| `onfido-2024-webhooks` | Onfido: Webhook delivery service | 2024-03 | T? D? O? | - | webhook-delivery | At the time of the incident all webhook messages were processed through a single queue at a cloud provider. |
| `onlineornot-2023-lambda-write-fan-in` | OnlineOrNot: Uptime check scheduling and result storage | undated | T? D? O? | single-database | job-queue | A single RDS Postgres instance holds the data. A Lambda fires every minute to find URLs to check, an SQS queue triggers checker Lambdas, and their results go through SNS into a second queue that batches them for one Lambda to write to the database. |
| `pusher-2020-webhooks-kinesis` | Pusher: Channels webhooks | undated | T4 D? O? | - | webhook-delivery | At the heart of Channels webhooks is a generic event stream on beanstalkd. A packager process turns the events that should lead to a customer webhook into jobs on a send_webhook queue, and sender processes make the HTTP requests to customer servers. |
| `segment-2018-goodbye-microservices` | Twilio Segment: Server-side destinations pipeline | 2018-07 | T? D? O? | - | webhook-delivery | After the change, all server-side destinations run in one monolithic service. Centrifuge, which this move inspired, was to replace the individual per-destination queues and be responsible for sending events to that single service. |
| `slack-2017-job-queue` | Slack: Job queue | 2017 | T4 D? O? | partitioned | job-queue | Jobs are queued in Redis clusters and executed by worker pools. Slack added Kafka in front of Redis as a durable buffer rather than replacing Redis, keeping the existing enqueue and dequeue interfaces. |
| `sourcehut-2020-simple-infrastructure` | SourceHut: SourceHut code forge infrastructure | 2020-04 | T? D? O? | - | crud-app | SourceHut runs on 10 dedicated servers and about 30 virtual machines, all provisioned by hand, with no Kubernetes, Docker or CloudFormation. Its application is split into independent miniservices that can fail separately, and many pages make only one or two database round-trips. |
| `stackoverflow-2016-architecture` | Stack Overflow: Stack Overflow and the Stack Exchange network | 2016-02 | T3 D? O? | partitioned | crud-app, multi-tenant-data, read-cache | One multi-tenant ASP.NET application on IIS serves every Q&A site behind HAProxy load balancers. SQL Server is the single source of truth, with Redis, Elasticsearch and a tag engine fed from it, and everything is duplicated in a second data center. |
| `tailscale-2021-control-plane-state` | Tailscale: Control plane (CONTROL) | undated | T? D? O? | single-node | control-plane | Tailscale's coordination server, CONTROL, runs as one Go process on one VM. Its data model was held in memory behind one mutex and persisted by writing the whole structure to disk as JSON on every edit, until the move to etcd described here. |
| `tarsnap-2012-ec2-power-outage` | Tarsnap: Tarsnap central server and S3-backed storage | 2012-06 | T? D? O? | - | blob-pipeline | Tarsnap stores all user data in Amazon S3 and keeps only metadata cached on its central server in EC2. The design is meant to survive the loss of everything held on EC2: the data is read back from S3 and the full operation log is replayed. |
| `tarsnap-2023-infrastructure` | Tarsnap: Tarsnap backup service infrastructure | 2023-08 | T? D? O? | - | blob-pipeline | The Tarsnap server runs in Amazon EC2 and stores archived data in Amazon S3, acknowledging it to clients only after it is stored. Payments go through Stripe and PayPal. |
| `tosbourn-2023-client-rails-jobs` | Unnamed client of Tosbourn Ltd: Client Rails application background jobs | 2023 | T0 D? O? | - | job-queue | A small Rails application whose background jobs go through Active Job. Its jobs had just been moved from Sidekiq, which needs Redis, to GoodJob, which keeps them in Postgres alongside the app's data. |
| `workos-2025-directory-sync-webhooks` | WorkOS: Directory Sync webhook delivery | 2025-09 | T? D? O? | - | webhook-delivery | Directory Sync webhook delivery draws on a pool of worker capacity shared across customers. |

## analytics-pipeline

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `fathom-2020-viral-customer-backlog#f1` | failure | T? D? O? | single-database | - | tenant-isolation, load-shedding-backpressure, capacity-cost | Fathom Analytics, 2020-08: A viral customer's pageviews backlog the shared queue for all sites while the database runs out of disk IOPS |
| `fathom-2020-viral-customer-backlog#f2` | failure | T? D? O? | single-database | - | schema-data-migration, observability | Fathom Analytics, 2020-08: Unindexed backlog tables and a text-typed site ID kept the database slow after the disk was fixed |
| `fathom-2020-viral-customer-backlog#d1` | decision | T? D? O? | single-database | - | load-shedding-backpressure, async-processing | Fathom Analytics, 2020-08: Cap concurrent queue workers on purpose to protect the database, accepting a bigger backlog |
| `fathom-2020-viral-customer-backlog#d2` | decision | T? D? O? | single-database | - | tenant-isolation, load-shedding-backpressure | Fathom Analytics, 2020-08: Limit pageviews processed per site per minute so one viral site cannot block the rest, then drop it |
| `fathom-2021-singlestore-database#d1` | decision | T? D? O? | single-database | - | datastore-choice, capacity-cost, load-shedding-backpressure | Fathom Analytics, 2021-09: Stop using DynamoDB and serve key/value lookups, ingest and rate limiting from one fixed-size SingleStore cluster |
| `fathom-2021-singlestore-database#d2` | decision | T? D? O? | single-database | - | capacity-cost, async-processing | Fathom Analytics, 2021-09: Keep database connections open by moving the dashboard and queue off per-request Lambda connections |

## blob-pipeline

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `healthchecks-2026-object-storage#d1` | decision | T2 D2 O0 | single-node | - | datastore-choice, capacity-cost, backup-restore | Healthchecks.io, 2026-04: Replace managed object storage with Versity S3 Gateway on one server, backed up by rsync, to stop provider slowdowns |
| `tarsnap-2012-ec2-power-outage#f1` | failure | T? D? O? | - | - | backup-restore, dependency-failure | Tarsnap, 2012-06: An EC2 power loss corrupted the metadata disk, and a full rebuild from S3 ran slowly through recovery code only ever tested on small data |
| `tarsnap-2012-ec2-power-outage#d1` | decision | T? D? O? | - | - | backup-restore, datastore-choice | Tarsnap, 2012-06: Keep all user data in S3 and only cached metadata on the EC2 server so that all server state can be rebuilt |
| `tarsnap-2012-ec2-power-outage#d2` | decision | T? D? O? | - | - | backup-restore | Tarsnap, 2012-06: Treat the corrupted local state as untrustworthy and rebuild it all from S3 instead of trusting it |
| `tarsnap-2023-infrastructure#d1` | decision | T? D? O? | - | - | consistency-transactions, backup-restore | Tarsnap, 2023-08: Acknowledge archives only after they reach standard S3, not the reduced-redundancy class |
| `tarsnap-2023-infrastructure#d2` | decision | T? D? O? | - | - | replication-failover, dependency-failure | Tarsnap, 2023-08: Run the server on one EC2 instance and accept an outage if its hardware fails |

## control-plane

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `tailscale-2021-control-plane-state#d1` | decision | T? D? O? | single-node | - | datastore-choice, schema-data-migration | Tailscale, undated: Hold all state in memory behind one lock and rewrite a single JSON file on every change |
| `tailscale-2021-control-plane-state#d2` | decision | T? D? O? | single-node | - | datastore-choice, schema-data-migration | Tailscale, undated: Replace the rewritten JSON file with etcd as a minimal database for a single-process control plane |

## crud-app

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `37signals-2023-datacenter-overview#d1` | decision | T? D? O? | multi-region | - | deployment-rollout, capacity-cost | 37signals, 2023-08: Rebuild both sites as identical footprints on a new network and move every server in about six months |
| `37signals-2023-datacenter-overview#d2` | decision | T? D? O? | multi-region | - | replication-failover, deployment-rollout | 37signals, 2023-08: Run Basecamp 4 active in both datacenters with BGP Anycast and keep other apps active and standby |
| `ethicalads-2021-ad-server#d1` | decision | T1 D? O? | single-database | - | service-boundaries, capacity-cost | EthicalAds, 2021: Split the ad server out of the Read the Docs app and tune Django query by query instead of rewriting it |
| `ethicalads-2021-ad-server#d2` | decision | T1 D? O? | single-database | - | capacity-cost, deployment-rollout | EthicalAds, 2021: Choose ad server hosting by load test, picking Azure AppService over Heroku for predictable latency |
| `gitlab-2017-database-outage#f1` | failure | T? D? O? | single-database | - | replication-failover, backup-restore | GitLab, 2017-01: Rebuilding a lagging replica by hand ended with the primary's data directory being wiped |
| `gitlab-2017-database-outage#f2` | failure | T? D? O? | single-database | - | backup-restore, observability | GitLab, 2017-01: Daily pg_dump backups had been silently failing, and no other backup layer was usable |
| `gitlab-2017-database-outage#d1` | decision | T? D? O? | single-database | - | backup-restore, schema-data-migration | GitLab, 2017-01: Restore from a staging copy of the six-hour-old manual snapshot, not the 24-hour-old one |
| `gitlab-2017-database-outage#d2` | decision | T? D? O? | single-database | - | backup-restore, deployment-rollout | GitLab, 2017-01: Spend the effort on recoverability and on making the host obvious, not on blocking dangerous commands |
| `healthchecks-2019-hosting-setup#d1` | decision | T? D? O0 | single-database | - | deployment-rollout, capacity-cost | Healthchecks.io, 2019-08: Run plain dedicated servers, one role each, with no containers, autoscaling or serverless |
| `healthchecks-2019-hosting-setup#d2` | decision | T? D? O0 | single-database | - | replication-failover | Healthchecks.io, 2019-08: Fail over the PostgreSQL primary to its hot standby by hand, using a tested procedure |
| `healthchecks-2019-hosting-setup#d3` | decision | T? D? O0 | single-database | - | service-boundaries, capacity-cost | Healthchecks.io, 2019-08: Replace Cloudflare's load balancer with two self-run HAProxy machines |
| `healthchecks-2019-hosting-setup#d4` | decision | T? D? O0 | single-database | - | service-boundaries, replication-failover | Healthchecks.io, 2019-08: Drop a dedicated private switch and second network cards for Hetzner's vSwitch |
| `letsencrypt-2020-database-servers#d1` | decision | T? D? O? | single-database | - | datastore-partitioning, capacity-cost | Let's Encrypt, 2020: Run the whole certificate authority against one database and scale the hardware instead of sharding |
| `letsencrypt-2020-database-servers#d2` | decision | T? D? O? | single-database | - | capacity-cost | Let's Encrypt, 2020: Replace the database servers with two-CPU EPYC machines holding 24 NVMe drives under OpenZFS |
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
| `govuk-2020-email-alert-lost-jobs#d1` | decision | T? D? O? | - | - | async-processing, delivery-idempotency | GOV.UK, 2020-12: Recover lost email jobs with an infrequent sweeper worker instead of buying Sidekiq Pro |
| `govuk-2020-email-alert-lost-jobs#d2` | decision | T? D? O? | - | - | delivery-idempotency, async-processing | GOV.UK, 2020-12: Make each worker idempotent with advisory locks for slow jobs and row locks for fast email jobs |
| `healthchecks-2025-ping-ingest#d1` | decision | T4 D? O? | single-database | - | async-processing, capacity-cost | Healthchecks.io, 2025: Batch ping writes with COPY in one transaction instead of calling a stored procedure once per ping |
| `healthchecks-2025-ping-ingest#d2` | decision | T4 D? O? | single-database | - | caching, load-shedding-backpressure | Healthchecks.io, 2025: Cache not-found results for UUID ping URLs so repeated pings to missing checks skip the database |
| `onlineornot-2023-lambda-write-fan-in#f1` | failure | T? D? O? | single-database | - | dependency-failure, load-shedding-backpressure | OnlineOrNot, undated: A hundred checker Lambdas each opened a database connection at once, and Postgres refused further connections |
| `onlineornot-2023-lambda-write-fan-in#d1` | decision | T? D? O? | single-database | - | async-processing, capacity-cost | OnlineOrNot, undated: Fan results in through SNS and a batching queue so one Lambda writes to Postgres, instead of upgrading the database |
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

## rate-limiting

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `grafana-2021-hosted-prometheus-outage#f1` | failure | T? D? O? | multi-region | - | tenant-isolation, load-shedding-backpressure | Grafana Labs, 2021-03: A bug in per-tenant limit enforcement let one tenant overload a shared cluster, and error handling made the overload spread |
| `grafana-2021-hosted-prometheus-outage#d1` | decision | T? D? O? | multi-region | - | tenant-isolation, capacity-cost | Grafana Labs, 2021-03: Share metrics clusters between tenants under per-tenant data and rate limits, and size clusters from those limits |
| `healthchecks-2025-tarpit-outage#f1` | failure | T? D? O? | - | - | load-shedding-backpressure, observability | Healthchecks.io, 2025-11: Tarpit rate limiting held sockets open until the load balancers ran out of connection slots and rejected real traffic |
| `healthchecks-2025-tarpit-outage#d1` | decision | T? D? O? | - | - | load-shedding-backpressure | Healthchecks.io, 2025-11: Answer rate-limited requests with an immediate HTTP 429 instead of tarpitting them |

## read-cache

| Record | Kind | Scale | Shape | Floor | Topics | What it is |
|---|---|---|---|---|---|---|
| `figma-2026-caching-platform#d1` | decision | T? D? O? | partitioned | - | caching, dependency-failure | Figma, 2026-03: Put a connection-multiplexing Redis proxy and first-party clients in front of the Redis clusters |
| `figma-2026-caching-platform#d2` | decision | T? D? O? | partitioned | - | service-boundaries, datastore-choice | Figma, 2026-03: Build the Redis proxy in-house instead of adopting or forking an open source one |
| `figma-2026-caching-platform#d3` | decision | T? D? O? | partitioned | - | deployment-rollout, dependency-failure | Figma, 2026-03: Migrate services to the proxy case by case, in slices, with a runtime switch to revert |
| `figma-2026-caching-platform#d4` | decision | T? D? O? | partitioned | - | capacity-cost, observability | Figma, 2026-03: Bound the proxy's latency cost with zone-aware routing, weekly production stress tests and per-pull-request benchmarks |
| `figma-2026-caching-platform#d5` | decision | T? D? O? | partitioned | - | deployment-rollout, service-boundaries | Figma, 2026-03: Express the proxy's routing and filtering as a Starlark configuration program over a tree of engines |

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
| `pusher-2020-webhooks-kinesis#d1` | decision | T4 D? O? | - | - | async-processing, datastore-choice | Pusher, undated: Replace self-hosted beanstalkd and a Ruby packager with Kinesis, SQS and a Go consumer before the system gave severe problems |
| `pusher-2020-webhooks-kinesis#d2` | decision | T4 D? O? | - | - | deployment-rollout, delivery-idempotency | Pusher, undated: Run the new pipeline alongside the old in production without sending webhooks, then cut over in one configuration change |
| `pusher-2020-webhooks-kinesis#d3` | decision | T4 D? O? | - | - | delivery-idempotency, datastore-partitioning | Pusher, undated: Divide the event stream into locked logical shards so that one packager sees all of a channel's events and can debounce them |
| `segment-2018-goodbye-microservices#d1` | decision | T? D? O? | - | - | async-processing, tenant-isolation | Twilio Segment, 2018-07: Give every destination its own queue and service so one slow destination cannot delay the rest |
| `segment-2018-goodbye-microservices#d2` | decision | T? D? O? | - | - | service-boundaries, deployment-rollout | Twilio Segment, 2018-07: Split each destination's code into its own repo to isolate test failures |
| `segment-2018-goodbye-microservices#d3` | decision | T? D? O? | - | - | service-boundaries, capacity-cost | Twilio Segment, 2018-07: Consolidate the over 140 destination services into one service, with Centrifuge replacing the queues |
| `segment-2018-goodbye-microservices#d4` | decision | T? D? O? | - | - | service-boundaries, deployment-rollout | Twilio Segment, 2018-07: Merge all destination code into one repo with a single version of every dependency |
| `segment-2018-goodbye-microservices#d5` | decision | T? D? O? | - | - | deployment-rollout | Twilio Segment, 2018-07: Record and replay destination HTTP traffic in tests so the merged repo's suite is fast and reliable |
| `workos-2025-directory-sync-webhooks#f1` | failure | T? D? O? | - | - | tenant-isolation, load-shedding-backpressure | WorkOS, 2025-09: One customer's endpoint outage made deliveries time out, filled the shared worker pool and delayed Directory Sync webhooks for everyone |
