// src/lib/sarvamVision.ts
// Kept for backward-compat import in onboarding/extract — actual OCR is now
// done inside extractMenuItemsFromImages() which sends images directly to GPT-4o.

import OpenAI from 'openai';

const OCR_PROMPT =
    'Extract all text from this menu image. Preserve item names, prices, and section headings. Include every item visible in the image. Return plain text, no markdown formatting.';

/**
 * Fallback single-image OCR — only used when the direct multi-image path fails.
 */
export async function imageToMenuText(
    buffer: Buffer,
    mimeType: string
): Promise<string> {
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                        { type: 'text', text: OCR_PROMPT },
                    ],
                },
            ],
            max_tokens: 2000,
        });

        const text = response.choices[0]?.message?.content ?? '';
        console.log(`[imageToMenuText] extracted ${text.length} chars from photo`);
        return text;
    } catch (err) {
        console.error('[imageToMenuText] GPT-4o-mini vision failed:', err);
        return '';
    }
}
