# Automatic shared chart lines

The live viewer uses the fax-lines Edge Function and public.fax_lines table.
Apply automatic.sql to provision the table/RPC and deploy automatic-edge.js as fax-lines with JWT verification enabled. pen.js contains only the public anon credential. The service role key stays in the function runtime.

Each pointer-up queues one UUID-tagged stroke automatically. Visitors see all strokes together, with no account, nickname, publication, or version selector. Polling refreshes visible charts every 15 seconds while the page is visible. Browser-local legacy strokes migrate when their exact chart is opened. The original PNG is unchanged.

An outbox persists additions/removals before network requests and retries after failures. Saves are idempotent, so uncertain responses do not duplicate lines. Concurrent users append separate records. Undo removes the latest line owned by this browser, and Clear mine removes only this browser's lines. Ownership uses a random local capability token whose hash is stored on the server; it is not a public identity. Clearing browser storage loses ownership access. Existing drawings remain public.

The service validates archive membership, PNG dimensions, colour/point limits, payload size, and a bounded per-chart and overall quota. Tables have RLS enabled and no anon/authenticated grants or policies intentionally: only the validated service endpoint accesses them. The RPC uses SECURITY INVOKER, with EXECUTE granted only to service_role. No service credential is sent to the browser.

schema.sql and edge.js document the superseded publication prototype, retained for migration history. They are not used by the current viewer. No publications existed when automatic sharing was introduced.

