#!/usr/bin/env bash
# System-breaker attack suite against localhost:3000
# Runs unauthenticated probes to find bugs in publicly-exposed endpoints.
set +e  # don't stop on individual failures

BASE="http://localhost:3000"
FAKE_UUID="00000000-0000-0000-0000-000000000000"

probe() {
  # probe METHOD PATH BODY [DESC]
  local m="$1" p="$2" body="$3" desc="$4"
  local out
  if [ -n "$body" ]; then
    out=$(curl -s -m 5 -o /tmp/atk_body -w "HTTP %{http_code} %{time_total}s" -X "$m" "$BASE$p" \
      -H "Content-Type: application/json" -d "$body" 2>&1)
  else
    out=$(curl -s -m 5 -o /tmp/atk_body -w "HTTP %{http_code} %{time_total}s" -X "$m" "$BASE$p" 2>&1)
  fi
  local snippet=$(head -c 150 /tmp/atk_body 2>/dev/null | tr -d '\n')
  printf "  %-40s %s\n      %s\n" "$desc" "$out" "${snippet:0:140}"
}

echo "═══ ATTACK 1: Auth probe — admin endpoints without Bearer ═══"
probe GET   "/api/manage/orders?site_id=$FAKE_UUID" "" "GET /manage/orders no-auth"
probe GET   "/api/manage/transactions?site_id=$FAKE_UUID" "" "GET /manage/transactions no-auth"
probe PATCH "/api/manage/sites/$FAKE_UUID/kot-mode" '{"kot_mode":"automatic"}' "PATCH kot-mode no-auth"
probe PATCH "/api/orders/$FAKE_UUID" '{"status":"completed"}' "PATCH /orders/[id] no-auth"
probe POST  "/api/manage/table-checkout" '{"site_id":"'"$FAKE_UUID"'","table_number":"5","payment_method":"cash"}' "POST table-checkout no-auth"
probe POST  "/api/manage/device-heartbeat" '{"site_id":"'"$FAKE_UUID"'","device_id":"x"}' "POST device-heartbeat no-auth"

echo ""
echo "═══ ATTACK 2: siteId fuzz — path traversal, SQL, malformed ═══"
probe POST "/api/orders" '{"siteId":""}' "empty siteId"
probe POST "/api/orders" '{"siteId":"not-a-uuid"}' "non-uuid siteId"
probe POST "/api/orders" '{"siteId":"../../../etc/passwd"}' "path traversal siteId"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID' OR 1=1--\"}" "SQL injection siteId"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\"}" "valid format but ghost siteId"

echo ""
echo "═══ ATTACK 3: items[] payload abuse ═══"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[]}" "empty items"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":null}" "null items"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":-1}]}" "negative qty"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":99999999}]}" "INT_MAX qty"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1.5}]}" "fractional qty"

# 100-item flood
items=$(python3 -c "import json; print(json.dumps([{'id':'$FAKE_UUID','qty':1} for _ in range(100)]))" 2>/dev/null \
        || node -e "console.log(JSON.stringify(Array(100).fill({id:'$FAKE_UUID',qty:1})))")
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":$items}" "100-item burst (MAX_ITEMS=50 expected)"

echo ""
echo "═══ ATTACK 4: customerName fuzz ═══"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"<script>alert(1)</script>\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}]}" "XSS name"
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"\\n\\n\\n\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}]}" "newline-only name"
big_name=$(printf 'A%.0s' {1..2000})
probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"$big_name\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}]}" "2000-char name (MAX_NAME_LEN=80)"

echo ""
echo "═══ ATTACK 5: customerEmail fuzz ═══"
for em in "" "no-at-sign" "@nodomain" "a@" "a@b" '"<>@b.co"' "$(printf 'A%.0s' {1..500})@b.co"; do
  probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"$em\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}]}" "email=${em:0:30}"
done

echo ""
echo "═══ ATTACK 6: paymentMethod tamper ═══"
for pm in "free" "GIFT" "online " " online" "ONLINE" "null" "[\"online\"]"; do
  probe POST "/api/orders" "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"x\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"$pm\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}]}" "paymentMethod=$pm"
done

echo ""
echo "═══ ATTACK 7: Bill request DoS — 10 rapid requests ═══"
for i in {1..10}; do
  out=$(curl -s -m 3 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/bill-request" \
    -H "Content-Type: application/json" -d "{\"siteId\":\"$FAKE_UUID\",\"tableNumber\":1}")
  printf " %s" "$out"
done
echo "  (limit is 3/IP/5min — expect 200,200,200,429,429,...)"

echo ""
echo "═══ ATTACK 8: Idempotency key tampering ═══"
KEY="malicious-replay-key-$RANDOM"
probe POST "/api/orders" \
  "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"victim\",\"customerEmail\":\"v@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}],\"clientRequestId\":\"$KEY\"}" \
  "first submit with key=$KEY"
probe POST "/api/orders" \
  "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"attacker\",\"customerEmail\":\"hax@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":99}],\"clientRequestId\":\"$KEY\"}" \
  "replay with different name/qty"

echo ""
echo "═══ ATTACK 9: order/status endpoint — timing oracle ═══"
echo "  Measuring response time for invalid vs no token..."
for run in {1..5}; do
  t1=$(curl -s -m 3 -o /dev/null -w "%{time_total}" "$BASE/api/orders/$FAKE_UUID/status")
  t2=$(curl -s -m 3 -o /dev/null -w "%{time_total}" "$BASE/api/orders/$FAKE_UUID/status?t=garbage")
  printf "  run %d: no-token=%ss  bad-token=%ss\n" "$run" "$t1" "$t2"
done

echo ""
echo "═══ ATTACK 10: Order spam — 30 requests as fast as possible ═══"
START=$(date +%s.%N)
codes=""
for i in {1..30}; do
  c=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/orders" \
    -H "Content-Type: application/json" \
    -d "{\"siteId\":\"$FAKE_UUID\",\"customerName\":\"spam$i\",\"customerEmail\":\"a@b.co\",\"paymentMethod\":\"counter\",\"items\":[{\"id\":\"$FAKE_UUID\",\"qty\":1}]}" &)
  codes="$codes $c"
done
wait
END=$(date +%s.%N)
echo "  30 requests done in $(echo "$END - $START" | bc 2>/dev/null || echo "?")s"
echo "  codes:$codes"

echo ""
echo "═══ DONE ═══"
