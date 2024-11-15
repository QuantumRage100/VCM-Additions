const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const vote = require('../misc/vote.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';
const VOTING_DURATION = parseInt(process.env.VOTING_DURATION, 10) || 120000; // Default to 2 minutes if not set
let votePending = {};

/**
 * Checks if a voice channel is already unlocked by examining the Connect permission for the @everyone role.
 * @param {VoiceChannel} voiceChannel - The voice channel to check.
 * @returns {boolean} - True if the channel is unlocked, otherwise false.
 */
function isChannelUnlocked(voiceChannel) {
    const everyoneRole = voiceChannel.guild.roles.everyone;
    const permissionOverwrites = voiceChannel.permissionOverwrites.cache.get(everyoneRole.id);

    // Check if Connect permission is null (default)
    return !permissionOverwrites || permissionOverwrites.deny === undefined;
}

/**
 * Unlocks the voice channel by setting the Connect permission to true for all roles 
 * with permission overwrites, and sets @everyone role to default permissions.
 * @param {VoiceChannel} voiceChannel The voice channel to unlock
 * @returns {Promise}
 */
async function unlockChannel(voiceChannel) {
    try {
        const permissionPromises = [];

        // Set Connect permission to true for all roles with overwrites
        voiceChannel.permissionOverwrites.cache.forEach(overwrite => {
            const role = voiceChannel.guild.roles.cache.get(overwrite.id);
            if (role) {
                permissionPromises.push(
                    voiceChannel.permissionOverwrites.edit(role, {
                        [PermissionFlagsBits.Connect]: true
                    })
                );
            }
        });

        // Set @everyone role to default permissions (null for Connect)
        permissionPromises.push(
            voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                [PermissionFlagsBits.Connect]: null
            })
        );

        await Promise.all(permissionPromises);

        if (LOG_COMMANDS) {
            console.log(`[COMMAND LOG] Successfully unlocked channel: ${voiceChannel.name}`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to unlock ${voiceChannel.name}:`, error);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlocks the voice channel to allow specified roles or everyone to join')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        try {
            // Ensure bot has permission to send messages
            if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
                await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
                return;
            }

            await interaction.deferReply();

            // Ensure the user is in a voice channel
            let voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                await interaction.editReply('You must be connected to a voice channel to use this command.');
                return;
            }

            // Check if the channel is already unlocked
            if (isChannelUnlocked(voiceChannel)) {
                await interaction.editReply('The channel is already unlocked. Use the /lock command to lock it.');
                return;
            }

            const humanMembers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);

            // Handle unlocking if there's only one user in the channel
            if (humanMembers.length <= 1) {
                try {
                    await unlockChannel(voiceChannel);
                    await interaction.editReply('Channel unlocked.');
                } catch (error) {
                    console.error(`[ERROR] Failed to unlock channel ${voiceChannel.name}:`, error);
                    await interaction.editReply('Failed to unlock the channel due to an error.');
                }
                return;
            }

            // Create a voting prompt for multiple users
            const subject = `Unlock ${voiceChannel.name}? Please vote using the reactions below.`;

            vote.vote(subject, interaction.channel, {
                targetUsers: humanMembers,
                time: VOTING_DURATION, // Use the variable from .env
            }).then(async (results) => {
                // Recheck if the channel still exists after voting
                voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    await interaction.editReply('The voice channel no longer exists.');
                    delete votePending[voiceChannel.id];
                    return;
                }

                const majorityThreshold = Math.floor(humanMembers.length / 2) + 1;

                // Check the vote results and unlock the channel if enough votes
                if (results.agree.count >= majorityThreshold) {
                    try {
                        await unlockChannel(voiceChannel);
                        await interaction.editReply('Channel unlocked.');
                    } catch (error) {
                        console.error(`[ERROR] Failed to unlock channel ${voiceChannel.name}:`, error);
                        await interaction.editReply('Failed to unlock the channel due to an error.');
                    }
                } else {
                    await interaction.editReply('Not enough votes to unlock the channel.');
                }

                if (LOG_COMMANDS) {
                    console.log(`[COMMAND LOG] Voting completed for /unlock in ${voiceChannel.name}.`);
                }
            }).catch(async () => {
                await interaction.editReply('Vote timed out or failed.');
                delete votePending[voiceChannel.id];
            });
        } catch (error) {
            console.error(`[ERROR] Failed to execute /unlock:`, error);
            await interaction.editReply('Failed to unlock the channel due to an error.');
        } finally {
            // Safeguard: Ensure votePending cleanup
            const voiceChannel = interaction.member.voice.channel;
            if (voiceChannel) {
                delete votePending[voiceChannel.id];
            }
        }
    },
};
