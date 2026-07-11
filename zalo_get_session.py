import json, os, re, time
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium import webdriver

SESS_FILE = os.path.join(os.path.dirname(__file__), "zalo_session.json")

def cookies_to_str(cookie_dict):
    prio = ["zpw_sek", "zpsid", "__zi", "zlogin_session", "app.event.zalo.me", "zlang"]
    parts = []
    for k in prio:
        if k in cookie_dict:
            parts.append(f"{k}={cookie_dict[k]}")
    for k, v in cookie_dict.items():
        if k not in prio and not k.startswith("_"):
            parts.append(f"{k}={v}")
    return "; ".join(parts)

options = webdriver.ChromeOptions()
options.add_argument("--no-sandbox")
options.add_argument("--disable-blink-features=AutomationControlled")
options.add_argument("--disable-dev-shm-usage")
service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service, options=options)

driver.get("https://chat.zalo.me")
input("[?] Dang nhap xong? Nhan Enter...")

time.sleep(2)
cookies_raw = driver.execute_cdp_cmd("Network.getAllCookies", {}).get("cookies", [])
cookie_dict = {c["name"]: c["value"] for c in cookies_raw}
cookie_arr = [{"name": c["name"], "value": c["value"], "domain": c.get("domain", "")} for c in cookies_raw]

cookie_str = cookies_to_str(cookie_dict)
imei = driver.execute_script(
    "return localStorage.getItem('z_uuid') || "
    "localStorage.getItem('sh_z_uuid') || "
    "localStorage.getItem('device-id-v2') || ''"
) or re.sub(r'[^0-9]', '', str(time.time()))[:15]

user_agent = driver.execute_script("return navigator.userAgent")

data = {
    "imei": imei,
    "cookie": cookie_str,
    "cookieArr": cookie_arr,
    "userAgent": user_agent,
    "cookies": cookie_dict,
}
with open(SESS_FILE, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"[+] Da luu session vao {SESS_FILE}")
print(f"[+] IMEI: {imei}")
print(f"[+] Cookie: {cookie_str[:80]}...")
print(f"[+] User-Agent: {user_agent[:80]}...")

driver.quit()
