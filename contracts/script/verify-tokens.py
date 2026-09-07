#!/usr/bin/env python3
"""
Verify every launched LaunchToken on Basescan (Etherscan V2 key) and Base Blockscout (keyless).
Constructor args are rebuilt from the token's own on-chain state (name, symbol, totalSupply,
launcher, metadataURI) — never from our database, which truncates long names.
Usage: ETHERSCAN_API_KEY=… script/verify-tokens.py [--chain base] [--only 0x…] [--dry-run]
Run from contracts/. Idempotent: already-verified tokens are skipped.
"""
import json, os, subprocess, sys, time, urllib.request

CHAIN = "base"
CHAIN_ID = 8453
SITE = "https://openlaunch.lol"
RPC = os.environ.get("BASE_RPC_URL") or "https://base-mainnet.public.blastapi.io"
KEY = os.environ.get("ETHERSCAN_API_KEY") or os.environ.get("BASESCAN_API_KEY")
if not KEY and os.path.exists(".env"):
    for line in open(".env"):
        if line.startswith("ETHERSCAN_API_KEY="):
            KEY = line.split("=", 1)[1].strip()
if not KEY:
    sys.exit("ETHERSCAN_API_KEY missing")
only = None
dry = "--dry-run" in sys.argv
if "--only" in sys.argv:
    only = sys.argv[sys.argv.index("--only") + 1].lower()

def sh(*args):
    r = subprocess.run(args, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr)

def call(addr, sig):
    code, out = sh("cast", "call", addr, sig, "--rpc-url", RPC)
    if code != 0:
        raise RuntimeError(out.strip()[:120])
    return out.strip()

def launches():
    out, offset = [], 0
    while True:
        d = json.load(urllib.request.urlopen(f"{SITE}/api/launch/list?sort=new&limit=200&offset={offset}&chain={CHAIN}"))
        items = d.get("launches") or []
        out += items
        if not d.get("has_more") or not items:
            return out
        offset += len(items)

def basescan_verified(addr):
    d = json.load(urllib.request.urlopen(f"https://api.etherscan.io/v2/api?chainid={CHAIN_ID}&module=contract&action=getsourcecode&address={addr}&apikey={KEY}"))
    r = (d.get("result") or [{}])[0]
    return isinstance(r, dict) and bool(r.get("SourceCode"))

def unquote(s):
    # cast prints strings quoted
    s = s.strip()
    return s[1:-1] if len(s) >= 2 and s[0] == '"' and s[-1] == '"' else s

toks = launches()
if only:
    toks = [t for t in toks if t["token"].lower() == only]
print(f"{len(toks)} {CHAIN} tokens", flush=True)
done = skipped = failed = 0
for i, t in enumerate(toks, 1):
    addr = t["token"]
    try:
        if basescan_verified(addr):
            skipped += 1
            print(f"[{i}/{len(toks)}] {t['symbol']:<8} already verified", flush=True)
            continue
        name = unquote(call(addr, "name()(string)"))
        symbol = unquote(call(addr, "symbol()(string)"))
        supply = call(addr, "totalSupply()(uint256)").split()[0]
        launcher = call(addr, "launcher()(address)")
        uri = unquote(call(addr, "metadataURI()(string)"))
        code, enc = sh("cast", "abi-encode", "constructor(string,string,uint256,address,string)", name, symbol, supply, launcher, uri)
        enc = enc.strip()
        if code != 0 or not enc.startswith("0x"):
            raise RuntimeError("abi-encode failed")
        if dry:
            print(f"[{i}/{len(toks)}] {symbol:<8} would verify ({name[:24]!r}, supply {supply[:6]}…)", flush=True)
            continue
        base = ["forge", "verify-contract", "--chain", CHAIN, addr, "src/LaunchToken.sol:LaunchToken", "--constructor-args", enc,
                "--compiler-version", "0.8.26", "--evm-version", "cancun", "--num-of-optimizations", "200", "--via-ir"]
        code, out = sh(*base, "--verifier", "etherscan", "--etherscan-api-key", KEY)
        ok = code == 0 and ("Submitted" in out or "already verified" in out)
        msg = "submitted" if ok else out.strip().splitlines()[-1][:100] if out.strip() else "failed"
        sh(*base, "--verifier", "blockscout", "--verifier-url", "https://base.blockscout.com/api/")  # keyless, best effort
        if ok:
            done += 1
        else:
            failed += 1
        print(f"[{i}/{len(toks)}] {symbol:<8} {msg}", flush=True)
        time.sleep(0.6)  # stay under the free-tier request rate
    except Exception as e:
        failed += 1
        print(f"[{i}/{len(toks)}] {t.get('symbol','?'):<8} ERROR {str(e)[:100]}", flush=True)
print(f"done: submitted {done}, already verified {skipped}, failed {failed}")
