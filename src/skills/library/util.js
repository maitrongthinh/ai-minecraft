export function log(bot, message) {
    if (bot && bot.output !== undefined) {
        bot.output += message + '\n';
    } else {
        console.log(message);
    }
}
