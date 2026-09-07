// Origin servers can receive absolute-form targets from browser/proxy paths.
// vinext 0.0.50 treats that target as a literal route; normalize it locally.
export function originTarget(target, host) {
  if (!/^https?:\/\//i.test(target)) return target;
  const url = new URL(target);
  if (url.host !== host || url.username || url.password || url.hash) {
    throw new Error('Invalid absolute request target');
  }
  return url.pathname + url.search;
}
