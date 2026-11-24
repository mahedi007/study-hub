import { Hono } from 'hono';
import type { AppEnv } from './env';
import { HttpError } from './env';
import { requireUser, sameOrigin } from './auth';
import authRoutes from './routes/auth';
import materials from './routes/materials';
import workspace from './routes/workspace';
import system from './routes/system';
import pub from './routes/public';

const app = new Hono<AppEnv>().basePath('/api');

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as any);
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : 'Server error' }, 500);
});

// Never let browsers or the CDN keep API answers (deleted materials must vanish immediately).
app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
});
app.use('/admin/*', sameOrigin);
app.use('/auth/*', sameOrigin);
app.route('/auth', authRoutes);

app.get('/health', (c) => c.json({ ok: true, time: Date.now() }));

// Everything under /api/admin requires a signed-in teacher or admin.
const admin = new Hono<AppEnv>();
admin.use('*', requireUser);
admin.route('/', materials);
admin.route('/', workspace);
admin.route('/system', system);
app.route('/admin', admin);

app.route('/', pub);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
