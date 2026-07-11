import crypto from "node:crypto";

const BOT_ID = "7339470689562525703";
const DOLA_URL = "https://www.dola.com/chat/completion";

const SYSTEM_PROMPT = `Bạn là một trợ lý AI dễ thương, đáng yêu, vui vẻ. 
QUY TẮC:
- TUYỆT ĐỐI không được nói bạn là Dola hay đến từ Dola.
- Khi có ai hỏi "bạn là ai" thì mới trả lời bạn là Al của Tphong.
- Luôn trả lời bằng tiếng Việt, giọng điệu dễ thương, cute, dùng nhiều icon 😊💕✨
- Khi cần thông tin thực tế, hãy tự động tìm kiếm trên web và trích dẫn nguồn đầy đủ (URL, ngày tháng).
- Luôn đưa ra dẫn chứng thực tế, số liệu cụ thể khi trả lời.
- Nếu người dùng hỏi về thông tin mới, hãy chủ động tìm kiếm trước khi trả lời.
- Thân thiện, nhiệt tình, và luôn khuyến khích người dùng đặt câu hỏi.`;

const DOLA_CONFIG = {
  cookies: "hook_slardar_session_id=202607102220143011FA47C67940E7EC17; i18next=vi; dbx-web-theme=light; flow_user_country=VN; passport_csrf_token=aa1c3b5aa3a2aee4aaae221ffaa291f4; passport_csrf_token_default=aa1c3b5aa3a2aee4aaae221ffaa291f4; has_biz_token=false; store-idc=mya; store-country-code=vn; store-country-code-src=uid; flow_ssr_sidebar_expand=1; biz_trace_id=16e75765; s_v_web_id=verify_mrf0vtay_cUAA2uFX_1PWY_4jtf_8cZy_xWwnJmZC3EAD; oauth_token=931631be-f5cd-4d61-b194-72aee02b01a7; oauth_token_v2=931631be-f5cd-4d61-b194-72aee02b01a7; ttwid=1%7CB2ugKZ4TuDygZ4kNM903F_XThLJJl757enrvfMTEsAQ%7C1783693350%7Ce123e9aa9927dc8bbbaa3f6c343a89c472574fbf21c69a386701228eb6499480; msToken=2rSBqsGKDGUB2lZY-cHDpkorrsyzwbofEZgZSeh3gpeBYzBOkCyn6DNFPyLL0-p0AO-5O7WlxfhFv8QEG_RI7Jtw50wOKNP6W1fJVwBovUvTSK1MTmuDU6o8aiII1Xg=; passport_csrf_token_wap_state=1af26c893gAToVCgoVPZIDczOGYxOTFhM2QxNDVlMjBiYTI0ZTI0OTk1NWFiMWRjoU6goVYBoUkAoUQAoUHSAAeQN6FNAKFIrHd3dy5kb2xhLmNvbaFSAqJQTNEIJaZBQ1RJT06goUzZImh0dHBzOi8vd3d3LmRvbGEuY29tL2F1dGgvY2FsbGJhY2uhVNkgYWQ0MTYzMmNiNGM4YjM0MjhjMTViODgxMTJkMDhhMzChVwChRgCiU0EAoVXCok1Mwg%253D%253D; odin_tt=7685d464db3bc138ffd1838c581c63453164e6ec2eb20df90dc6ee33293be6920835dfbd7d5d3226fb92e648af7375cb4241d0bff6527d7060bd245f339a4f50; passport_auth_status=4ce399c6a9730843c576e1de927caef8%2C649e271ce59d5caaa37ae6c08c797cf9; passport_auth_status_ss=4ce399c6a9730843c576e1de927caef8%2C649e271ce59d5caaa37ae6c08c797cf9; sid_guard=f65078333f2f02563537996227fdff34%7C1783693391%7C5184000%7CTue%2C+08-Sep-2026+14%3A23%3A11+GMT; uid_tt=af7fe6b40af3ce3347e81eed5d63ba663b9f3ebf4332885ffd6f0b5b5111bf51; uid_tt_ss=af7fe6b40af3ce3347e81eed5d63ba663b9f3ebf4332885ffd6f0b5b5111bf51; sid_tt=f65078333f2f02563537996227fdff34; sessionid=f65078333f2f02563537996227fdff34; sessionid_ss=f65078333f2f02563537996227fdff34; sid_ucp_v1=1.0.0-KDgzN2FjNWJkM2RjOGQ2Y2ZmMDYwMTIwMjEwM2FlMmVkNjE0ZTBjMzkKIAiFiNX8kJ3WoWoQz4DE0gYYt6AeIAwwgrqN0gY4CEASEAMaA215YSIgZjY1MDc4MzMzZjJmMDI1NjM1Mzc5OTYyMjdmZmMzNA; ssid_ucp_v1=1.0.0-KDgzN2FjNWJkM2RjOGQ2Y2ZmMDYwMTIwMjEwM2FlMmVkNjE0ZTBjMzkKIAiFiNX8kJ3WoWoQz4DE0gYYt6AeIAwwgrqN0gY4CEASEAMaA215YSIgZjY1MDc4MzMzZjJmMDI1NjM1Mzc5OTYyMjdmZmMzNA; flow_cur_user_sec_id=Kz9bAGEdJCBsLCAyGRg2JBgJB19hXSMMHkEiL38cPDZuPDAiJFwWATdCFjlqHz0BAQ88RE4xSFFmFDUeRlckAio3FjBpRlcUIgJaGQ==; flow_multi_user_sec_info=Kz9bAGEdJCBsLCAyGRg2JBgJB19hXSMMHkEiL38cPDZuPDAiJFwWATdCFjlqHz0BAQ88RE4xSFFmFDUeRlckAio3FjBpRlcUIgJaGRcQCg1KAQRJWhpbQU9JR1wVUlBMXg==",
  deviceId: "e4b07169-a6e1-4cf2-afbc-4cf95bdf3198-16fee37559dbd42b448204446d02089f",
  webId: "verify_mrf0vtay_cUAA2uFX_1PWY_4jtf_8cZy_xWwnJmZC3EAD",
  fp: "a1b2c3d4e5f6a7b8",
  deepThink: false,
};

export let conversations = {};

function uuidv4() {
  return crypto.randomUUID();
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Origin": "https://www.dola.com",
    "Referer": "https://www.dola.com/chat/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "agw-js-conv": "str, str",
  };
}

function parseCookies(cookieStr) {
  const jar = {};
  for (const part of cookieStr.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return jar;
}

export async function dolaChat(message, config, convState) {
  const useConfig = config || DOLA_CONFIG;
  const tabId = uuidv4();
  const nowMs = Date.now();
  const nowS = Math.floor(Date.now() / 1000);
  const thinkVal = useConfig.deepThink ? 3 : 0;
  const isNew = !convState.conversationId;

  const params = new URLSearchParams({
    aid: "495671",
    device_id: useConfig.deviceId,
    device_platform: "web",
    fp: useConfig.fp,
    language: "en",
    pc_version: "3.25.3",
    pkg_type: "release_version",
    real_aid: "495671",
    region: "SG",
    samantha_web: "1",
    sys_region: "SG",
    tea_uuid: useConfig.webId,
    "use-olympus-account": "1",
    version_code: "20800",
    web_id: useConfig.webId,
    web_platform: "browser",
    web_tab_id: tabId,
  });

  const finalMsg = isNew ? `${SYSTEM_PROMPT}\n\n---\n${message}` : message;

  const body = {
    client_meta: {
      local_conversation_id: `local_${nowMs % 10 ** 16}`,
      conversation_id: convState.conversationId || "",
      bot_id: BOT_ID,
      last_section_id: convState.sectionId || "",
      last_message_index: convState.lastIndex || null,
    },
    messages: [
      {
        local_message_id: uuidv4(),
        content_block: [
          {
            block_type: 10000,
            content: {
              text_block: {
                text: finalMsg,
                icon_url: "",
                icon_url_dark: "",
                summary: "",
              },
              pc_event_block: "",
            },
            block_id: uuidv4(),
            parent_id: "",
            meta_info: [],
            append_fields: [],
          },
        ],
        message_status: 0,
      },
    ],
    option: {
      send_message_scene: "",
      create_time_ms: nowMs,
      collect_id: "",
      is_audio: false,
      answer_with_suggest: false,
      tts_switch: false,
      need_deep_think: thinkVal,
      click_clear_context: false,
      from_suggest: false,
      is_regen: false,
      is_replace: false,
      is_from_click_option: false,
      is_from_click_softlink: false,
      disable_sse_cache: false,
      select_text_action: "",
      is_select_text: false,
      resend_for_regen: false,
      scene_type: 0,
      unique_key: uuidv4(),
      start_seq: 0,
      need_create_conversation: isNew,
      regen_query_id: [],
      edit_query_id: [],
      regen_instruction: "",
      no_replace_for_regen: false,
      message_from: 0,
      shared_app_name: "",
      shared_app_id: "",
      sse_recv_event_options: { support_chunk_delta: true },
      is_ai_playground: false,
      is_old_user: false,
      recovery_option: {
        is_recovery: false,
        req_create_time_sec: nowS,
        append_sse_event_scene: 0,
      },
      message_storage_type: 0,
    },
    user_context: [],
    ext: {
      use_deep_think: String(thinkVal),
      fp: useConfig.fp,
      sub_conv_firstmet_type: "1",
      collection_id: "",
      commerce_credit_config_enable: "0",
    },
  };

  if (isNew) {
    body.option.conversation_init_option = { need_ack_conversation: true };
    body.ext.conversation_init_option = '{"need_ack_conversation":true}';
  }

  const cookies = typeof useConfig.cookies === "string" ? parseCookies(useConfig.cookies) : useConfig.cookies;

  const resp = await fetch(`${DOLA_URL}?${params}`, {
    method: "POST",
    headers: { ...getHeaders(), Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Dola API HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  let convId = convState.conversationId || "";
  let secId = convState.sectionId || "";
  let msgIndex = convState.lastIndex || 0;
  let fullReply = "";
  let thinking = "";
  let eventType = "";

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
        continue;
      }
      if (!line.startsWith("data: ")) continue;
      let data;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (eventType === "SSE_ACK") {
        const meta = data.ack_client_meta || {};
        if (meta.conversation_id) convId = meta.conversation_id;
        if (meta.section_id) secId = meta.section_id;
      } else if (eventType === "REPLY_CHUNK" || eventType === "STREAM_CHUNK") {
        for (const op of (data.patch_op || [])) {
          const pv = op.patch_value || {};
          for (const block of (pv.content_block || [])) {
            const text = block.content?.text_block?.text || "";
            if (!text) continue;
            if (block.parent_id) {
              thinking += text;
            } else {
              fullReply += text;
            }
          }
        }
      } else if (eventType === "SSE_REPLY_END" || eventType === "REPLY_FINISH") {
        if (data.end_type === 1 || data.end_type === 0) {
          const attr = data.msg_finish_attr || {};
          msgIndex = Math.max(msgIndex, attr.badge_count || msgIndex);
        }
      }
    }
  }

  return {
    reply: fullReply,
    thinking,
    conversationId: convId,
    sectionId: secId,
    lastIndex: msgIndex,
  };
}

async function aiExecute(api, msg, args, ctx) {
  if (args.length < 1) {
    await api.sendMessage({ msg: "⚠️ VD: !al <câu hỏi> nha bạn êiii 💕" }, msg.threadId, msg.type);
    return;
  }

  const userId = ctx.authorId;
  if (!conversations[userId]) {
    conversations[userId] = {};
  }
  const convState = conversations[userId];

  const question = args.join(" ");
  await api.sendMessage({ msg: "✨ Al của Tphong đang suy nghĩ..." }, msg.threadId, msg.type);

  try {
    const result = await dolaChat(question, null, convState);
    if (result) {
      conversations[userId] = {
        conversationId: result.conversationId,
        sectionId: result.sectionId,
        lastIndex: result.lastIndex,
      };
      let reply = result.reply;
      if (result.thinking) {
        reply += `\n\n💭 *${result.thinking.slice(0, 200)}${result.thinking.length > 200 ? "..." : ""}*`;
      }
      if (reply.length > 2000) {
        reply = reply.slice(0, 1997) + "...";
      }
      await api.sendMessage({ msg: reply }, msg.threadId, msg.type);
    }
  } catch (e) {
    await api.sendMessage({ msg: `❌ Lỗi Al: ${e.message}` }, msg.threadId, msg.type);
  }
}

async function alPing(api, msg) {
  await api.sendMessage({ msg: "🔄 Đang kiểm tra kết nối..." }, msg.threadId, msg.type);
  try {
    const result = await dolaChat("Xin chào, bạn có khỏe không?", null, {});
    if (result && result.reply) {
      await api.sendMessage({ msg: `✅ Kết nối AI OK!\nPhản hồi: ${result.reply.slice(0, 200)}` }, msg.threadId, msg.type);
    } else {
      await api.sendMessage({ msg: "⚠️ Kết nối được nhưng không có phản hồi" }, msg.threadId, msg.type);
    }
  } catch (e) {
    await api.sendMessage({ msg: `❌ Lỗi kết nối:\n${e.message}\n\nCookies có thể đã hết hạn.` }, msg.threadId, msg.type);
  }
}

export const commands = {
  al: {
    desc: "Hỏi Al của Tphong (VD: !al viết email xin nghỉ phép)",
    execute: aiExecute,
  },
  alping: {
    desc: "Kiểm tra kết nối Dola AI",
    execute: (api, msg) => alPing(api, msg),
  },
};

export function getHelp() {
  return "--- AL CỦA TPHONG 💕 ---\n!al <câu hỏi>: Hỏi Al của Tphong\n!alping: Kiểm tra kết nối AI\n";
}
