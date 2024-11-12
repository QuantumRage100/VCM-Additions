const utils = require('../utils.js');
const { Client, GatewayIntentBits, PermissionsBitField, Collection, ChannelType } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
require('dotenv').config();

// API keys and file path
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
const FILE_PATH = './gameAbbreviations.json';

/**
 * Queries Google to find subreddit abbreviations for a game name.
 * @param {string} gameName - The name of the game.
 * @returns {Promise<string|null>} - The subreddit name or null if not found.
 */
async function queryGoogleForAbbreviation(gameName) {
    let abbreviations = loadAbbreviationsFromFile();
    if (abbreviations[gameName]) return abbreviations[gameName];

    const query = `"${gameName}"`;
    const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}`;
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                const url = item.link;
                const subredditMatch = url.match(/reddit\.com\/r\/(\w+)/);
                if (subredditMatch) {
                    const subredditName = subredditMatch[1];
                    abbreviations[gameName] = subredditName;
                    saveAbbreviationsToFile(abbreviations);
                    return subredditName;
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Loads game abbreviations from a JSON file.
 * @returns {Object} - The abbreviations object.
 */
function loadAbbreviationsFromFile() {
    if (fs.existsSync(FILE_PATH)) {
        try {
            const data = fs.readFileSync(FILE_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }
    return {};
}

/**
 * Saves game abbreviations to a JSON file.
 * @param {Object} abbreviations - Abbreviations to save.
 */
function saveAbbreviationsToFile(abbreviations) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(abbreviations, null, 2));
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
        await channel.delete();
    } catch (error) {}
}

// Set to prevent concurrent management of the same category
const categoryLocks = new Set();

/**
 * Manages the channels in a specified category, creating or deleting as needed.
 * @param {CategoryChannel} cat - The category to manage.
 */
async function manageChannels(cat) {
    if (categoryLocks.has(cat.id)) {
        return;
    }

    categoryLocks.add(cat.id);

    try {
        const category = await cat.fetch();
        const guild = category.guild;
        const voiceChannels = category.children.cache.filter(channel => channel.type === ChannelType.GuildVoice);

        let index = 1;
        const populatedChannels = voiceChannels.filter(channel => channel.members.size > 0);

        for (const channel of populatedChannels.values()) {
            await getChannelName(channel, index).then(channelName => renameChannel(channel, channelName));
            index++;
        }

        const emptyVoiceChannels = voiceChannels.filter(channel => channel.members.size === 0);
        const deletePromises = emptyVoiceChannels.map(deleteEmptyChannel);
        await Promise.all(deletePromises);

        const existingChannelNames = category.children.cache.map(c => c.name);
        const newChannelName = `Voice Channel ${index}`;
        if (!existingChannelNames.includes(newChannelName)) {
            await guild.channels.create({
                name: newChannelName,
                type: ChannelType.GuildVoice,
                parent: category
            });
        }
    } finally {
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
    renameChannel(channel, channelName);
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
        channel.delete().then(() => {
            category.guild.channels.create({
                name: name,
                type: ChannelType.GuildVoice,
                parent: category
            }).catch(() => {});
        });
        return;
    }

    if (channel.name === name) {
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
        channel.setName(name).catch(() => {});
    } else {
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
                let newUserChannel = utils.get(newPresence, 'member.voice.channel');
                if (newUserChannel != null) {
                    getChannelName(newUserChannel, 1).then(channelName => {
                        renameChannel(newUserChannel, channelName);
                    });
                }
            }
        });
    }
};
