import 'server-only';

/**
 * CSRF guard for JSON route handlers. Server Actions check Origin themselves;
 * route handlers must do it explicitly. The session cookie is SameSite=Lax,
 * which already blocks most cross-site POSTs — this closes the rest.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
