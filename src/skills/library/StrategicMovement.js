import Vec3 from 'vec3';
import { log } from './util.js';

/**
 * StrategicMovement
 * 
 * Logic for safe navigation, retreating, and tactical positioning.
 * Replaces "GoalInvert" blind kiting.
 */
export class StrategicMovement {

    /**
     * Find a safe position to retreat to, away from a threat.
     * @param {Bot} bot 
     * @param {Vec3} threatPos 
     * @param {number} desiredDist 
     * @returns {Vec3|null} Safe position or null if none found
     */
    static findSafeRetreatPos(bot, threatPos, desiredDist = 16) {
        const botPos = bot.entity.position;

        // Vector from threat to bot
        const escapeVec = botPos.minus(threatPos).normalize();

        // Ideal destination
        const idealDest = botPos.plus(escapeVec.scaled(desiredDist));

        // 1. Raycast to check for immediate walls/blocks blocking the path
        const raycast = bot.world.raycast(botPos.offset(0, 1.6, 0), escapeVec, desiredDist);
        if (raycast) {
            // Hit a wall?
            // Try to find an angled path (45 degrees left or right)
            const leftVec = new Vec3(escapeVec.z, 0, -escapeVec.x).normalize(); // Rotate 90
            const rightVec = new Vec3(-escapeVec.z, 0, escapeVec.x).normalize(); // Rotate -90

            // Try mix of escape + side (45 deg)
            const altVec1 = escapeVec.plus(leftVec).normalize();
            const altVec2 = escapeVec.plus(rightVec).normalize();

            const dest1 = this.verifyDestination(bot, botPos, altVec1, desiredDist);
            if (dest1) return dest1;

            const dest2 = this.verifyDestination(bot, botPos, altVec2, desiredDist);
            if (dest2) return dest2;

            // If all else fails, return null or just the hit position minus a bit?
            return null;
        }

        // 2. Check destination safety (ground check, lava check)
        if (this.isPositionSafe(bot, idealDest)) {
            return idealDest;
        }

        return null;
    }

    /**
     * Verify if a vector leads to a safe spot
     */
    static verifyDestination(bot, startPos, dirVec, dist) {
        // cast ray
        const hit = bot.world.raycast(startPos.offset(0, 1.6, 0), dirVec, dist);
        let target = startPos.plus(dirVec.scaled(dist));

        if (hit) {
            // Use position just before hit
            target = hit.position.minus(dirVec.scaled(1));
        }

        if (this.isPositionSafe(bot, target)) return target;
        return null;
    }

    /**
     * Check if a position is safe to stand on
     * @param {Bot} bot 
     * @param {Vec3} pos 
     */
    static isPositionSafe(bot, pos) {
        const floorPos = pos.floor();

        // 1. Check block at feet (must be air or passable)
        const feetBlock = bot.blockAt(floorPos);
        const headBlock = bot.blockAt(floorPos.offset(0, 1, 0));

        if (feetBlock.boundingBox === 'block' || headBlock.boundingBox === 'block') return false; // Suffocation

        // 2. Check block BELOW feet (Ground check)
        const groundBlock = bot.blockAt(floorPos.offset(0, -1, 0));
        if (!groundBlock || groundBlock.boundingBox !== 'block') {
            // Cliff / Air check
            // We can tolerate a 1-2 block drop, but not infinite
            const ground2 = bot.blockAt(floorPos.offset(0, -2, 0));
            const ground3 = bot.blockAt(floorPos.offset(0, -3, 0));

            if ((!ground2 || ground2.boundingBox !== 'block') &&
                (!ground3 || ground3.boundingBox !== 'block')) {
                return false; // Too deep a drop
            }
        }

        // 3. Hazard Check (Lava/Fire/Cactus)
        const nearby = [
            floorPos, floorPos.offset(0, -1, 0),
            floorPos.offset(1, 0, 0), floorPos.offset(-1, 0, 0),
            floorPos.offset(0, 0, 1), floorPos.offset(0, 0, -1)
        ];

        for (const p of nearby) {
            const b = bot.blockAt(p);
            if (b && (b.name === 'lava' || b.name === 'fire' || b.name === 'magma_block' || b.name === 'cactus' || b.name === 'sweet_berry_bush')) {
                return false;
            }
        }

        return true;
    }
}
