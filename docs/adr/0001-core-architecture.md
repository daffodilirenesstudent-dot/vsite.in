# Vsite Core Architecture

## 1. Technology Stack
- **Frontend & Framework:** Next.js 14 (App Router), React 18, Tailwind CSS, TypeScript.
- **Backend/Database:** Supabase (PostgreSQL), utilizing Postgres RPC functions for core logic (No ORMs used for performance).
- **Authentication:** Firebase (Phone OTP).
- **Hosting/Deployment:** Digital Ocean.
- **AI & Vision APIs:** OpenAI (GPT-4o, GPT-4o-mini), Sarvam Vision (OCR).
- **Payments:** Razorpay.

## 2. Onboarding Architecture & Microservices
During the onboarding phase, the architecture relies on several microservices:
- **Firebase Auth:** Handles the initial user signup via Phone OTP.
- **Vercel Serverless Functions:** Specific endpoints (`/api/onboarding/extract` and `/api/onboarding/complete`) handle the business logic under a strict 60-second timeout limit.
- **OpenAI Service:** Used for advanced vision extraction from photos and generating localized item descriptions.
- **Sarvam Vision VLM:** Acts as a fallback microservice to extract raw text from images if the primary AI vision struggles.
- **Supabase Service-Role:** Handles secure data insertion directly into the PostgreSQL database once the onboarding data is confirmed.

## 3. Image to Digital Menu Extraction Process (Step-by-Step)
Converting a physical menu photo into a digital menu is a highly optimized, two-pass pipeline designed to bypass serverless timeouts:
1. **Upload & Validation:** The user uploads up to 15 menu images. The server validates the image types and sizes to ensure they meet constraints.
2. **Pass 1 - Extraction (GPT-4o Vision):** Images are chunked into batches of 3 and sent in parallel to OpenAI's GPT-4o model. The AI is specifically prompted to return a highly compact JSON array of tuples (e.g., `["Item Name", price, "Category", "type", "foodType", [variants]]`). This tuple format minimizes token usage and latency.
3. **OCR Fallback (Conditional):** If the direct vision extraction returns zero items, the system falls back to an OCR service (Sarvam Vision) to grab raw text, which is then fed back to GPT-4o.
4. **Deduplication:** The system programmatically removes duplicate items (e.g., if the same item appears on the cover and an inside page) based on normalized name and price.
5. **Pass 2 - Description Generation (GPT-4o-mini):** The deduped items are sent in batches of 50 to the faster/cheaper `gpt-4o-mini` model. This pass generates localized, one-sentence descriptions written in a South Indian / Tamil Nadu culinary style.
6. **Finalization:** If the AI fails to generate a description for an item, a local keyword-matching fallback provides a generic description. The fully structured data is then sent to the frontend for the user to review.

### Why use a VLM (Vision Language Model) instead of Traditional OCR?
While traditional OCR (like Google Cloud Vision or Tesseract) is great at extracting raw text, it struggles significantly with menus due to:
- **Lost Spatial Relationships:** Menus have complex layouts (e.g., item name on the far left, price on the far right). Traditional OCR often loses the visual connection between these elements, returning a jumbled block of text.
- **Lack of Semantic Context:** Traditional OCR does not understand that "Mains" is a category heading or that "Half/Full" represent portion sizes; it only sees characters.
- **Parsing Complexity:** Relying purely on traditional OCR requires writing hundreds of fragile Regular Expression rules to parse the messy text into a structured database format. 

By contrast, **VLMs like GPT-4o Vision** understand both the text and the visual layout of the page simultaneously, allowing them to instantly output clean, properly formatted JSON data without complex manual parsing scripts.

## 4. Menu Engineering Algorithm
The application features a 6-layer background algorithm that automatically ranks, categorizes, and promotes menu items. It is based on Kasavana & Smith's hospitality research (1982) but modernized with fuzzy logic and multi-criteria decision support.
- **Layer 0 (Ingestion):** Collects raw data (prices, food costs, owner priority, live orders, likes).
- **Layer 1 (Profitability & Popularity):** Calculates the Contribution Margin (absolute profit per item) and Sales Mix % (popularity within its category).
- **Layer 2 (Classification):** Categorizes items into 9 fuzzy zones (e.g., "Confident Star", "Rising Plowhorse", "Confident Dog").
- **Layer 3 (Ranking Score):** Computes a weighted score based on profitability, owner rating, recent orders, and likes. This dictates the exact display order on the customer menu.
- **Layer 4 (Dynamic Offer Trigger):** Monitors real-time demand. If live orders drop below a 30-day average threshold, it automatically triggers temporary discounts on high-profit/low-popularity items ("Puzzles").
- **Layer 5 (Display Assembly):** Automatically assigns visual badges (e.g., "Bestseller", "Trending") and frontend countdown timers based on the item's zone and active offers.
