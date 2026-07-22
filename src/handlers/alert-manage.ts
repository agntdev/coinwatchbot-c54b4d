import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { alerts } from "../storage.js";

registerMainMenuItem({ label: "📋 Manage Alerts", data: "alert:manage", order: 40 });

const composer = new Composer<Ctx>();

composer.callbackQuery("alert:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderAlerts(ctx);
});

composer.callbackQuery(/^alert:toggle:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  const alertId = match[1]!;
  const userId = String(ctx.from!.id);
  const list = (await alerts.get(userId)) ?? [];
  const alert = list.find((a) => a.id === alertId);
  if (!alert) {
    await ctx.editMessageText("That alert no longer exists.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  alert.active = !alert.active;
  await alerts.set(userId, list);
  const status = alert.active ? "resumed" : "paused";
  await renderAlerts(ctx, `Alert ${status}.`);
});

composer.callbackQuery(/^alert:delete:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const match = ctx.match as RegExpMatchArray;
  const alertId = match[1]!;
  const userId = String(ctx.from!.id);
  const list = (await alerts.get(userId)) ?? [];
  const updated = list.filter((a) => a.id !== alertId);
  await alerts.set(userId, updated);
  await renderAlerts(ctx, "Alert deleted.");
});

async function renderAlerts(ctx: Ctx, header?: string): Promise<void> {
  const userId = String(ctx.from!.id);
  const list = (await alerts.get(userId)) ?? [];

  if (list.length === 0) {
    const text = header
      ? `${header}\n\nNo alerts yet — tap 🔔 Create Alert to set one up.`
      : "No alerts yet — tap 🔔 Create Alert to set one up.";
    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 Create Alert", "alert:create")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const alert of list) {
    const unit = alert.type === "threshold" ? "USD" : "%";
    const status = alert.active ? "🟢" : "⏸️";
    const label = `${status} ${alert.ticker} ${alert.direction} ${alert.value}${unit}`;
    rows.push([
      inlineButton(label, `alert:toggle:${alert.id}`),
      inlineButton("✕", `alert:delete:${alert.id}`),
    ]);
  }
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const text = header ? `${header}\n\nYour alerts:` : "Your alerts:";
  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard(rows),
  });
}

export default composer;
