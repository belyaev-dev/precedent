-- One row per tool call made with an API key: when, whose key, which tool, what was asked and how much was found.
-- "asked" is the search's query text and filters, or the ids fetched, as JSON. Rows older than 90 days are deleted daily.
create table "call" ("at" text not null, "userId" text not null references "user" ("id") on delete cascade, "tool" text not null, "asked" text, "matched" integer, "shown" integer, "atScale" integer, "client" text);

create index "call_at_idx" on "call" ("at");

create index "call_userId_idx" on "call" ("userId", "at");

-- Sign-in emails asked for per day by one address or from one client address, so that neither can use up the day's total.
-- "sender" is "to:" and a SHA-256 of the email address, or "ip:" and the client address.
create table "emailSender" ("day" text not null, "sender" text not null, "sent" integer not null, primary key ("day", "sender"));
