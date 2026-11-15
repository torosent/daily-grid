// Cloudflare Worker for grid.tomer.dev. The page itself is a static asset (public/index.html), served for both editions:
// / is English, /he/ is Hebrew (same file; the Worker sets the Hebrew lang, dir and title in the HTML so link previews
// and search engines see Hebrew).
// The datasets live in the GitHub repo (DATA_ORIGIN in wrangler.jsonc). The Worker answers from its edge cache at once and
// refreshes from GitHub in the background every few minutes; if GitHub is slow, down or sends a broken file, the last good
// copy keeps being served. deploy.sh also ships a snapshot of the datasets with the Worker, used when a data center has
// no cached copy and GitHub is unavailable.
const FILE = /^\/data\/((?:he\/puzzles-(5|7|13)|puzzles-(5|7|15))\.json)$/; // only the real datasets, so this is never an open proxy
const FRESH = 300; // seconds before GitHub is asked again
const KEEP = 7 * 86400; // how long the last good copy stays in the edge cache
const UPSTREAM_MS = 5000; // give up on GitHub after this long
const HE = { title: 'התשבץ היומי', desc: 'תשבצים בעברית: 300 תשבצים בשלושה גדלים ובשלוש רמות קושי.' };

// The same checks the page makes before using a file, so a bad commit can never replace a good cached copy.
function validDataset(text, n, he) {
  let d; try { d = JSON.parse(text); } catch (e) { return false; }
  const letters = he ? /^[א-ת#]+$/ : /^[A-Z#]+$/;
  return !!d && d.size === n && Array.isArray(d.puzzles) && d.puzzles.length > 0
    && d.puzzles.every(p => Array.isArray(p) && Number.isInteger(p[0]) && typeof p[1] === 'string' && p[1].length === n * n && letters.test(p[1]))
    && !!d.clues && typeof d.clues === 'object'
    && Object.values(d.clues).every(c => Array.isArray(c) && c.length === 2 && c.every(s => typeof s === 'string' && s));
}

const reply = (body, fetchedAt, source) => new Response(body, {
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-fetched-at': String(fetchedAt), 'x-source': source },
});

async function refresh(env, key, file, n, he) {
  const upstream = await fetch(env.DATA_ORIGIN + file, { signal: AbortSignal.timeout(UPSTREAM_MS) });
  if (!upstream.ok) throw new Error(`GitHub answered ${upstream.status}`);
  const body = await upstream.text();
  if (!validDataset(body, n, he)) throw new Error('GitHub sent a dataset the page would reject');
  const now = Date.now();
  const stored = caches.default.put(key, new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${KEEP}`, 'x-fetched-at': String(now) } }));
  return { body, now, stored };
}

async function dataset(request, env, ctx, url, m) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  const file = m[1], he = !!m[2], n = +(m[2] || m[3]);
  const key = new Request(url.origin + url.pathname); // one cache entry per file, whatever the query string
  const hit = await caches.default.match(key);
  if (hit) {
    const fetchedAt = +hit.headers.get('x-fetched-at') || 0, body = await hit.text();
    // Stale: answer now, refresh in the background. A failed refresh keeps the old copy and tries again next time.
    if (Date.now() - fetchedAt >= FRESH * 1000) ctx.waitUntil(refresh(env, key, file, n, he).then(r => r.stored).catch(() => {}));
    return reply(body, fetchedAt, 'cache');
  }
  try {
    const { body, now, stored } = await refresh(env, key, file, n, he);
    ctx.waitUntil(stored);
    return reply(body, now, 'github');
  } catch (e) {
    // No cached copy here and GitHub is unavailable: fall back to the snapshot shipped with the deploy, if any.
    const snap = env.ASSETS ? await env.ASSETS.fetch(new Request(new URL('/snapshot/' + file, url))) : null;
    if (snap && snap.ok) { const body = await snap.text(); if (validDataset(body, n, he)) return reply(body, 0, 'snapshot'); }
    return new Response('Dataset unavailable', { status: 502 });
  }
}

async function hebrewPage(request, env) {
  const page = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
  return new HTMLRewriter()
    .on('html', { element: e => { e.setAttribute('lang', 'he'); e.setAttribute('dir', 'rtl'); } })
    .on('title', { element: e => e.setInnerContent(HE.title) })
    .on('meta[name="description"]', { element: e => e.setAttribute('content', HE.desc) })
    .transform(page);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/he') return Response.redirect(new URL('/he/' + url.search, url), 301);
    if (url.pathname === '/he/' || url.pathname === '/he/index.html') return hebrewPage(request, env);
    const m = FILE.exec(url.pathname);
    if (m) return dataset(request, env, ctx, url, m);
    if (url.pathname.startsWith('/snapshot/')) return new Response('Not found', { status: 404 }); // the snapshot is only for the Worker
    return new Response('Not found', { status: 404 });
  },
};
