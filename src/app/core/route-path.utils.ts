/**
 * The route-path test the chrome and the app shell both need: "is the current
 * URL under this route, nested paths included?".
 *
 * It used to be written twice — once in AppComponent (notebook only) and once in
 * HeaderComponent (`onPath`, used for notebook, studio and dashboard). Two copies
 * of a URL parse drift: one of them had to remember to strip `#` as well as `?`,
 * and a route whose prefix is a prefix of another (`/notebook`, `/notebook/...`)
 * must not match a sibling. One implementation, one behaviour.
 */
export function isRoutePath(url: string, prefix: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  return path === prefix || path.startsWith(`${prefix}/`);
}
