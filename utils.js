const { Collection, TextChannel, User } = require('discord.js');

/**
 * Initiates a vote in a text channel.
 *
 * @param {String} subject - The subject or question to be voted on.
 * @param {TextChannel} channel - The text channel where the vote will take place.
 * @param {Object} options - Configuration options for the vote.
 * @param {Array<{name: String, emoji: String}>} [options.selections] - The available selections with names and emojis. Defaults to agree/disagree.
 * @param {Number} [options.time] - Time in milliseconds to listen for reactions. Defaults to 5000 ms.
 * @param {Array<User>} [options.targetUsers] - Specific users allowed to vote. If not provided, all users can vote.
 * @returns {Promise<Object>} - A promise that resolves with the vote results.
 */
async function vote(subject, channel, options = {}) {
    const {
        selections = [
            { name: 'agree', emoji: '✅' },
            { name: 'disagree', emoji: '❌' }
        ],
        time = 5000,
        targetUsers
    } = options;

    // Alert target users via mentions
    if (targetUsers && targetUsers.length > 0) {
        const mentions = targetUsers.map(user => user.toString()).join(' ');
        subject = `${mentions}\n\n${subject}`;
    }

    try {
        const message = await channel.send(subject);

        // React to the message with each selection emoji
        for (const selection of selections) {
            await message.react(selection.emoji);
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

        // Determine the number of votes required to conclude the vote
        const totalVoters = targetUsers ? targetUsers.length : channel.guild.memberCount;
        const votesNeeded = Math.floor(totalVoters / 2) + 1;

        return new Promise((resolve) => {
            collector.on('collect', (reaction, user) => {
                const selection = selections.find(sel => sel.emoji === reaction.emoji.name);
                if (selection) {
                    voteCounts[selection.name].add(user.id);

                    // Check if the required number of votes has been reached
                    if (voteCounts[selection.name].size >= votesNeeded) {
                        collector.stop();
                    }
                }
            });

            collector.on('end', async () => {
                // Prepare the final results
                const results = {};
                selections.forEach(selection => {
                    results[selection.name] = {
                        count: voteCounts[selection.name].size,
                        users: Array.from(voteCounts[selection.name])
                    };
                });
                
                // Delete the vote message after voting concludes
                await message.delete().catch(error => console.error('Failed to delete vote message:', error));

                resolve(results);
            });
        });
    } catch (error) {
        console.error('Error during voting process:', error);
        return {};
    }
}

module.exports = {
    vote
};
