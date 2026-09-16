r"""
Diagnose Pia's Groq connection.

Answers the two questions the in-app error cannot distinguish: is the API key
valid, and does the configured model actually exist on this account?

Run from the repository root:

    python scripts\diagnose_pia.py
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api")))

import httpx  # noqa: E402

from app.core.config import settings  # noqa: E402


def main() -> int:
    key = settings.GROQ_API_KEY
    model = settings.GROQ_MODEL

    print("=" * 66)
    print("Pia / Groq diagnostics")
    print("=" * 66)

    if not key:
        print("GROQ_API_KEY: (empty)")
        print("\nPia is disabled. Add GROQ_API_KEY to .env and restart the server.")
        return 2

    print(f"GROQ_API_KEY: {key[:7]}...{key[-4:]}  (length {len(key)})")
    print(f"GROQ_MODEL:   {model}")
    print()

    # 1. Is the key accepted at all?
    try:
        res = httpx.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        print(f"Could not reach Groq: {exc}")
        print("Check your internet connection, proxy, or firewall.")
        return 1

    if res.status_code in (401, 403):
        print(f"[FAIL] Groq rejected the key (HTTP {res.status_code}).")
        print("       The key is invalid, revoked, or has a typo.")
        print("       Issue a new one at https://console.groq.com/keys")
        return 1
    if res.status_code != 200:
        print(f"[FAIL] Unexpected response listing models: HTTP {res.status_code}")
        print(res.text[:400])
        return 1

    print("[OK]   API key accepted.")

    ids = sorted(m["id"] for m in res.json().get("data", []))
    print(f"[OK]   {len(ids)} models available to this account.")

    # 2. Does the configured model exist?
    if model in ids:
        print(f"[OK]   Configured model '{model}' is available.")
    else:
        print(f"[FAIL] Configured model '{model}' is NOT available to this account.")
        print("       This produces a 404 that can look like an auth failure.")
        print("\n       Available models:")
        for i in ids:
            print(f"         {i}")
        print("\n       Set GROQ_MODEL in .env to one of the above, then restart.")
        return 1

    # 3. A real end-to-end completion.
    print("\nSending a test question...")
    try:
        chat = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Reply with exactly: PIA OK"}],
                "max_tokens": 20,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as exc:
        print(f"[FAIL] Request failed: {exc}")
        return 1

    if chat.status_code != 200:
        print(f"[FAIL] HTTP {chat.status_code}")
        print(chat.text[:400])
        return 1

    reply = chat.json()["choices"][0]["message"]["content"].strip()
    print(f"[OK]   Model replied: {reply!r}")
    print("\nVERDICT: Pia's Groq connection is working.")
    print("If the widget still errors, restart the API server so it reloads .env.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
