# Private files on Supabase Storage

The app's current database and sign-in do not change. The `supabase` adapter only stores, retrieves and deletes images; access to each file is still checked in the app's file service. The admin key lives only on the server.

## Supabase setup

1. In Storage, create a bucket named `uploads`; Public must be off.
2. Set the allowed formats to `image/jpeg`, `image/png` and `image/webp`. The app currently accepts only images.
3. In Settings → API Keys, take the server key `service_role`. A publishable or anon key is not suitable for this connection. Do not put the key in chat, Git or `NEXT_PUBLIC_*` variables.
4. Do not create a public policy for the browser or anonymous users. The app's sign-in system does not use Supabase Auth; requests run with the server key after the app's permission checks.

## Vercel variables

| Name | Value | Type |
|---|---|---|
| `STORAGE_DRIVER` | `supabase` | Config |
| `SUPABASE_URL` | `https://mzobuelymeskvqvfxwqi.supabase.co` | Config |
| `SUPABASE_STORAGE_BUCKET` | `uploads` | Config |
| `SUPABASE_SERVICE_ROLE_KEY` | Server key from the dashboard | Secret |

Save the variables for Production and Redeploy after releasing the new code. In local development the same variables go in the root `.env`. Files previously stored on disk are not migrated automatically when the adapter changes.

After setting the variables in `.env`, the command `pnpm storage:check` verifies that the bucket is private and round-trips a temporary image, then deletes the test image. No attachment record or user data is changed.

## Limits and verification

On the free plan, Storage space is one gigabyte and data transfer also has a quota. This connection does not enforce a cap on the account's total space; check usage in the Supabase dashboard. No payment setting is needed for this connection.

The current upload path goes through a Vercel Function. Vercel's request body limit is 4.5 MB and includes the multipart overhead; for the current deployment set `MAX_UPLOAD_BYTES=4000000`. The current UI message still shows the app's general 5 MB limit; larger files may be rejected before reaching the app.

After release, with an admin account add a small image to a task or question, save, and open it again. With another student's account make sure the private file is not visible. Actual file deletion happens in the attachment cleanup; with `JOBS_MODE=off` the automatic cleanup of unused attachments does not run, and its schedule must be enabled separately to prevent gradual space consumption.

Sources: [bucket privacy](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Supabase pricing](https://supabase.com/pricing), [Vercel Functions limits](https://vercel.com/docs/functions/limitations).
