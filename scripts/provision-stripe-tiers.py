"""One-shot: create a Stripe Product + recurring Price for each
membership tier that's still missing a stripe_price_id, then write the
IDs back to public.membership_tiers. Safe to re-run — it skips rows
that already have a price wired up.

Reads credentials from the project's .env.local (gitignored) so the
script itself can live in version control. Run from anywhere:

    python scripts/provision-stripe-tiers.py

Required env vars (set in .env.local at the repo root):
    STRIPE_SECRET_KEY            sk_test_... or sk_live_...
    SUPABASE_ACCESS_TOKEN        sbp_... (Management API token)
    NEXT_PUBLIC_SUPABASE_URL     https://<ref>.supabase.co
"""

import json, urllib.request, urllib.parse, base64, os, sys, pathlib, re


def load_env_local():
    """Tiny .env.local parser — avoids adding python-dotenv as a dep."""
    repo_root = pathlib.Path(__file__).resolve().parent.parent
    env_path = repo_root / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


load_env_local()

STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY")
SUPA_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
SUPA_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
m = re.match(r"https://([a-z0-9]+)\.supabase\.co", SUPA_URL)
SUPA_REF = m.group(1) if m else None

missing = [k for k, v in [
    ("STRIPE_SECRET_KEY", STRIPE_KEY),
    ("SUPABASE_ACCESS_TOKEN", SUPA_TOKEN),
    ("NEXT_PUBLIC_SUPABASE_URL", SUPA_REF),
] if not v]
if missing:
    sys.exit(f"Missing required env var(s): {', '.join(missing)}. Set them in .env.local.")

auth = base64.b64encode(f"{STRIPE_KEY}:".encode()).decode()

def supa_query(sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{SUPA_REF}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {SUPA_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "sarahcrm-provision/1.0",
        },
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req).read())

def stripe_post(path, data):
    body = urllib.parse.urlencode(data, doseq=True).encode()
    req = urllib.request.Request(
        f"https://api.stripe.com/v1/{path}",
        data=body,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "sarahcrm-provision/1.0",
        },
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req).read())

tiers = supa_query("SELECT id, name, price_pence FROM public.membership_tiers WHERE stripe_price_id IS NULL ORDER BY tier, membership_type;")
print(f"Provisioning {len(tiers)} tier(s)...\n")

for t in tiers:
    print(f"-> {t['name']:25} GBP {t['price_pence']/100:.0f}/month")
    prod = stripe_post("products", {
        "name": f"The Club - {t['name']}",
        "metadata[tier_id]": t['id'],
        "metadata[source]": "sarahcrm",
    })
    price = stripe_post("prices", {
        "product": prod['id'],
        "unit_amount": t['price_pence'],
        "currency": "gbp",
        "recurring[interval]": "month",
        "metadata[tier_id]": t['id'],
    })
    supa_query(
        f"UPDATE public.membership_tiers SET stripe_product_id='{prod['id']}', stripe_price_id='{price['id']}', updated_at=now() WHERE id='{t['id']}';"
    )
    print(f"   product={prod['id']}  price={price['id']}")

print("\nFinal state:")
rows = supa_query("SELECT name, price_pence, stripe_price_id FROM public.membership_tiers ORDER BY tier, membership_type;")
for r in rows:
    print(f"  {r['name']:25} GBP {r['price_pence']/100:6.0f}/mo  {r['stripe_price_id']}")
