"""Scoped API keys. Stdlib only (pbkdf2_hmac, sqlite3).

Key format: `crk_<prefix>_<secret>`; only prefix + sha256 hash stored.
"""
import hashlib
import hmac
import secrets
import sqlite3

PREFIX = "crk_"
SCOPES = {"run:python", "run:node", "egress", "artifacts:read", "admin"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS keys (
  prefix TEXT PRIMARY KEY,
  hash BLOB NOT NULL,
  salt BLOB NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_used_at INTEGER
);
"""


def _connect(db_path):
    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)
    return db


def create_key(db_path, name, scopes, expires_at=None):
    scopes = sorted(set(scopes))
    bad = [s for s in scopes if s not in SCOPES]
    if bad:
        raise ValueError(f"unknown scopes: {bad}")
    prefix = secrets.token_hex(4)
    secret = secrets.token_urlsafe(32)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 210_000)
    db = _connect(db_path)
    db.execute("INSERT INTO keys (prefix, hash, salt, name, scopes, expires_at) "
               "VALUES (?,?,?,?,?,?)",
               (prefix, digest, salt, name, ",".join(scopes), expires_at))
    db.commit()
    db.close()
    return {"key": f"{PREFIX}{prefix}_{secret}", "prefix": prefix, "scopes": scopes}


def verify(db_path, key, required_scope=None):
    """Return key row dict if valid for scope, else None."""
    if not key or not key.startswith(PREFIX):
        return None
    try:
        _, prefix, secret = key.split("_", 2)
    except ValueError:
        return None
    db = _connect(db_path)
    row = db.execute("SELECT prefix, hash, salt, name, scopes, expires_at, revoked "
                     "FROM keys WHERE prefix=?", (prefix,)).fetchone()
    if not row:
        db.close()
        return None
    _, stored, salt, name, scopes, expires_at, revoked = row
    if revoked:
        db.close()
        return None
    import time
    if expires_at and expires_at < int(time.time()):
        db.close()
        return None
    trial = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 210_000)
    if not hmac.compare_digest(trial, stored):
        db.close()
        return None
    scope_list = scopes.split(",") if scopes else []
    if required_scope and required_scope not in scope_list and "admin" not in scope_list:
        db.close()
        return None
    db.execute("UPDATE keys SET last_used_at=strftime('%s','now') WHERE prefix=?", (prefix,))
    db.commit()
    db.close()
    return {"prefix": prefix, "name": name, "scopes": scope_list}


def revoke(db_path, prefix):
    db = _connect(db_path)
    cur = db.execute("UPDATE keys SET revoked=1 WHERE prefix=?", (prefix,))
    db.commit()
    db.close()
    return cur.rowcount > 0
