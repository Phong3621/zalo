import { Reactions, ThreadType } from "zca-js";

const ALLOWED_UNDO_UID = "839913876931178412";

const REACT_MAP = {
  tim: Reactions.HEART,
  "trái tim": Reactions.HEART,
  like: Reactions.LIKE,
  thich: Reactions.LIKE,
  thích: Reactions.LIKE,
  haha: Reactions.HAHA,
  wow: Reactions.WOW,
  buon: Reactions.CRY,
  khoc: Reactions.CRY,
  khóc: Reactions.CRY,
  gian: Reactions.ANGRY,
  giận: Reactions.ANGRY,
  yeu: Reactions.LOVE,
  yêu: Reactions.LOVE,
  kiss: Reactions.KISS,
  "thả tim": Reactions.HEART,
  hoa: Reactions.ROSE,
  rose: Reactions.ROSE,
  "vo tay": Reactions.HANDCLAP,
  handclap: Reactions.HANDCLAP,
  sad: Reactions.SAD,
  dislike: Reactions.DISLIKE,
};

async function reactExecute(api, msg, args, ctx) {
  const quote = msg.data?.quote;
  if (!quote) {
    await api.sendMessage({ msg: "⚠️ Hãy reply vào tin nhắn muốn thả cảm xúc, kèm icon (VD: !thacamxuc tim)" }, msg.threadId, msg.type);
    return;
  }

  let iconKey = args.join(" ").toLowerCase().trim();
  let reaction;
  if (!iconKey) {
    const values = Object.values(REACT_MAP);
    reaction = values[Math.floor(Math.random() * values.length)];
  } else {
    reaction = REACT_MAP[iconKey];
    if (!reaction) {
      const keys = Object.keys(REACT_MAP).filter(k => !/[a-z]{2,}/.test(k) || k.length <= 6).slice(0, 10);
      await api.sendMessage({ msg: `⚠️ Icon không hợp lệ. Gợi ý: ${keys.join(", ")}` }, msg.threadId, msg.type);
      return;
    }
  }

  try {
    await api.addReaction(reaction, {
      data: {
        msgId: String(quote.globalMsgId),
        cliMsgId: String(quote.cliMsgId),
      },
      threadId: msg.threadId,
      type: msg.type,
    });
  } catch (e) {
    await api.sendMessage({ msg: `❌ Lỗi thả cảm xúc: ${e.message}` }, msg.threadId, msg.type);
  }
}

async function undoExecute(api, msg, args, ctx) {
  if (ctx.authorId !== ALLOWED_UNDO_UID) {
    await api.sendMessage({ msg: "❌ Bạn không có quyền sử dụng lệnh này." }, msg.threadId, msg.type);
    return;
  }

  const quote = msg.data?.quote;
  if (!quote) {
    await api.sendMessage({ msg: "⚠️ Hãy reply vào tin nhắn muốn thu hồi." }, msg.threadId, msg.type);
    return;
  }

  try {
    await api.undo(
      { msgId: quote.globalMsgId, cliMsgId: quote.cliMsgId },
      msg.threadId,
      msg.type,
    );
  } catch (e) {
    await api.sendMessage({ msg: `❌ Lỗi thu hồi: ${e.message}` }, msg.threadId, msg.type);
  }
}

export const commands = {
  thacamxuc: {
    desc: "Thả cảm xúc vào tin nhắn (reply + !thacamxuc tim/like/haha/yeu/buon/gian)",
    execute: reactExecute,
  },
  thuhoi: {
    desc: "Thu hồi tin nhắn (chủ bot)",
    execute: undoExecute,
  },
};

export function getHelp() {
  return "--- TƯƠNG TÁC 💬 ---\n!thacamxuc <icon>: Thả cảm xúc (reply vào tn)\n!thuhoi: Thu hồi tin nhắn (chủ bot)\n";
}
