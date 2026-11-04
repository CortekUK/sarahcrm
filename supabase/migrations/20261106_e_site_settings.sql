-- ============================================================
-- 20261106_e_site_settings.sql
--   Site-wide content settings for the website rebuild (Sarah's brief,
--   28 Oct 2026). Run AFTER 20261106_a_website_rebuild_schema.sql.
--
--   * app_settings 'club_stats' — the ONE editable source for "The Club in
--     numbers" (homepage + About) and every About-page figure/chart:
--     six number tiles, ecosystem extras, sector bars (source line),
--     region bars, company-size bars + note, beyond-the-room tiles and
--     channel counts. Edited at /dashboard/website/club-numbers.
--     Inserted only if missing — an edited value is never overwritten.
--   * Homepage Members' Voices: the three invented testimonials (Alexandra
--     Cole, Marcus Bell, Sophie Linwood) are switched off. Rows are kept
--     (is_active = false), nothing is deleted.
--   * hero_slides alt text for /club-rules and /privacy-policy no longer
--     describes the old stock photos.
--
--   Safe to run twice.
-- ============================================================

insert into public.app_settings (key, value)
values ('club_stats', $cs${
  "numbers": [
    {
      "value": "7,000+",
      "label": "Profiled business and HNW contacts"
    },
    {
      "value": "£18m",
      "label": "In business converted through our referrals"
    },
    {
      "value": "16,300+",
      "label": "Engaged followers across The Club and founder channels"
    },
    {
      "value": "200",
      "label": "Events delivered, from ten-guest round tables to 300-guest showcases"
    },
    {
      "value": "50+",
      "label": "Events a year across five programmes, UK and overseas"
    },
    {
      "value": "7 years",
      "label": "Building the network"
    }
  ],
  "ecosystem": [
    {
      "value": "5",
      "label": "Event series"
    },
    {
      "value": "6",
      "label": "UK cities + Europe"
    },
    {
      "value": "£1m–£100m+",
      "label": "Member turnover"
    }
  ],
  "sectors": [
    {
      "label": "Hospitality, restaurants & leisure",
      "pct": 22.7
    },
    {
      "label": "Financial services, wealth & investment",
      "pct": 13.3
    },
    {
      "label": "Retail, luxury & fashion",
      "pct": 10.4
    },
    {
      "label": "Legal & professional services",
      "pct": 9.9
    },
    {
      "label": "Marketing, media, PR & creative",
      "pct": 9.7
    },
    {
      "label": "Property, construction & development",
      "pct": 8.9
    },
    {
      "label": "Technology, software & IT",
      "pct": 7.1
    },
    {
      "label": "Sport, wellness & health",
      "pct": 6
    },
    {
      "label": "Other sectors",
      "pct": 5.9
    },
    {
      "label": "Education, public sector & non-profit",
      "pct": 2.8
    },
    {
      "label": "Automotive & motor",
      "pct": 1.7
    },
    {
      "label": "Manufacturing & industrial",
      "pct": 1.6
    }
  ],
  "sectors_source": "The Club CRM, September 2026",
  "regions": [
    {
      "label": "North West",
      "pct": 38
    },
    {
      "label": "Yorkshire",
      "pct": 19
    },
    {
      "label": "London & South East",
      "pct": 19
    },
    {
      "label": "Rest of UK",
      "pct": 23
    },
    {
      "label": "International",
      "pct": 1
    }
  ],
  "company_size": [
    {
      "label": "2–10",
      "pct": 22
    },
    {
      "label": "11–50",
      "pct": 26
    },
    {
      "label": "51–200",
      "pct": 17
    },
    {
      "label": "201–1,000",
      "pct": 17
    },
    {
      "label": "1,000+",
      "pct": 18
    }
  ],
  "company_size_note": "Two thirds of the database is founder-led or owner-managed: the decision maker is in the room.",
  "demographics_stamp": "Sept 2026",
  "beyond": [
    {
      "value": "16,300+",
      "label": "Combined following across The Club and founder channels"
    },
    {
      "value": "98,000",
      "label": "Instagram views in 90 days, from 12,400 individual viewers"
    },
    {
      "value": "7,000+",
      "label": "Contacts in the email database, segmented and profiled"
    },
    {
      "value": "2,700+",
      "label": "Profile visits in 90 days, with 2,200+ direct interactions"
    }
  ],
  "channels": [
    {
      "label": "LinkedIn",
      "value": "6,451"
    },
    {
      "label": "Instagram",
      "value": "6,143"
    },
    {
      "label": "Facebook",
      "value": "3,226"
    },
    {
      "label": "TikTok",
      "value": "388"
    }
  ],
  "audience_notes": [
    "64.5% women · 35.5% men",
    "64% aged 35–54 · 71% UK"
  ]
}$cs$::jsonb)
on conflict (key) do nothing;

update public.testimonials
   set is_active = false
 where is_active = true
   and person_name in ('Alexandra Cole', 'Marcus Bell', 'Sophie Linwood');

-- Hero alt text: two rows still describe the old stock photos (a letter on a
-- desk) rather than The Club's own event photography now uploaded there.
update public.hero_slides
   set alt_text = 'An evening at The Club'
 where page_slug in ('club-rules', 'privacy-policy')
   and alt_text in ('A handwritten letter on a wooden desk', 'A quiet desk with a sealed letter');
