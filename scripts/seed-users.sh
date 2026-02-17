#!/bin/bash
# Create 28 demo auth users via Supabase Auth Admin API
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucXphaHhncXhnaWJkemt4YWNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI1ODk1MywiZXhwIjoyMDg2ODM0OTUzfQ.th1liNz1ZyxPt4w-PR677GYpYlveMaOf74gReaXoziM"
URL="https://fnqzahxgqxgibdzkxacf.supabase.co/auth/v1/admin/users"

create_user() {
  local id=$1 email=$2 first=$3 last=$4
  curl -s -X POST "$URL" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    --data-raw "{\"id\":\"$id\",\"email\":\"$email\",\"password\":\"Demo12345\",\"email_confirm\":true,\"user_metadata\":{\"first_name\":\"$first\",\"last_name\":\"$last\"}}" > /dev/null 2>&1
  echo "  Created $first $last ($email)"
}

echo "Creating 28 demo users..."

create_user "10000000-0000-4000-a000-000000000001" "emma.richardson@demo.club" "Emma" "Richardson"
create_user "10000000-0000-4000-a000-000000000002" "oliver.chen@demo.club" "Oliver" "Chen"
create_user "10000000-0000-4000-a000-000000000003" "sophia.patel@demo.club" "Sophia" "Patel"
create_user "10000000-0000-4000-a000-000000000004" "james.whitfield@demo.club" "James" "Whitfield"
create_user "10000000-0000-4000-a000-000000000005" "charlotte.brooks@demo.club" "Charlotte" "Brooks"
create_user "10000000-0000-4000-a000-000000000006" "william.hart@demo.club" "William" "Hart"
create_user "10000000-0000-4000-a000-000000000007" "amelia.thornton@demo.club" "Amelia" "Thornton"
create_user "10000000-0000-4000-a000-000000000008" "george.kingston@demo.club" "George" "Kingston"
create_user "10000000-0000-4000-a000-000000000009" "isabella.wright@demo.club" "Isabella" "Wright"
create_user "10000000-0000-4000-a000-000000000010" "harry.morrison@demo.club" "Harry" "Morrison"
create_user "10000000-0000-4000-a000-000000000011" "mia.cooper@demo.club" "Mia" "Cooper"
create_user "10000000-0000-4000-a000-000000000012" "alexander.reid@demo.club" "Alexander" "Reid"
create_user "10000000-0000-4000-a000-000000000013" "freya.marshall@demo.club" "Freya" "Marshall"
create_user "10000000-0000-4000-a000-000000000014" "benjamin.scott@demo.club" "Benjamin" "Scott"
create_user "10000000-0000-4000-a000-000000000015" "lucy.evans@demo.club" "Lucy" "Evans"
create_user "10000000-0000-4000-a000-000000000016" "daniel.carter@demo.club" "Daniel" "Carter"
create_user "10000000-0000-4000-a000-000000000017" "grace.mitchell@demo.club" "Grace" "Mitchell"
create_user "10000000-0000-4000-a000-000000000018" "thomas.walker@demo.club" "Thomas" "Walker"
create_user "10000000-0000-4000-a000-000000000019" "olivia.hughes@demo.club" "Olivia" "Hughes"
create_user "10000000-0000-4000-a000-000000000020" "samuel.price@demo.club" "Samuel" "Price"
create_user "10000000-0000-4000-a000-000000000021" "ellie.bennett@demo.club" "Ellie" "Bennett"
create_user "10000000-0000-4000-a000-000000000022" "jack.turner@demo.club" "Jack" "Turner"
create_user "10000000-0000-4000-a000-000000000023" "hannah.davies@demo.club" "Hannah" "Davies"
create_user "10000000-0000-4000-a000-000000000024" "oscar.phillips@demo.club" "Oscar" "Phillips"
create_user "10000000-0000-4000-a000-000000000025" "ruby.foster@demo.club" "Ruby" "Foster"
create_user "10000000-0000-4000-a000-000000000026" "archie.collins@demo.club" "Archie" "Collins"
create_user "10000000-0000-4000-a000-000000000027" "isla.morgan@demo.club" "Isla" "Morgan"
create_user "10000000-0000-4000-a000-000000000028" "liam.edwards@demo.club" "Liam" "Edwards"

echo "Done creating users."
