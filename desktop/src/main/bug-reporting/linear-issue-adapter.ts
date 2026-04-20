import type { DesktopBugSeverity } from "../../shared/contracts/bug-reporting.ts";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export interface LinearIssueCreateInput {
  readonly title: string;
  readonly description: string;
  readonly severity: DesktopBugSeverity;
}

export interface LinearIssueCreateResult {
  readonly id: string;
  readonly identifier: string | null;
  readonly url: string | null;
}

type FetchLike = typeof fetch;

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

export class LinearIssueAdapter {
  readonly #apiKey: string | null;
  readonly #teamId: string | null;
  readonly #workspaceUrl: string | null;
  readonly #fetchImpl: FetchLike;

  constructor(options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: FetchLike;
  } = {}) {
    const env = options.env ?? process.env;
    this.#apiKey = firstNonEmptyString(env.SENSE1_LINEAR_API_KEY);
    this.#teamId = firstNonEmptyString(env.SENSE1_LINEAR_TEAM_ID);
    this.#workspaceUrl = firstNonEmptyString(env.SENSE1_LINEAR_WORKSPACE_URL);
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.#apiKey && this.#teamId);
  }

  async createIssue(input: LinearIssueCreateInput): Promise<LinearIssueCreateResult> {
    if (!this.#apiKey || !this.#teamId) {
      throw new Error("Linear issue creation requires SENSE1_LINEAR_API_KEY and SENSE1_LINEAR_TEAM_ID.");
    }

    const response = await this.#fetchImpl(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.#apiKey,
      },
      body: JSON.stringify({
        query: `mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
            }
          }
        }`,
        variables: {
          input: {
            title: input.title,
            description: input.description,
            teamId: this.#teamId,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Linear API request failed with status ${response.status}.`);
    }

    const payload = await response.json() as {
      errors?: Array<{ message?: string }>;
      data?: {
        issueCreate?: {
          success?: boolean;
          issue?: {
            id?: string;
            identifier?: string | null;
          } | null;
        } | null;
      };
    };

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors.map((entry) => entry.message || "Unknown Linear GraphQL error").join("; "));
    }

    const issue = payload.data?.issueCreate?.issue;
    if (!payload.data?.issueCreate?.success || !issue?.id) {
      throw new Error("Linear issue creation did not return a created issue.");
    }

    const identifier = typeof issue.identifier === "string" && issue.identifier.trim() ? issue.identifier.trim() : null;
    const url = this.#workspaceUrl && identifier
      ? `https://linear.app/${this.#workspaceUrl}/issue/${identifier}`
      : null;

    return {
      id: issue.id,
      identifier,
      url,
    };
  }
}
