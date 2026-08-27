# Vsite Menu Engineering Algorithm
## Production Engineering Reference Document

**Version:** 1.0  
**Product:** Vsite.in — AI Menu Sales Executive  
**Audience:** Engineering team (backend, frontend, data)  
**Purpose:** Full specification of the Phase 0 menu ranking and classification pipeline  

---

## Executive Summary

The Vsite Menu Engineering Algorithm is a deterministic, multi-layer scoring and classification pipeline that transforms raw restaurant menu data into a ranked, badged, and display-ready output for the customer-facing digital menu. It is grounded in 40+ years of academic research in hospitality menu engineering, extended with modern multi-criteria decision science and fuzzy logic.

The pipeline has six layers. Each layer takes outputs from the previous layer as inputs and produces richer outputs. The final output is a fully ranked item list with display instructions: position, badge, visibility, upsell eligibility, and offer trigger status. No machine learning or GPU compute is required for Phase 0. The entire system runs in Python or TypeScript on a standard server with a Supabase PostgreSQL backend.

---

## Part 1 — Formula Definitions

This section defines every mathematical formula used in the pipeline, by inventor name, with derivation, example calculation, and purpose.

---

### 1.1 Contribution Margin — Kasavana & Smith (1982)

**Inventor:** Michael Kasavana and Donald Smith, Michigan State University, published in *Menu Engineering: A Practical Guide to Menu Analysis* (1982).

**Purpose:** Measures the actual rupee profit generated each time an item is sold. It replaces food cost percentage as the primary profitability metric because it captures absolute profit rather than a ratio.

**Formula:**

\[
CM_i = P_i - FC_i
\]

Where:
- \(CM_i\) = Contribution Margin of item \(i\) (in currency units, e.g. INR)
- \(P_i\) = Selling price of item \(i\) (excluding tax)
- \(FC_i\) = Direct food cost per portion of item \(i\)

**Why not use food cost percentage?** Consider two items:
- Item A: Price ₹50, Food Cost ₹20 → Food Cost % = 40%, CM = ₹30
- Item B: Price ₹200, Food Cost ₹100 → Food Cost % = 50%, CM = ₹100

Miller's model (1980) would call Item A better because it has a lower food cost percentage. Kasavana-Smith correctly identifies Item B as more profitable because it contributes ₹100 per sale versus ₹30.

**Example calculation:**

| Item | Price (₹) | Food Cost (₹) | CM (₹) |
|------|-----------|----------------|---------|
| Chicken Biryani | 220 | 135 | 85 |
| Cold Coffee | 90 | 48 | 42 |
| Masala Dosa | 60 | 32 | 28 |
| Gulab Jamun | 55 | 18 | 37 |

**Engineering input:** `selling_price` (DECIMAL), `food_cost_per_portion` (DECIMAL)  
**Engineering output:** `cm` (DECIMAL, stored per item, recalculated when either input changes)

---

### 1.2 Sales Mix Percentage — Kasavana & Smith (1982)

**Purpose:** Measures the popularity of an item relative to its category. Not total volume — it is a normalised proportion so items in large and small categories can be compared fairly.

**Formula:**

\[
SM_i = \frac{Q_i}{\sum_{j=1}^{n} Q_j} \times 100
\]

Where:
- \(SM_i\) = Sales Mix % of item \(i\) in its category
- \(Q_i\) = Quantity sold of item \(i\) in the analysis window (default: last 30 days)
- \(n\) = Total number of items in the same category
- \(\sum_{j=1}^{n} Q_j\) = Total units sold across all items in the category

**Important:** Sales Mix % is computed **within category**, not across the full menu. A beverage competing against other beverages for its sales mix, not against rice dishes.

**Example calculation** (Mains category, 30-day window):

| Item | Units Sold | SM% |
|------|------------|-----|
| Chicken Biryani | 340 | 34.0% |
| Mutton Biryani | 220 | 22.0% |
| Paneer Curry | 185 | 18.5% |
| Dal Tadka | 150 | 15.0% |
| Egg Curry | 105 | 10.5% |
| **Total** | **1000** | **100%** |

**Engineering input:** `units_sold` per item per window, `category_id`  
**Engineering output:** `sales_mix_pct` (DECIMAL, computed and stored daily via cron)

---

### 1.3 Popularity Threshold — Kasavana & Smith (1982), refined by AHLEI (2026)

**Purpose:** Defines the dividing line between "high popularity" and "low popularity." This determines the left/right axis of the classification matrix.

**Original Kasavana-Smith formula:**

\[
PT = \frac{100}{n} \times 0.80
\]

**AHLEI-revised formula (2026):**

\[
PT = \frac{100}{n} \times 0.70
\]

Where:
- \(PT\) = Popularity Threshold (in %)
- \(n\) = Number of items in the category
- `0.70` (AHLEI) vs `0.80` (original): AHLEI's lower multiplier is preferred for SMB menus with fewer items, because 0.80 produces too many "low popularity" classifications in short menus of 5–8 items.

**Why the multiplier matters:** Without a multiplier, the threshold is exactly the average — meaning exactly half the items will always be "popular" and half "unpopular," regardless of actual performance variance. The multiplier sets the bar below the mean, ensuring that genuinely strong performers are rewarded.

**Example** (n = 5 items in Mains):
\[ PT = \frac{100}{5} \times 0.70 = 20 \times 0.70 = 14\% \]

Any item above 14% SM% is high popularity. Any item below is low popularity.

From the example above: Chicken Biryani (34%), Mutton Biryani (22%), Paneer Curry (18.5%), Dal Tadka (15%) → all **high popularity**. Egg Curry (10.5%) → **low popularity**.

**Engineering input:** `n` (item count per category)  
**Engineering output:** `popularity_threshold` (DECIMAL, computed per category per window)

---

### 1.4 Profitability Threshold — Kasavana & Smith (1982)

**Purpose:** Defines the dividing line between "high profitability" and "low profitability." This is the up/down axis of the classification matrix.

**Formula:**

\[
\overline{CM} = \frac{\sum_{i=1}^{n} CM_i}{n}
\]

Where:
- \(\overline{CM}\) = Average Contribution Margin (the profitability threshold)
- \(CM_i\) = Contribution Margin of item \(i\)
- \(n\) = Number of items in the category

Any item with \(CM_i > \overline{CM}\) is "high profitability." Any item with \(CM_i \leq \overline{CM}\) is "low profitability."

**Example** (Mains category):

\[ \overline{CM} = \frac{85 + 72 + 60 + 55 + 48}{5} = \frac{320}{5} = ₹64 \]

| Item | CM (₹) | vs Threshold (₹64) | Profitability |
|------|---------|---------------------|---------------|
| Chicken Biryani | 85 | +21 | High |
| Mutton Biryani | 72 | +8 | High |
| Paneer Curry | 60 | -4 | Low |
| Dal Tadka | 55 | -9 | Low |
| Egg Curry | 48 | -16 | Low |

**Engineering input:** `cm` per item, `category_id`  
**Engineering output:** `cm_threshold` (DECIMAL, computed per category per window)

---

### 1.5 Prime Value Score — Pavesic (1983)

**Inventor:** David Pavesic, Georgia State University, published in *Cost/Margin Analysis: A Third Approach to Menu Pricing and Design* (1983).

**Purpose:** A single-axis composite score that combines food cost percentage and contribution margin into one number. Used as a secondary signal in the weighted scoring layer.

**Formula:**

\[
PV_i = FC\%_i \times CM_i
\]

Where:
- \(PV_i\) = Prime Value score of item \(i\) (lower is better — low cost ratio combined with high margin)
- \(FC\%_i\) = Food Cost Percentage \(= \frac{FC_i}{P_i} \times 100\)
- \(CM_i\) = Contribution Margin of item \(i\)

**Interpretation:** Items with low food cost % AND high CM score lowest on Prime Value (i.e., they are the most efficient items). Items with high food cost % AND high CM score highest (high volume but expensive to make). This index is used in Vsite to identify Plowhorse items that could become Stars if food cost is reduced.

**Example:**

| Item | FC% | CM (₹) | Prime Value |
|------|-----|---------|-------------|
| Chicken Biryani | 61.4% | 85 | 52.2 |
| Cold Coffee | 53.3% | 42 | 22.4 |
| Gulab Jamun | 32.7% | 37 | 12.1 |

Gulab Jamun has the best Prime Value (12.1) — low cost ratio, still generates decent margin. This makes it a candidate for bundling or promotion even though its raw CM is lower than Chicken Biryani.

**Engineering input:** `food_cost_pct` (computed from FC/price), `cm`  
**Engineering output:** `prime_value` (DECIMAL)

---

### 1.6 Labor-Inclusive Contribution Margin — LeBruto, Quain & Ashley (1995)

**Inventors:** Stephen LeBruto, William Quain, and Robert Ashley, published in *Menu Engineering: An Approach for the 1990s* (1995).

**Purpose:** Corrects Kasavana-Smith's CM by adding direct labour cost per item. Items with long preparation times may look like Stars but are actually Plowhorses when labour is counted.

**Formula:**

\[
LCM_i = P_i - FC_i - LC_i
\]

Where:
- \(LCM_i\) = Labour-inclusive Contribution Margin
- \(LC_i\) = Direct labour cost per portion = `prep_time_minutes × kitchen_wage_per_minute`

**Simplified version for Vsite SMB (Phase 0):**

Since most SMB owners cannot track prep time precisely, a **preparation complexity tier** (PCT) approximates labour cost:

\[
LC_i^{approx} = PCT_i \times W_{base}
\]

Where:
- \(PCT_i \in \{1, 2, 3, 4\}\) = Preparation complexity assigned by owner (1 = heat and serve, 4 = made-from-scratch complex)
- \(W_{base}\) = Base labour cost per complexity unit = kitchen staff total monthly cost ÷ (working hours × 60) × 5 minutes per tier

**Example** (kitchen wage = ₹80/hour = ₹1.33/min; 5 min per complexity tier):

| Item | CM (₹) | PCT | LC approx (₹) | LCM (₹) |
|------|---------|-----|----------------|---------|
| Chicken Biryani | 85 | 4 | 26.6 | 58.4 |
| Cold Coffee | 42 | 1 | 6.6 | 35.4 |
| Gulab Jamun | 37 | 1 | 6.6 | 30.4 |

Chicken Biryani drops from ₹85 to ₹58.4 true contribution. This does not change its Star status in this example, but in restaurants with high kitchen wages it can cause reclassification. The full LCM is a Pro tier feature in Vsite.

**Engineering input:** `cm`, `prep_complexity_tier` (INT 1–4), `kitchen_wage_per_hour` (restaurant setting)  
**Engineering output:** `lcm` (DECIMAL)

---

### 1.7 Activity-Based Contribution Margin — Linassi, Alberton & Marinho (2016)

**Inventors:** Rodrigo Linassi, Anete Alberton, and Sidnei Vieira Marinho, published in *International Journal of Contemporary Hospitality Management*, Vol. 28, Issue 7 (2016).

**Purpose:** The most accurate profitability measure. Extends LCM by adding traceable overhead (packaging, utilities, portion of equipment wear). Research found that 20–30% of items change quadrant classification when switching from CM to ABC-CM.

**Formula:**

\[
ABCCM_i = P_i - FC_i - LC_i - OH_i
\]

Where:
- \(OH_i\) = Traceable overhead per portion (packaging cost + gas/electricity proportion traceable to item + disposable garnishes)

**Key rule:** Only include costs that are **directly traceable to the specific item**. Fixed costs (rent, salaried staff) are excluded. A biryani served in a takeaway container adds ₹4–6 packaging overhead that a plated dish does not. This difference matters at scale.

**Example:**

| Item | CM (₹) | LC (₹) | OH (₹) | ABC-CM (₹) |
|------|---------|--------|---------|------------|
| Chicken Biryani (takeaway) | 85 | 26.6 | 8.5 | 49.9 |
| Cold Coffee | 42 | 6.6 | 2.0 | 33.4 |
| Masala Dosa (plated) | 28 | 13.3 | 0.5 | 14.2 |

**Engineering input:** `cm`, `lc`, `packaging_cost`, `utility_cost_per_item`  
**Engineering output:** `abc_cm` (DECIMAL, Pro tier only)

---

### 1.8 Weighted Multi-Signal Score — MCDS / Pavesic extended (2024)

**Framework:** Multi-Criteria Decision Support (MCDS), formalised in *ScienceDirect, International Journal of Hospitality Management* (2024), building on Pavesic (1983).

**Purpose:** Aggregates multiple signals (popularity, profitability, velocity, social proof, offer status) into a single continuous ranking score. Replaces binary quadrant classification as the primary sort key.

**Formula:**

\[
S_i = \sum_{k=1}^{K} w_k \cdot \hat{x}_{ik}
\]

Where:
- \(S_i\) = Final ranking score for item \(i\) (range: 0 to 1)
- \(K\) = Number of signals
- \(w_k\) = Weight of signal \(k\), where \(\sum_{k=1}^{K} w_k = 1\)
- \(\hat{x}_{ik}\) = Min-max normalised value of signal \(k\) for item \(i\)

**Min-max normalisation formula:**

\[
\hat{x}_{ik} = \frac{x_{ik} - \min_k}{\max_k - \min_k}
\]

**Vsite Phase 0 signals and weights:**

| Signal (k) | Raw value \(x_{ik}\) | Min | Max | Weight \(w_k\) | Rationale |
|---|---|---|---|---|---|
| star_rating | Owner input (1–4) | 1 | 4 | 0.50 | Strategic intent of owner |
| profit_tier | Owner input (1–4) | 1 | 4 | 0.35 | Profitability proxy before real cost data |
| orders_today | Live DB count | 0 | 50 (cap) | 0.08 | Real-time demand signal |
| like_count | Consumer interactions | 0 | 200 (cap) | 0.04 | Social proof signal |
| offer_active | Boolean (0 or 1) | 0 | 1 | 0.03 | Promotional boost |

**Full scoring example:**

Chicken Biryani: star=4, profit_tier=4, orders_today=34, likes=142, offer_active=False
- \(\hat{x}_{star} = (4-1)/(4-1) = 1.0\)
- \(\hat{x}_{profit} = (4-1)/(4-1) = 1.0\)
- \(\hat{x}_{orders} = (34-0)/(50-0) = 0.68\)
- \(\hat{x}_{likes} = (142-0)/(200-0) = 0.71\)
- \(\hat{x}_{offer} = 0\)
- \(S = 0.50(1.0) + 0.35(1.0) + 0.08(0.68) + 0.04(0.71) + 0.03(0) = 0.50 + 0.35 + 0.054 + 0.028 + 0 = \mathbf{0.932}\)

Cold Coffee: star=2, profit_tier=3, orders_today=8, likes=55, offer_active=True
- \(\hat{x}_{star} = (2-1)/3 = 0.333\)
- \(\hat{x}_{profit} = (3-1)/3 = 0.667\)
- \(\hat{x}_{orders} = 8/50 = 0.16\)
- \(\hat{x}_{likes} = 55/200 = 0.275\)
- \(\hat{x}_{offer} = 1.0\)
- \(S = 0.50(0.333) + 0.35(0.667) + 0.08(0.16) + 0.04(0.275) + 0.03(1.0) = 0.167 + 0.233 + 0.013 + 0.011 + 0.03 = \mathbf{0.454}\)

**Engineering input:** `star_rating`, `profit_tier`, `orders_today`, `like_count`, `offer_active`  
**Engineering output:** `ranking_score` (DECIMAL 0–1, recomputed every 5 minutes)

---

### 1.9 Fuzzy Membership Function — Tom & Annaraud (2017)

**Inventors:** Reza Tom and Katerina Annaraud, published at *IEEE International Conference on Fuzzy Systems (FUZZ-IEEE 2017)*.

**Purpose:** Replaces hard binary thresholds (above/below CM average, above/below popularity threshold) with continuous membership degrees. Prevents correct Star items near the boundary from being misclassified as Dogs due to small data fluctuations.

**Trapezoidal membership function:**

\[
\mu(x) =
\begin{cases}
0 & \text{if } x < a \\
\frac{x - a}{b - a} & \text{if } a \leq x < b \\
1 & \text{if } b \leq x \leq c \\
\frac{d - x}{d - c} & \text{if } c < x \leq d \\
0 & \text{if } x > d
\end{cases}
\]

Where a, b, c, d are set from the distribution of the data:
- \(a\) = 5th percentile of the signal across all items in category
- \(b\) = 25th percentile
- \(c\) = 75th percentile
- \(d\) = 95th percentile

**How to apply it in Vsite:**

For each item, compute two fuzzy memberships:
1. \(\mu_{pop}(SM_i)\) = fuzzy popularity membership (using SM% distribution)
2. \(\mu_{profit}(CM_i)\) = fuzzy profitability membership (using CM distribution)

**Fuzzy classification rules** (9-zone model vs original 4-zone):

| \(\mu_{pop}\) | \(\mu_{profit}\) | Zone | Label | Action |
|---|---|---|---|---|
| > 0.7 | > 0.7 | Zone 1 | Confident Star | Bestseller badge, top position |
| 0.4–0.7 | > 0.7 | Zone 2 | Near-Star | Promote, watch popularity |
| < 0.4 | > 0.7 | Zone 3 | Confident Puzzle | Chef's Pick badge, offer trigger |
| > 0.7 | 0.4–0.7 | Zone 4 | Rising Plowhorse | Reposition, test price lift |
| 0.4–0.7 | 0.4–0.7 | Zone 5 | Marginal | A/B test |
| < 0.4 | 0.4–0.7 | Zone 6 | Weak Puzzle | Requires description rewrite |
| > 0.7 | < 0.4 | Zone 7 | Confident Plowhorse | Cost reduction target |
| 0.4–0.7 | < 0.4 | Zone 8 | Near-Dog | Low priority, monitor |
| < 0.4 | < 0.4 | Zone 9 | Confident Dog | Hide, consider removing |

**Example:**

Category CM distribution: min=28, p25=38, p75=74, p95=89

For Chicken Biryani (CM = 85):
- b=38, c=74, so 85 > d candidate... 85 is between p75 and p95
- \(\mu_{profit}(85) = (95-85)/(95-74) = 10/21 = 0.48\)
- This is a "near high" profitability — Chicken Biryani is Zone 4 or 2, not a confident Zone 1 Star in this specific category distribution.

This output feeds into the classification system, not the ranking score. Ranking is driven by the MCDS score (1.8). Fuzzy logic drives the badge and zone label only.

**Engineering input:** `cm` and `sm_pct` per item; full category distribution vectors for percentile calculation  
**Engineering output:** `fuzzy_pop` (DECIMAL 0–1), `fuzzy_profit` (DECIMAL 0–1), `zone_id` (INT 1–9), `zone_label` (VARCHAR)

---

### 1.10 Dynamic Offer Trigger Formula — IJPREMS (2025)

**Source:** *AI-Driven Dynamic Food Menu Pricing for Restaurants Based on Demand and Weather*, IJPREMS (2025).

**Purpose:** Determines when and by how much to apply a promotional discount to a Puzzle item to stimulate demand. Applied downward only — prices never increase toward customers.

**Demand Index formula:**

\[
DI_{t} = \frac{R_{t}}{R_{avg,t}}
\]

Where:
- \(DI_t\) = Demand Index at current time block \(t\)
- \(R_t\) = Current order rate (orders per hour at this time block today)
- \(R_{avg,t}\) = Historical average order rate for this same time block (trailing 30 days)

**Offer trigger rule:**

\[
\text{trigger\_offer} = \begin{cases} \text{True} & \text{if } DI_t < 0.70 \\ \text{False} & \text{otherwise} \end{cases}
\]

**Offer discount formula** (applied to Puzzle items only):

\[
P_{offer,i} = P_i \times (1 - \delta)
\]

Where \(\delta\) is the discount rate, calculated as:

\[
\delta = \alpha \times (1 - DI_t)
\]

Where \(\alpha\) = max discount cap (default: 0.15 = 15% maximum discount). If DI = 0.50, discount = 0.15 × (1 − 0.50) = 7.5%.

**Hard constraint:** Offer price must never result in negative CM:

\[
P_{offer,i} \geq FC_i + \epsilon
\]

Where \(\epsilon\) = minimum acceptable margin buffer (default: ₹10).

**Engineering input:** `current_order_rate`, `historical_avg_order_rate`, `item_cm`, `item_price`  
**Engineering output:** `offer_active` (BOOLEAN), `offer_price` (DECIMAL), `discount_pct` (DECIMAL)

---

## Part 2 — The Pipeline Layers

The six layers execute sequentially for every menu rendering request. Layers 1 and 2 run on a scheduled basis (nightly or on-demand). Layers 3 through 6 execute at real-time request time.

---

### Layer 0: Data Ingestion and Storage

**What it is:** The foundation layer. Collects and stores the raw inputs that all subsequent layers depend on. No computation occurs here — only structured storage and validation.

**Introduction and context:** Every formula in the pipeline requires clean, validated inputs. Layer 0 defines the data contract between the restaurant owner's input interface and the algorithm engine. Errors at this layer propagate through all six layers. Input validation is therefore non-negotiable.

**Required Supabase schema:**

```sql
CREATE TABLE menu_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id         UUID NOT NULL REFERENCES restaurants(id),
  category_id           UUID NOT NULL REFERENCES categories(id),
  name                  VARCHAR(120) NOT NULL,
  description           TEXT,
  selling_price         DECIMAL(10,2) NOT NULL CHECK (selling_price > 0),
  food_cost             DECIMAL(10,2) NOT NULL CHECK (food_cost >= 0),
  star_rating           INT NOT NULL CHECK (star_rating BETWEEN 1 AND 4),
  profit_tier           INT NOT NULL CHECK (profit_tier BETWEEN 1 AND 4),
  prep_complexity_tier  INT DEFAULT 2 CHECK (prep_complexity_tier BETWEEN 1 AND 4),
  packaging_cost        DECIMAL(8,2) DEFAULT 0,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE menu_item_stats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID REFERENCES menu_items(id),
  window_date      DATE NOT NULL,
  units_sold       INT DEFAULT 0,
  like_count       INT DEFAULT 0,
  view_count       INT DEFAULT 0,
  orders_today     INT DEFAULT 0,
  UNIQUE(item_id, window_date)
);
```

**Inputs required from restaurant owner:**
- `selling_price`: Actual menu price excluding tax
- `food_cost`: Direct ingredient cost per portion (owner estimate acceptable for Phase 0)
- `star_rating`: Strategic priority (4 = top priority Star items owner wants to push)
- `profit_tier`: Owner's own assessment of profitability (4 = high margin)
- `prep_complexity_tier`: How complex is preparation (1 = heat-serve, 4 = from scratch)

**Inputs collected automatically by system:**
- `units_sold`: From order events (POS integration or manual order entry)
- `like_count`: From customer like button interactions
- `view_count`: From menu item impression events
- `orders_today`: From real-time order stream, reset at midnight via `pg_cron`

**Validation rules:**
- `food_cost` must be < `selling_price` (reject negative margin items)
- `star_rating` and `profit_tier` must be integers 1–4 (enforce at API layer)
- `selling_price` changes trigger full re-ranking pipeline

**Output to Layer 1:** Clean, validated item record with all required fields populated.

---

### Layer 1: Profitability and Popularity Computation

**What it is:** Executes the Kasavana-Smith formulas to compute Contribution Margin, Sales Mix %, and the category-level thresholds for profitability and popularity.

**Introduction and context:** This layer transforms raw price and volume data into normalised performance metrics. It operates at the category level — all calculations are scoped to items within the same menu category. This is the most critical layer; every classification and ranking decision downstream depends on its outputs being accurate and up-to-date.

**Schedule:** Recalculated nightly at 02:00 local restaurant time via `pg_cron`. Also triggered on-demand when an owner updates a price or food cost.

**Step-by-step execution:**

**Step 1: Calculate CM for each item**

\[
CM_i = P_i - FC_i
\]

**Step 2: Calculate units sold over window (default: 30 days)**

Pull from `menu_item_stats` table, sum `units_sold` over `window_date` range.

**Step 3: Calculate Sales Mix % within category**

\[
SM_i = \frac{Q_i}{\sum_{j \in \text{category}} Q_j} \times 100
\]

**Step 4: Calculate Popularity Threshold per category**

\[
PT_{cat} = \frac{100}{n_{cat}} \times 0.70
\]

**Step 5: Calculate Profitability Threshold per category**

\[
\overline{CM}_{cat} = \frac{\sum_{i \in cat} CM_i}{n_{cat}}
\]

**Full example — Mains category (5 items):**

| Item | Price | FC | CM | Units | SM% | Pop Threshold (14%) | CM Threshold (₹64) |
|------|-------|----|----|-------|-----|---------------------|---------------------|
| Chicken Biryani | 220 | 135 | 85 | 340 | 34.0% | ✅ Above | ✅ Above |
| Mutton Biryani | 195 | 123 | 72 | 220 | 22.0% | ✅ Above | ✅ Above |
| Paneer Curry | 160 | 100 | 60 | 185 | 18.5% | ✅ Above | ❌ Below |
| Dal Tadka | 130 | 75 | 55 | 150 | 15.0% | ✅ Above | ❌ Below |
| Egg Curry | 110 | 62 | 48 | 105 | 10.5% | ❌ Below | ❌ Below |

**Required inputs:** All Layer 0 outputs + `window_date_start`, `window_date_end`  
**Outputs:**

```json
{
  "item_id": "abc-123",
  "cm": 85.00,
  "sm_pct": 34.0,
  "pop_threshold": 14.0,
  "cm_threshold": 64.0,
  "is_pop_high": true,
  "is_cm_high": true
}
```

---

### Layer 2: Item Classification

**What it is:** Applies Kasavana-Smith quadrant classification and Tom & Annaraud fuzzy membership to assign each item a label and zone.

**Introduction and context:** Classification determines what action the system recommends for each item and what badge it receives on the customer menu. The fuzzy model from Tom & Annaraud (2017) extends the original 4-zone Kasavana-Smith model into 9 zones, resolving the harsh boundary problem that causes items near the threshold to be misclassified. Both the binary label and the fuzzy zone are computed here — they serve different purposes downstream.

**Sub-step A: Binary Kasavana-Smith Classification**

```
if   is_pop_high AND is_cm_high  → STAR
elif is_pop_high AND NOT is_cm_high → PLOWHORSE
elif NOT is_pop_high AND is_cm_high → PUZZLE
else                                → DOG
```

**Sub-step B: Fuzzy Membership Computation (Tom & Annaraud)**

For each item in the category, compute percentiles of the SM% and CM distributions:

```python
import numpy as np

def trapezoid_membership(x, a, b, c, d):
    if x < a or x > d: return 0.0
    elif a <= x < b:   return (x - a) / (b - a)
    elif b <= x <= c:  return 1.0
    elif c < x <= d:   return (d - x) / (d - c)

def compute_fuzzy(value, all_values):
    a = np.percentile(all_values, 5)
    b = np.percentile(all_values, 25)
    c = np.percentile(all_values, 75)
    d = np.percentile(all_values, 95)
    return trapezoid_membership(value, a, b, c, d)
```

**Sub-step C: Zone Assignment**

| Fuzzy Pop | Fuzzy Profit | Zone | Label | Customer Badge | Owner Recommendation |
|---|---|---|---|---|---|
| ≥ 0.7 | ≥ 0.7 | 1 | Confident Star | "Bestseller" | Protect — do not discount |
| 0.4–0.7 | ≥ 0.7 | 2 | Near-Star | "Trending" | Watch popularity, test visibility |
| < 0.4 | ≥ 0.7 | 3 | Confident Puzzle | "Chef's Pick" | Promote — place higher, offer discount |
| ≥ 0.7 | 0.4–0.7 | 4 | Rising Plowhorse | "Popular" | Cost reduction target |
| 0.4–0.7 | 0.4–0.7 | 5 | Marginal | none | A/B test price and placement |
| < 0.4 | 0.4–0.7 | 6 | Weak Puzzle | none | Rewrite description |
| ≥ 0.7 | < 0.4 | 7 | Confident Plowhorse | "Popular" | Bundle with high-CM item |
| 0.4–0.7 | < 0.4 | 8 | Near-Dog | none | Monitor, consider removal |
| < 0.4 | < 0.4 | 9 | Confident Dog | none | Hide or remove |

**Required inputs:** Layer 1 outputs (cm, sm_pct, category distributions)  
**Outputs:**

```json
{
  "item_id": "abc-123",
  "ks_class": "STAR",
  "fuzzy_pop": 0.94,
  "fuzzy_profit": 0.81,
  "zone_id": 1,
  "zone_label": "Confident Star",
  "badge": "Bestseller",
  "owner_recommendation": "Protect — do not discount"
}
```

---

### Layer 3: Weighted Ranking Score

**What it is:** Computes the MCDS composite score (Section 1.8) using live real-time signals. This score is the primary sort key for the customer-facing menu display.

**Introduction and context:** Classification (Layer 2) is a diagnostic tool for the owner. Ranking (Layer 3) is the operational output for the customer. They are deliberately separate because the business goal of the display is not the same as the analytical goal of classification. A Plowhorse might still be ranked position 2 because of extremely high volume today, even though it is marked for cost reduction in the owner dashboard.

**Execution frequency:** Recomputed every 5 minutes (Redis-cached between refreshes).

**Computation:**

```python
def score_item(star, profit_tier, orders_today, likes, offer_active):
    def norm(val, mn, mx): return min(max((val - mn) / (mx - mn), 0), 1)
    
    return (
        norm(star, 1, 4)           * 0.50 +
        norm(profit_tier, 1, 4)    * 0.35 +
        norm(orders_today, 0, 50)  * 0.08 +
        norm(likes, 0, 200)        * 0.04 +
        (1.0 if offer_active else 0.0) * 0.03
    )

def rank_menu(items):
    scored = [(item, score_item(**item['signals'])) for item in items]
    return sorted(scored, key=lambda x: -x[1])
```

**Hard overrides (applied after score):**

| Condition | Override action |
|---|---|
| `ks_class == "DOG"` AND `orders_today == 0` | Force to hidden — score irrelevant |
| `ks_class == "STAR"` | Add rank_boost: push to top 3 within category |
| `offer_active == True` | Cannot be a DOG (offer trigger excluded for Dog items) |
| `is_active == False` | Force hidden regardless of score |

**Required inputs:** Layer 2 outputs + live `orders_today`, `like_count`, `offer_active`  
**Outputs:**

```json
{
  "item_id": "abc-123",
  "ranking_score": 0.932,
  "display_position": 1,
  "is_visible": true,
  "rank_override": null
}
```

---

### Layer 4: Offer and Countdown Trigger

**What it is:** Applies the IJPREMS demand index formula to determine whether any Puzzle items should receive a live countdown offer to boost their order rate.

**Introduction and context:** Puzzle items (high profit, low popularity) are the most important items to convert. They already generate strong margin when sold — the system just needs to push customers toward them. The demand index formula triggers offers when the restaurant is quiet (DI < 0.70), specifically targeting Puzzle items that the customer menu should surface with urgency.

**Execution frequency:** Checked every 15 minutes. Offer windows run for 45–90 minutes by default.

**Step-by-step:**

**Step 1: Calculate current Demand Index**

\[
DI_t = \frac{R_t}{R_{avg,t}}
\]

`R_t` = orders in the current hour. `R_avg,t` = average orders in this same hour over the last 30 days.

**Step 2: Check offer trigger condition**

```python
TRIGGER_THRESHOLD = 0.70
MAX_DISCOUNT_RATE = 0.15

if DI < TRIGGER_THRESHOLD:
    # Find all PUZZLE items with no active offer
    puzzle_items = get_items_by_zone([3, 6])  # Zones 3 and 6
    for item in puzzle_items:
        discount = MAX_DISCOUNT_RATE * (1 - DI)
        offer_price = item['price'] * (1 - discount)
        # Hard floor: offer price must yield at least ₹10 margin
        if offer_price - item['food_cost'] >= 10:
            activate_offer(item['id'], offer_price, duration_minutes=60)
```

**Step 3: Countdown timer**

Once an offer is activated, the countdown is managed by the frontend using the stored `offer_end_timestamp`. The backend only stores the end time; the frontend computes remaining seconds on each render.

**Required inputs:** `orders_today_by_hour` (time-series), `historical_hourly_avg`, Layer 2 zone data, `food_cost`  
**Outputs:**

```json
{
  "item_id": "xyz-456",
  "offer_active": true,
  "offer_price": 76.50,
  "original_price": 90.00,
  "discount_pct": 15.0,
  "offer_end_timestamp": "2026-04-26T21:00:00+05:30",
  "seconds_remaining": 2847
}
```

---

### Layer 5: Display Instruction Assembly

**What it is:** Aggregates all previous layer outputs into a single display-ready JSON payload consumed by the frontend rendering engine. No computation occurs here — this is a composition and serialisation layer.

**Introduction and context:** The frontend should be completely stateless with respect to business logic. It receives a display payload and renders it. All decisions — what to show, where to show it, what badge to display, what upsell to trigger — are resolved here in the backend before the payload leaves the server.

**Final output payload (per item):**

```json
{
  "id": "abc-123",
  "name": "Chicken Biryani",
  "description": "Slow-cooked basmati with saffron and tender chicken thigh.",
  "price": 220,
  "offer_price": null,
  "display_position": 1,
  "is_visible": true,
  "badge": "Bestseller",
  "badge_color": "gold",
  "show_hot_indicator": true,
  "orders_today_display": "67 ordered today",
  "like_count": 142,
  "show_countdown": false,
  "countdown_seconds": null,
  "upsell_items": ["raita", "cold-coffee"],
  "ai_nudge_eligible": true,
  "zone_label": "Confident Star",
  "ranking_score": 0.932
}
```

**Badge assignment rules:**

| Zone | Badge text | Badge color |
|---|---|---|
| Zone 1 (Confident Star) | "Bestseller" | Gold |
| Zone 2 (Near-Star) | "Trending" | Blue |
| Zone 3 (Confident Puzzle) | "Chef's Pick" | Green |
| Zone 4 (Rising Plowhorse) | "Popular" | Neutral |
| Zone 7 (Confident Plowhorse) | "Popular" | Neutral |
| offer_active == True (any zone) | "Limited Offer" | Red (overrides zone badge) |
| orders_today ≥ 20 | 🔥 Hot indicator | n/a (separate from badge) |
| All others | none | — |

**Engineering output:** REST endpoint `GET /api/menu/{restaurantId}` returns array of display instruction objects, pre-sorted by `display_position`.

---

### How the Layers Work Together (Data Flow)

```
LAYER 0: Data Ingestion
│  Input:  owner form (price, FC, star, profit_tier), order events, likes
│  Output: validated menu_items + menu_item_stats DB records
│
LAYER 1: Profitability & Popularity (nightly + on-demand)
│  Input:  Layer 0 DB records + date window
│  Output: cm, sm_pct, pop_threshold, cm_threshold per item
│
LAYER 2: Item Classification (nightly + on-demand)
│  Input:  Layer 1 outputs + category distribution vectors
│  Output: ks_class, fuzzy_pop, fuzzy_profit, zone_id, badge
│
LAYER 3: Weighted Ranking (every 5 minutes)
│  Input:  Layer 2 outputs + live orders_today, like_count, offer_active
│  Output: ranking_score, display_position, visibility flag
│
LAYER 4: Offer Trigger (every 15 minutes)
│  Input:  Layer 3 outputs + hourly demand index
│  Output: offer_active, offer_price, countdown end time
│
LAYER 5: Display Assembly (per API request, <50ms)
   Input:  All Layer 0–4 outputs
   Output: Final display JSON payload for frontend
```

**Caching strategy:**
- Layers 1 and 2: Results cached in Supabase `menu_item_computed` table, invalidated nightly or on owner update
- Layer 3: Ranking score cached in Redis with 5-minute TTL
- Layers 4 and 5: Computed at request time from cached Layer 3 base + live offer state

---

## Part 3 — Evaluation and Validation

### 3.1 Unit Tests for Each Formula

**Test 1: CM calculation (Layer 1)**
```python
assert cm(220, 135) == 85.0
assert cm(60, 32) == 28.0
assert cm(90, 48) == 42.0
# Edge: food cost exactly equals price → CM = 0 (should trigger validation warning)
with pytest.raises(ValidationError):
    cm(60, 65)  # negative margin — reject
```

**Test 2: Sales Mix % (Layer 1)**
```python
units = [340, 220, 185, 150, 105]
expected = [34.0, 22.0, 18.5, 15.0, 10.5]
result = sales_mix(units)
for i, r in enumerate(result):
    assert abs(r - expected[i]) < 0.01
assert sum(result) == pytest.approx(100.0, abs=0.01)
```

**Test 3: Popularity Threshold (Layer 2)**
```python
# n=5 items
assert popularity_threshold(n=5) == pytest.approx(14.0, abs=0.01)
# n=8 items
assert popularity_threshold(n=8) == pytest.approx(8.75, abs=0.01)
```

**Test 4: Weighted Score (Layer 3)**
```python
# Chicken Biryani
score = score_item(star=4, profit_tier=4, orders_today=34, likes=142, offer_active=False)
assert abs(score - 0.932) < 0.005

# All inputs at minimum
score_min = score_item(star=1, profit_tier=1, orders_today=0, likes=0, offer_active=False)
assert score_min == pytest.approx(0.0, abs=0.001)

# All inputs at maximum
score_max = score_item(star=4, profit_tier=4, orders_today=50, likes=200, offer_active=True)
assert score_max == pytest.approx(1.0, abs=0.001)
```

**Test 5: Fuzzy membership (Layer 2)**
```python
# Value at centre of distribution → membership = 1.0
values = [10, 20, 40, 60, 80, 90, 100]
assert compute_fuzzy(55, values) == 1.0
# Value below 5th percentile → membership = 0.0
assert compute_fuzzy(5, values) == 0.0
# Value on rising slope → 0 < membership < 1
mu = compute_fuzzy(22, values)
assert 0 < mu < 1
```

---

### 3.2 System-Level Validation Metrics

**Metric 1: Classification Stability Index (CSI)**

Measures how frequently items change classification between consecutive weekly windows. High churn in a stable restaurant indicates data noise or incorrect threshold calculation.

\[
CSI = 1 - \frac{\text{Number of items that changed ks\_class}}{\text{Total items}}
\]

Target: CSI ≥ 0.85 (no more than 15% of items should change class week-over-week in a stable restaurant).

**Metric 2: Star Coverage Rate (SCR)**

Checks that Stars are being placed in top display positions.

\[
SCR = \frac{\text{Number of Stars in top } \lceil n/3 \rceil \text{ positions}}{\text{Total Stars}}
\]

Target: SCR = 1.0 (all Stars must appear in top third of the ranked list).

**Metric 3: Puzzle Promotion Rate (PPR)**

Checks that Puzzle items (Zone 3) receive offers or badges.

\[
PPR = \frac{\text{Zone 3 items with active badge or offer}}{\text{Total Zone 3 items}}
\]

Target: PPR ≥ 0.80 (at least 80% of Puzzles should have a promotion mechanism active).

**Metric 4: Dog Suppression Rate (DSR)**

Checks that Dog items are hidden from customer view.

\[
DSR = \frac{\text{Zone 9 items with is\_visible = False}}{\text{Total Zone 9 items}}
\]

Target: DSR = 1.0 (all Confident Dogs must be hidden).

**Metric 5: Average Order Value impact (AOV delta)**

The most important business metric. Computed weekly.

\[
AOV\Delta = \frac{AOV_{post} - AOV_{pre}}{AOV_{pre}} \times 100\%
\]

Target: AOV delta ≥ +8% within 4 weeks of activation. Investigate if delta is negative.

---

### 3.3 A/B Testing Framework for Weight Calibration

The MCDS weights (0.50, 0.35, 0.08, 0.04, 0.03) are set from research defaults. They should be validated against real customer order data. The recommended approach:

**Test setup:**
- Split incoming customers 50/50 by session UUID hash
- Group A: Default weights (0.50, 0.35, 0.08, 0.04, 0.03)
- Group B: Modified weights (e.g., increase `orders_today` weight to 0.15, reduce `star_rating` to 0.43)
- Run for minimum 500 sessions per group

**Primary metric:** Average CM per order (not AOV — CM per order is what the restaurant keeps)
**Secondary metric:** Add-to-cart rate on position 1 item (measures whether top-ranked item is compelling)
**Guardrail metric:** Customer satisfaction score (do not let UX degrade in pursuit of higher CM)

Results inform the next round of weight tuning. Weights should be re-evaluated every 90 days per restaurant cohort.

---

### 3.4 Data Quality Checks (Run before Layer 1 Execution)

| Check | Query | Action on failure |
|---|---|---|
| Missing food cost | `food_cost IS NULL OR food_cost <= 0` | Block re-ranking, alert owner |
| Negative CM | `selling_price <= food_cost` | Flag item, notify owner, exclude from ranking |
| Zero units in window | All items have `units_sold = 0` | Use star_rating only; skip SM% calculation |
| Single item category | `n = 1` | SM% = 100% by definition; skip popularity threshold; classify by CM only |
| Stale data | `window_date < CURRENT_DATE - 60` | Alert: analysis window has no recent data |
| Price unchanged for 90+ days | `updated_at < CURRENT_DATE - 90` | Prompt owner to review prices |

---

### 3.5 Validation Checklist Before Production Deployment

- [ ] All unit tests pass with 100% coverage on formula functions
- [ ] CSI ≥ 0.85 on 4 weeks of synthetic test data
- [ ] SCR = 1.0 on test data
- [ ] DSR = 1.0 on test data
- [ ] Offer trigger formula tested for floor constraint (no offer ever drops below ₹10 margin)
- [ ] Score normalisation verified: inputs at min produce 0.0, inputs at max produce 1.0
- [ ] Category with n=1 item handled without division errors
- [ ] pg_cron job verified to execute nightly Layer 1–2 recalculation
- [ ] Redis TTL verified at 5 minutes for Layer 3 cache
- [ ] API latency for Layer 5 assembly endpoint: < 50ms at p95

---

## Appendix A — Formula Quick Reference

| Formula | Inventor (Year) | Equation | Layer |
|---|---|---|---|
| Contribution Margin | Kasavana & Smith (1982) | \(CM_i = P_i - FC_i\) | 1 |
| Sales Mix % | Kasavana & Smith (1982) | \(SM_i = (Q_i / \sum Q_j) \times 100\) | 1 |
| Popularity Threshold | Kasavana & Smith / AHLEI | \(PT = (100/n) \times 0.70\) | 2 |
| Profitability Threshold | Kasavana & Smith (1982) | \(\overline{CM} = \sum CM_i / n\) | 2 |
| Prime Value | Pavesic (1983) | \(PV_i = FC\%_i \times CM_i\) | 2 |
| Labour-Inclusive CM | LeBruto, Quain & Ashley (1995) | \(LCM_i = P_i - FC_i - LC_i\) | 1 (Pro) |
| Activity-Based CM | Linassi et al. (2016) | \(ABCCM_i = P_i - FC_i - LC_i - OH_i\) | 1 (Pro) |
| MCDS Weighted Score | ScienceDirect / Pavesic extended (2024) | \(S_i = \sum w_k \hat{x}_{ik}\) | 3 |
| Fuzzy Membership | Tom & Annaraud (2017) | Trapezoidal \(\mu(x; a,b,c,d)\) | 2 |
| Demand Index | IJPREMS (2025) | \(DI_t = R_t / R_{avg,t}\) | 4 |
| Offer Discount Rate | IJPREMS (2025) | \(\delta = \alpha(1-DI_t)\) | 4 |

---

## Appendix B — Recommended Libraries

| Layer | Language | Library | Purpose |
|---|---|---|---|
| 1–2 | Python | `pandas`, `numpy` | CM, SM%, threshold calculations |
| 2 | Python | `scipy.stats` | Percentile computation for fuzzy parameters |
| 2 | Python | `mlxtend` (Phase 1 upgrade) | Association rule mining |
| 3 | TypeScript | Native | Scoring formula (pure arithmetic) |
| 4 | Python | `prophet` (optional) | Demand forecasting for DI baseline |
| 4 | TypeScript | `date-fns` | Countdown timer management |
| All | TypeScript | `supabase-js` | DB read/write |
| 3 | All | Redis (ioredis) | 5-minute score cache |


### Task list 
