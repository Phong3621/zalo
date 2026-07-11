import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import FormData from "form-data";

const TMP_DIR = process.env.TMP_DIR
  ? path.resolve(process.env.TMP_DIR)
  : (() => {
    // Linux (Belmo): dùng /tmp, Windows: dùng music_library
    const dir = process.platform === "win32"
      ? path.join(process.cwd(), "music_library")
      : "/tmp/zalo_bot_music";
    return dir;
  })();
const CLIENT_ID = "lmRjTI0FqeXygHMXc3hRzS7hth20PNk5";
const HEADERS = {
  "accept": "application/json, text/javascript, */*; q=0.01",
  "Referer": "https://soundcloud.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};
const TIMEOUT = 60_000;

async function searchSoundCloud(query) {
  const searchQ = query.toLowerCase().includes("remix") ? query : `${query} remix`;
  const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(searchQ)}&client_id=${CLIENT_ID}&limit=10&offset=0`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Search API lỗi ${res.status}`);
  const data = await res.json();
  let tracks = data.collection?.filter(t => t.kind === "track" && t.streamable) || [];
  if (!tracks.length) throw new Error("Không tìm thấy bài hát nào");
  const remix = tracks.find(t => /remix/i.test(t.title));
  return remix || tracks[0];
}

function pickTranscoding(track) {
  const media = track.media;
  if (!media?.transcodings?.length) throw new Error("Track không có dữ liệu audio");
  const progMp3 = media.transcodings.find(t => t.format?.protocol === "progressive" && t.format?.mime_type === "audio/mpeg");
  if (progMp3) return progMp3;
  return media.transcodings[0];
}

async function getStreamUrl(transcoding) {
  const url = `${transcoding.url}?client_id=${CLIENT_ID}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Stream API lỗi ${res.status}`);
  const data = await res.json();
  if (!data.url) throw new Error("Không lấy được stream URL");
  return data.url;
}

function getTrackDisplay(track) {
  const title = track.title || "Unknown";
  const artist = track.user?.username;
  let display = artist ? `${artist} - ${title}` : title;
  if (display.length > 200) display = display.slice(0, 200) + "...";
  return display;
}

async function findFfmpeg() {
  // Thử ffmpeg-static (portable, cross-platform)
  try {
    const { default: ffmpegPath } = await import("ffmpeg-static");
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
  } catch {}
  // Windows paths
  const common = [
    "C:\\Users\\phong\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin",
    "C:\\Program Files\\ffmpeg\\bin",
    "C:\\ffmpeg\\bin",
  ];
  for (const dir of common) {
    const p = path.join(dir, "ffmpeg.exe");
    if (fs.existsSync(p)) return p;
  }
  // Linux / macOS
  for (const p of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"]) {
    if (fs.existsSync(p)) return p;
  }
  return "ffmpeg";
}

async function downloadToFile(streamUrl, outPath) {
  const ffmpegPath = await findFfmpeg();
  const cmd = [
    `"${ffmpegPath}"`,
    `-user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`,
    `-headers "Referer: https://soundcloud.com/"`,
    `-i "${streamUrl}"`,
    `-c:a copy`,
    `"${outPath}"`,
    `-y`,
  ].join(" ");
  execSync(cmd, { timeout: TIMEOUT, encoding: "utf-8", stdio: "pipe" });
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) throw new Error("File lỗi hoặc quá nhỏ");
}

async function uploadToFreeHost(filePath, fileName) {
  const buf = fs.readFileSync(filePath);
  // Thử catbox.moe trước
  try {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buf, fileName || path.basename(filePath));
    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      headers: form.getHeaders(),
      body: form.getBuffer(),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const url = (await res.text()).trim();
      if (url.startsWith("http")) return url;
    }
  } catch (e) { console.log("[-] Catbox fail:", e.message); }

  // Fallback: tmpfiles.org
  const form2 = new FormData();
  form2.append("file", buf, fileName || path.basename(filePath));
  const res2 = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    headers: form2.getHeaders(),
    body: form2.getBuffer(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res2.ok) throw new Error(`tmpfiles thất bại: ${res2.status}`);
  const data = await res2.json();
  if (!data?.data?.url) throw new Error("tmpfiles ko co url");
  return data.data.url.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().slice(0, 100) || "audio";
}

export async function getSoundCloudUrl(query) {
  if (!query?.trim()) throw new Error("Query rỗng");
  const track = await searchSoundCloud(query);
  const transcoding = pickTranscoding(track);
  const streamUrl = await getStreamUrl(transcoding);
  return { url: streamUrl, display: getTrackDisplay(track) };
}

export async function sendVoice(api, streamUrl, display, threadId, type) {
  const say = async (msg) => {
    msg = msg.length > 500 ? msg.slice(0, 497) + "..." : msg;
    try {
      await api.sendMessage({ msg }, threadId, type);
      console.log(`[+] say OK: ${msg.slice(0, 60)}`);
    } catch (e) {
      console.log(`[-] say fail (${e.code || "?"}): ${e.message} | msg=${msg.slice(0, 80)}`);
      try {
        const plain = msg.replace(/[^\x20-\x7E\n]/g, "").trim();
        if (plain.length > 0) {
          await api.sendMessage(plain, threadId, type);
          console.log(`[+] say plain OK: ${plain.slice(0, 60)}`);
        }
      } catch (e2) {
        console.log(`[-] say plain fail (${e2.code || "?"}): ${e2.message}`);
      }
    }
  };

  console.log(`[*] sendVoice starts | threadId=${threadId} type=${type} display=${display}`);
  await say(`🎧 ${display}`);

  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const hash = crypto.createHash("md5").update(streamUrl).digest("hex").slice(0, 8);
  const localPath = path.join(TMP_DIR, `${hash}.mp3`);

  // Chỉ tải nếu chưa có
  if (!fs.existsSync(localPath)) {
    console.log(`[*] Downloading ${streamUrl.substring(0, 80)}...`);
    try {
      await downloadToFile(streamUrl, localPath);
      console.log(`[+] Downloaded to ${localPath}`);
    } catch (e) {
      console.log(`[-] Download fail: ${e.message}`);
      await say(`❌ Lỗi: ${e.message}`);
      return;
    }
  } else {
    console.log(`[*] File exists: ${localPath}`);
  }

  // Gửi file MP3 (với tên bài hát)
  const displayFile = sanitizeFileName(display) + ".mp3";
  const sendPath = path.join(TMP_DIR, displayFile);
  if (!fs.existsSync(sendPath)) fs.copyFileSync(localPath, sendPath);
  try {
    await api.sendMessage({ msg: "", attachments: [sendPath] }, threadId, type);
    console.log("[+] File sent via Zalo CDN");
  } catch (e) {
    console.log(`[-] Zalo CDN fail (${e.code}): ${e.message}`);
    try {
      const fileUrl = await uploadToFreeHost(sendPath, displayFile);
      console.log(`[+] Uploaded to free host: ${fileUrl}`);
      await say(`📥 File MP3: ${fileUrl}`);
    } catch (e2) {
      console.log(`[-] Free host fail: ${e2.message}`);
      await say(`❌ Không gửi được file`);
    }
  }

  // Gửi voice (upload lên free host rồi dùng URL)
  console.log("[*] Processing voice...");
  const voicePath = path.join(TMP_DIR, `${hash}_voice.m4a`);
  try {
    execSync(`"${await findFfmpeg()}" -i "${localPath}" -t 60 -c:a aac -b:a 32k -ar 22050 -ac 1 "${voicePath}" -y`,
      { timeout: 30000, stdio: "pipe" });
    const voiceSize = fs.statSync(voicePath).size;
    console.log(`[+] Voice converted: ${voicePath} (${voiceSize} bytes)`);
    if (voiceSize >= 512) {
      // Thử upload lên CDN Zalo trước (có timeout 20s)
      let cdnUrl = null;
      try {
        const uploadResult = await Promise.race([
          api.uploadAttachment([voicePath], threadId, type),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout upload CDN")), 20000))
        ]);
        cdnUrl = uploadResult?.[0]?.fileUrl;
      } catch (e) { console.log("[-] Zalo CDN upload fail:", e.message); }

      if (cdnUrl) {
        console.log(`[+] Voice uploaded to Zalo CDN: ${cdnUrl}`);
        await api.sendVoice({ voiceUrl: cdnUrl, fileSize: voiceSize }, threadId, type);
      } else {
        // Fallback upload free host + sendVoice
        const url = await uploadToFreeHost(voicePath, sanitizeFileName(display) + "_voice.m4a");
        console.log(`[+] Voice uploaded to free host: ${url}`);
        await api.sendVoice({ voiceUrl: url, fileSize: voiceSize }, threadId, type);
      }
      console.log("[+] Voice sent via Zalo");
    } else {
      console.log("[-] Voice file too small, skipping");
    }
  } catch (e) {
    console.log("[-] Voice fail:", e.message);
  } finally {
    try { fs.unlinkSync(voicePath); } catch {}
  }
  console.log("[*] sendVoice done");
}
