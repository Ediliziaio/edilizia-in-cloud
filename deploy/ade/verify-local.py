"""Synthetic Docker/mTLS smoke test. Never contacts AdE or an existing server.

Build eic-smts:local first. Optional ADE_COMPOSE_BIN can name a standalone
Compose binary. All containers, ports, keys and volumes are isolated/temporary.
"""
import http.client
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import ssl
import subprocess
import tempfile
import time
import uuid

COMPOSE = shlex.split(os.environ.get("ADE_COMPOSE_BIN", "docker compose"))
SOURCE = Path(__file__).resolve().parent
PROJECT = "ade-smoke-" + uuid.uuid4().hex[:12]


def run(args):
    try:
        return subprocess.check_output(args, stderr=subprocess.PIPE, text=True, timeout=120).strip()
    except subprocess.CalledProcessError as error:
        raise RuntimeError(error.stderr.strip()) from error


(SOURCE.parents[1] / ".tmp").mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="ade-smoke-", dir=SOURCE.parents[1] / ".tmp") as directory:
    root = Path(directory)
    shutil.copy(SOURCE / "compose.yaml", root / "compose.yaml")
    shutil.copy(SOURCE / "haproxy.cfg", root / "haproxy.cfg")
    for env in ("test", "production"):
        (root / f"{env}.env").write_text("SMTS_GATEWAY_SECRET=synthetic-local-only-secret-more-than-32-chars\n")
    base = COMPOSE + ["-p", PROJECT, "-f", str(root / "compose.yaml"), "--profile", "production"]
    config = json.loads(run(base + ["config", "--format", "json"]))

    def openssl(*args):
        run(["openssl", *args])

    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(root / "ca.key"),
            "-out", str(root / "ca.pem"), "-subj", "/CN=Synthetic local smoke CA", "-days", "1")

    def certificate(name, hostname=None):
        key, csr, cert = [root / (name + suffix) for suffix in (".key", ".csr", ".pem")]
        openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key),
                "-out", str(csr), "-subj", "/CN=" + (hostname or name))
        ext = root / (name + ".ext")
        ext.write_text("extendedKeyUsage=" + ("serverAuth\nsubjectAltName=DNS:" + hostname if hostname else "clientAuth") + "\n")
        openssl("x509", "-req", "-in", str(csr), "-CA", str(root / "ca.pem"),
                "-CAkey", str(root / "ca.key"), "-CAcreateserial", "-out", str(cert),
                "-days", "1", "-extfile", str(ext))
        return key, cert

    clients = {}
    for name in ("test", "production", "unlisted"):
        clients[name] = certificate(name + "-client")
    for name, hostname in (("test", "sdi-test.ediliziaincloud.com"), ("production", "sdi.ediliziaincloud.com")):
        key, cert = certificate(name + "-server", hostname)
        certdir = root / "certs" / name
        certdir.mkdir(parents=True)
        for source, target in ((key, "server-key.pem"), (cert, "server.pem"), (root / "ca.pem", "ca.pem"), (clients[name][1], "sdi-client.pem")):
            shutil.copy(source, certdir / target)
            # Synthetic fixtures only; no production keys are generated here.
            (certdir / target).chmod(0o644)
        service = config["services"][name]
        service.pop("build", None)
        service["pull_policy"] = "never"
        service["environment"].update({"SMTS_ACCREDITED": "false", "SMTS_SERVER_CERT": "/certs/server.pem",
            "SMTS_SERVER_KEY": "/certs/server-key.pem", "SMTS_CA": "/certs/ca.pem", "SMTS_SDI_CLIENT_CERTS": "/certs/sdi-client.pem"})
    for service in config["services"].values():
        for port in service.get("ports", []):
            port.update({"host_ip": "127.0.0.1", "published": "0"})
    resolved = root / "resolved.json"
    resolved.write_text(json.dumps(config))
    base = COMPOSE + ["-p", PROJECT, "-f", str(resolved), "--profile", "production"]

    def compose(*args):
        return run(base + list(args))

    def row_count(environment):
        return int(compose("exec", "-T", environment, "node", "-e",
            "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/requests.sqlite').prepare('SELECT count(*) AS n FROM sdi_notifications').get().n)"))

    payload = b'<Envelope><Body><ricevutaConsegna><IdentificativoSdI>123</IdentificativoSdI><NomeFile>IT00000000000.xml</NomeFile><File>YQ==</File></ricevutaConsegna></Body></Envelope>'
    try:
        compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "60")
        ingress = int(compose("port", "ingress", "8443").rsplit(":", 1)[1])

        def notification(hostname, client):
            context = ssl.create_default_context(cafile=str(root / "ca.pem"))
            if client:
                key, cert = clients[client]
                context.load_cert_chain(str(cert), str(key))
            with socket.create_connection(("127.0.0.1", ingress), timeout=5) as raw:
                with context.wrap_socket(raw, server_hostname=hostname) as tls:
                    tls.sendall(("POST /sdi/trasmissione HTTP/1.1\r\nHost: " + hostname + "\r\nConnection: close\r\nSOAPAction: http://www.fatturapa.it/TrasmissioneFatture/RicevutaConsegna\r\nContent-Length: " + str(len(payload)) + "\r\n\r\n").encode() + payload)
                    response = http.client.HTTPResponse(tls)
                    response.begin()
                    response.read()
                    return response.status

        assert notification("sdi-test.ediliziaincloud.com", "test") == 202
        assert row_count("test") == 1 and row_count("production") == 0
        assert notification("sdi-test.ediliziaincloud.com", "unlisted") == 403
        assert notification("sdi.ediliziaincloud.com", "test") == 403
        for hostname, client in (("sdi-test.ediliziaincloud.com", None), ("unknown.ediliziaincloud.com", "test")):
            try:
                notification(hostname, client)
            except (OSError, http.client.HTTPException):
                pass
            else:
                raise AssertionError("TLS connection should have been rejected")
        compose("restart", "test")
        for attempt in range(20):
            try:
                assert notification("sdi-test.ediliziaincloud.com", "test") == 202
                break
            except OSError:
                if attempt == 19:
                    raise
                time.sleep(0.25)
        assert row_count("test") == 1
        assert notification("sdi.ediliziaincloud.com", "production") == 202
        assert row_count("production") == 1
        print("PASS: mTLS passthrough, pinned client, missing certificate, unknown SNI, environment isolation, persistent deduplication after restart")
    finally:
        # Only this random, synthetic project. Never touch deployment volumes.
        compose("down", "--volumes", "--remove-orphans")
