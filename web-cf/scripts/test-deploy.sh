#!/bin/bash
# Deployment smoke tests for purroxy.com
# Usage: ./scripts/test-deploy.sh [base-url]
# Default: https://purroxy.com

BASE="${1:-https://purroxy.com}"
PASS=0
FAIL=0
TOTAL=0

green="\033[32m"
red="\033[31m"
dim="\033[2m"
reset="\033[0m"

check() {
  local name="$1"
  local result="$2"
  local detail="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$result" = "pass" ]; then
    PASS=$((PASS + 1))
    printf "  ${green}pass${reset}  %s${dim} %s${reset}\n" "$name" "$detail"
  else
    FAIL=$((FAIL + 1))
    printf "  ${red}FAIL${reset}  %s${dim} %s${reset}\n" "$name" "$detail"
  fi
}

echo ""
echo "Deployment tests: $BASE"
echo "─────────────────────────────────────"

# --- Frontend ---
echo ""
echo "Frontend"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
[ "$STATUS" = "200" ] && check "Homepage" "pass" "$STATUS" || check "Homepage" "FAIL" "got $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/signup")
[ "$STATUS" = "200" ] && check "Signup page" "pass" "$STATUS" || check "Signup page" "FAIL" "got $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/marketplace")
[ "$STATUS" = "200" ] && check "Marketplace" "pass" "$STATUS" || check "Marketplace" "FAIL" "got $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/docs")
[ "$STATUS" = "200" ] && check "Docs page" "pass" "$STATUS" || check "Docs page" "FAIL" "got $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://docs.purroxy.com/")
[ "$STATUS" = "200" ] && check "Docs subdomain" "pass" "$STATUS" || check "Docs subdomain" "FAIL" "got $STATUS"

# --- API Health ---
echo ""
echo "API"

BODY=$(curl -s "$BASE/api/health")
echo "$BODY" | grep -q '"ok":true' && check "Health" "pass" "$BODY" || check "Health" "FAIL" "$BODY"

# --- Version ---
BODY=$(curl -s "$BASE/api/version")
echo "$BODY" | grep -q '"downloadBase"' && check "Version (has downloadBase)" "pass" "" || check "Version (has downloadBase)" "FAIL" "$BODY"
echo "$BODY" | grep -q 'github.com' && check "Version (GitHub releases)" "pass" "" || check "Version (GitHub releases)" "FAIL" "$BODY"
echo "$BODY" | grep -q '"version"' && check "Version (has version)" "pass" "" || check "Version (has version)" "FAIL" "$BODY"

# --- Auth ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{}')
[ "$STATUS" = "400" ] && check "Login (rejects empty)" "pass" "$STATUS" || check "Login (rejects empty)" "FAIL" "got $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d '{}')
[ "$STATUS" = "400" ] && check "Signup (rejects empty)" "pass" "$STATUS" || check "Signup (rejects empty)" "FAIL" "got $STATUS"

BODY=$(curl -s "$BASE/api/auth/check-username?username=mreider")
echo "$BODY" | grep -q '"available":false' && check "Username check (taken)" "pass" "" || check "Username check (taken)" "FAIL" "$BODY"

BODY=$(curl -s "$BASE/api/auth/check-username?username=zzz-unused-test-name")
echo "$BODY" | grep -q '"available":true' && check "Username check (available)" "pass" "" || check "Username check (available)" "FAIL" "$BODY"

# --- License ---
BODY=$(curl -s -X POST "$BASE/api/license/validate" -H "Authorization: Bearer invalid-key" -H "Content-Type: application/json")
echo "$BODY" | grep -q '"valid":false\|Invalid' && check "License (rejects invalid)" "pass" "" || check "License (rejects invalid)" "FAIL" "$BODY"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/license/validate" -H "Content-Type: application/json" -d '{}')
[ "$STATUS" = "401" ] || [ "$STATUS" = "400" ] && check "License (requires key)" "pass" "$STATUS" || check "License (requires key)" "FAIL" "got $STATUS"

# --- Account ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/account/profile")
[ "$STATUS" = "401" ] && check "Account (requires auth)" "pass" "$STATUS" || check "Account (requires auth)" "FAIL" "got $STATUS"

# --- Sites ---
BODY=$(curl -s "$BASE/api/sites")
echo "$BODY" | grep -q '"sites"\|"total"' && check "Sites list" "pass" "" || check "Sites list" "FAIL" "$BODY"

# --- Submissions ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions?profileId=test")
[ "$STATUS" = "401" ] && check "Submissions (requires auth)" "pass" "$STATUS" || check "Submissions (requires auth)" "FAIL" "got $STATUS"

# --- Stripe ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/stripe/create-checkout" -H "Content-Type: application/json" -d '{}')
[ "$STATUS" = "401" ] && check "Stripe checkout (requires auth)" "pass" "$STATUS" || check "Stripe checkout (requires auth)" "FAIL" "got $STATUS"

# --- Usage ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/usage/check" -H "Content-Type: application/json" -d '{}')
[ "$STATUS" = "401" ] && check "Usage (requires auth)" "pass" "$STATUS" || check "Usage (requires auth)" "FAIL" "got $STATUS"

# --- Legacy compat ---
BODY=$(curl -s "$BASE/api/profiles")
echo "$BODY" | grep -q '"profiles"\|"total"' && check "Legacy /api/profiles" "pass" "" || check "Legacy /api/profiles" "FAIL" "$BODY"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/profiles/test-id/download")
[ "$STATUS" = "401" ] && check "Legacy download (requires auth)" "pass" "$STATUS" || check "Legacy download (requires auth)" "FAIL" "got $STATUS"

# --- GitHub webhook ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/github/webhook" -H "Content-Type: application/json" -d '{}')
# Should reject without signature (401) or skip non-PR events
[ "$STATUS" = "401" ] || [ "$STATUS" = "200" ] && check "GitHub webhook (responds)" "pass" "$STATUS" || check "GitHub webhook (responds)" "FAIL" "got $STATUS"

# --- Download link ---
BODY=$(curl -s "$BASE/api/version")
DL_BASE=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('downloadBase',''))" 2>/dev/null)
DMG=$(echo "$BODY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('dmg',''))" 2>/dev/null)
if [ -n "$DL_BASE" ] && [ -n "$DMG" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -I "$DL_BASE/$DMG")
  [ "$STATUS" = "302" ] || [ "$STATUS" = "200" ] && check "Download link (resolves)" "pass" "$STATUS $DMG" || check "Download link (resolves)" "FAIL" "got $STATUS for $DL_BASE/$DMG"
else
  check "Download link (resolves)" "FAIL" "could not parse version response"
fi

# --- Summary ---
echo ""
echo "─────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  printf "${green}All $TOTAL tests passed${reset}\n"
else
  printf "${red}$FAIL/$TOTAL tests failed${reset}\n"
fi
echo ""

exit $FAIL
