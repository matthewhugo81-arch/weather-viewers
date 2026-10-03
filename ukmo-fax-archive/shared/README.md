# Shared chart drawings

Public endpoint: https://znlriqmliaszlxlnkeic.supabase.co/functions/v1/fax-drawings
Project: UKMO FAX Drawings (London, free plan).

Visitors do not need an account. The viewer uses the public legacy anonymous API key because this Edge Function uses the platform JWT verification. This key is not a secret and cannot directly read or write the drawing table. Service credentials stay in the Edge Function environment.

GET returns up to 50 versions for an exact chart filename. POST validates the immutable chart against the live manifest, PNG dimensions, four allowed colours, finite coordinate arrays, author length, 120 KB body limit and 10,000 total points. Each publication creates a separate row. New browsers choose the newest version by default; existing private drafts take precedence. Share / versions allows selecting another version or the original.

A random 256-bit browser token authorizes withdrawal only of that browser's publications. Only its hash is stored server-side. This is a browser capability, not a verified person/account. Losing browser storage loses withdrawal access; the site owner can remove a publication in Supabase. Names are public, self-chosen and unverified. Never submit confidential content.

Only the validated Edge Function uses service-role database access. RLS is enabled, anon/authenticated table grants and RPC execute privileges are revoked. The RLS-no-policy informational advisory is intentional: direct clients have no access. The publish RPC is SECURITY INVOKER and callable only by service_role. A transaction lock enforces 20 publications per hour per browser/network hash, 500 per day globally, 50 per chart and 5,000 active publications in total. Daily salted network hashes support abuse limits; raw IP addresses are not stored in this table. These limits bound stored data; a determined attacker can still consume public endpoint requests. No paid upgrade was enabled.

No automatic deletion of shared versions. They remain tied to the exact PNG hash, so colour overlays cannot drift onto a newer run. The regular chart retention still controls which originals are shown in the viewer. For moderation, use the Supabase table editor on public.fax_drawings; identify a version by id, author and chart. Only remove the intended publication. Back up shared data separately; chart GitHub backups do not include this database.

Deploy shared/edge.js as fax-drawings with verify_jwt=true. schema.sql documents the applied migration shared_fax_drawings. GET/POST/DELETE checks were tested including invalid payloads, unauthorized withdrawal and direct database denial.
