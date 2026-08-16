const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const ACCOUNTING_BASE_URL = "https://api.xero.com/api.xro/2.0";

export class XeroApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`Xero API error ${status} ${statusText}: ${JSON.stringify(body)}`);
    this.name = "XeroApiError";
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

function buildQueryString(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export type XeroAuthMode = "authorization_code" | "client_credentials";

/**
 * Xero has no separate sandbox API host (unlike QuickBooks' dedicated
 * sandbox-quickbooks.api.intuit.com subdomain) — every request goes to the
 * same production base URL. Testing means using a real Xero demo/trial
 * organisation, not a different endpoint. See README.
 *
 * This client supports two auth modes (see .env.example):
 *  - authorization_code (default, free): standard OAuth consent flow.
 *    Access tokens last 30 minutes; refresh tokens last 60 days *unused*
 *    but ROTATE on every refresh call — this client tracks the rotation
 *    in memory and logs the new value to stderr, same pattern as this
 *    series' QuickBooks repo, but does not persist it back to disk.
 *  - client_credentials (Xero "Custom Connection", a paid add-on): no
 *    redirect, no refresh token, just re-requests a token directly from
 *    the Client ID/Secret. Locked to a single organisation, so no tenant
 *    header is sent in this mode.
 */
export class XeroClient {
  private readonly authMode: XeroAuthMode;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scopes: string;
  private tenantId: string;
  private accessToken: string;
  private refreshToken: string;
  private accessTokenExpiresAt = 0;

  constructor(config: {
    authMode?: string;
    clientId: string;
    clientSecret: string;
    tenantId?: string;
    accessToken?: string;
    refreshToken?: string;
    scopes?: string;
  }) {
    // Deliberately not validated here: the server should start and expose
    // its tool list without credentials so it can be inspected/demoed. The
    // credentials are only required once a tool actually calls out to the
    // live API.
    this.authMode = config.authMode === "client_credentials" ? "client_credentials" : "authorization_code";
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tenantId = config.tenantId ?? "";
    this.accessToken = config.accessToken ?? "";
    this.refreshToken = config.refreshToken ?? "";
    this.scopes = config.scopes ?? "accounting.contacts accounting.transactions accounting.settings.read offline_access";
  }

  private assertConfigured(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Missing Xero credentials. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET in your environment " +
          "(see .env.example) to call the live API.",
      );
    }
    if (this.authMode === "authorization_code" && (!this.tenantId || !this.accessToken || !this.refreshToken)) {
      throw new Error(
        "Missing Xero credentials for authorization_code mode. Set XERO_TENANT_ID, XERO_ACCESS_TOKEN, " +
          "and XERO_REFRESH_TOKEN in your environment (see .env.example) to call the live API.",
      );
    }
  }

  private async refreshAccessToken(): Promise<void> {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const body =
      this.authMode === "client_credentials"
        ? new URLSearchParams({ grant_type: "client_credentials", scope: this.scopes })
        : new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refreshToken });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : undefined;
    if (!response.ok) {
      throw new XeroApiError(response.status, response.statusText, data ?? text);
    }

    const parsed = data as { access_token: string; refresh_token?: string; expires_in: number };
    this.accessToken = parsed.access_token;
    this.accessTokenExpiresAt = Date.now() + parsed.expires_in * 1000;

    if (this.authMode === "authorization_code" && parsed.refresh_token && parsed.refresh_token !== this.refreshToken) {
      this.refreshToken = parsed.refresh_token;
      console.error(
        `[Xero] Refresh token rotated. Update XERO_REFRESH_TOKEN before your next restart: ${parsed.refresh_token}`,
      );
    }
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.accessTokenExpiresAt || Date.now() > this.accessTokenExpiresAt - 60_000) {
      await this.refreshAccessToken();
    }
  }

  private async request<T = unknown>(
    method: "GET" | "POST" | "PUT",
    path: string,
    options: { query?: QueryParams; body?: unknown; baseUrl?: string; useTenantHeader?: boolean } = {},
  ): Promise<T> {
    this.assertConfigured();
    await this.ensureFreshToken();

    const base = options.baseUrl ?? ACCOUNTING_BASE_URL;
    const url = `${base}${path}${buildQueryString(options.query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    // Custom Connections (client_credentials mode) are locked to a single
    // organisation and reject requests that include this header at all.
    const wantsTenantHeader = options.useTenantHeader ?? true;
    if (wantsTenantHeader && this.authMode === "authorization_code" && this.tenantId) {
      headers["Xero-tenant-id"] = this.tenantId;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const data = text ? safeJsonParse(text) : undefined;
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new XeroApiError(
          response.status,
          response.statusText,
          { ...(typeof data === "object" && data !== null ? data : { raw: data }), retryAfterSeconds: retryAfter ?? undefined },
        );
      }
      throw new XeroApiError(response.status, response.statusText, data ?? text);
    }
    return data as T;
  }

  get<T = unknown>(path: string, query?: QueryParams) {
    return this.request<T>("GET", path, { query });
  }

  post<T = unknown>(path: string, body?: unknown, query?: QueryParams) {
    return this.request<T>("POST", path, { body, query });
  }

  put<T = unknown>(path: string, body?: unknown, query?: QueryParams) {
    return this.request<T>("PUT", path, { body, query });
  }

  /**
   * GET https://api.xero.com/connections — lists the organisations (Xero
   * calls them "tenants") your token is authorized for, each with a
   * tenantId. Used by the list_organisations tool to help find your
   * XERO_TENANT_ID during setup; not scoped to any one organisation, so it
   * deliberately skips the Xero-tenant-id header.
   */
  listConnections<T = unknown>() {
    return this.request<T>("GET", "", { baseUrl: CONNECTIONS_URL, useTenantHeader: false });
  }
}

/** Builds a Xero `where` clause from a list of already-formatted conditions. */
export function buildWhereClause(conditions: string[]): string | undefined {
  return conditions.length ? conditions.join(" AND ") : undefined;
}

/** Escapes a value for safe interpolation into a Xero `where`/GUID-style string literal. */
export function escapeXeroString(value: string): string {
  return value.replace(/"/g, '\\"');
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
