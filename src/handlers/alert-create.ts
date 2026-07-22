import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { watchlists, alerts } from "../storage.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "🔔 Create Alert", data: "alert:create", order: 30 });

const composer = new Composer<Ctx>();

composer.callbackQuery("alert:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = String(ctx.from!.id);
  const list = (await watchlists.get(userId)) ?? [];

  if (list.length === 0) {
    await ctx.editMessageText(
      "Your watchlist is empty — add a coin first before creating an alert.",
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
    inlineButton(item.ticker, `alert:coin:${item.ticker}`),
  ]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.editMessageText("Which coin do you want to set an alert for?", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^alert:coin:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  ctx.session.alertTicker = match[1]!.toUpperCase();
  ctx.session.step = "alert:type";

  await ctx.editMessageText(
    `What kind of alert for ${ctx.session.alertTicker}?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Price threshold", "alert:type:threshold")],
        [inlineButton("% change", "alert:type:percentage")],
        [inlineButton("Cancel", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery(/^alert:type:(threshold|percentage)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  ctx.session.alertType = match[1] as "threshold" | "percentage";
  ctx.session.step = "alert:direction";

  const typeLabel = ctx.session.alertType === "threshold" ? "price threshold" : "% change";
  await ctx.editMessageText(
    `For the ${typeLabel} alert on ${ctx.session.alertTicker}, trigger when the price is…`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📈 Above", "alert:dir:above")],
        [inlineButton("📉 Below", "alert:dir:below")],
        [inlineButton("Cancel", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery(/^alert:dir:(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  ctx.session.alertDir = match[1] as "above" | "below";
  ctx.session.step = "alert:value";

  const unit = ctx.session.alertType === "threshold" ? "USD" : "%";
  const direction = ctx.session.alertDir === "above" ? "above" : "below";
  await ctx.editMessageText(
    `When ${ctx.session.alertTicker} goes ${direction} what ${unit}? Type the value.`,
  );
  // ForceReply to get typed input
  await ctx.reply(`Enter the ${unit} value:`, {
    reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "alert:value") return next();

  const text = ctx.message!.text.trim();
  const value = parseFloat(text);

  if (isNaN(value) || value <= 0) {
    await ctx.reply("Please enter a valid positive number.");
    return;
  }

  ctx.session.alertValue = value;
  ctx.session.step = "alert:confirm";

  const unit = ctx.session.alertType === "threshold" ? "USD" : "%";
  const direction = ctx.session.alertDir === "above" ? "above" : "below";
  const typeLabel = ctx.session.alertType === "threshold" ? "price" : "% change";

  await ctx.reply(
    `Confirm your alert:\n\n` +
      `Coin: ${ctx.session.alertTicker}\n` +
      `Type: ${typeLabel}\n` +
      `Trigger: ${direction} ${value}${unit}\n` +
      `Cooldown: 1 hour`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✅ Create alert", "alert:confirm:yes")],
        [inlineButton("❌ Cancel", "alert:confirm:no")],
      ]),
    },
  );
});

composer.callbackQuery("alert:confirm:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = String(ctx.from!.id);
  const { alertTicker, alertType, alertDir, alertValue } = ctx.session;

  if (!alertTicker || !alertType || !alertDir || alertValue === undefined) {
    await ctx.editMessageText("Something went wrong. Start over from the menu.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const existingAlerts = (await alerts.get(userId)) ?? [];
  const newAlert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ticker: alertTicker,
    type: alertType,
    direction: alertDir,
    value: alertValue,
    cooldownMinutes: 60,
    active: true,
    createdAt: now().getTime(),
  };

  existingAlerts.push(newAlert);
  await alerts.set(userId, existingAlerts);

  // Clear flow state
  ctx.session.step = undefined;
  ctx.session.alertTicker = undefined;
  ctx.session.alertType = undefined;
  ctx.session.alertDir = undefined;
  ctx.session.alertValue = undefined;

  const unit = alertType === "threshold" ? "USD" : "%";
  const direction = alertDir === "above" ? "above" : "below";

  await ctx.editMessageText(
    `✅ Alert created!\n\n` +
      `I'll notify you when ${alertTicker} goes ${direction} ${alertValue}${unit}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 Create another", "alert:create")],
        [inlineButton("📋 Manage alerts", "alert:manage")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("alert:confirm:no", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.alertTicker = undefined;
  ctx.session.alertType = undefined;
  ctx.session.alertDir = undefined;
  ctx.session.alertValue = undefined;

  await ctx.editMessageText("Alert cancelled.", {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
