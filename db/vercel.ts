/**
 * Build-time fallback for Vercel.
 *
 * The Vercel route forwards Sangat requests to the existing private service,
 * so it never calls this function. Keeping the same export lets Next.js avoid
 * bundling Cloudflare's virtual `cloudflare:workers` module.
 */
export function getDb(): D1Database {
  throw new Error('The Vercel Sangat bridge is not configured.');
}
