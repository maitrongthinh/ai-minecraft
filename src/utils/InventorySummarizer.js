
/**
 * InventorySummarizer.js
 * 
 * Compresses the bot's inventory into a token-efficient summary string.
 * Example: "Oak Log (x64), Dirt (x128), Iron Sword (x1)"
 */
export class InventorySummarizer {
    /**
     * groups items by name and formats them
     * @param {Bot} bot - Mineflayer bot instance
     * @returns {string} - "Item (xCount), Item (xCount)..."
     */
    static summarize(bot) {
        if (!bot || !bot.inventory) return "Empty";

        const items = bot.inventory.items();
        if (items.length === 0) return "Empty";

        const groups = {};

        // Group by name
        for (const item of items) {
            if (!groups[item.name]) {
                groups[item.name] = 0;
            }
            groups[item.name] += item.count;
        }

        // Format
        const summaryParts = Object.entries(groups).map(([name, count]) => {
            return `${name} (x${count})`;
        });

        // Optional: Sort by count desc or name? 
        // Name is better for stability (prevent shifting tokens)
        summaryParts.sort();

        // Check fullness
        const emptySlots = bot.inventory.emptySlotCount();
        const fullness = emptySlots < 5 ? " [FULL]" : "";

        return summaryParts.join(', ') + fullness;
    }
}
