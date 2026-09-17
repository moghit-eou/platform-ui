import { Injectable, isDevMode } from '@angular/core';

interface RuntimeEnv {
  MIP_VERSION?: unknown;
  GUIDE_COVARIATE?: unknown;
  GUIDE_VARIABLE?: unknown;
  NOTEBOOK_ENABLED?: unknown;
  JUPYTER_CONTEXT_PATH?: unknown;
}

interface RuntimeVersionEntry {
  label: string;
  value: string;
}

interface RuntimeGuideTarget {
  value: string;
  label: string;
}

interface RuntimeVersions {
  mip: string | null;
}

@Injectable({ providedIn: 'root' })
export class RuntimeEnvService {
  private readonly runtimeEnv = this.readRuntimeEnv();

  readonly versions = this.readVersions();
  readonly versionEntries = this.buildVersionEntries();
  readonly mipVersion = this.versions.mip;
  readonly guideCovariate = this.readGuideTarget('GUIDE_COVARIATE', 'Sex');
  readonly guideVariable = this.readGuideTarget('GUIDE_VARIABLE', 'Age');
  readonly notebookEnabled = this.readBoolean('NOTEBOOK_ENABLED', false);
  readonly jupyterContextPath = this.readPath('JUPYTER_CONTEXT_PATH', '/notebook');

  private readRuntimeEnv(): RuntimeEnv {
    if (typeof window === 'undefined') {
      return {};
    }

    return (window as Window & { __env?: RuntimeEnv }).__env ?? {};
  }

  private readVersions(): RuntimeVersions {
    return {
      mip: this.readVersion('MIP_VERSION', 'MIP'),
    };
  }

  private buildVersionEntries(): RuntimeVersionEntry[] {
    const entries = [
      { label: 'Version', value: this.versions.mip },
    ];

    return entries.filter((entry): entry is RuntimeVersionEntry => entry.value !== null);
  }

  private readVersion(key: keyof RuntimeEnv, label: string): string | null {
    const value = this.readString(key);
    if (value) {
      return value;
    }

    if (isDevMode()) {
      return '9.0.0';
    }

    console.warn(
      `[RuntimeEnv] Expected ${label} version in window.__env.${key}, but it was not provided. The UI will hide that version until it is set.`
    );
    return null;
  }

  private readGuideTarget(key: keyof RuntimeEnv, fallback: string): RuntimeGuideTarget {
    const value = this.readString(key) ?? fallback;

    return {
      value,
      label: this.formatGuideTargetLabel(value),
    };
  }

  private readString(key: keyof RuntimeEnv): string | null {
    const rawValue = this.runtimeEnv[key];
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = String(rawValue).trim();
    return value.length > 0 ? value : null;
  }

  private readPath(key: keyof RuntimeEnv, fallback: string): string {
    const value = this.readString(key) ?? fallback;
    const withLeadingSlash = value.startsWith('/') ? value : '/' + value;
    return withLeadingSlash.endsWith('/') && withLeadingSlash.length > 1
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash;
  }

  private readBoolean(key: keyof RuntimeEnv, defaultValue: boolean): boolean {
    const rawValue = this.runtimeEnv[key];
    if (rawValue === null || rawValue === undefined) {
      return defaultValue;
    }
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    const normalized = String(rawValue).trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return false;
    }
    return defaultValue;
  }

  private formatGuideTargetLabel(value: string): string {
    const normalized = value
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');

    if (!normalized) {
      return value;
    }

    return normalized
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
