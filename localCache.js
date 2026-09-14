/**
 * تخزين محلي للمتجر — يقلل قراءات Firebase لأقصى حد
 * أول مرة: قراءة من الشبكة → حفظ محلي
 * المرات التالية: من المحلي فقط (صفر قراءات) إلا لو force=true أو بيانات جديدة بعد كتابة محلية
 */
const PREFIX = 'misran_cache_v1:';
const MAX_KEY_BYTES = 4.2 * 1024 * 1024; // حد تقريبي لكل مفتاح

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/** تحويل Timestamps وكائنات Firestore لقيم قابلة للـ JSON */
export function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  // Firestore Timestamp
  if (typeof value.toDate === 'function' && typeof value.toMillis === 'function') {
    return { __ts: value.toMillis() };
  }
  if (value instanceof Date) return { __ts: value.getTime() };
  if (Array.isArray(value)) return value.map(toPlain);
  const out = {};
  for (const k of Object.keys(value)) {
    if (k === 'firestore' || typeof value[k] === 'function') continue;
    out[k] = toPlain(value[k]);
  }
  return out;
}

/** إعادة Timestamp تقريبي للعرض */
export function revive(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value.__ts != null && Object.keys(value).length === 1) {
    const d = new Date(value.__ts);
    return {
      __ts: value.__ts,
      toDate: () => d,
      toMillis: () => value.__ts
    };
  }
  if (Array.isArray(value)) return value.map(revive);
  const out = {};
  for (const k of Object.keys(value)) out[k] = revive(value[k]);
  return out;
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return revive(parsed.data);
  } catch {
    return null;
  }
}

export function cacheSet(key, data) {
  try {
    const payload = JSON.stringify({ t: Date.now(), data: toPlain(data) });
    if (payload.length > MAX_KEY_BYTES) {
      // كبير جداً — حاول بدون حقول ثقيلة
      console.warn('[cache] skip large key', key, payload.length);
      return false;
    }
    localStorage.setItem(PREFIX + key, payload);
    return true;
  } catch (e) {
    // مساحة ممتلئة — امسح أقدم مفاتيح
    try { cacheEvictOldest(5); localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), data: toPlain(data) })); return true; }
    catch { return false; }
  }
}


/** عمر الكاش بالميلي ثانية من وقت الحفظ */
export function cacheAge(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || !parsed.t) return null;
    return Date.now() - parsed.t;
  } catch { return null; }
}

/**
 * جلب مرن: يستخدم المحلي، ويعيد التحقق من الشبكة مرة لكل جلسة (أو بعد maxAge)
 * - لو مفيش كاش: قراءة شبكة + حفظ
 * - لو فيه كاش ولم تُتحقق الجلسة بعد: قراءة شبكة ومقارنة/تحديث ثم تعليم الجلسة
 * - لو اتحقق في الجلسة: محلي فقط (صفر قراءات)
 */
export async function softFetch(key, fetcher, { sessionFlag, maxAgeMs = null, force = false } = {}) {
  const flag = sessionFlag || ('soft:' + key);
  let sessDone = false;
  try { sessDone = sessionStorage.getItem(flag) === '1'; } catch {}

  const cached = cacheGet(key);
  const age = cacheAge(key);
  const expired = maxAgeMs != null && age != null && age > maxAgeMs;

  if (!force && cached != null && sessDone && !expired) {
    return { data: cached, fromCache: true, revalidated: false };
  }

  // مفيش كاش أو لسه ما اتحققناش في الجلسة أو منتهي
  try {
    const data = await fetcher();
    if (data !== undefined && data !== null) cacheSet(key, data);
    try { sessionStorage.setItem(flag, '1'); } catch {}
    return { data, fromCache: false, revalidated: true };
  } catch (e) {
    if (cached != null) return { data: cached, fromCache: true, revalidated: false, error: e };
    throw e;
  }
}

export function cacheRemove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

export function cacheRemovePrefix(prefix) {
  try {
    const full = PREFIX + prefix;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(full)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}

function cacheEvictOldest(n = 3) {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    try {
      const p = safeParse(localStorage.getItem(k));
      items.push({ k, t: p?.t || 0 });
    } catch {}
  }
  items.sort((a, b) => a.t - b.t);
  items.slice(0, n).forEach(x => localStorage.removeItem(x.k));
}

/**
 * جلب مع كاش: لو موجود محلياً يرجّع فوراً بدون شبكة
 * force=true يفرض قراءة جديدة ثم يحدّث الكاش
 */
export async function cachedFetch(key, fetcher, { force = false } = {}) {
  if (!force) {
    const hit = cacheGet(key);
    if (hit !== null && hit !== undefined) {
      return { data: hit, fromCache: true };
    }
  }
  const data = await fetcher();
  if (data !== undefined && data !== null) cacheSet(key, data);
  return { data, fromCache: false };
}

/** دمج عنصر في قائمة مخزنة محلياً (مثلاً بعد إضافة مشروع) */
export function cacheUpsertInList(listKey, item, idField = 'id') {
  const list = cacheGet(listKey);
  if (!Array.isArray(list)) {
    cacheSet(listKey, [item]);
    return;
  }
  const id = item[idField];
  const idx = list.findIndex(x => x && x[idField] === id);
  if (idx >= 0) list[idx] = { ...list[idx], ...item };
  else list.unshift(item);
  cacheSet(listKey, list);
}

export function cacheUserKey(uid) { return `user:${uid}`; }
export function cacheProductKey(id) { return `product:${id}`; }
export function cacheProjectsPageKey(page) { return `projects:page:${page}`; }
export function cacheNotifsKey(uid) { return `notifs:${uid}`; }
export function cacheChatsKey(uid) { return `chats:${uid}`; }
export function cachePurchasesKey(uid) { return `purchases:${uid}`; }
export function cacheSellerKey(id) { return `seller:${id}`; }
export function cacheSellerProdsKey(id) { return `sellerProds:${id}`; }
export function cacheMyProjectsKey(uid) { return `myProjects:${uid}`; }
export function cacheBalanceKey(uid) { return `balance:${uid}`; }
export function cacheTopupsKey(uid) { return `topups:${uid}`; }
export function cacheEarningsKey(uid) { return `earnings:${uid}`; }
export function cacheNewsKey() { return 'news:bar'; }
export function cacheOfficialKey() { return 'official:profile'; }

// كشف عام على window للاستخدام من صفحات بدون import معقد
if (typeof window !== 'undefined') {
  window.localCache = {
    get: cacheGet,
    set: cacheSet,
    remove: cacheRemove,
    removePrefix: cacheRemovePrefix,
    fetch: cachedFetch,
    softFetch: softFetch,
    age: cacheAge,
    upsertInList: cacheUpsertInList,
    toPlain,
    revive,
    keys: {
      user: cacheUserKey,
      product: cacheProductKey,
      projectsPage: cacheProjectsPageKey,
      notifs: cacheNotifsKey,
      chats: cacheChatsKey,
      purchases: cachePurchasesKey,
      seller: cacheSellerKey,
      sellerProds: cacheSellerProdsKey,
      myProjects: cacheMyProjectsKey,
      balance: cacheBalanceKey,
      topups: cacheTopupsKey,
      earnings: cacheEarningsKey,
      news: cacheNewsKey,
      official: cacheOfficialKey
    }
  };
}

export default {
  cacheGet, cacheSet, cacheRemove, cacheRemovePrefix, cachedFetch, cacheUpsertInList,
  toPlain, revive
};
