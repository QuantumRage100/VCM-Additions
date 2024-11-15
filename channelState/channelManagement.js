const { Client, GatewayIntentBits, PermissionsBitField, Collection, ChannelType } = require('discord.js');
const { queryGoogleForAbbreviation } = require('./abbreviationHandler.js'); // Import abbreviation functions
const fs = require('fs');
require('dotenv').config();

// Logging control
const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';

/**
 * Logs a message if LOG_COMMANDS is enabled.
 * @param {string} message - The message to log.
 */
function logOperation(message) {
    if (LOG_COMMANDS) {
        console.log(`[INFO] ${message}`);
    }
}

/**
 * Checks if the bot has permissions to manage a specified voice channel.
 * @param {Channel} channel - The channel to check.
 * @returns {boolean} - True if permissions are sufficient.
 */
function canActOn(channel) {
    if (!channel.parent) return false;
    const perms = channel.parent.permissionsFor(channel.client.user);
    return perms.has(PermissionsBitField.Flags.ManageChannels) &&
           perms.has(PermissionsBitField.Flags.Connect) &&
           channel.type === ChannelType.GuildVoice;
}

/**
 * Deletes a specified empty voice channel.
 * @param {Channel} channel - The channel to delete.
 */
async function deleteEmptyChannel(channel) {
    try {
        logOperation(`Deleting empty channel: ${channel.name}`);
        await channel.delete();
    } catch (error) {
        console.error('[ERROR] Error deleting channel:', error);
    }
}

// Set to prevent concurrent management of the same category
const categoryLocks = new Set();

/**
 * Manages the channels in a specified category, creating or deleting as needed.
 * @param {CategoryChannel} cat - The category to manage.
 */
async function manageChannels(cat) {
    if (categoryLocks.has(cat.id)) {
        logOperation(`Category "${cat.name}" is already being managed.`);
        return;
    }

    categoryLocks.add(cat.id);

    try {
        const category = await cat.fetch();
        const guild = category.guild;
        const voiceChannels = category.children.cache.filter(channel => channel.type === ChannelType.GuildVoice);

        logOperation(`Managing channels in category: ${category.name}`);

        let index = 1;
        const populatedChannels = voiceChannels.filter(channel => channel.members.size > 0);

        for (const channel of populatedChannels.values()) {
            logOperation(`Renaming populated channel: ${channel.name}`);
            await getChannelName(channel, index).then(channelName => renameChannel(channel, channelName));
            index++;
        }

        const emptyVoiceChannels = voiceChannels.filter(channel => channel.members.size === 0);
        const deletePromises = emptyVoiceChannels.map(deleteEmptyChannel);
        await Promise.all(deletePromises);

        const existingChannelNames = category.children.cache.map(c => c.name);
        const newChannelName = `Voice Channel ${index}`;
        if (!existingChannelNames.includes(newChannelName)) {
            logOperation(`Creating new channel: ${newChannelName}`);
            await guild.channels.create({
                name: newChannelName,
                type: ChannelType.GuildVoice,
                parent: category
            });
        }
    } catch (error) {
        console.error('[ERROR] Error managing channels:', error);
    } finally {
        logOperation(`Finished managing channels in category: ${cat.name}`);
        console.log(); // Adds a blank line in the console
        categoryLocks.delete(cat.id);
    }
}

/**
 * Generates a name for the channel based on the most common activity among its members.
 * @param {Channel} channel - The channel to rename.
 * @param {number} index - The index to use if no activity is detected.
 * @returns {Promise<string>} - The new channel name.
 */
async function getChannelName(channel, index) {
    let activityNames = {};
    let max = 0;
    let activityName;

    logOperation(`Analyzing member activities in channel: ${channel.name}`);

    for (const [_, member] of channel.members) {
        const updatedMember = await channel.guild.members.fetch(member.id);
        const activities = updatedMember.presence?.activities || [];

        if (!updatedMember.user.bot) {
            activities.forEach(activity => {
                if (activity.type === 'PLAYING' || activity.type === 0) {
                    const name = activity.name;
                    if (name) {
                        activityNames[name] = (activityNames[name] || 0) + 1;
                    }
                }
            });
        }
    }

    for (let name in activityNames) {
        if (activityNames[name] > max) {
            max = activityNames[name];
            activityName = name;
        }
    }

    const defaultName = `Voice Channel ${index}`;
    const channelName = activityName
        ? await queryGoogleForAbbreviation(activityName) || activityName
        : defaultName;

    logOperation(`Determined name for channel "${channel.name}": ${channelName}`);
    return channelName;
}

// Collection to manage cooldowns for renaming channels
const renameCoolDowns = new Collection();
const rateLimit = (1000 * 60 * 10) + 1000;

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
                type: ChannelType.GuildVoice,
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
    init: function (client) {
        client.guilds.cache.forEach(guild => {
            guild.channels.cache
                .filter(channel => channel.type === ChannelType.GuildCategory)
                .forEach(category => {
                    const perms = category.permissionsFor(client.user);
                    if (perms && perms.has(PermissionsBitField.Flags.ManageChannels) && perms.has(PermissionsBitField.Flags.Connect)) {
                        manageChannels(category);
                    }
                });
        });

        client.on('voiceStateUpdate', (oldState, newState) => {
            let newUserChannel = newState.channel, oldUserChannel = oldState.channel;
            if (newUserChannel && canActOn(newUserChannel) && (!oldUserChannel || !newUserChannel.equals(oldUserChannel))) {
                manageChannels(newUserChannel.parent);
            }

            if (oldUserChannel && canActOn(oldUserChannel) && (!newUserChannel || !newUserChannel.equals(oldUserChannel))) {
                manageChannels(oldUserChannel.parent);
            }
        });

        client.on('presenceUpdate', (oldPresence, newPresence) => {
            if (oldPresence == null || !oldPresence.equals(newPresence)) {
                let newUserChannel = newPresence?.member?.voice?.channel;
                if (newUserChannel != null) {
                    getChannelName(newUserChannel, 1).then(channelName => {
                        renameChannel(newUserChannel, channelName);
                    });
                }
            }
        });

        logOperation('Bot initialized.');
    }
};
