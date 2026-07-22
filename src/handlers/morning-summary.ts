import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { watchlists, alerts, alertFires } from "../storage.js";
import { getPrices } from "../coingecko.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "📊 Summary", data: "summary:show", order: 60 });

const composer = new Composer<Ctx>();

composer.callbackQuery("summary:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = String(ctx.from!.id);
  const list = (await watchlists.get(userId)) ?? [];

  if (list.length === 0) {
    await ctx.editMessageText(
      "Your watchlist is empty — add a coin to see a summary.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add Coin", "watchlist:add")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // Fetch prices
  const tickers = list.map((item) => item.ticker);
  let priceMap: Map<string, { price: number; change24h: number }>;
  try {
    priceMap = await getPrices(tickers);
  } catch {
    await ctx.editMessageText(
      "Couldn't fetch prices right now — try again in a moment.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🔄 Retry", "summary:show")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // Build summary
  const lines: string[] = ["📊 Watchlist Summary\n"];
  for (const item of list) {
    const p = priceMap.get(item.ticker);
    if (p) {
      const sign = p.change24h >= 0 ? "+" : "";
      lines.push(`• ${item.ticker}: $${formatPrice(p.price)} (${sign}${p.change24h.toFixed(2)}%)`);
    } else {
      lines.push(`• ${item.ticker}: unavailable`);
    }
  }

  // Alerts fired in past 24h
  const fires = (await alertFires.get(userId)) ?? [];
  const cutoff = now().getTime() - 24 * 60 * 60 * 1000;
  const recentFires = fires.filter((f) => f.firedAt > cutoff);

  if (recentFires.length > 0) {
    lines.push(`\n🔔 Alerts fired (24h): ${recentFires.length}`);
    const tickerCounts = new Map<string, number>();
    for (const f of recentFires) {
      tickerCounts.set(f.ticker, (tickerCounts.get(f.ticker) ?? 0) + 1);
    }
    for (const [ticker, count] of tickerCounts) {
      lines.push(`  • ${ticker}: ${count}x`);
    }
  } else {
    lines.push(`\nNo alerts fired in the past 24h.`);
  }

  // Active alerts count
  const userAlerts = (await alerts.get(userId)) ?? [];
  const activeAlerts = userAlerts.filter((a) => a.active).length;
  if (activeAlerts > 0) {
    lines.push(`\nYou have ${activeAlerts} active alert(s).`);
  }

  await ctx.editMessageText(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "summary:show")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

function formatPrice(price: number): string {
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

export default composer;
