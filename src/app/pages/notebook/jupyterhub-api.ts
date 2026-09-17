export interface HubServerState {
    name?: string;
    ready?: boolean;
    pending?: string | null;
    url?: string;
    progress_url?: string;
    started?: string;
}

export interface HubUser {
    name: string;
    server?: string | null;
    servers?: Record<string, HubServerState>;
}

import { hubFetch, primeHubSession, readXsrfToken } from './hub-http';

export class HubApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = 'HubApiError';
    }
}

const DEFAULT_SERVER_NAME = '';

function getDefaultServerState(user: HubUser): HubServerState | undefined {
    return user.servers?.[DEFAULT_SERVER_NAME];
}

export function isServerReady(user: HubUser): boolean {
    const server = getDefaultServerState(user);
    return Boolean(server?.ready);
}

function isServerPending(user: HubUser): boolean {
    const server = getDefaultServerState(user);
    return Boolean(server?.pending);
}

export async function getHubUser(basePath: string): Promise<HubUser> {
    const response = await hubFetch(basePath, '/hub/api/user');
    if (response.status === 401 || response.status === 403) {
        throw new HubApiError('Hub session is not authenticated', response.status);
    }
    if (!response.ok) {
        throw new HubApiError(`Failed to load Hub user (${response.status})`, response.status);
    }
    return response.json() as Promise<HubUser>;
}

async function postStartServer(basePath: string, username: string): Promise<Response> {
    return hubFetch(basePath, `/hub/api/users/${encodeURIComponent(username)}/server`, {
        method: 'POST',
    });
}

export async function startServer(basePath: string, username: string): Promise<void> {
    let response = await postStartServer(basePath, username);

    if ((response.status === 403 || response.status === 400) && !readXsrfToken()) {
        await primeHubSession(basePath);
        response = await postStartServer(basePath, username);
    }

    if (response.status === 401 || response.status === 403) {
        const body = await response.text();
        throw new HubApiError(body || 'Hub session is not authenticated', response.status);
    }
    if (response.status === 201 || response.status === 202 || response.status === 200) {
        return;
    }
    if (response.status === 400) {
        const body = await response.text();
        throw new HubApiError(body || 'Failed to start notebook server', response.status);
    }
    if (!response.ok) {
        throw new HubApiError(`Failed to start notebook server (${response.status})`, response.status);
    }
}

export function buildLabUrl(basePath: string, username: string): string {
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    return `${normalizedBase}/user/${encodeURIComponent(username)}/lab`;
}

interface WaitForServerOptions {
    pollIntervalMs?: number;
    timeoutMs?: number;
    onProgress?: (message: string) => void;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForServer(
    basePath: string,
    options: WaitForServerOptions = {},
): Promise<HubUser> {
    const pollIntervalMs = options.pollIntervalMs ?? 2000;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const user = await getHubUser(basePath);
        if (isServerReady(user)) {
            return user;
        }

        if (isServerPending(user)) {
            options.onProgress?.('Starting your notebook server…');
        } else {
            options.onProgress?.('Preparing your notebook server…');
        }

        await sleep(pollIntervalMs);
    }

    throw new HubApiError('Timed out waiting for notebook server to start', 408);
}

export async function ensureServerRunning(
    basePath: string,
    options: WaitForServerOptions = {},
): Promise<HubUser> {
    const user = await getHubUser(basePath);
    if (isServerReady(user)) {
        return user;
    }

    if (!isServerPending(user)) {
        options.onProgress?.('Starting your notebook server…');
        await startServer(basePath, user.name);
    } else {
        options.onProgress?.('Starting your notebook server…');
    }

    return waitForServer(basePath, options);
}
