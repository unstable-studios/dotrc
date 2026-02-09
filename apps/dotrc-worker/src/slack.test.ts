import { describe, it, expect, vi, beforeEach } from "vitest";
import { processSlackEvent, processSlashCommand } from "./slack";
import type { SlackEvent, SlackSlashCommand } from "./slack";

// --- Mock storage ---

function createMockStorage() {
  const integrations = new Map<string, any>();
  const identities = new Map<string, any>();
  const scopeMembers = new Map<string, string[]>();
  const storedDots: any[] = [];
  const ensuredUsers: string[] = [];
  const ensuredScopes: string[] = [];

  return {
    _integrations: integrations,
    _identities: identities,
    _scopeMembers: scopeMembers,
    _storedDots: storedDots,
    _ensuredUsers: ensuredUsers,
    _ensuredScopes: ensuredScopes,

    getIntegrationByWorkspace: vi.fn(async (provider: string, workspaceId: string) => {
      return integrations.get(`${provider}:${workspaceId}`) || null;
    }),
    getExternalIdentityByExternalId: vi.fn(
      async (integrationId: string, externalUserId: string) => {
        return identities.get(`${integrationId}:${externalUserId}`) || null;
      },
    ),
    ensureUser: vi.fn(async (userId: string) => {
      ensuredUsers.push(userId);
    }),
    ensureScope: vi.fn(async (scopeId: string) => {
      ensuredScopes.push(scopeId);
    }),
    ensureTenant: vi.fn(async () => {}),
    storeExternalIdentity: vi.fn(async (identity: any) => {
      identities.set(
        `${identity.integration_id}:${identity.external_user_id}`,
        identity,
      );
    }),
    getScopeMembers: vi.fn(async (scopeId: string) => {
      return scopeMembers.get(scopeId) || [];
    }),
    ensureEntities: vi.fn(async () => {}),
    storeDot: vi.fn(async (req: any) => {
      storedDots.push(req);
      return { success: true, dotId: req.dot.id };
    }),
    listDotsForUser: vi.fn(async () => ({
      dots: [] as any[],
      total: 0,
      hasMore: false,
    })),
    storeScopeMembership: vi.fn(async () => {}),
  };
}

// --- Mock core ---

function createMockCore() {
  return {
    createDot: vi.fn((draft: any, timestamp: string, dotId: string) => ({
      dot: {
        id: dotId,
        tenant_id: draft.tenant_id,
        title: draft.title,
        body: draft.body,
        created_by: draft.created_by,
        created_at: timestamp,
        scope_id: draft.scope_id,
        tags: draft.tags,
        attachments: [],
      },
      grants: draft.visible_to_users.map((userId: string) => ({
        dot_id: dotId,
        user_id: userId,
        granted_at: timestamp,
      })),
      links: [],
    })),
  };
}

describe("processSlackEvent", () => {
  let storage: ReturnType<typeof createMockStorage>;
  let core: ReturnType<typeof createMockCore>;
  let dotIdCounter: number;

  beforeEach(() => {
    storage = createMockStorage();
    core = createMockCore();
    dotIdCounter = 0;

    // Set up a default integration
    storage._integrations.set("slack:T123", {
      id: "int-1",
      tenant_id: "tenant-1",
      provider: "slack",
      workspace_id: "T123",
      created_at: "2025-01-01T00:00:00Z",
    });
  });

  const generateDotId = () => `dot-${++dotIdCounter}`;
  const nowFn = () => "2025-06-01T12:00:00Z";

  it("creates a dot from a message event", async () => {
    const event: SlackEvent = {
      type: "message",
      user: "U456",
      text: "Hello from Slack!",
      channel: "C789",
    };

    const result = await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result).not.toBeNull();
    expect(result!.dotId).toBe("dot-1");
    expect(core.createDot).toHaveBeenCalledOnce();
    expect(storage.storeDot).toHaveBeenCalledOnce();

    // Check draft was built correctly
    const draft = core.createDot.mock.calls[0][0];
    expect(draft.title).toBe("Hello from Slack!");
    expect(draft.body).toBe("Hello from Slack!");
    expect(draft.tenant_id).toBe("tenant-1");
    expect(draft.tags).toContain("slack");
    expect(draft.scope_id).toBe("slack-channel-C789");
  });

  it("creates external identity for new Slack user", async () => {
    const event: SlackEvent = {
      type: "message",
      user: "UNEW",
      text: "New user message",
      channel: "C789",
    };

    await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(storage.storeExternalIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "slack-UNEW",
        integration_id: "int-1",
        external_user_id: "UNEW",
      }),
    );
  });

  it("reuses existing external identity", async () => {
    storage._identities.set("int-1:UEXIST", {
      user_id: "existing-user",
      integration_id: "int-1",
      external_user_id: "UEXIST",
      display_name: "UEXIST",
      linked_at: "2025-01-01T00:00:00Z",
    });

    const event: SlackEvent = {
      type: "message",
      user: "UEXIST",
      text: "Returning user",
      channel: "C789",
    };

    await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    // Should NOT create new identity
    expect(storage.storeExternalIdentity).not.toHaveBeenCalled();
    // Should use existing user ID
    const draft = core.createDot.mock.calls[0][0];
    expect(draft.created_by).toBe("existing-user");
  });

  it("includes channel members in visible_to_users", async () => {
    storage._scopeMembers.set("slack-channel-C789", [
      "member-1",
      "member-2",
    ]);

    const event: SlackEvent = {
      type: "message",
      user: "U456",
      text: "Channel message",
      channel: "C789",
    };

    await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    const draft = core.createDot.mock.calls[0][0];
    expect(draft.visible_to_users).toContain("member-1");
    expect(draft.visible_to_users).toContain("member-2");
    expect(draft.visible_to_users).toContain("slack-U456");
  });

  it("skips events with subtypes (bot_message, etc.)", async () => {
    const event: SlackEvent = {
      type: "message",
      subtype: "bot_message",
      text: "Bot says hi",
      channel: "C789",
    };

    const result = await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result).toBeNull();
    expect(core.createDot).not.toHaveBeenCalled();
  });

  it("skips events with no user/text/channel", async () => {
    const event: SlackEvent = {
      type: "message",
      // missing user, text, channel
    };

    const result = await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result).toBeNull();
  });

  it("returns null when no integration found", async () => {
    const event: SlackEvent = {
      type: "message",
      user: "U456",
      text: "Hello",
      channel: "C789",
    };

    const result = await processSlackEvent(
      event,
      "T_UNKNOWN",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result).toBeNull();
  });

  it("truncates long messages to 100 chars for title", async () => {
    const longText = "A".repeat(150);

    const event: SlackEvent = {
      type: "message",
      user: "U456",
      text: longText,
      channel: "C789",
    };

    await processSlackEvent(
      event,
      "T123",
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    const draft = core.createDot.mock.calls[0][0];
    expect(draft.title.length).toBe(100);
    expect(draft.title.endsWith("...")).toBe(true);
    // Full text is in body
    expect(draft.body).toBe(longText);
  });
});

describe("processSlashCommand", () => {
  let storage: ReturnType<typeof createMockStorage>;
  let core: ReturnType<typeof createMockCore>;
  let dotIdCounter: number;

  beforeEach(() => {
    storage = createMockStorage();
    core = createMockCore();
    dotIdCounter = 0;

    storage._integrations.set("slack:T123", {
      id: "int-1",
      tenant_id: "tenant-1",
      provider: "slack",
      workspace_id: "T123",
      created_at: "2025-01-01T00:00:00Z",
    });
  });

  const generateDotId = () => `dot-${++dotIdCounter}`;
  const nowFn = () => "2025-06-01T12:00:00Z";

  function makeCommand(overrides: Partial<SlackSlashCommand> = {}): SlackSlashCommand {
    return {
      command: "/dotrc",
      text: "",
      user_id: "U456",
      user_name: "testuser",
      team_id: "T123",
      channel_id: "C789",
      channel_name: "general",
      response_url: "https://hooks.slack.com/actions/T123/1234/abcd",
      trigger_id: "trig-1",
      ...overrides,
    };
  }

  it("creates a dot via 'create' subcommand", async () => {
    const result = await processSlashCommand(
      makeCommand({ text: "create My new dot" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("in_channel");
    expect(result.text).toContain("My new dot");
    expect(core.createDot).toHaveBeenCalledOnce();

    const draft = core.createDot.mock.calls[0][0];
    expect(draft.title).toBe("My new dot");
    expect(draft.tags).toContain("slash-command");
  });

  it("returns error when create has no text", async () => {
    const result = await processSlashCommand(
      makeCommand({ text: "create" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("ephemeral");
    expect(result.text).toContain("Usage");
    expect(core.createDot).not.toHaveBeenCalled();
  });

  it("lists recent dots via 'list' subcommand", async () => {
    storage.listDotsForUser.mockResolvedValueOnce({
      dots: [
        {
          id: "dot-1",
          tenant_id: "tenant-1",
          title: "First dot",
          created_by: "u-1",
          created_at: "2025-01-01T00:00:00Z",
          tags: [],
          attachments: [],
        },
      ],
      total: 1,
      hasMore: false,
    });

    const result = await processSlashCommand(
      makeCommand({ text: "list" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("ephemeral");
    expect(result.text).toContain("First dot");
  });

  it("shows help for unknown subcommand", async () => {
    const result = await processSlashCommand(
      makeCommand({ text: "unknown" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("ephemeral");
    expect(result.text).toContain("Available commands");
  });

  it("shows help for empty text", async () => {
    const result = await processSlashCommand(
      makeCommand({ text: "" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("ephemeral");
    expect(result.text).toContain("Available commands");
  });

  it("returns error when no integration found", async () => {
    const result = await processSlashCommand(
      makeCommand({ team_id: "T_UNKNOWN" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("ephemeral");
    expect(result.text).toContain("not connected");
  });

  it("lists 'No dots found' when empty", async () => {
    const result = await processSlashCommand(
      makeCommand({ text: "list" }),
      storage as any,
      core,
      generateDotId,
      nowFn,
    );

    expect(result.response_type).toBe("ephemeral");
    expect(result.text).toContain("No dots found");
  });
});
