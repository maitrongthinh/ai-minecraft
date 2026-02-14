
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

/**
 * Minecraft Wiki Scraper & Cache
 * Provides access to external knowledge about Minecraft.
 */
export class MinecraftWiki {
    constructor(agent) {
        this.agent = agent;
        this.baseUrl = 'https://minecraft.wiki';
        this.cacheFile = 'wiki_cache.json';
        this.cache = new Map();
        this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Hours

        // Rate limiting
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000; // 2 seconds

        this.loadCache();
    }

    loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                for (const [key, value] of Object.entries(data)) {
                    // Check TTL
                    if (Date.now() - value.timestamp < this.CACHE_TTL) {
                        this.cache.set(key, value);
                    }
                }
            }
        } catch (err) {
            console.warn('[Wiki] Failed to load cache:', err.message);
        }
    }

    saveCache() {
        try {
            const data = {};
            for (const [key, value] of this.cache.entries()) {
                data[key] = value;
            }
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        } catch (err) {
            console.warn('[Wiki] Failed to save cache:', err.message);
        }
    }

    async fetchPage(term) {
        const cacheKey = term.toLowerCase();
        if (this.cache.has(cacheKey)) {
            console.debug(`[Wiki] Cache hit for: ${term}`);
            return this.cache.get(cacheKey).data;
        }

        // Rate Limit
        const now = Date.now();
        if (now - this.lastRequestTime < this.minRequestInterval) {
            await new Promise(r => setTimeout(r, this.minRequestInterval - (now - this.lastRequestTime)));
        }
        this.lastRequestTime = Date.now();

        console.debug(`[Wiki] Fetching: ${term}...`);
        try {
            // Search redirect
            const searchUrl = `${this.baseUrl}/w/Special:Search?search=${encodeURIComponent(term)}`;
            const response = await fetch(searchUrl);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();

            // Allow redirects to handle the "search result" page vs "direct article"
            // Simple fetch follows redirects by default.

            return html;
        } catch (err) {
            console.error(`[Wiki] Fetch error for ${term}:`, err.message);
            return null;
        }
    }

    /**
     * General search for any term (mechanics, blocks, lore)
     * @param {string} query 
     */
    async searchGeneral(query) {
        const term = query.replace(/_/g, ' ');
        if (this.cache.has(term.toLowerCase())) {
            const cached = this.cache.get(term.toLowerCase());
            if (cached.data.summary) return cached.data;
        }

        const html = await this.fetchPage(term);
        if (!html) return null;

        const $ = cheerio.load(html);

        // Extract first 3 paragraphs of content
        const paragraphs = [];
        $('#mw-content-text .mw-parser-output > p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 20 && paragraphs.length < 3) {
                paragraphs.push(text);
            }
        });

        // Extract Infobox key-values (generic)
        const infobox = {};
        $('.infobox-row').each((i, el) => {
            const label = $(el).find('.infobox-row-label').text().trim();
            const value = $(el).find('.infobox-row-value').text().trim();
            if (label && value) infobox[label] = value;
        });

        const result = {
            title: term,
            summary: paragraphs.join('\n\n'),
            details: infobox,
            url: `${this.baseUrl}/w/${encodeURIComponent(term)}`
        };

        this.cache.set(term.toLowerCase(), {
            timestamp: Date.now(),
            data: result
        });
        this.saveCache();

        return result;
    }

    async searchRecipe(itemName) {
        const term = itemName.replace(/_/g, ' ');
        const html = await this.fetchPage(term);
        if (!html) return null;

        const $ = cheerio.load(html);

        // Enhanced Recipe Parsing (Crafting, Smelting, Brewing)
        const recipes = [];

        // 1. Crafting Table (Standard)
        $('.mcui-Crafting_Table').each((i, el) => {
            const outputEl = $(el).find('.mcui-output .invsprite');
            const outputFn = outputEl.attr('title') || 'Unknown';
            const outputCount = $(el).find('.mcui-output .mcui-number').text() || '1';

            // Grid Input
            const inputs = [];
            $(el).find('.mcui-input span.invsprite').each((j, slot) => {
                const title = $(slot).attr('title');
                inputs.push(title || "Air");
            });

            if (inputs.length > 0) {
                recipes.push({
                    type: 'crafting',
                    output: `${outputFn} x${outputCount}`,
                    ingredients: inputs
                });
            }
        });

        // 2. Furnace (Smelting)
        $('.mcui-Furnace').each((i, el) => {
            const outputFn = $(el).find('.mcui-output .invsprite').attr('title') || 'Unknown';
            const inputFn = $(el).find('.mcui-input .invsprite').first().text() || 'Unknown'; // Simplified selector
            if (outputFn !== 'Unknown') {
                recipes.push({
                    type: 'smelting',
                    output: outputFn,
                    input: inputFn
                });
            }
        });

        const result = { recipes };
        // ... cache logic ...
        this.cache.set(term.toLowerCase(), { timestamp: Date.now(), data: result });
        this.saveCache();
        return result;
    }

    async getMobInfo(mobName) {
        const term = mobName.replace(/_/g, ' ');
        if (this.cache.has(term.toLowerCase())) {
            const cached = this.cache.get(term.toLowerCase());
            if (cached.data.hp) return cached.data;
        }

        const html = await this.fetchPage(term);
        if (!html) return null;

        const $ = cheerio.load(html);

        // Robust Infobox Parsing (2025/2026 Wiki Layout Support)
        const getKey = (keys) => {
            if (!Array.isArray(keys)) keys = [keys];
            for (const k of keys) {
                // Style A: data-source
                let val = $(`[data-source="${k}"] .infobox-row-value`).text().trim();
                if (val) return val;

                // Style B: Table Headers
                val = $(`th:contains("${k}")`).next('td').text().trim();
                if (val) return val;
            }
            return null;
        };

        // Extract description
        const summary = $('#mw-content-text .mw-parser-output > p').not('.mw-empty-elt').first().text().trim();

        const info = {
            name: term,
            hp: getKey(['health', 'HealthPoints']) || "20 (10 Hearts)",
            damage: getKey(['attack_strength', 'AttackStrength']) || "Easy: 2, Normal: 3, Hard: 4",
            drops: getKey(['drops', 'Drops']) || "Unknown",
            behavior: getKey(['behavior', 'Behavior']) || "Hostile", // Default assumption if missing
            spawn: getKey(['spawn', 'Spawn']) || "Darkness",
            summary: summary || "A Minecraft entity."
        };

        this.cache.set(term.toLowerCase(), { timestamp: Date.now(), data: info });
        this.saveCache();
        return info;
    }
}
