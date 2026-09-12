# vsite — SEO + GEO Strategy

**Goal:** when anyone in Tamil Nadu searches *or asks an AI* for a digital menu,
vsite is the first answer.
**Date:** 10 September 2026 · **Status:** proposed, awaiting review

---

## 0. Read this before anything else ships

Three claims currently on the live site cannot be supported, and two of them are
the kind AI systems and prospects check in seconds. **Fixing these is not
optional housekeeping — it is the precondition for everything below**, because
GEO runs on entity trust, and a debunked claim is worse than no claim.

| Claim | Where | Reality |
|---|---|---|
| **"1,000+ menus live"** | `components/home/Proof.tsx` → `PROOF_STATS.menusLive` | The production database holds **57 sites across 30 owners**, and you told me on 10 Sep they are *"only feedback and testing users"*. |
| **"All 38 districts of Tamil Nadu"** | same | Not supportable at 57 test stores. |
| **"Typical QR menu tool: ₹500–₹1,500/mo"** | `content/seo-pages/data.ts`, the comparison table | **DineCard is ₹99/mo (₹999/yr). MenuScan publishes ₹250 / ₹600 / ₹750 tiers.** Only DineCard is meaningfully cheaper — vsite sits mid-market, not at the top. |

Why this matters more than it looks:

1. **It is the exact opposite of a GEO asset.** AI engines corroborate across
   sources. A pricing table that any model can falsify in one retrieval teaches
   the model your domain is unreliable — and unreliability is sticky.
2. **India's Consumer Protection Act 2019 and the ASCI code** treat unsubstantiated
   quantified claims as misleading advertising. A ₹299 SaaS does not want that fight.
3. **It is unnecessary.** The honest version is *better* marketing (§4).

**Recommendation:** replace with claims that are true today and get stronger as
you sell — "Live in Tamil Nadu since March 2026", "menus in Tamil and English",
"3 minutes from photo to live menu" (verifiable, and your actual edge). Put the
store count back the day it is real.

---

## 1. The honest competitive position

Research, not assumption:

| | vsite | DineCard | MenuScan | Restrofi |
|---|---|---|---|---|
| Price | **₹299/mo** | ₹99/mo · ₹999/yr | ₹250–₹750/mo | ₹699/mo |
| Trial | 7 days | 14 days | 7 days | — |
| AI menu extraction | Yes | Yes ("5 minutes") | — | — |
| Tamil | Yes | 15+ Indian languages | — | — |
| AI food photos | **Yes** | No | No | No |
| **Menu engineering** | **Yes** | No | No | No |
| Bulk import from a photo | **Yes** | Yes | No | — |
| Banners / per-item offers | **Yes** | No | No | — |
| Menu design themes | **Yes** | "Limited" (their word) | No | — |
| Multi-outlet | **Yes** | No | Yes | — |
| Item cap | **None** | — | 100 / 300 | — |
| Ordering | Frozen (coming) | Display-only | Yes | Yes |
| Physical NFC/QR stands | **Yes, posted** | No | No | No |

Verified 10 Sep 2026 against each company's own published pages.

**Only DineCard is meaningfully cheaper, and the gap is narrower than it first
looks** — MenuScan's entry tier is ₹250 and its comparable tier ₹600. So the
positioning problem is one competitor, not the category.

Against DineCard at a third of the price, the argument is not "we are cheap".
It is what ₹299 buys that ₹99 does not, and every line of it is checkable:

- **Menu engineering.** Kasavana–Smith classification with fuzzy scoring, so the
  owner learns which dish to promote, reprice or cut. Neither competitor lists
  any profitability analysis at all. This is the strongest differentiator on the
  list and it is currently invisible in the marketing.
- **AI food photos for every dish.** They extract menu text and leave the
  photography to the restaurant — which is why most menus built on them have no
  pictures.
- **Bulk import that actually scales.** A 200-item menu is minutes of checking,
  not an evening of typing.
- **Banners and one-click per-item offers.** Neither offers them.
- **Design that matches the business.** DineCard's own page lists "limited
  design customization" as a drawback — their words, and a direct validation of
  the theme system.
- **Physical presence.** Weatherproof stands and NFC cards posted out. Software
  companies do not do logistics; that is a moat.
- **You are local.** DineCard is a website. You can stand in the shop.

---

## 2. Why vsite is not ranking — diagnosis

The technical foundation is **fine**: `robots.ts`, `sitemap.ts` (101 URLs), 15
keyword landing pages, 23 blog posts, FAQ + breadcrumb schema, canonical tags.
This is not a crawlability problem. It is four other problems.

**a. The domain is ~6 months old with no off-site authority.**
Nothing below fixes this except time and links. Expect 3–6 months.

**b. Zero city pages.** The sitemap has *no* location landing pages — only one
Chennai *blog post*. "digital menu Chennai", "QR menu Coimbatore", "hotel menu
Madurai" are the highest-intent, lowest-competition queries you have, and the
brief is to cover all of Tamil Nadu. **This is the single biggest gap.**

**c. Zero Tamil-language pages.** Vernacular search in India grows ~3× faster
than English; Tamil voice search 40–60% YoY. You sell to Tamil Nadu in English only.

**d. No comparison pages against the competitors people actually name.** There
is one `vsite-vs-petpooja` post — Petpooja is a POS, not a menu tool. There is
nothing for DineCard or MenuScan. This matters disproportionately for GEO (§3).

**e. No third-party footprint at all.** No G2, no Capterra, no Reddit, no
directory listings. In SaaS recommendation queries studied in 2026, **100% of
the tools ChatGPT recommended had Capterra reviews and 99% had G2 reviews.**
On-site work alone cannot produce an AI recommendation.

---

## 3. GEO: how to become the answer, not just a result

The mechanics differ from SEO and most of the work is *off* your domain.

**How models actually pick a brand.** For a recommendation prompt, the model
synthesises listicles, Reddit threads, review platforms and comparison articles.
A brand named in four of six retrieved sources gets recommended; a brand in one
gets skipped. **Listicles are 21.9% of all AI citations and 40.9% for commercial
queries. 57% of citations for brand evaluations come from reviews and social
proof. ChatGPT's largest non-brand source is Reddit.** Only 11% of domains are
cited by both ChatGPT and Perplexity — presence has to be built per platform.

### The five GEO levers, applied

**1 — AI crawler access.** Add `llms.txt`; keep GPTBot/PerplexityBot/ClaudeBot
explicitly allowed in `robots.ts`. *(Built — §5.)*

**2 — Citable structure.** Models lift self-contained, factual passages. Every
page needs: a direct one-sentence answer under each H2, `FAQPage` JSON-LD (the
highest-impact schema for GEO), comparison **tables** (models quote tables), and
concrete numbers with units and dates. Already partly present — extend to new pages.

**3 — Entity clarity.** One consistent description of what vsite *is*, repeated
across site, schema, and every third-party profile. Ship `Organization` +
`SoftwareApplication` + `Offer` schema with the real ₹299 price. Wikidata entry.

**4 — Freshness.** Perplexity is retrieval-heavy and weights recency. Datelined,
updated content beats evergreen-and-stale. Put visible `Updated: <date>` on pages.

**5 — Third-party authority. This is the lever you are missing entirely.**
In priority order:
   - **Capterra + G2 + SoftwareSuggest + Tracxn** listings. Free. Do this first —
     it is the highest-ROI hour in this whole document.
   - **Get into other people's listicles.** Search "best digital menu India 2026",
     find every ranking listicle, and pitch inclusion. This is what models quote.
   - **Reddit**, honestly: r/india, r/Chennai, r/restaurateur, r/smallbusiness.
     Answer questions as a founder who built the thing. Never astroturf — models
     and moderators both punish it, and it is the one mistake that is unrecoverable.
   - **Local press + YouTube in Tamil.** A founder demo in Tamil is a durable asset
     nobody in this category has.

### Prompts to win, and to track weekly

Track literal answers to: *"best digital menu software India"*, *"QR code menu
Tamil Nadu"*, *"digital menu with Tamil language support"*, *"cheapest QR menu
for a small restaurant India"*, *"digital menu for restaurant chain India"*,
*"தமிழ் டிஜிட்டல் மெனு"*. Log which brands each engine names, monthly.

---

## 4. The content plan

### 4a. City pages — all of Tamil Nadu *(the biggest win)*
One page per district, generated from data, genuinely differentiated (local food
culture, real neighbourhoods, district-specific FAQ). **Not** doorway pages with
a swapped city name — Google penalises those and they read as spam to a human.

Tier 1 (write by hand, deep): Chennai, Coimbatore, Madurai, Trichy, Salem.
Tier 2 (templated, real local detail): the remaining 33 districts.

### 4b. Comparison pages *(the biggest GEO win)*
`/vs/dinecard`, `/vs/menuscan`, `/vs/petpooja`, plus `/best-digital-menu-software-india`
— your own listicle, written fairly, including competitors and saying honestly
where they win. Fair comparisons get cited; hatchet jobs do not.

### 4c. Tamil-language surface
`/ta` — the homepage, pricing and one guide in Tamil. Real translation, not machine.

### 4d. Blog: answer real questions
Shift from generic to specific and local: *"How much does a QR menu cost in
Tamil Nadu?"*, *"GST rules for restaurant menus in India 2026"*, *"How a Madurai
mess cut ₹18,000 of printing"*. One flagship per month beats four thin posts.

---

## 5. What was built in this pass

- **`EnterpriseBand`** on the homepage — the multi-franchise offer, with a
  WhatsApp CTA carrying a pre-filled message (§6).
- **`llms.txt`** — the plain-language brief AI crawlers read. Every number is
  imported from the same constants checkout uses, so it cannot contradict the
  pricing page.
- **`robots.ts`** — ten AI crawlers allowed explicitly, so the intent is on the
  record rather than inherited from the wildcard.
- **13 city pages** at `/digital-menu/<city>`, each carrying local substance
  that is true of that city and false of the others.
- **`/vs/dinecard` and `/vs/menuscan`** — sourced comparisons with a
  *where they win* section that recommends the competitor where that is the
  honest answer.
- **`/best-digital-menu-software-india`** — our own roundup, with `ItemList`
  and `FAQPage` schema.
- **Honesty fix** on `PROOF_STATS` (which propagated to `TrustBar` and
  `FooterCTA`), the competitor pricing table, and three "fastest-growing"
  superlatives.

### Open issue: keyword cannibalisation

`/blog/best-digital-menu-software-india-2026` (published 19 May, covering
Petpooja, DotPe, MakeMyMenu and MenuGen) now targets the same query as the new
`/best-digital-menu-software-india`. Two pages competing for one keyword split
link equity and Google picks one — often the weaker.

**This needs a decision, not a default.** The right fix is to fold the
Petpooja/DotPe research into `competitors.ts`, make the standalone page the one
comprehensive roundup, and 301 the blog post to it. That is a content merge that
deletes a published URL, so it is deliberately left for the owner rather than
done silently.

## 6. The multi-franchise offer, positioned

Two products, one page, no confusion:

- **₹299/month — independent restaurants.** Self-serve, card, live in 3 minutes.
- **Enterprise / multi-franchise — chains and brands.** Custom-designed menus,
  owner dashboard with cross-outlet analytics, custom QR and NFC stands at low
  cost. **Talk to us → WhatsApp.** No price on the page: chains expect a
  conversation, and a number here would anchor the ₹299 buyer wrongly.

Placed directly after `Pricing`, so the reader who has just decided "₹299 is not
me, I have six outlets" is caught at the exact moment of that thought.

---

## 7. Sequence

| When | Do | Why |
|---|---|---|
| **Today** | Fix the three claims | Everything else inherits their credibility |
| **This week** | Capterra, G2, SoftwareSuggest listings | Highest-ROI hour in this document |
| **This week** | Ship enterprise band + llms.txt + city pages | Built, pending review |
| **Weeks 2–4** | 5 Tier-1 city pages, `/vs/dinecard`, own listicle | Ranking + citation surface |
| **Month 2** | `/ta` Tamil surface; Reddit presence; Tamil YouTube demo | Nobody else is there |
| **Ongoing** | Weekly AI-prompt tracking; one flagship post monthly | GEO is measured, not assumed |

**Honest expectation:** a 6-month-old domain does not reach #1 in weeks. City
pages and comparisons can rank in 4–8 weeks because competition is thin. AI
citations respond faster than Google rankings once third-party presence exists —
that is the fastest lever you have, and it is free.

---

**Sources**
- [GEO complete 2026 guide — Enrich Labs](https://www.enrichlabs.ai/blog/generative-engine-optimization-geo-complete-guide-2026)
- [How ChatGPT decides which brands to recommend — UltraScout](https://ultrascout.ai/article/how-chatgpt-decides-which-brands-to-recommend)
- [How ChatGPT chooses brands — Cited](https://www.getcited.in/blog/how-chatgpt-chooses-brands-to-recommend)
- [GEO statistics 2026 — Omnibound](https://www.omnibound.ai/blog/generative-engine-optimization-statistics)
- [AEO & GEO statistics — Instant Press](https://www.instantpress.co/aeo-statistics)
- [Best digital menu app India — DineCard](https://www.dinecard.in/blog/best-digital-menu-app-india)
- [Best QR ordering system 2026 — MenuScan](https://menuscan.in/blog/best-qr-ordering-system-2026)
- [Voice search & Tamil SEO 2026 — DivX](https://www.divxwebstudio.in/blog/blog-voice-search-tamil-seo-2026)
- [Vernacular SEO India — Digiveritaz](https://www.digiveritaz.com/blog/vernacular-seo-india-regional-language-strategy/)
