import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadDB, saveDB } from "./data.mjs";
import { getSoundCloudUrl, sendVoice as sendVoiceFile } from "./sendVoice.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DESC = {
  "voice": "Chuyển file MP3 thành voice và gửi lên (đính kèm file)",
  "search": "Tìm kiếm file MP3 trong thư viện",
  "listmusic": "Danh sách nhạc trong thư viện",
  "play": "Phát nhạc từ SoundCloud (gửi voice + file MP3)",
};

function getFFmpegPath() {
  const common = [
    "C:\\Users\\phong\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin",
    "C:\\Program Files\\ffmpeg\\bin",
    "C:\\ffmpeg\\bin",
  ];
  for (const dir of common) {
    if (fs.existsSync(path.join(dir, "ffmpeg.exe"))) return dir;
  }
  return "";
}

export const commands = {
  voice: {
    desc: DESC.voice,
    async execute(api, msg, args, ctx) {
      await api.sendMessage({ msg: "Gửi file MP3 kèm theo lệnh !voice để chuyển thành voice." }, msg.threadId, msg.type);
    }
  },

  search: {
    desc: DESC.search,
    async execute(api, msg, args, ctx) {
      const db = loadDB("music");
      if (!db.files) db.files = [];
      const keyword = args.join(" ").toLowerCase();
      const found = db.files.filter(f => f.name.toLowerCase().includes(keyword));
      if (!found.length) {
        await api.sendMessage({ msg: "Không tìm thấy file nào!" }, msg.threadId, msg.type);
        return;
      }
      const lines = found.map(f => `🎧 ${f.name}`);
      await api.sendMessage({ msg: `Tìm thấy ${found.length} file:\n${lines.slice(0, 15).join("\n")}` }, msg.threadId, msg.type);
    }
  },

  listmusic: {
    desc: DESC.listmusic,
    async execute(api, msg, args, ctx) {
      const db = loadDB("music");
      if (!db.files || !db.files.length) {
        await api.sendMessage({ msg: "📭 Thư viện nhạc trống!" }, msg.threadId, msg.type);
        return;
      }
      const lines = db.files.map((f, i) => `${i + 1}. ${f.name}`);
      await api.sendMessage({ msg: `🎵 Thư viện (${db.files.length} bài):\n${lines.slice(0, 20).join("\n")}` }, msg.threadId, msg.type);
    }
  },

  play: {
    desc: DESC.play,
    async execute(api, msg, args, ctx) {
      const query = args.join(" ");
      if (!query) {
        await api.sendMessage({ msg: "⚠️ VD: !play <tên bài hát>" }, msg.threadId, msg.type);
        return;
      }
      await api.sendMessage({ msg: `🔍 Đang tìm "${query}"...` }, msg.threadId, msg.type);
      try {
        const { url, display } = await getSoundCloudUrl(query);
        await sendVoiceFile(api, url, display, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
    }
  }
};

export async function handleAttachment(api, msg) {
  const attachments = msg.data?.attachments || [];
  for (const att of attachments) {
    if (att.type === "FILE" && (att.fname?.endsWith(".mp3") || att.fname?.endsWith(".aac") || att.fname?.endsWith(".m4a"))) {
      try {
        const url = att.url.replace(/\.mp3$/i, ".aac").replace(/\.m4a$/i, ".aac");
        let fileSize = 0;
        try { fileSize = parseInt((await fetch(url, { method: "HEAD" })).headers.get("content-length") || "0"); } catch {}
        await api.sendVoice({ voiceUrl: url, fileSize }, msg.threadId, msg.type);
        await api.sendMessage({ msg: `📎 ${att.fname}`, attachments: [att.url] }, msg.threadId, msg.type);

        const db = loadDB("music");
        if (!db.files) db.files = [];
        db.files.push({ name: att.fname, path: att.url, time: Date.now() });
        saveDB("music", db);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
      return;
    }
  }
}

export function getHelp() {
  let s = "--- TIỆN ÍCH VOICE ---\n";
  for (const [cmd, info] of Object.entries(commands)) {
    if (cmd !== "play") s += `!${cmd}: ${info.desc}\n`;
  }
  s += "!play: Phát nhạc từ SoundCloud (gửi cả voice + MP3)\n";
  return s;
}
