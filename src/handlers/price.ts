import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { watchlists, alerts, alertFires, queuedAlerts, userProfiles } from "../storage.js";
import { getPrices, getPrice, suggestCoins } from "../coingecko.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "💰 Price Check", data: "price:check", order: 20 });

const composer = new Composer<Ctx>();

composer.command("price", async (ctx) => {
  const text = ctx.message!.text.trim();
  const parts = text.split(/\s+/);
  const ticker = parts.length > 1 ? parts[1]?.toUpperCase() : undefined;

  if (ticker) {
    await handleSinglePrice(ctx, ticker, false);
  } else {
    await handleWatchlistPrices(ctx, false);
  }
});

composer.callbackQuery("price:check", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleWatchlistPrices(ctx, true);
});

composer.callbackQuery(/^price:single:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  await handleSinglePrice(ctx, match[1]!.toUpperCase(), true);
});

async function handleWatchlistPrices(ctx: Ctx, isEdit: boolean): Promise<void> {
  const userId = String(ctx.from!.id);
  const list = (await watchlists.get(userId)) ?? [];

  if (list.length === 0) {
    const msg = "Your watchlist is empty — add a coin first to check prices.";
    const kb = inlineKeyboard([
      [inlineButton("➕ Add Coin", "watchlist:add")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]);
    if (isEdit) {
      await ctx.editMessageText(msg, { reply_markup: kb });
    } else {
      await ctx.reply(msg, { reply_markup: kb });
    }
    return;
  }

  const tickers = list.map((item) => item.ticker);
  let prices: Map<string, { price: number; change24h: number }>;

  try {
    prices = await getPrices(tickers);
  } catch {
    const msg = "Couldn't fetch prices right now — the price service may be temporarily unavailable. Try again in a moment.";
    const kb = inlineKeyboard([
      [inlineButton("🔄 Retry", "price:check")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]);
    if (isEdit) {
      await ctx.editMessageText(msg, { reply_markup: kb });
    } else {
      await ctx.reply(msg, { reply_markup: kb });
    }
    return;
  }

  if (prices.size === 0) {
    const msg = "Couldn't look up those coins. Double-check your watchlist tickers.";
    const kb = inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]);
    if (isEdit) {
      await ctx.editMessageText(msg, { reply_markup: kb });
    } else {
      await ctx.reply(msg, { reply_markup: kb });
    }
    return;
  }

  const lines: string[] = [];
  for (const item of list) {
    const p = prices.get(item.ticker);
    if (p) {
      const changeStr = formatChange(p.change24h);
      lines.push(`${item.ticker}: $${formatPrice(p.price)} (${changeStr})`);
    } else {
      lines.push(`${item.ticker}: unavailable`);
    }
  }

  // Check for alerts that should fire
  const userAlerts = (await alerts.get(userId)) ?? [];
  const firedIds: string[] = [];
  for (const alert of userAlerts) {
    if (!alert.active) continue;
    const p = prices.get(alert.ticker);
    if (!p) continue;

    const shouldFire =
      (alert.direction === "above" && p.price > alert.value) ||
      (alert.direction === "below" && p.price < alert.value);

    if (shouldFire) {
      const lastFired = alert.lastFired ?? 0;
      const cooldownMs = alert.cooldownMinutes * 60 * 1000;
      if (now().getTime() - lastFired > cooldownMs) {
        const profile = (await userProfiles.get(userId)) ?? {};
        if (isQuietHours(profile, now())) {
          const queued = (await queuedAlerts.get(userId)) ?? [];
          queued.push({
            alertId: alert.id,
            ticker: alert.ticker,
            message: formatAlertMessage(alert, p),
            queuedAt: now().getTime(),
          });
          await queuedAlerts.set(userId, queued);
        } else {
          firedIds.push(alert.id);
          alert.lastFired = now().getTime();
        }
      }
    }
  }
  if (firedIds.length > 0) {
    await alerts.set(userId, userAlerts);
    const fires = (await alertFires.get(userId)) ?? [];
    for (const id of firedIds) {
      const alert = userAlerts.find((a) => a.id === id);
      if (alert) {
        fires.push({ alertId: id, ticker: alert.ticker, firedAt: now().getTime() });
      }
    }
    await alertFires.set(userId, fires);
  }

  const alertText =
    firedIds.length > 0 ? `\n\n🔔 ${firedIds.length} alert(s) fired!` : "";

  const body = `Current prices:\n${lines.map((l) => `• ${l}`).join("\n")}${alertText}`;
  const kb = inlineKeyboard([
    ...list.map((item) => [
      inlineButton(`ℹ️ ${item.ticker}`, `price:single:${item.ticker}`),
    ]),
    [inlineButton("🔄 Refresh", "price:check")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);

  if (isEdit) {
    await ctx.editMessageText(body, { reply_markup: kb });
  } else {
    await ctx.reply(body, { reply_markup: kb });
  }
}

async function handleSinglePrice(ctx: Ctx, ticker: string, isEdit: boolean): Promise<void> {
  let price: { price: number; change24h: number } | null;
  try {
    price = await getPrice(ticker);
  } catch {
    const msg = `Couldn't fetch the price for ${ticker} right now. Try again in a moment.`;
    const kb = inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]);
    if (isEdit) {
      await ctx.editMessageText(msg, { reply_markup: kb });
    } else {
      await ctx.reply(msg, { reply_markup: kb });
    }
    return;
  }

  if (!price) {
    const suggestions = await suggestCoins(ticker);
    let text = `Couldn't find "${ticker}" on CoinGecko.`;
    if (suggestions.length > 0) {
      text += `\n\nDid you mean: ${suggestions.join(", ")}?`;
    }
    const kb = inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]);
    if (isEdit) {
      await ctx.editMessageText(text, { reply_markup: kb });
    } else {
      await ctx.reply(text, { reply_markup: kb });
    }
    return;
  }

  const changeStr = formatChange(price.change24h);
  const body = `${ticker}: $${formatPrice(price.price)}\n24h change: ${changeStr}`;
  const kb = inlineKeyboard([
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  if (isEdit) {
    await ctx.editMessageText(body, { reply_markup: kb });
  } else {
    await ctx.reply(body, { reply_markup: kb });
  }
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

function formatAlertMessage(
  alert: { ticker: string; direction: string; value: number; type: string },
  price: { price: number },
): string {
  const unit = alert.type === "threshold" ? "USD" : "%";
  return `🔔 ${alert.ticker} is now ${alert.direction} ${alert.value}${unit} (current: $${formatPrice(price.price)})`;
}

function isQuietHours(
  profile: { quietHoursStart?: number; quietHoursEnd?: number },
  currentTime: Date,
): boolean {
  if (profile.quietHoursStart === undefined || profile.quietHoursEnd === undefined)
    return false;
  const hour = currentTime.getHours();
  const start = profile.quietHoursStart;
  const end = profile.quietHoursEnd;
  if (start <= end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

export default composer;
