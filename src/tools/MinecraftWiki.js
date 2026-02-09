
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

    async searchRecipe(itemName) {
        const term = itemName.replace(/_/g, ' ');
        const html = await this.fetchPage(term);
        if (!html) return null;

        const $ = cheerio.load(html);

        // Strategy: Look for '.mcui-Crafting_Table' (standard wiki template)
        const recipes = [];

        $('.mcui-Crafting_Table').each((i, el) => {
            const outputFn = $(el).find('.mcui-output .invsprite').attr('title') || 'Unknown';

            // Only care if output matches our search roughly
            if (outputFn.toLowerCase().includes(term.toLowerCase())) {
                const inputs = [];
                $(el).find('.mcui-input span.invsprite').each((j, slot) => {
                    const title = $(slot).attr('title');
                    if (title) inputs.push(title);
                    else inputs.push("Air"); // Grid slot empty
                });

                // Format: 3x3 grid
                if (inputs.length > 0) {
                    recipes.push({
                        output: outputFn,
                        ingredients: inputs
                    });
                }
            }
        });

        const result = { recipes };

        // Cache result
        this.cache.set(term.toLowerCase(), {
            timestamp: Date.now(),
            data: html // Note: Caching full HTML is heavy, ideally cache processed data. 
            // BUT: For now caching processed result is better.
        });

        // Update cache to store RESULT, not HTML (Override logic above)
        this.cache.set(term.toLowerCase(), {
            timestamp: Date.now(),
            data: result // Storing processed object now
        });

        this.saveCache();
        return result;
    }

    async getMobInfo(mobName) {
        const term = mobName.replace(/_/g, ' ');
        // Check cache for processed data first
        if (this.cache.has(term.toLowerCase())) {
            const cached = this.cache.get(term.toLowerCase());
            if (cached.data.hp) return cached.data; // Ensure it's mob data
        }

        const html = await this.fetchPage(term);
        if (!html) return null;

        const $ = cheerio.load(html);

        // Strategy: Infobox parsing
        const hp = $('[data-source="health"] .infobox-row-value').text().trim() || "Unknown";
        const drop = $('[data-source="drops"] .infobox-row-value').text().trim() || "Unknown";
        const behavior = $('[data-source="behavior"] .infobox-row-value').text().trim() || "Unknown";

        // Paragraph extract
        const summary = $('#mw-content-text .mw-parser-output > p').first().text().trim();

        const info = {
            name: term,
            hp: hp,
            drops: drop,
            summary: summary
        };

        this.cache.set(term.toLowerCase(), {
            timestamp: Date.now(),
            data: info
        });
        this.saveCache();

        return info;
    }
}
