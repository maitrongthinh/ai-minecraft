// import json5 from 'json5'; // Not available, using custom dirty parser

export class JsonSanitizer {
    /**
     * Extracts and parses JSON from a string that might contain other text.
     * @param {string} text - The input text from AI
     * @returns {Object|null} - The parsed object or null if failed
     */
    static parse(text) {
        if (!text) return null;
        if (typeof text !== 'string') return text; // Already object?

        // 1. Try cleaning markdown code blocks
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // 2. Try direct parse
        try {
            return JSON.parse(cleanText);
        } catch (e) {
            // Continue
        }

        // 3. Dirty Extraction: Find the outermost {} or []
        const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            let potentialJson = jsonMatch[0];
            try {
                return JSON.parse(potentialJson);
            } catch (e) {
                // 4. Try Auto-Fixing common errors
                return JsonSanitizer.fixAndParse(potentialJson);
            }
        }


        return null;
    }

    static fixAndParse(jsonStr) {
        // Simple fixes for common LLM mistakes
        let fixed = jsonStr
            // Remove trailing commas before } or ]
            .replace(/,\s*([}\]])/g, '$1')
            // Fix unquoted keys (simple case: key:) -> "key":
            // This is risky but often needed for lazy models
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
            // Fix single quotes to double quotes
            .replace(/'/g, '"');

        try {
            return JSON.parse(fixed);
        } catch (e) {
            console.warn('[JsonSanitizer] Failed to fix JSON:', e.message);
            // console.debug('Original:', jsonStr);
            // console.debug('Fixed:', fixed);
            return null;
        }
    }
}
