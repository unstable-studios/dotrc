/**
 * Slack integration adapter for dotrc-worker.
 *
 * Handles:
 * - Slack Events API (message → dot)
 * - URL verification challenge
 * - User identity mapping (Slack user → internal user)
 * - Channel scope expansion (channel members → explicit grants)
 * - Slash commands
 *
 * Core remains pure — this adapter handles Slack API calls,
 * user resolution, and persistence.
 */

import type { DotDraft } from "./types";
import type { D1DotStorage } from "./storage-d1";
import type { Logger } from "./logger";

// --- Slack event types ---

export interface SlackEventWrapper {
  type: string;
  token?: string;
  team_id?: string;
  event?: SlackEvent;
  challenge?: string;
  event_id?: string;
}

export interface SlackEvent {
  type: string;
  subtype?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
}

export interface SlackSlashCommand {
  command: string;
  text: string;
  user_id: string;
  user_name: string;
  team_id: string;
  channel_id: string;
  channel_name: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: { id: string; name: string };
  authed_user?: { id: string };
  error?: string;
}

// --- Core adapter logic ---

export interface SlackConfig {
  signingSecret: string;
  botToken?: string;
  clientId?: string;
  clientSecret?: string;
}

/**
 * Process a Slack event and create a dot if applicable.
 * Returns the dot ID if created, null otherwise.
 */
export async function processSlackEvent(
  event: SlackEvent,
  teamId: string,
  storage: D1DotStorage,
  core: { createDot: (draft: DotDraft, now: string, dotId: string) => any },
  generateDotId: () => string,
  now: () => string,
  logger?: Logger,
): Promise<{ dotId: string } | null> {
  // Only process regular messages (no subtypes like bot_message, channel_join, etc.)
  if (event.type !== "message" || event.subtype) {
    logger?.debug("slack.event_skipped", { type: event.type, subtype: event.subtype });
    return null;
  }

  if (!event.user || !event.text || !event.channel) {
    logger?.warn("slack.event_missing_fields", {
      hasUser: !!event.user,
      hasText: !!event.text,
      hasChannel: !!event.channel,
    });
    return null;
  }

  // Look up integration by team_id
  const integration = await storage.getIntegrationByWorkspace("slack", teamId);
  if (!integration) {
    logger?.warn("slack.no_integration", { teamId });
    return null;
  }

  const tenantId = integration.tenant_id;
  const timestamp = now();

  // Resolve Slack user → internal user
  const userId = await resolveSlackUser(
    event.user,
    integration.id,
    tenantId,
    storage,
    timestamp,
  );

  // Resolve channel → scope and get member grants
  const scopeId = `slack-channel-${event.channel}`;
  await storage.ensureScope(scopeId, tenantId, timestamp);

  // Get channel members for explicit grants
  const memberUserIds = await storage.getScopeMembers(scopeId);
  // Always include the creator
  const visibleToUsers = Array.from(new Set([userId, ...memberUserIds]));

  // Build dot draft
  const title = event.text.length > 100
    ? event.text.slice(0, 97) + "..."
    : event.text;

  const draft: DotDraft = {
    title,
    body: event.text,
    created_by: userId,
    tenant_id: tenantId,
    scope_id: scopeId,
    tags: ["slack", `slack-channel-${event.channel}`],
    visible_to_users: visibleToUsers,
    visible_to_scopes: [],
    attachments: [],
  };

  // Call core to create dot
  const dotId = generateDotId();
  const result = core.createDot(draft, timestamp, dotId);

  // Persist
  await storage.ensureEntities(
    { dot: result.dot, grants: result.grants, links: result.links },
    timestamp,
  );
  await storage.storeDot({
    dot: result.dot,
    grants: result.grants,
    links: result.links,
  });

  logger?.info("slack.dot_created", {
    dotId: result.dot.id,
    channel: event.channel,
    userId,
  });

  return { dotId: result.dot.id };
}

/**
 * Resolve a Slack user ID to an internal user ID.
 * Creates the mapping if it doesn't exist.
 */
async function resolveSlackUser(
  slackUserId: string,
  integrationId: string,
  tenantId: string,
  storage: D1DotStorage,
  now: string,
): Promise<string> {
  // Check existing mapping
  const existing = await storage.getExternalIdentityByExternalId(
    integrationId,
    slackUserId,
  );
  if (existing) {
    return existing.user_id;
  }

  // Create new internal user mapped to Slack user
  const userId = `slack-${slackUserId}`;
  await storage.ensureUser(userId, tenantId, now);
  await storage.storeExternalIdentity({
    user_id: userId,
    integration_id: integrationId,
    external_user_id: slackUserId,
    display_name: slackUserId, // Will be updated when we fetch profile
    linked_at: now,
  });

  return userId;
}

/**
 * Process a slash command.
 * Returns a Slack-formatted response object.
 */
export async function processSlashCommand(
  command: SlackSlashCommand,
  storage: D1DotStorage,
  core: { createDot: (draft: DotDraft, now: string, dotId: string) => any },
  generateDotId: () => string,
  now: () => string,
  logger?: Logger,
): Promise<{ response_type: string; text: string }> {
  const integration = await storage.getIntegrationByWorkspace(
    "slack",
    command.team_id,
  );
  if (!integration) {
    return {
      response_type: "ephemeral",
      text: "This workspace is not connected to dotrc. Please install the app first.",
    };
  }

  const tenantId = integration.tenant_id;
  const timestamp = now();
  const userId = await resolveSlackUser(
    command.user_id,
    integration.id,
    tenantId,
    storage,
    timestamp,
  );

  const parts = command.text.trim().split(/\s+/);
  const subcommand = parts[0] || "help";
  const args = parts.slice(1).join(" ");

  switch (subcommand) {
    case "create": {
      if (!args) {
        return {
          response_type: "ephemeral",
          text: "Usage: `/dotrc create <title>`",
        };
      }

      const scopeId = `slack-channel-${command.channel_id}`;
      await storage.ensureScope(scopeId, tenantId, timestamp);
      const memberUserIds = await storage.getScopeMembers(scopeId);
      const visibleToUsers = Array.from(new Set([userId, ...memberUserIds]));

      const draft: DotDraft = {
        title: args,
        created_by: userId,
        tenant_id: tenantId,
        scope_id: scopeId,
        tags: ["slack", "slash-command"],
        visible_to_users: visibleToUsers,
        visible_to_scopes: [],
        attachments: [],
      };

      const dotId = generateDotId();
      const result = core.createDot(draft, timestamp, dotId);
      await storage.ensureEntities(
        { dot: result.dot, grants: result.grants, links: result.links },
        timestamp,
      );
      await storage.storeDot({
        dot: result.dot,
        grants: result.grants,
        links: result.links,
      });

      logger?.info("slack.slash_create", { dotId: result.dot.id });

      return {
        response_type: "in_channel",
        text: `Dot created: *${args}* (${result.dot.id})`,
      };
    }

    case "list": {
      const dots = await storage.listDotsForUser({
        tenantId,
        userId,
        limit: 5,
        offset: 0,
      });

      if (dots.dots.length === 0) {
        return {
          response_type: "ephemeral",
          text: "No dots found.",
        };
      }

      const lines = dots.dots.map(
        (d, i) => `${i + 1}. *${d.title}* (${d.id}) — ${d.created_at}`,
      );

      return {
        response_type: "ephemeral",
        text: `Recent dots:\n${lines.join("\n")}`,
      };
    }

    default:
      return {
        response_type: "ephemeral",
        text: "Available commands:\n• `/dotrc create <title>` — Create a new dot\n• `/dotrc list` — List recent dots",
      };
  }
}
