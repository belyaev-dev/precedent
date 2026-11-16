#!/usr/bin/env python3
"""Checks a deployed Precedent endpoint from outside. Usage: live-check.py <base url>

Fails unless the static corpus downloads whole and holds cards, and the MCP endpoint returns real
records for a fetch and a search. Standard library only.
"""
import json
import re
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip("/")
ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def fail(message):
    sys.exit(f"FAIL: {message}")


def fetch(path, body=None, headers=None):
    request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def rpc(body, extra=None):
    """One JSON-RPC call; returns its `result`, or fails on a transport, protocol or tool error."""
    headers = {"content-type": "application/json", "accept": "application/json, text/event-stream", **(extra or {})}
    status, text = fetch("/mcp", body, headers)
    if status != 200:
        fail(f"{body['method']} answered HTTP {status}: {text[:200]}")
    payloads = [line[5:].strip() for line in text.splitlines() if line.startswith("data:")] or [text]
    message = json.loads(payloads[-1])
    if "error" in message:
        fail(f"{body['method']} returned an error: {message['error']}")
    return message["result"]


def tool(name, arguments):
    result = rpc({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": name, "arguments": arguments}}, {"mcp-protocol-version": "2025-06-18"})
    if result.get("isError"):
        fail(f"{name} reported a tool error: {result}")
    return "\n".join(part["text"] for part in result["content"] if part.get("type") == "text")


# 1. The static corpus downloads whole and holds cards.
status, text = fetch("/corpus/corpus.json")
if status != 200:
    fail(f"static corpus answered HTTP {status}")
corpus = json.loads(text)
version = corpus.get("corpus_version")
cards = corpus.get("cards")
if not (isinstance(version, str) and re.fullmatch(r"[0-9a-f]{12}", version)):
    fail(f"corpus_version is not a 12-character hash: {version!r}")
if not (isinstance(cards, list) and len(cards) >= 10):
    fail(f"expected at least 10 cards, found {len(cards) if isinstance(cards, list) else type(cards).__name__}")
live = [c for c in cards if c.get("status") != "retracted"]
for card in cards:
    if not (isinstance(card.get("id"), str) and ID.match(card["id"])):
        fail(f"a card has no valid id: {str(card)[:120]}")
for card in live:
    if not (card.get("records") and card.get("source", {}).get("url") and card.get("architecture", {}).get("text")):
        fail(f"card {card['id']} is missing records, a source or an architecture")
print(f"static corpus: {len(text.encode())} bytes, version {version}, {len(cards)} cards ({len(live)} live)")

# 2. The endpoint introduces itself and serves the same corpus version.
info = rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "live-check", "version": "0"}}})
if info.get("serverInfo", {}).get("name") != "precedent":
    fail(f"unexpected server info: {info.get('serverInfo')}")
if version not in info["serverInfo"].get("version", ""):
    fail(f"endpoint serves {info['serverInfo'].get('version')}, static corpus is {version}")

# 3. A fetch returns the cards asked for, taken from the corpus itself so the check does not go stale.
wanted = [c["id"] for c in live[:3]]
got = tool("precedent_get", {"ids": wanted})
if "NOT FOUND" in got or "WITHDRAWN" in got or "LEFT OUT" in got:
    fail(f"fetch of {wanted} did not return every card: {got[:300]}")
for card_id in wanted:
    if f"CARD {card_id}\n" not in got:
        fail(f"fetch did not return a CARD section for {card_id}")
print(f"precedent_get: {len(wanted)} cards returned, {len(got.encode())} bytes")

# 4. A search built from a real record's title finds that record.
card = live[0]
record = card["records"][0]
found = tool("precedent_search", {"query": record["title"][:190], "limit": 10})
if f"cite: {card['id']}#{record['id']} " not in found:
    fail(f"search for the title of {card['id']}#{record['id']} did not return it: {found[:300]}")
print(f"precedent_search: found {card['id']}#{record['id']}")

# 5. A plain GET to the MCP path is refused.
status, _ = fetch("/mcp")
if status != 405:
    fail(f"GET /mcp answered {status}, expected 405")
print("ok")
