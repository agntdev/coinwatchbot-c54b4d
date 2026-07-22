import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { watchlists } from "../storage.js";
import { findCoinId, suggestCoins } from "../coingecko.js";

const COMMON_COINS = [
  { ticker: "BTC", label: "BTC" },
  { ticker: "ETH", label: "ETH" },
  { ticker: "TON", label: "TON" },
  { ticker: "USDT", label: "USDT" },
  { ticker: "BNB", label: "BNB" },
  { ticker: "SOL", label: "SOL" },
  { ticker: "XRP", label: "XRP" },
  { ticker: "ADA", label: "ADA" },
];

registerMainMenuItem({ label: "➕ Add Coin", data: "watchlist:add", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("watchlist:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < COMMON_COINS.length; i += 2) {
    const row = COMMON_COINS.slice(i, i + 2).map((c) =>
      inlineButton(c.label, `watchlist:pick:${c.ticker}`),
    );
    rows.push(row);
  }
  rows.push([inlineButton("Other…", "watchlist:custom")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.editMessageText("Pick a coin to add to your watchlist:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery("watchlist:custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "watchlist:custom";
  ctx.session.awaitingCustomTicker = true;
  await ctx.editMessageText(
    "Type the ticker or name of the coin you want to add (e.g. DOGE, AVAX):",
  );
});

composer.callbackQuery(/^watchlist:pick:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  const ticker = match[1]!.toUpperCase();
  await addCoinToWatchlist(ctx, ticker);
});

composer.callbackQuery(/^watchlist:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  const ticker = match[1]!.toUpperCase();
  const userId = String(ctx.from!.id);
  const list = (await watchlists.get(userId)) ?? [];
  const updated = list.filter((item) => item.ticker !== ticker);
  await watchlists.set(userId, updated);
  await renderWatchlist(ctx, `Removed ${ticker} from your watchlist.`);
});

composer.on("message:text", async (ctx, next) => {
  if (!ctx.session.awaitingCustomTicker) return next();
  ctx.session.awaitingCustomTicker = false;
  ctx.session.step = undefined;
  const ticker = ctx.message!.text.trim().toUpperCase();
  if (!ticker || ticker.length > 10) {
    await ctx.reply("That doesn't look like a valid ticker. Try again.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  await addCoinToWatchlist(ctx, ticker);
});

async function addCoinToWatchlist(ctx: Ctx, ticker: string): Promise<void> {
  const userId = String(ctx.from!.id);
  const list = (await watchlists.get(userId)) ?? [];

  if (list.some((item) => item.ticker === ticker)) {
    await ctx.editMessageText(`${ticker} is already on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  // Verify the ticker exists on CoinGecko
  const coinId = await findCoinId(ticker);
  if (!coinId) {
    const suggestions = await suggestCoins(ticker);
    let text = `Couldn't find "${ticker}" on CoinGecko. Check the spelling and try again.`;
    if (suggestions.length > 0) {
      text += `\n\nDid you mean: ${suggestions.join(", ")}?`;
    }
    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  list.push({ ticker, displayName: ticker });
  await watchlists.set(userId, list);

  await ctx.editMessageText(`✅ Added ${ticker} to your watchlist.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add another", "watchlist:add")],
      [inlineButton("💰 Check prices", "price:check")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

async function renderWatchlist(ctx: Ctx, header: string): Promise<void> {
  const userId = String(ctx.from!.id);
  const list = (await watchlists.get(userId)) ?? [];

  if (list.length === 0) {
    await ctx.editMessageText(
      `${header}\n\nYour watchlist is empty — tap ➕ Add Coin to get started.`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add Coin", "watchlist:add")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const rows = list.map((item) => [
    inlineButton(`${item.ticker}`, `watchlist:pick:${item.ticker}`),
    inlineButton("✕", `watchlist:remove:${item.ticker}`),
  ]);
  rows.push([inlineButton("➕ Add more", "watchlist:add")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const items = list.map((item) => `• ${item.ticker}`).join("\n");
  await ctx.editMessageText(`${header}\n\nYour watchlist:\n${items}`, {
    reply_markup: inlineKeyboard(rows),
  });
}

export default composer;
