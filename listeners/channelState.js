const utils = require('../utils.js');
const Discord = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
require('dotenv').config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
const FILE_PATH = './gameAbbreviations.json';

// Logs messages with a timestamp for better tracking
function logWithTimestamp(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Queries Google for an abbreviation of a game name and stores results locally
async function queryGoogleForAbbreviation(gameName) {
    logWithTimestamp(`Looking up abbreviation for game: "${gameName}"`);

    let abbreviations = {};

    // Check if abbreviations file exists and load it
    if (fs.existsSync(FILE_PATH)) {
        try {
            logWithTimestamp("Loading abbreviations from local file.");
            const data = fs.readFileSync(FILE_PATH, 'utf-8');
            abbreviations = JSON.parse(data);
        } catch (error) {
            logWithTimestamp(`Error reading gameAbbreviations.json: ${error.message}`);
        }
    }

    // Return abbreviation if it exists in the local file
    if (abbreviations[gameName]) {
        logWithTimestamp(`Abbreviation found in local file for "${gameName}": ${abbreviations[gameName]}`);
        return abbreviations[gameName];
    }

    // Search Google for an abbreviation if it's not found locally
    const query = `"${gameName}"`;
    const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        // Parse Google results for a Reddit subreddit match
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                const url = item.link;
                const subredditMatch = url.match(/reddit\.com\/r\/(\w+)/);
                if (subredditMatch) {
                    const subredditName = subredditMatch[1];
                    abbreviations[gameName] = subredditName;
                    fs.writeFileSync(FILE_PATH, JSON.stringify(abbreviations, null, 2));
                    logWithTimestamp(`Subreddit "${subredditName}" saved to local file.`);
                    return subredditName;
                }
            }
        }
        logWithTimestamp(`No relevant search results found for "${gameName}".`);
        return null;
    } catch (error) {
        logWithTimestamp(`Error querying Google API: ${error.message}`);
        return null;
    }
}

// Checks if the bot has permission to act on a channel
function canActOn(channel) {
    let perms;
    if (!channel.parent) {
        return false;
    }
    perms = channel.parent.permissionsFor(channel.client.user);
    return perms.has('MANAGE_CHANNELS') && perms.has('CONNECT') && channel.type === 'voice';
}

// Deletes an empty voice channel
async function deleteEmptyChannel(channel) {
    logWithTimestamp(`Attempting to delete empty channel: "${channel.name}"`);
    try {
        await channel.delete();
        logWithTimestamp(`Successfully deleted empty channel: "${channel.name}"`);
    } catch (error) {
        logWithTimestamp(`Failed to delete channel "${channel.name}": ${error.message}`);
    }
}

// Manages the channels in a given category, deleting empty ones and renaming others
async function manageChannels(cat) {
    logWithTimestamp(`Managing channels in category: "${cat.name}"`);
    const category = await cat.fetch();
    let guild = category.guild;
    let voiceChannels = category.children.filter(channel => channel.type === 'voice');
    logWithTimestamp(`Total voice channels in category: ${voiceChannels.size}`);

    let index = 1;
    logWithTimestamp(`Initial index: ${index}`);

    // Processes populated channels for naming
    let populatedChannels = voiceChannels.filter(channel => channel.members.size > 0);
    logWithTimestamp(`Populated channels found: ${populatedChannels.size}`);
    
    populatedChannels.forEach(channel => {
        logWithTimestamp(`Assigning index ${index} to populated channel "${channel.name}" with ${channel.members.size} member(s)`);
        getChannelName(channel, index).then(channelName => {
            renameChannel(channel, channelName);
        });
        index++;
    });

    // Deletes empty channels
    let emptyVoiceChannels = voiceChannels.filter(channel => channel.members.size === 0);
    logWithTimestamp(`Empty channels to delete: ${emptyVoiceChannels.size}`);

    for (const channel of emptyVoiceChannels.values()) {
        logWithTimestamp(`Marking empty channel "${channel.name}" for deletion`);
        await deleteEmptyChannel(channel); // Ensure each deletion completes
    }

    // Deletes any higher-indexed empty channels
    const higherIndexedChannels = category.children.filter(
        (c) => c.type === 'voice' && parseInt(c.name.split(' ').pop()) > index && c.members.size === 0
    );

    for (const channel of higherIndexedChannels.values()) {
        logWithTimestamp(`Deleting unnecessary higher-indexed empty channel: "${channel.name}"`);
        await deleteEmptyChannel(channel);
    }

    // Creates the next indexed voice channel
    guild.channels.create('Voice Channel ' + index, {
        type: 'voice',
        parent: category
    }).then(newChannel => {
        logWithTimestamp(`Successfully created new channel: "${newChannel.name}" with index ${index}`);
    }).catch(error => {
        logWithTimestamp(`Failed to create new voice channel: ${error.message}`);
    });
}

// Determines the name of a voice channel based on user activity
async function getChannelName(channel, index) {
    logWithTimestamp(`getChannelName called with index ${index} for channel "${channel.name}"`);
    let activityNames = {};
    let max = 0;
    let activityName;

    // Collects active game names from users in the channel
    channel.members.forEach(member => {
        let activities = utils.get(member, 'presence.activities');
        if (member.user.bot) return;

        activities.forEach(activity => {
            if (activity.type === 'PLAYING') {
                let name = activity.name;
                if (name) {
                    activityNames[name] = (activityNames[name] || 0) + 1;
                }
            }
        });
    });

    // Finds the most common game name in the channel
    for (let name in activityNames) {
        if (activityNames[name] > max) {
            max = activityNames[name];
            activityName = name;
        }
    }

    // Returns either the game abbreviation or the index-based name
    if (activityName) {
        logWithTimestamp(`Detected activity name for channel: "${activityName}"`);
        const subredditName = await queryGoogleForAbbreviation(activityName);
        const channelName = subredditName || activityName;
        logWithTimestamp(`Renaming channel to: "${channelName}"`);
        renameChannel(channel, channelName);
        return channelName;
    } else {
        const defaultName = `Voice Channel ${index}`;
        logWithTimestamp(`No active game detected. Setting default channel name: ${defaultName}`);
        renameChannel(channel, defaultName);
        return defaultName;
    }
}

const renameCoolDowns = new Discord.Collection();
const rateLimit = (1000 * 60 * 10) + 1000;

// Handles channel renaming with a cooldown mechanism
function renameChannel(channel, name) {
    logWithTimestamp(`renameChannel called with name: ${name} for channel "${channel.name}"`);
    if (channel.members.size === 0) {
        let category = channel.parent;
        channel.delete().then(() => {
            guild.channels.create(name, {
                type: 'voice',
                parent: category
            });
        });
        return;
    }

    if (channel.name === name) {
        logWithTimestamp(`Channel name already set to "${name}". No rename necessary.`);
        return;
    }

    // Applies cooldown to limit renaming frequency
    let channelCoolDown;
    let channelId = channel.id;
    if (!renameCoolDowns.has(channelId)) {
        channelCoolDown = new Discord.Collection();
        channelCoolDown.set('count', 0);
        channelCoolDown.set('name', undefined);
        logWithTimestamp(`Cooldown started for channel: ${channelId} (${channel.name})`);
        channelCoolDown.set('timeout', setTimeout(() => {
            let ccd = renameCoolDowns.get(channelId);
            let queuedName = ccd.get('name');
            if (queuedName !== undefined) {
                ccd.get('channel').fetch()
                    .then((queuedChannel) => {
                        logWithTimestamp(`Completing rename of channel: ${channelId} (${queuedChannel.name}). New name should be ${queuedName}`);
                        queuedChannel.setName(queuedName).catch((e) => {});
                    })
                    .catch((e) => {});
            }
           renameCoolDowns.delete(channelId);
        }, rateLimit));
        renameCoolDowns.set(channelId, channelCoolDown);
    } else {
        channelCoolDown = renameCoolDowns.get(channelId);
    }
    let count = channelCoolDown.get('count');
    count++;
    logWithTimestamp(`${count} requests to rename channel: ${channelId} (${channel.name}). Requested name is '${name}'`);
    channelCoolDown.set('count', count);
    channelCoolDown.set('channel', channel);

    if (count < 3) {
        channel.setName(name).catch((e) => {});
    } else {
        logWithTimestamp(`Queueing name '${name}' for channel: ${channelId} (${channel.name})`);
        channelCoolDown.set('name', name);
    }
}

module.exports = {
    init: function (client) {
        logWithTimestamp("Bot initialized and ready.");
        client.guilds.cache.forEach(guild => {
            guild.channels.cache.filter(channel => {
                let perms;
                if (channel.type !== 'category') {
                    return false;
                }
                perms = channel.permissionsFor(client.user);
                return perms.has('MANAGE_CHANNELS') && perms.has('CONNECT');
            }).forEach(category => {
                manageChannels(category);
            });
        });

        client.on('voiceStateUpdate', (oldState, newState) => {
            let newUserChannel = newState.channel,
                oldUserChannel = oldState.channel,
                newCategoryID;

            if (newUserChannel != null && canActOn(newUserChannel) && (oldUserChannel == null || !newUserChannel.equals(oldUserChannel))) {
                newCategoryID = newUserChannel.parentID;
                logWithTimestamp(`User joined voice channel: "${newUserChannel.name}"`);
                manageChannels(newUserChannel.parent);
            }

            if (oldUserChannel != null && canActOn(oldUserChannel) && (newUserChannel == null || !newUserChannel.equals(oldUserChannel))) {
                if (newCategoryID !== oldUserChannel.parentID) {
                    logWithTimestamp(`User left voice channel: "${oldUserChannel.name}"`);
                    manageChannels(oldUserChannel.parent);
                }
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
