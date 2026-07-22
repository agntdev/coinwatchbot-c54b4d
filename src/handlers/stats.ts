import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { allUserIds, alerts, alertFires, watchlists, userProfiles } from "../storage.js";

const OWNER_ID = process.env.OWNER_ID;

const composer = new Composer<Ctx>();

composer.command("stats", async (ctx) => {
  if (!OWNER_ID || String(ctx.from!.id) !== OWNER_ID) {
    await ctx.reply("This command is only available to the bot owner.");
    return;
  }
  await showStats(ctx);
});

composer.callbackQuery("stats:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!OWNER_ID || String(ctx.from!.id) !== OWNER_ID) {
    await ctx.reply("This command is only available to the bot owner.");
    return;
  }
  await showStats(ctx);
});

async function showStats(ctx: Ctx): Promise<void> {
  const userIds = (await allUserIds.get("all")) ?? [];
  const totalUsers = userIds.length;

  // Count active users (have a watchlist or alerts)
  let activeUsers = 0;
  for (const uid of userIds) {
    const wl = await watchlists.get(uid);
    const al = await alerts.get(uid);
    if ((wl && wl.length > 0) || (al && al.length > 0)) {
      activeUsers++;
    }
  }

  // Aggregate all alerts and count fires
  const allAlertsList: Array<{ ticker: string; active: boolean }> = [];
  const fireCountByTicker = new Map<string, number>();
  for (const uid of userIds) {
    const userAlerts = (await alerts.get(uid)) ?? [];
    for (const a of userAlerts) {
      allAlertsList.push({ ticker: a.ticker, active: a.active });
    }
    const fires = (await alertFires.get(uid)) ?? [];
    for (const f of fires) {
      fireCountByTicker.set(f.ticker, (fireCountByTicker.get(f.ticker) ?? 0) + 1);
    }
  }

  const totalAlerts = allAlertsList.length;
  const activeAlerts = allAlertsList.filter((a) => a.active).length;

  // Top fired alerts
  const topFired = [...fireCountByTicker.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const lines: string[] = [];
  lines.push(`📊 Bot Statistics`);
  lines.push(``);
  lines.push(`Users: ${totalUsers} total, ${activeUsers} active`);
  lines.push(`Alerts: ${totalAlerts} total, ${activeAlerts} active`);

  if (topFired.length > 0) {
    lines.push(``);
    lines.push(`Top fired alerts:`);
    for (const [ticker, count] of topFired) {
      lines.push(`  • ${ticker}: ${count}x`);
    }
  } else {
    lines.push(``);
    lines.push(`No alerts have fired yet.`);
  }

  await ctx.reply(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "stats:show")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

export default composer;
