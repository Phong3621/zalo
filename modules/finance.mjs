import { loadDB, saveDB, getTodayKey, getMonthKey } from "./data.mjs";

const DESC = {
  "chi": "Ghi chi tiêu (VD: !chi 50k ăn trưa)",
  "thu": "Ghi thu nhập (VD: !thu 5tr lương)",
  "sodu": "Xem số dư hiện tại",
  "baocao": "Báo cáo thu chi (theo ngày/tháng)",
  "xoa": "Xoá giao dịch gần nhất",
};

function parseAmount(text) {
  const m = text.match(/([\d,.]+)\s*(k|ngàn|ngan|triệu|tr)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ""));
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k" || unit === "ngan" || unit === "ngàn") v *= 1000;
  if (unit === "trieu" || unit === "tr" || unit === "triệu") v *= 1000000;
  return v;
}

export const commands = {
  chi: {
    desc: DESC.chi,
    async execute(api, msg, args, ctx) {
      if (args.length < 2) {
        await api.sendMessage({ msg: "VD: !chi 50k ăn trưa" }, msg.threadId, msg.type);
        return;
      }
      const amount = parseAmount(args[0]);
      if (!amount) {
        await api.sendMessage({ msg: "Số tiền không hợp lệ!" }, msg.threadId, msg.type);
        return;
      }
      const note = args.slice(1).join(" ");
      const db = loadDB("finance");
      if (!db.transactions) db.transactions = [];
      db.transactions.push({
        type: "chi", amount, note,
        by: ctx.authorId, date: getTodayKey(), time: Date.now()
      });
      saveDB("finance", db);
      await api.sendMessage({ msg: `Đã ghi chi: ${amount.toLocaleString()}đ - ${note}` }, msg.threadId, msg.type);
    }
  },

  thu: {
    desc: DESC.thu,
    async execute(api, msg, args, ctx) {
      if (args.length < 2) {
        await api.sendMessage({ msg: "VD: !thu 5tr lương" }, msg.threadId, msg.type);
        return;
      }
      const amount = parseAmount(args[0]);
      if (!amount) {
        await api.sendMessage({ msg: "Số tiền không hợp lệ!" }, msg.threadId, msg.type);
        return;
      }
      const note = args.slice(1).join(" ");
      const db = loadDB("finance");
      if (!db.transactions) db.transactions = [];
      db.transactions.push({
        type: "thu", amount, note,
        by: ctx.authorId, date: getTodayKey(), time: Date.now()
      });
      saveDB("finance", db);
      await api.sendMessage({ msg: `Đã ghi thu: ${amount.toLocaleString()}đ - ${note}` }, msg.threadId, msg.type);
    }
  },

  sodu: {
    desc: DESC.sodu,
    async execute(api, msg, args, ctx) {
      const db = loadDB("finance");
      const tx = db.transactions || [];
      let total = 0;
      for (const t of tx) {
        total += t.type === "thu" ? t.amount : -t.amount;
      }
      const thu = tx.filter(t => t.type === "thu").reduce((s, t) => s + t.amount, 0);
      const chi = tx.filter(t => t.type === "chi").reduce((s, t) => s + t.amount, 0);
      await api.sendMessage({
        msg: `Số dư: ${total.toLocaleString()}đ\nTổng thu: ${thu.toLocaleString()}đ\nTổng chi: ${chi.toLocaleString()}đ`
      }, msg.threadId, msg.type);
    }
  },

  baocao: {
    desc: DESC.baocao,
    async execute(api, msg, args, ctx) {
      const db = loadDB("finance");
      const tx = db.transactions || [];
      const period = args[0] || "today";
      let filtered;
      if (period === "today") {
        filtered = tx.filter(t => t.date === getTodayKey());
      } else if (period === "month") {
        filtered = tx.filter(t => t.date && t.date.startsWith(getMonthKey()));
      } else {
        filtered = tx;
      }
      const thu = filtered.filter(t => t.type === "thu").reduce((s, t) => s + t.amount, 0);
      const chi = filtered.filter(t => t.type === "chi").reduce((s, t) => s + t.amount, 0);
      const lines = filtered.slice(-10).reverse().map(t =>
        `${t.type === "thu" ? "+" : "-"}${t.amount.toLocaleString()}đ ${t.note}`
      );
      await api.sendMessage({
        msg: `Báo cáo (${period}):\nThu: ${thu.toLocaleString()}đ\nChi: ${chi.toLocaleString()}đ\n\n${lines.join("\n")}`
      }, msg.threadId, msg.type);
    }
  },

  xoa: {
    desc: DESC.xoa,
    async execute(api, msg, args, ctx) {
      const db = loadDB("finance");
      if (!db.transactions || !db.transactions.length) {
        await api.sendMessage({ msg: "Không có giao dịch nào!" }, msg.threadId, msg.type);
        return;
      }
      const removed = db.transactions.pop();
      saveDB("finance", db);
      await api.sendMessage({
        msg: `Đã xoá: ${removed.type === "thu" ? "+" : "-"}${removed.amount.toLocaleString()}đ ${removed.note}`
      }, msg.threadId, msg.type);
    }
  }
};

export function getHelp() {
  let s = "--- QUẢN LÝ THU CHI ---\n";
  for (const [cmd, info] of Object.entries(commands)) {
    s += `!${cmd}: ${info.desc}\n`;
  }
  return s;
}
