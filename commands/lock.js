const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const vote = require('../misc/vote.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';
const VOTING_DURATION = parseInt(process.env.VOTING_DURATION, 10) || 120000; // Default to 2 minutes if not set
let votePending = {};

/**
 * Checks if a voice channel is already locked by examining the Connect permission for the @everyone role.
 * @param {VoiceChannel} voiceChannel - The voice channel to check.
 * @returns {boolean} - True if the channel is locked, otherwise false.
 */
function isChannelLocked(voiceChannel) {
    const everyoneRole = voiceChannel.guild.roles.everyone;
    const permissionOverwrites = voiceChannel.permissionOverwrites.cache.get(everyoneRole.id);

    // Check if Connect permission is explicitly denied
    return permissionOverwrites && permissionOverwrites.deny.has(PermissionFlagsBits.Connect);
}

/**
 * Locks the voice channel by setting necessary permissions for bot members and denying CONNECT for all others.
 * @param {VoiceChannel} voiceChannel The voice channel to lock
 * @returns {Promise}
 */
async function lockChannel(voiceChannel) {
    try {
        const members = await voiceChannel.guild.members.fetch();
        const botPermissionPromises = members
            .filter(member => member.user.bot)
            .map(botMember =>
                voiceChannel.permissionOverwrites.edit(botMember.id, {
                    [PermissionFlagsBits.Connect]: true
                })
            );

        await Promise.all(botPermissionPromises);

        await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
            [PermissionFlagsBits.Connect]: false,
        });

        const permissionPromises = [];
        voiceChannel.permissionOverwrites.cache.forEach(overwrite => {
            if (!members.some(member => member.id === overwrite.id && member.user.bot)) {
                permissionPromises.push(
                    voiceChannel.permissionOverwrites.edit(overwrite.id, {
                        [PermissionFlagsBits.Connect]: false
                    })
                );
            }
        });

        await Promise.all(permissionPromises);
        if (LOG_COMMANDS) {
            console.log(`[COMMAND LOG] Successfully locked channel: ${voiceChannel.name}`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to lock channel ${voiceChannel.name}:`, error);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Locks the voice channel so only specified bots and current occupants can join')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        let voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.editReply('You must be connected to a voice channel to use this command.');
            return;
        }

        // Check if the channel is already locked
        if (isChannelLocked(voiceChannel)) {
            await interaction.editReply('The channel is already locked. Use the /unlock command to unlock it.');
            return;
        }

        const humanMembers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);

        // Skip the vote if only one human member is in the channel
        if (humanMembers.length <= 1) {
            try {
                await lockChannel(voiceChannel);
                await interaction.editReply('Channel locked.');
            } catch (error) {
                console.error(`[ERROR] Failed to lock channel ${voiceChannel.name}:`, error);
                await interaction.editReply('Failed to lock the channel due to an error.');
            }
            return;
        }

        const subject = `Lock ${voiceChannel.name}? Please vote using the reactions below.`;

        try {
            const results = await vote.vote(subject, interaction.channel, {
                targetUsers: humanMembers,
                time: VOTING_DURATION, // Use the variable from .env
            });

            // Recheck if the channel still exists after the vote
            voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                await interaction.editReply('The voice channel no longer exists.');
                delete votePending[voiceChannel.id];
                return;
            }

            const majorityThreshold = Math.floor(humanMembers.length / 2) + 1;

            if (results.agree.count >= majorityThreshold) {
                try {
                    await lockChannel(voiceChannel);
                    await interaction.editReply('Channel locked.');
                } catch (error) {
                    console.error(`[ERROR] Failed to lock channel ${voiceChannel.name}:`, error);
                    await interaction.editReply('Failed to lock the channel due to an error.');
                }
            } else {
                await interaction.editReply('Not enough votes to lock the channel.');
            }

            if (LOG_COMMANDS) {
                console.log(`[COMMAND LOG] Voting completed for /lock in ${voiceChannel.name}.`);
            }
        } catch (error) {
            console.error(`[ERROR] Error during voting process in ${voiceChannel.name || 'unknown channel'}:`, error);
            await interaction.editReply('Vote timed out or failed.');
        } finally {
            delete votePending[voiceChannel.id];
        }
    },
};
