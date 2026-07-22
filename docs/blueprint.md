# CryptoWatch — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that monitors cryptocurrency prices and sends private alerts when watched coins move. Users manage watchlists, set price thresholds or percentage change alerts, request on-demand prices, and configure quiet hours. The owner receives usage statistics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto watchers
- Telegram users

## Success criteria

- Users receive timely price alerts based on their watchlists
- Users can manage watchlists and alerts through inline buttons
- Owner receives periodic usage statistics with top-fired alerts

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and explain features
- **/price** (command, actor: user, command: /price) — Request current prices for watchlist or specific ticker
- **/stats** (command, actor: owner, command: /stats) — Request on-demand usage statistics
- **Add Coin** (button, actor: user, callback: watchlist:add) — Add a coin to watchlist with inline button options
- **Create Alert** (button, actor: user, callback: alert:create) — Start guided alert creation flow
- **Manage Alerts** (button, actor: user, callback: alert:manage) — View and modify existing alerts
- **Configure Quiet Hours** (button, actor: user, callback: settings:quiet_hours) — Set quiet hours for alert suppression

## Flows

### Onboarding
_Trigger:_ /start

1. Display welcome message with features and privacy notice
2. Suggest adding a coin to watchlist
3. Prompt to configure quiet hours or morning summary

_Data touched:_ User profile

### Watchlist Management
_Trigger:_ watchlist:add

1. Display inline buttons for common coins (BTC, ETH, TON, USDT, BNB, SOL, XRP, ADA)
2. Handle 'Other' selection for free-text ticker entry
3. Confirm successful addition or suggest closest matches for unknown tickers

_Data touched:_ Watchlist item

### Alert Creation
_Trigger:_ alert:create

1. Select coin from watchlist
2. Choose alert type (threshold or percentage)
3. Set direction and value
4. Configure cooldown period
5. Confirm alert creation

_Data touched:_ Alert

### Price Request
_Trigger:_ /price

1. Check if ticker parameter provided
2. If no ticker, return prices for entire watchlist
3. If ticker provided, return specific coin price
4. Include 24h change information

_Data touched:_ Price sample

### Morning Summary
_Trigger:_ scheduled:summary

1. Generate summary of watchlist prices
2. List alerts fired in past 24h
3. Include optional opt-out prompt

_Data touched:_ User profile, Alert

### Quiet Hours Handling
_Trigger:_ alert:check_quiet_hours

1. Check current time against user's quiet hours
2. Queue alerts during quiet hours
3. Deliver queued alerts after quiet hours end

_Data touched:_ User profile, Alert

### Owner Statistics
_Trigger:_ /stats

1. Generate summary of active users
2. List top 10 most-fired alerts
3. Include anonymized metrics

_Data touched:_ User profile, Alert

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — Telegram ID, timezone, quiet hours, morning summary time, owner-visibility flag
  - fields: Telegram ID, timezone, quiet hours, morning summary time, owner-visibility flag
- **Watchlist item** _(retention: persistent)_ — ticker (symbol or name), display name
  - fields: ticker, display name
- **Alert** _(retention: persistent)_ — type (threshold or percentage), direction, value, lookback window, cooldown, active/paused, last-fired timestamp
  - fields: type, direction, value, lookback window, cooldown, active/paused, last-fired timestamp
- **Price sample** _(retention: session)_ — timestamped price for ticker (cached briefly for calculations)
  - fields: ticker, price, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- /stats command to request on-demand statistics
- Owner-visibility flag in user profiles to track opt-ins

## Notifications

- Price alerts with coin movement details
- Morning summaries of watchlist prices
- Owner statistics summary messages

## Permissions & privacy

- Private chat only (no group support)
- Anonymized metrics for owner dashboard
- User data stored securely with opt-in visibility

## Edge cases

- Price feed failures with retry logic
- Unknown tickers with helpful suggestions
- Quiet hours alert queuing and delivery

## Required tests

- Verify alert delivery during non-quiet hours
- Test watchlist management with common and unknown tickers
- Validate morning summary content and timing
- Confirm owner statistics accuracy

## Assumptions

- Default percent lookback window is 1 hour
- Seed common coins limited to 8 items
- Per-alert cooldown defaults to 1 hour
- Quiet hours suppress alerts but queue for later delivery
- Price feed failures retry up to 3 times before notification
- Unknown tickers produce helpful suggestions
