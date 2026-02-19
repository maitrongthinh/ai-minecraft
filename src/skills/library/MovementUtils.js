export function localLog(bot, message) {
    if (bot && bot.output !== undefined) {
        bot.output += message + '\n';
    } else {
        console.log(message);
    }
}

export function isModeOn(bot, mode) {
    return !!(bot?.modes && typeof bot.modes.isOn === 'function' && bot.modes.isOn(mode));
}

export function pauseMode(bot, mode) {
    if (bot?.modes && typeof bot.modes.pause === 'function') {
        bot.modes.pause(mode);
    }
}

export function unpauseMode(bot, mode) {
    if (bot?.modes && typeof bot.modes.unpause === 'function') {
        bot.modes.unpause(mode);
    }
}

let _doorInterval = null;
export function startDoorInterval(bot) {
    if (_doorInterval) {
        clearInterval(_doorInterval);
    }
    let prev_pos = bot.entity.position.clone();
    let prev_check = Date.now();
    let stuck_time = 0;

    const doorCheckInterval = setInterval(() => {
        const now = Date.now();
        if (bot.entity.position.distanceTo(prev_pos) >= 0.1) {
            stuck_time = 0;
        } else {
            stuck_time += now - prev_check;
        }

        if (stuck_time > 1200) {
            const positions = [
                bot.entity.position.clone(),
                bot.entity.position.offset(0, 0, 1),
                bot.entity.position.offset(0, 0, -1),
                bot.entity.position.offset(1, 0, 0),
                bot.entity.position.offset(-1, 0, 0),
            ]
            let elevated_positions = positions.map(position => position.offset(0, 1, 0));
            positions.push(...elevated_positions);
            positions.push(bot.entity.position.offset(0, 2, 0));
            positions.push(bot.entity.position.offset(0, -1, 0));

            let currentIndex = positions.length;
            while (currentIndex != 0) {
                let randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [positions[currentIndex], positions[randomIndex]] = [
                    positions[randomIndex], positions[currentIndex]];
            }

            for (let position of positions) {
                let block = bot.blockAt(position);
                if (block && block.name &&
                    !block.name.includes('iron') &&
                    (block.name.includes('door') ||
                        block.name.includes('fence_gate') ||
                        block.name.includes('trapdoor'))) {
                    bot.activateBlock(block);
                    break;
                }
            }
            stuck_time = 0;
        }
        prev_pos = bot.entity.position.clone();
        prev_check = now;
    }, 200);
    _doorInterval = doorCheckInterval;
    return doorCheckInterval;
}
