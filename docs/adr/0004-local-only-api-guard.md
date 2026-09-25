# 0004: Host, Origin and Content-Type guard on the local API

Status: Accepted (2026-09-25)

## Context
The server binds `127.0.0.1` and has no authentication, so anything running on the machine, and any web page the user visits, could reach it. A page on `attacker.example` can rebind that name to `127.0.0.1` (DNS rebinding, which browsers treat as same-origin) or fire a cross-site `text/plain` POST. Either spends API credit through `/api/chat` or reads, overwrites and deletes project files.

## Decision
`localOnly` middleware in `server/app.ts` runs on every `/api/*` route before anything else:
- `Host` must parse to the hostname `localhost`, `127.0.0.1` or `[::1]` (any port), else 403. Node's `URL` parser does the normalising, so `localhost.attacker.example`, `localhost@attacker.example` and unparsable values all fail.
- A present `Origin` must parse to one of the same hostnames, else 403. `null` is rejected.
- `POST` and `PUT` must carry `Content-Type: application/json` (parameters ignored), else 415. This is what makes a cross-site form or `text/plain` fetch fail even when a browser lets it through.

When `Host` is absent the request URL's host is used. `@hono/node-server` always sets one from the incoming `Host` or `:authority` header, so on the real server the two are the same value; only Hono's in-process `app.request()` (tests) and HTTP/1.0 clients on the local machine take that path.

Rejected: a shared token in a header. The browser would need to obtain it from the server first, which reintroduces the same problem for that one route, and it complicates the zero-setup first run.

## Consequences
The API is unreachable through any other name for the machine (a LAN hostname, `host.docker.internal`, an mDNS name). Hosting it anywhere else means adding real authentication, as ADR 0002 already anticipates. The Vite dev proxy forwards with `changeOrigin`, so the API sees `Host: 127.0.0.1:<port>`; the browser adds `Origin: http://localhost:5173` on writes, which passes. Clients must always send JSON with the right header; the app's own client already does.
