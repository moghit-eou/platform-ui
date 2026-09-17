import { clearHubXsrfCache, hubFetch, primeHubSession } from './hub-http';

export { primeHubSession } from './hub-http';

const HUB_LOGIN_REDIRECT_KEY = 'mip_notebook_hub_login_redirect_ts';
const HUB_LOGIN_PENDING_KEY = 'mip_notebook_hub_login_pending';
const HUB_LOGIN_COOLDOWN_MS = 15_000;
const DEFAULT_WAIT_RETRIES = 10;
const PENDING_WAIT_RETRIES = 30;
const WAIT_DELAY_MS = 500;

export type EnsureHubSessionResult = 'ready' | 'redirected' | 'failed';

export async function hasHubSession(basePath: string): Promise<boolean> {
    try {
        const response = await hubFetch(basePath, '/hub/api/user');
        return response.status === 200;
    } catch {
        return false;
    }
}

interface WaitForHubSessionOptions {
    retries?: number;
    delayMs?: number;
}

export async function waitForHubSession(
    basePath: string,
    options: WaitForHubSessionOptions = {},
): Promise<boolean> {
    const retries = options.retries ?? DEFAULT_WAIT_RETRIES;
    const delayMs = options.delayMs ?? WAIT_DELAY_MS;

    for (let attempt = 0; attempt < retries; attempt += 1) {
        await primeHubSession(basePath);
        if (await hasHubSession(basePath)) {
            return true;
        }
        if (attempt < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    return false;
}

export function buildHubReturnPath(basePath: string): string {
    return `${basePath}/hub/home`;
}

export function buildHubLoginUrl(basePath: string, returnPath?: string): string {
    const nextPath = returnPath ?? buildHubReturnPath(basePath);
    const next = encodeURIComponent(nextPath);
    return `${basePath}/hub/login?next=${next}`;
}

function hasHubLoginPending(): boolean {
    try {
        return sessionStorage.getItem(HUB_LOGIN_PENDING_KEY) === '1';
    } catch {
        return false;
    }
}

export function markHubLoginPending(): void {
    try {
        sessionStorage.setItem(HUB_LOGIN_PENDING_KEY, '1');
    } catch {
        // ignore storage errors
    }
}

function clearHubLoginPending(): void {
    try {
        sessionStorage.removeItem(HUB_LOGIN_PENDING_KEY);
    } catch {
        // ignore storage errors
    }
}

export function shouldRedirectToHubLogin(): boolean {
    try {
        const raw = sessionStorage.getItem(HUB_LOGIN_REDIRECT_KEY);
        const last = raw ? Number(raw) : 0;
        return !last || !Number.isFinite(last) || (Date.now() - last) >= HUB_LOGIN_COOLDOWN_MS;
    } catch {
        return true;
    }
}

export function markHubLoginRedirect(): void {
    try {
        sessionStorage.setItem(HUB_LOGIN_REDIRECT_KEY, String(Date.now()));
    } catch {
        // ignore storage errors
    }
}

function clearHubLoginRedirect(): void {
    try {
        sessionStorage.removeItem(HUB_LOGIN_REDIRECT_KEY);
    } catch {
        // ignore storage errors
    }
}

export function clearHubLoginState(): void {
    clearHubLoginRedirect();
    clearHubLoginPending();
    clearHubXsrfCache();
}

export function redirectToHubLogin(
    basePath: string,
    returnPath?: string,
    navigate: (url: string) => void = (url) => window.location.assign(url),
): void {
    if (!shouldRedirectToHubLogin()) {
        return;
    }
    markHubLoginPending();
    markHubLoginRedirect();
    navigate(buildHubLoginUrl(basePath, returnPath));
}

export async function ensureHubSession(basePath: string): Promise<EnsureHubSessionResult> {
    if (await hasHubSession(basePath)) {
        clearHubLoginState();
        return 'ready';
    }

    const returningFromLogin = hasHubLoginPending();
    const sessionReady = await waitForHubSession(basePath, {
        retries: returningFromLogin ? PENDING_WAIT_RETRIES : DEFAULT_WAIT_RETRIES,
        delayMs: WAIT_DELAY_MS,
    });

    if (sessionReady) {
        clearHubLoginState();
        return 'ready';
    }

    if (!shouldRedirectToHubLogin()) {
        return 'failed';
    }

    redirectToHubLogin(basePath);
    return 'redirected';
}
