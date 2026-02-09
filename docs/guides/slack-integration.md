# Slack Integration

DotRC integrates with Slack to create dots from messages and slash commands. The integration maps Slack workspaces to DotRC tenants and Slack users to DotRC users.

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**
3. Name it (e.g., "DotRC") and select your workspace

### 2. Configure OAuth Scopes

Under **OAuth & Permissions**, add these Bot Token Scopes:

- `channels:history` — Read messages in public channels
- `channels:read` — List public channels
- `chat:write` — Send messages
- `commands` — Add slash commands
- `groups:history` — Read messages in private channels
- `groups:read` — List private channels
- `users:read` — Look up user info

### 3. Set Up Slash Commands

Under **Slash Commands**, create a new command:

| Field | Value |
|-------|-------|
| Command | `/dot` |
| Request URL | `https://your-worker.dev/slack/commands` |
| Short Description | Create a dot record |
| Usage Hint | `[title]` |

### 4. Enable Events

Under **Event Subscriptions**:

1. Toggle **Enable Events** on
2. Set the Request URL to `https://your-worker.dev/slack/events`
3. Subscribe to these bot events:
   - `message.channels` — Messages in public channels
   - `message.groups` — Messages in private channels

### 5. Configure Worker Secrets

```bash
wrangler secret put SLACK_SIGNING_SECRET   # From Basic Information > App Credentials
wrangler secret put SLACK_BOT_TOKEN        # From OAuth & Permissions > Bot User OAuth Token
wrangler secret put SLACK_CLIENT_ID        # From Basic Information > App Credentials
wrangler secret put SLACK_CLIENT_SECRET    # From Basic Information > App Credentials
```

### 6. Install the App

Direct users to `https://your-worker.dev/slack/install` or use the **Install to Workspace** button in the Slack app settings.

## Usage

### Slash Command

Create a dot from any Slack channel:

```
/dot Meeting notes: discussed Q1 roadmap
```

This creates a dot with:
- **Title:** "Meeting notes: discussed Q1 roadmap"
- **Scope:** The Slack channel ID
- **Visibility:** Members of the channel
- **Creator:** The Slack user (mapped to internal user ID)

### Automatic Dot Creation

When event subscriptions are enabled, the integration can automatically create dots from specific message patterns (configurable per workspace).

## How It Works

### Identity Mapping

The integration maintains mappings between:

- **Slack workspace** → DotRC **tenant** (via `Integration` records)
- **Slack user ID** → DotRC **user ID** (via `ExternalIdentity` records)
- **Slack channel** → DotRC **scope** (via `ScopeMembership` records)

### OAuth Flow

1. User visits `/slack/install`
2. Redirected to Slack's OAuth authorization page
3. After approval, Slack redirects to `/slack/oauth_redirect`
4. Worker exchanges the code for an access token
5. Creates or finds the integration and tenant records

### Security

- All Slack webhook requests are verified using `x-slack-signature` with HMAC-SHA256
- The `x-slack-request-timestamp` is checked to prevent replay attacks
- Bot tokens are stored as encrypted secrets in the worker environment

## Troubleshooting

### "Slack integration not configured" (503)

- Verify `SLACK_SIGNING_SECRET` is set: `wrangler secret list`

### "Invalid Slack signature" (401)

- Ensure `SLACK_SIGNING_SECRET` matches the value in your Slack app settings
- Check that the request timestamp is not stale (> 5 minutes)

### Users not being mapped

- Verify the workspace has been connected via OAuth (`/slack/install`)
- Check that `ExternalIdentity` records exist for the users
