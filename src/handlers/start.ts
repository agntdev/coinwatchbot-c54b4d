import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard } from "../toolkit/index.js";
import { allUserIds, queuedAlerts, userProfiles } from "../storage.js";
import { now } from "../clock.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome! Tap a button below to get started.";

composer.command("start", async (ctx) => {
  // Track user
  const userId = String(ctx.from!.id);
  const existing = (await allUserIds.get("all")) ?? [];
  if (!existing.includes(userId)) {
    existing.push(userId);
    await allUserIds.set("all", existing);
  }

  // Deliver queued alerts if quiet hours have ended
  await deliverQueuedAlerts(ctx);

  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();

  // Track user
  const userId = String(ctx.from!.id);
  const existing = (await allUserIds.get("all")) ?? [];
  if (!existing.includes(userId)) {
    existing.push(userId);
    await allUserIds.set("all", existing);
  }

  // Deliver queued alerts if quiet hours have ended
  await deliverQueuedAlerts(ctx);

  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

async function deliverQueuedAlerts(ctx: Ctx): Promise<void> {
  const userId = String(ctx.from!.id);
  const queued = (await queuedAlerts.get(userId)) ?? [];
  if (queued.length === 0) return;

  const profile = (await userProfiles.get(userId)) ?? {};
  if (isQuietHours(profile, now())) return;

  // Deliver all queued alerts
  for (const q of queued) {
    try {
      await ctx.reply(q.message);
    } catch {
      // Best effort — don't break the loop
    }
  }
  await queuedAlerts.set(userId, []);
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
