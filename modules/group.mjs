const DESC = {
  "them": "Thêm thành viên vào nhóm (UID)",
  "kick": "Xoá thành viên khỏi nhóm (UID)",
  "info": "Xem thông tin nhóm hiện tại",
  "list": "Xem danh sách thành viên nhóm",
};

export const commands = {
  them: {
    desc: DESC.them,
    async execute(api, msg, args, ctx) {
      if (msg.type !== 1) {
        await api.sendMessage({ msg: "Lệnh này chỉ dùng trong nhóm!" }, msg.threadId, msg.type);
        return;
      }
      if (args.length < 1) {
        await api.sendMessage({ msg: "VD: !them 1234567890" }, msg.threadId, msg.type);
        return;
      }
      try {
        await api.addUserToGroup(args[0], msg.threadId);
        await api.sendMessage({ msg: `Đã thêm ${args[0]} vào nhóm!` }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `Lỗi: ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  kick: {
    desc: DESC.kick,
    async execute(api, msg, args, ctx) {
      if (msg.type !== 1) {
        await api.sendMessage({ msg: "Lệnh này chỉ dùng trong nhóm!" }, msg.threadId, msg.type);
        return;
      }
      if (args.length < 1) {
        await api.sendMessage({ msg: "VD: !kick 1234567890" }, msg.threadId, msg.type);
        return;
      }
      try {
        await api.removeUserFromGroup(args[0], msg.threadId);
        await api.sendMessage({ msg: `Đã kick ${args[0]} khỏi nhóm!` }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `Lỗi: ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  info: {
    desc: DESC.info,
    async execute(api, msg, args, ctx) {
      if (msg.type !== 1) {
        await api.sendMessage({ msg: "Lệnh này chỉ dùng trong nhóm!" }, msg.threadId, msg.type);
        return;
      }
      try {
        const info = await api.getGroupInfo(msg.threadId);
        const txt = `Tên nhóm: ${info.name || "?"}\nID: ${info.id || msg.threadId}\nSố TV: ${info.totalMember || "?"}`;
        await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `Lỗi: ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  list: {
    desc: DESC.list,
    async execute(api, msg, args, ctx) {
      if (msg.type !== 1) {
        await api.sendMessage({ msg: "Lệnh này chỉ dùng trong nhóm!" }, msg.threadId, msg.type);
        return;
      }
      try {
        const raw = await api.getGroupMembersInfo(msg.threadId);
        const members = Array.isArray(raw) ? raw : Object.values(raw || {});
        const names = members.map(m => `${m.name || m.id || "?"} (${m.id})`).slice(0, 30);
        await api.sendMessage({ msg: `Thành viên (${members.length}):\n${names.join("\n")}` }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `Lỗi: ${e.message}` }, msg.threadId, msg.type);
      }
    }
  }
};

export function getHelp() {
  let s = "--- QUẢN LÝ NHÓM ---\n";
  for (const [cmd, info] of Object.entries(commands)) {
    s += `!${cmd}: ${info.desc}\n`;
  }
  return s;
}
