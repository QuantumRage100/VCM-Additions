const { Collection, TextChannel, User } = require('discord.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';
const VOTING_DURATION = parseInt(process.env.VOTING_DURATION, 10) || 120000; // Default to 2 minutes if not set

/**
 * Initiates a vote in a text channel.
 *
 * @param {String} subject - The subject or question to be voted on.
 * @param {TextChannel} channel - The text channel where the vote will take place.
 * @param {Object} options - Configuration options for the vote.
 * @param {Array<{name: String, emoji: String}>} [options.selections] - The available selections with names and emojis. Defaults to agree/disagree.
 * @param {Number} [options.time] - Time in milliseconds to listen for reactions. Defaults to `VOTING_DURATION`.
 * @param {Array<User>} [options.targetUsers] - Specific users allowed to vote. If not provided, all users can vote.
 * @returns {Promise<Object>} - A promise that resolves with the vote results.
 */
async function vote(subject, channel, options = {}) {
    const {
        selections = [
            { name: 'agree', emoji: '✅' },
            { name: 'disagree', emoji: '❌' }
        ],
        time = VOTING_DURATION, // Use configurable voting duration
        targetUsers
    } = options;

    // Alert target users via mentions
    if (targetUsers && targetUsers.length > 0) {
        const mentions = targetUsers.map(user => user.toString()).join(' ');
        subject = `${mentions}\n\n${subject}`;
    }

    try {
        if (!channel || !channel.isTextBased()) {
            console.error('[ERROR] Invalid channel for voting.');
            return {};
        }

        if (LOG_COMMANDS) {
            console.log(`[COMMAND LOG] Starting vote: "${subject}" with duration: ${time}ms.`);
        }

        const message = await channel.send(subject);

        // React to the message with each selection emoji
        for (const selection of selections) {
            try {
                await message.react(selection.emoji);
            } catch (reactionError) {
                console.error(`[ERROR] Failed to add reaction "${selection.emoji}":`, reactionError);
            }
        }

        // Define the filter for the reaction collector
        const filter = (reaction, user) => {
            const isValidEmoji = selections.some(selection => selection.emoji === reaction.emoji.name);
            const isTargetUser = targetUsers ? targetUsers.some(targetUser => targetUser.id === user.id) : true;
            const isNotBot = !user.bot;
            return isValidEmoji && isTargetUser && isNotBot;
        };

        // Create a reaction collector
        const collector = message.createReactionCollector({ filter, time });

        // Initialize vote counts
        const voteCounts = {};
        selections.forEach(selection => {
            voteCounts[selection.name] = new Set();
        });

        return new Promise((resolve) => {
            collector.on('collect', (reaction, user) => {
                try {
                    const selection = selections.find(sel => sel.emoji === reaction.emoji.name);
                    if (selection) {
                        voteCounts[selection.name].add(user.id);

                        // Log the vote collection for debugging purposes
                        if (LOG_COMMANDS) {
                            console.log(`[COMMAND LOG] Collected vote: User "${user.tag}" voted "${selection.name}".`);
                        }
                    }
                } catch (error) {
                    console.error('[ERROR] Error collecting vote:', error);
                }
            });

            collector.on('end', async () => {
                try {
                    // Prepare the final results
                    const results = {};
                    selections.forEach(selection => {
                        results[selection.name] = {
                            count: voteCounts[selection.name].size,
                            users: Array.from(voteCounts[selection.name])
                        };
                    });

                    if (LOG_COMMANDS) {
                        console.log(`[COMMAND LOG] Vote concluded. Results:`, results);
                    }

                    // Delete the vote message after voting concludes
                    try {
                        await message.delete();
                    } catch (deleteError) {
                        console.error('[ERROR] Failed to delete vote message:', deleteError);
                    }

                    resolve(results);
                } catch (finalizeError) {
                    console.error('[ERROR] Error finalizing vote results:', finalizeError);
                    resolve({});
                }
            });
        });
    } catch (error) {
        console.error('[ERROR] Error during voting process:', error);
        return {};
    }
}

module.exports = {
    vote
};
