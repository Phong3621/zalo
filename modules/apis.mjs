import { loadDB, saveDB } from "./data.mjs";
import fmt from "./format.mjs";
import { sendVoice, getSoundCloudUrl } from "./sendVoice.mjs";

const CHILL_LIST = [
  "Son Tung M-TP - Em Cua Ngay Hom Qua",
  "Den Vau - Mang Tieng Anh Di",
  "Vu - Em La Ba",
  "Hai - Thu Cuoi",
  "Den Vau - Di Ve Nha",
  "Nguyen Dinh Vu - Em Nao Con Chi",
  "Den Vau - Anh Va Yen",
  "Vu - Em Nghi Ve Anh",
  "Tien Cookie - Em Thich",
  "Den Vau - Mot Nam Moi Binh An",
  "Son Tung M-TP - Nang An Mua",
  "Vu - Quen Anh Di",
  "Den Vau - Bai Nay Khong Vui Dau",
  "Hai - Anh La Ai",
  "Den Vau - Ngay Dep Troi",
];

const DESC = {
  "weather": "☀️ Xem thời tiết hiện tại (VD: !weather Hà Nội)",
  "news": "📰 Xem tin tức mới nhất (VD: !news hoặc !news công nghệ)",
  "music": "🎵 Tìm nhạc trên iTunes (VD: !music em của ngày hôm qua)",
  "play": "🎧 Phát nhạc, tự tải từ SoundCloud nếu chưa có (VD: !play tên bài)",
  "chill": "😌 Phát nhạc chill (VD: !chill hoặc !chill 3)",
  "lyrics": "📝 Tìm lời bài hát (VD: !lyrics em của ngày hôm qua)",
  "listmusic": "📋 Xem danh sách nhạc trong kho",
  "setnewsapi": "🔑 Cài đặt API key cho NewsAPI",
  "tienich": "🧰 Xem danh sách API tiện ích",
};

export const commands = {
  weather: {
    desc: DESC.weather,
    async execute(api, msg, args, ctx) {
      if (args.length < 1) {
        await api.sendMessage({ msg: "⚠️ VD: !weather Hà Nội" }, msg.threadId, msg.type);
        return;
      }
      const city = args.join(" ");
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=vi`;
      try {
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();
        if (!geoData.results || !geoData.results.length) {
          await api.sendMessage({ msg: `❌ Không tìm thấy thành phố: ${city}` }, msg.threadId, msg.type);
          return;
        }
        const loc = geoData.results[0];
        const lat = loc.latitude;
        const lon = loc.longitude;
        const name = loc.name + (loc.admin1 ? `, ${loc.admin1}` : "") + (loc.country ? `, ${loc.country}` : "");

        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
        const wxRes = await fetch(wxUrl);
        const wxData = await wxRes.json();

        const cw = wxData.current_weather;
        const daily = wxData.daily;
        let msgText = fmt.box("☀️ THỜI TIẾT", "");
        msgText += `\n📍 ${name}`;
        msgText += `\n🌡 ${cw.temperature}°C  |  💨 ${cw.windspeed} km/h`;
        if (daily) {
          msgText += `\n${"─".repeat(28)}`;
          msgText += `\n📅 7 ngày tới:\n`;
          for (let i = 0; i < Math.min(7, daily.time.length); i++) {
            const d = new Date(daily.time[i]);
            const dayName = d.toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric" });
            msgText += `  ${dayName}: ${daily.temperature_2m_min[i]}°C → ${daily.temperature_2m_max[i]}°C  ☔${daily.precipitation_sum[i] || 0}mm\n`;
          }
        }
        msgText += `└────────────────────────────────┘`;
        await api.sendMessage({ msg: msgText }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  news: {
    desc: DESC.news,
    async execute(api, msg, args, ctx) {
      try {
        const db = loadDB("config");
        const apiKey = db.newsApiKey || "";
        if (!apiKey) {
          await api.sendMessage({ msg: "⚠️ Chưa cài API key! Admin dùng: !setnewsapi <key>\n📌 Đăng ký key miễn phí tại: https://newsapi.org/register" }, msg.threadId, msg.type);
          return;
        }
        let url, label;
        if (args.length) {
          const keyword = args.join(" ");
          url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&language=vi&pageSize=5&sortBy=publishedAt&apiKey=${apiKey}`;
          label = `📌 Tin tức về "${keyword}"`;
        } else {
          url = `https://newsapi.org/v2/everything?q=Vi%E1%BB%87t+Nam&language=vi&pageSize=5&sortBy=publishedAt&apiKey=${apiKey}`;
          label = "📌 Tin tức mới nhất trong nước";
        }
        const res = await fetch(url);
        const data = await res.json();
        if (!data.articles || !data.articles.length) {
          await api.sendMessage({ msg: "❌ Không tìm thấy tin tức!" }, msg.threadId, msg.type);
          return;
        }
        let txt = fmt.box("📰 TIN TỨC", "");
        txt += `\n${label}\n${"─".repeat(28)}\n`;
        for (const a of data.articles.slice(0, 2)) {
          txt += `\n📄 ${a.title}`;
          if (a.description) txt += `\n   ${a.description}`;
          txt += `\n   🔗 ${a.url}\n`;
        }
        txt += `└────────────────────────────────┘`;
        await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  setnewsapi: {
    desc: DESC.setnewsapi,
    async execute(api, msg, args, ctx) {
      if (args.length < 1) {
        await api.sendMessage({ msg: "⚠️ VD: !setnewsapi abc123def456" }, msg.threadId, msg.type);
        return;
      }
      const db = loadDB("config");
      db.newsApiKey = args[0];
      saveDB("config", db);
      await api.sendMessage({ msg: "✅ Đã lưu API key NewsAPI!" }, msg.threadId, msg.type);
    }
  },

  chill: {
    desc: DESC.chill,
    async execute(api, msg, args, ctx) {
      if (!args.length) {
        const song = CHILL_LIST[Math.floor(Math.random() * CHILL_LIST.length)];
        args[0] = song;
      } else {
        const idx = parseInt(args[0]) - 1;
        if (!isNaN(idx) && idx >= 0 && idx < CHILL_LIST.length) {
          args[0] = CHILL_LIST[idx];
        }
      }
      await commands.play.execute(api, msg, args, ctx);
    }
  },

  music: {
    desc: "🎵 Tìm nhạc trên iTunes (VD: !music em của ngày hôm qua)",
    async execute(api, msg, args, ctx) {
      if (args.length < 1) {
        await api.sendMessage({ msg: "⚠️ VD: !music em của ngày hôm qua" }, msg.threadId, msg.type);
        return;
      }
      try {
        const q = encodeURIComponent(args.join(" "));
        const res = await fetch(`https://itunes.apple.com/search?term=${q}&limit=5&entity=song&country=VN`);
        const data = await res.json();
        if (!data.results || !data.results.length) {
          await api.sendMessage({ msg: "❌ Không tìm thấy bài hát!" }, msg.threadId, msg.type);
          return;
        }
        let txt = fmt.box("🎵 KẾT QUẢ TÌM KIẾM", "");
        for (let i = 0; i < data.results.length; i++) {
          const s = data.results[i];
          txt += `\n${i + 1}. ${s.trackName} — ${s.artistName}`;
          txt += `\n   ▶ ${s.previewUrl || "N/A"}`;
          txt += `\n`;
        }
        txt += `└────────────────────────────────┘`;
        await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  play: {
    desc: DESC.play,
    async execute(api, msg, args, ctx) {
      if (args.length < 1) {
        await api.sendMessage({ msg: "⚠️ VD: !play tên bài" }, msg.threadId, msg.type);
        return;
      }
      try {
        const searchQuery = args.join(" ");
        const { url, display } = await getSoundCloudUrl(searchQuery);
        await sendVoice(api, url, display, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  listmusic: {
    desc: "📋 Xem danh sách nhạc trong kho",
    async execute(api, msg, args, ctx) {
      const db = loadDB("music");
      const files = db.files || [];
      if (!files.length) {
        await api.sendMessage({ msg: "📭 Kho nhạc trống!" }, msg.threadId, msg.type);
        return;
      }
      const lines = files.map((f, i) => `${i + 1}. ${f.name}`);
      let txt = fmt.box("🎵 KHO NHẠC", "");
      txt += `\n📊 Tổng: ${files.length} bài\n${"─".repeat(28)}\n`;
      txt += lines.slice(0, 20).join("\n");
      txt += `\n└────────────────────────────────┘`;
      await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
    }
  },

  lyrics: {
    desc: "📝 Tìm lời bài hát (VD: !lyrics em của ngày hôm qua)",
    async execute(api, msg, args, ctx) {
      if (args.length < 1) {
        await api.sendMessage({ msg: "⚠️ VD: !lyrics em của ngày hôm qua" }, msg.threadId, msg.type);
        return;
      }
      try {
        const q = args.join(" ");
        const res = await fetch(`https://api.lyrics.ovh/v1/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          await api.sendMessage({ msg: "❌ Không tìm thấy lời bài hát!" }, msg.threadId, msg.type);
          return;
        }
        const data = await res.json();
        const lyrics = data.lyrics || "Không có lời";
        const truncated = lyrics.length > 1500 ? lyrics.slice(0, 1500) + "..." : lyrics;
        let txt = fmt.box("📝 LỜI BÀI HÁT", "");
        txt += `\n${truncated}`;
        txt += `\n└────────────────────────────────┘`;
        await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
      } catch (e) {
        await api.sendMessage({ msg: `❌ Lỗi (${e.code || "?"}): ${e.message}` }, msg.threadId, msg.type);
      }
    }
  },

  tienich: {
    desc: DESC.tienich,
    async execute(api, msg, args, ctx) {
      const txt = `🧰 DANH SÁCH TIỆN ÍCH\n${"─".repeat(28)}\n☀️ !weather <TP> — Thời tiết\n📰 !news <tk> — Tin tức\n🎵 !music <tk> — Tìm nhạc\n🎧 !play <tk> — Phát nhạc\n😌 !chill <số> — Nhạc chill\n📋 !listmusic — Kho nhạc\n📝 !lyrics <tk> — Lời bài hát\n🔑 !setnewsapi — Cài API key`;
      await api.sendMessage({ msg: txt }, msg.threadId, msg.type);
    }
  }
};

export function getHelp() {
  return "🧰 TIỆN ÍCH:\n☀️ weather  📰 news  🎵 music\n🎧 play  😌 chill  📋 listmusic\n📝 lyrics  🔑 setnewsapi\n";
}
