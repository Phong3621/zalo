import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESS = path.join(__dirname, "session.json");

async function main() {
  const { Builder } = await import("selenium-webdriver");
  const chrome = await import("selenium-webdriver/chrome.js");

  const options = new chrome.Options();
  options.addArguments("--no-sandbox", "--disable-blink-features=AutomationControlled");
  const driver = new Builder().forBrowser("chrome").setChromeOptions(options).build();

  await driver.get("https://chat.zalo.me");
  console.log("[?] Dang nhap xong? Nhan Enter...");
  await new Promise(r => process.stdin.once("data", r));

  const allCookies = await driver.executeCdpCommand("Network.getAllCookies", {});
  const cookieArr = allCookies.cookies.map(c => ({
    name: c.name, value: c.value, domain: c.domain || "chat.zalo.me"
  }));

  const imei = await driver.executeScript(`
    return localStorage.getItem('z_uuid') || 
           localStorage.getItem('sh_z_uuid') || ''
  `) || String(Date.now()).slice(0, 15);

  const userAgent = await driver.executeScript("return navigator.userAgent");
  await driver.quit();

  fs.writeFileSync(SESS, JSON.stringify({ imei, cookieArr, userAgent }, null, 2));
  console.log("[+] Da luu session vao session.json");
}

main().catch(console.error);
