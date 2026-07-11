import { createServer } from "node:http";
const PORT = process.env.PORT || 3000;
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
}).listen(PORT, () => console.log(`[*] HTTP server on port ${PORT}`));

import { Zalo, ThreadType } from "zca-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, "session.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function getConfig() {
  return loadJSON(CONFIG_FILE) || {};
}

function loadSession() {
  // Ưu tiên env vars
  const envSession = process.env.ZALO_SESSION;
  if (envSession) {
    try { return JSON.parse(envSession); } catch {}
  }
  const envCookie = process.env.ZALO_COOKIE;
  const envImei = process.env.ZALO_IMEI;
  if (envCookie && envImei) {
    try { return { cookieArr: JSON.parse(envCookie), imei: envImei }; } catch {}
  }
  // Fallback file
  const s = loadJSON(SESSION_FILE);
  if (!s || !s.cookieArr || !s.imei) return null;
  return s;
}

async function loadCommands() {
  const modules = [
    await import("./modules/finance.mjs"),
    await import("./modules/group.mjs"),
    await import("./modules/voice.mjs"),
    await import("./modules/utils.mjs"),
    await import("./modules/apis.mjs"),
    await import("./modules/ai.mjs"),
    await import("./modules/interact.mjs"),
  ];
  const all = {};
  for (const mod of modules) {
    if (mod.commands) Object.assign(all, mod.commands);
  }
  return { commands: all, modules };
}

async function main() {
  let session = loadSession();
  if (!session) {
    console.log("[-] Chua co session. Chay: node get_session.mjs");
    process.exit(1);
  }

  const config = getConfig();
  const prefix = config.prefix || "!";
  const autoReplyCfg = config.autoReply || {};
  const cooldownMs = (autoReplyCfg.cooldownMinutes || 60) * 60 * 1000;

  console.log("[*] Dang dang nhap...");
  const zalo = new Zalo();
  const api = await zalo.login({
    imei: session.imei,
    cookie: { cookies: session.cookieArr },
    userAgent: session.userAgent || undefined,
    language: config.language || "vi",
  });

  let userId = "?";
  let botName = "";
  try {
    const info = await api.fetchAccountInfo();
    userId = String(info.profile?.userId || "");
    botName = (info.profile?.name || info.profile?.displayName || "").trim();
  } catch {}
  console.log(`[+] Dang nhap thanh cong! UserID: ${userId}${botName ? ` (${botName})` : ""}`);

  // Load commands
  const { commands, modules } = await loadCommands();
  const voiceModule = modules.find(m => m.handleAttachment);

  // Friends list
  let friendIds = new Set();
  try {
    const friends = await api.getAllFriends();
    friendIds = new Set(friends.map(f => String(f.userId)));
    console.log(`[+] Da tai ${friendIds.size} ban be`);
  } catch (e) {
    console.log("[-] Loi tai ban be:", e.message);
  }

  // Auto-reply cooldown tracking
  const replied = new Map();

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [id, t] of replied) {
      if (now - t > cooldownMs) replied.delete(id);
    }
  }, 60000);

  console.log("[*] Bot dang chay. Nhan Ctrl+C de dung.");
  console.log(`[*] Prefix: "${prefix}" | Auto-reply: ${autoReplyCfg.enabled ? "ON" : "OFF"}`);

  api.listener.on("message", async (message) => {
    if (message.isSelf) return;

    const type = message.type;
    const authorId = String(message.data?.uidFrom || "");
    const threadId = message.threadId;
    const rawContent = message.data?.content;
    const text = typeof rawContent === "string" ? rawContent : "";

    // Check for MP3 attachment
    if (voiceModule && voiceModule.handleAttachment) {
      try { await voiceModule.handleAttachment(api, message); } catch {}
    }

    // Auto-reply khi nhắc đến Hải Yến / hải dúi
    const lowerText = text.toLowerCase();
    if (/hải\s*(yến|dúi)/i.test(text)) {
      try { await api.sendMessage({ msg: "duân hoài duân hoài hoài duân duân" }, threadId, type); } catch {}
    }

    const isGroup = type === ThreadType.Group;
    const isFriend = friendIds.has(authorId);

    // Check if bot is mentioned in group message
    let isMentioned = false;
    let textClean = text;
    if (isGroup) {
      if (message.data?.mentionInfo) {
        try {
          const mentions = typeof message.data.mentionInfo === "string"
            ? JSON.parse(message.data.mentionInfo)
            : message.data.mentionInfo;
          isMentioned = Array.isArray(mentions) && mentions.some(m => String(m.uid) === userId);
        } catch {}
      }
      if (!isMentioned) {
        const cleanText = text.replace(/\u200B/g, "").trim();
        isMentioned = /^@\S+\b/.test(cleanText);
        if (botName) {
          const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          isMentioned = new RegExp(`@${escaped}\\b`, "i").test(cleanText);
        }
      }
      if (isMentioned) {
        textClean = text.replace(/^@\S+\s*/, "").trim();
      }
    }

    // Process text commands
    if (text.startsWith(prefix)) {
      const parts = text.slice(prefix.length).trim().split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);
      const cmd = commands[cmdName];
      if (cmd) {
        console.log(`[CMD] ${authorId}: ${text}`);
        try {
          await cmd.execute(api, message, args, { authorId, threadId, type, isGroup, isFriend });
        } catch (e) {
          console.log(`[-] Loi command ${cmdName}:`, e.message);
          try { await api.sendMessage({ msg: `Loi: ${e.message}` }, threadId, type); } catch {}
        }
        return;
      }
    }

    // Auto-reply logic (private chat hoặc group)
    if (autoReplyCfg.enabled) {
      const shouldReply =
        (!isGroup && ((autoReplyCfg.replyToStrangers && !isFriend) || (autoReplyCfg.replyToFriends && isFriend))) ||
        isGroup;
      if (shouldReply) {
        const last = replied.get(authorId);
        if (!last || Date.now() - last > cooldownMs) {
          replied.set(authorId, Date.now());
          const display = text.length > 50 ? text.slice(0, 50) + "..." : text || "(media)";
          console.log(`[REPLY] ${isFriend ? "BAN" : "LA"} (${authorId}): ${display}`);
          let aiReplied = false;
          if (textClean && autoReplyCfg.useAI) {
            try {
              const { dolaChat, conversations: dolaConvs } = await import("./modules/ai.mjs");
              if (!dolaConvs[authorId]) dolaConvs[authorId] = {};
              const result = await dolaChat(textClean, null, dolaConvs[authorId]);
              if (result && result.reply) {
                dolaConvs[authorId] = { conversationId: result.conversationId, sectionId: result.sectionId, lastIndex: result.lastIndex };
                let reply = result.reply;
                if (reply.length > 2000) reply = reply.slice(0, 1997) + "...";
                await api.sendMessage({ msg: reply }, threadId, type);
                aiReplied = true;
              }
            } catch (e) {
              console.log("[-] Loi AI auto-reply:", e.message);
            }
          }
          if (!aiReplied) {
            try {
              await api.sendMessage({ msg: autoReplyCfg.message }, threadId, type);
            } catch (e) {
              console.log("[-] Loi gui reply fallback:", e.message);
            }
          }
        }
      }
    }
  });

  api.listener.start();
  await new Promise(() => {});
}

main().catch(e => {
  console.error("[-] Loi:", e.message);
  process.exit(1);
});
