const { Collection } = require('discord.js');

// Collection to manage cooldowns for renaming channels
const renameCoolDowns = new Collection();
const rateLimit = (1000 * 60 * 10) + 1000;

/**
 * Logs a message if LOG_COMMANDS is enabled.
 * @param {string} message - The message to log.
 */
function logOperation(message) {
    if (process.env.LOG_COMMANDS === 'true') {
        console.log(`[INFO] ${message}`);
    }
}

/**
 * Renames a voice channel, using a cooldown to avoid frequent renames.
 * If the channel is empty, deletes and recreates it with the new name.
 * @param {Channel} channel - The channel to rename.
 * @param {string} name - The new name for the channel.
 */
function renameChannel(channel, name) {
    if (channel.members.size === 0) {
        let category = channel.parent;
        logOperation(`Channel "${channel.name}" is empty. Deleting and recreating with new name: ${name}`);
        channel.delete().then(() => {
            category.guild.channels.create({
                name: name,
                type: 'GUILD_VOICE',
                parent: category
            }).catch(error => {
                console.error('[ERROR] Error recreating empty channel:', error);
            });
        });
        return;
    }

    if (channel.name === name) {
        logOperation(`Channel "${channel.name}" already has the correct name.`);
        return;
    }

    let channelCoolDown;
    let channelId = channel.id;
    if (!renameCoolDowns.has(channelId)) {
        channelCoolDown = new Collection();
        channelCoolDown.set('count', 0);
        channelCoolDown.set('name', undefined);
        channelCoolDown.set('timeout', setTimeout(() => {
            let ccd = renameCoolDowns.get(channelId);
            let queuedName = ccd.get('name');
            if (queuedName !== undefined) {
                logOperation(`Applying queued name "${queuedName}" to channel.`);
                ccd.get('channel').fetch()
                    .then((queuedChannel) => {
                        queuedChannel.setName(queuedName).catch(() => {});
                    })
                    .catch(() => {});
            }
            renameCoolDowns.delete(channelId);
        }, rateLimit));
        renameCoolDowns.set(channelId, channelCoolDown);
    } else {
        channelCoolDown = renameCoolDowns.get(channelId);
    }

    let count = channelCoolDown.get('count');
    count++;
    channelCoolDown.set('count', count);
    channelCoolDown.set('channel', channel);

    if (count < 3) {
        logOperation(`Renaming channel immediately: "${channel.name}" -> "${name}".`);
        channel.setName(name).catch(() => {});
    } else {
        logOperation(`Queueing name change for "${channel.name}" to "${name}".`);
        channelCoolDown.set('name', name);
    }
}

module.exports = {
    renameChannel,
};
