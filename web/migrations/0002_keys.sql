-- One API key per user. Only the SHA-256 of the key is stored; lastFour is kept to show which key is active.
create table "apiKey" ("userId" text not null primary key references "user" ("id") on delete cascade, "hash" text not null unique, "lastFour" text not null, "createdAt" text not null);

-- Calls counted per user and calendar month (UTC, "YYYY-MM").
create table "usage" ("userId" text not null references "user" ("id") on delete cascade, "month" text not null, "calls" integer not null, primary key ("userId", "month"));

-- A user's plan. No row means the free plan. wantsProAt records a click on "Get Pro" until payments exist.
create table "accountPlan" ("userId" text not null primary key references "user" ("id") on delete cascade, "plan" text not null default 'free', "wantsProAt" text);

-- Sign-in emails sent per day (UTC, "YYYY-MM-DD"), to cap what email can cost.
create table "emailDay" ("day" text not null primary key, "sent" integer not null);
