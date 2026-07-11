const DESC = {
  "ping": "Kiểm tra bot còn sống không",
  "time": "Xem thời gian hiện tại",
  "uid": "Xem ID của bạn",
  "help": "Hiển thị trợ giúp",
};

export const commands = {
  ping: {
    desc: DESC.ping,
    async execute(api, msg, args, ctx) {
      await api.sendMessage({ msg: "Pong! Bot đang chạy." }, msg.threadId, msg.type);
    }
  },

  time: {
    desc: DESC.time,
    async execute(api, msg, args, ctx) {
      const now = new Date();
      await api.sendMessage({
        msg: `Hôm nay: ${now.toLocaleDateString("vi-VN")}\nBây giờ: ${now.toLocaleTimeString("vi-VN")}`
      }, msg.threadId, msg.type);
    }
  },

  uid: {
    desc: DESC.uid,
    async execute(api, msg, args, ctx) {
      await api.sendMessage({ msg: `UID của bạn: ${ctx.authorId}` }, msg.threadId, msg.type);
    }
  },

  help: {
    desc: DESC.help,
    async execute(api, msg, args, ctx) {
      let txt = "=== ZALO BOT ===\n\n";
      const allModules = await Promise.all([
        import("./finance.mjs"),
        import("./group.mjs"),
        import("./voice.mjs"),
        import("./apis.mjs"),
        import("./ai.mjs"),
        import("./utils.mjs"),
      ]);
      for (const mod of allModules) {
        if (mod.getHelp) txt += mod.getHelp() + "\n";
      }
      txt += "--- LƯU Ý ---\n";
      txt += "Gửi file MP3 để tự động chuyển thành voice + gửi lại file.\n";
      txt += "Auto-reply: Al của Tphong tự động trả lời.";
      await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
    }
  }
};

export function getHelp() {
  let s = "--- TIỆN ÍCH ---\n";
  for (const [cmd, info] of Object.entries(commands)) {
    s += `!${cmd}: ${info.desc}\n`;
  }
  return s;
}
