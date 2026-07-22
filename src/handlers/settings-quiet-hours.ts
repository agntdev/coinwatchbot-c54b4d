import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { userProfiles } from "../storage.js";

registerMainMenuItem({ label: "🌙 Quiet Hours", data: "settings:quiet_hours", order: 50 });

const composer = new Composer<Ctx>();

composer.callbackQuery("settings:quiet_hours", async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderQuietHours(ctx);
});

composer.callbackQuery("qh:set", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "qh:start";
  ctx.session.qhTarget = "start";
  await ctx.editMessageText(
    "What hour should quiet hours START? (0–23, where 0 = midnight and 22 = 10 PM)",
  );
  await ctx.reply("Enter the start hour (0–23):", {
    reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
  });
});

composer.callbackQuery("qh:clear", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = String(ctx.from!.id);
  const profile = (await userProfiles.get(userId)) ?? {};
  profile.quietHoursStart = undefined;
  profile.quietHoursEnd = undefined;
  await userProfiles.set(userId, profile);
  await renderQuietHours(ctx, "Quiet hours cleared.");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "qh:start" && ctx.session.step !== "qh:end") return next();

  const text = ctx.message!.text.trim();
  const hour = parseInt(text, 10);

  if (isNaN(hour) || hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    await ctx.reply("Please enter a whole number between 0 and 23.");
    return;
  }

  const userId = String(ctx.from!.id);
  const profile = (await userProfiles.get(userId)) ?? {};

  if (ctx.session.step === "qh:start") {
    profile.quietHoursStart = hour;
    await userProfiles.set(userId, profile);
    ctx.session.step = "qh:end";
    ctx.session.qhTarget = "end";
    await ctx.reply(
      `Quiet hours will start at ${formatHour(hour)}. What hour should they END? (0–23)`,
    );
  } else if (ctx.session.step === "qh:end") {
    profile.quietHoursEnd = hour;
    await userProfiles.set(userId, profile);
    ctx.session.step = undefined;
    ctx.session.qhTarget = undefined;

    const start = profile.quietHoursStart!;
    const end = profile.quietHoursEnd!;
    let rangeText: string;
    if (start === end) {
      rangeText = "24 hours (all day)";
    } else if (start < end) {
      rangeText = `${formatHour(start)} to ${formatHour(end)}`;
    } else {
      rangeText = `${formatHour(start)} to ${formatHour(end)} (wraps past midnight)`;
    }

    await ctx.reply(
      `✅ Quiet hours set: ${rangeText}\n\nAlerts during this window will be queued and delivered when quiet hours end.`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  }
});

async function renderQuietHours(ctx: Ctx, header?: string): Promise<void> {
  const userId = String(ctx.from!.id);
  const profile = (await userProfiles.get(userId)) ?? {};

  if (profile.quietHoursStart !== undefined && profile.quietHoursEnd !== undefined) {
    const start = profile.quietHoursStart;
    const end = profile.quietHoursEnd;
    let rangeText: string;
    if (start === end) {
      rangeText = "24 hours (all day)";
    } else if (start < end) {
      rangeText = `${formatHour(start)} to ${formatHour(end)}`;
    } else {
      rangeText = `${formatHour(start)} to ${formatHour(end)} (wraps past midnight)`;
    }

    const text = header
      ? `${header}\n\nQuiet hours: ${rangeText}`
      : `Quiet hours: ${rangeText}\n\nDuring quiet hours, price alerts are queued and delivered later.`;

    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([
        [inlineButton("Change hours", "qh:set")],
        [inlineButton("Clear", "qh:clear")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  } else {
    const text = header
      ? `${header}\n\nQuiet hours are not set.`
      : "Quiet hours are not set.\n\nSet quiet hours to suppress alerts during certain times (e.g. overnight).";

    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([
        [inlineButton("Set quiet hours", "qh:set")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  }
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export default composer;
