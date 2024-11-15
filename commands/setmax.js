const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');
const vote = require('../misc/vote.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';
const VOTING_DURATION = parseInt(process.env.VOTING_DURATION, 10) || 120000; // Default to 2 minutes if not set

let votePending = {};

// Function to set the max user limit for the voice channel
function doSetMax(voiceChannel, maxInt) {
    return voiceChannel.edit({
        userLimit: maxInt
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setmax')
        .setDescription('Set the maximum number of users that can connect to your voice channel. \'0\' will reset it.')
        .addIntegerOption(option =>
            option.setName('maxusers')
                .setDescription('Max users limit')
                .setRequired(true)
        ),
    cooldown: 20,
    guildOnly: true,

    async execute(interaction) {
        try {
            // Check if the bot has permission to send messages in the current channel
            if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
                await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
                return;
            }

            const maxInt = interaction.options.getInteger('maxusers');
            let voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                await interaction.reply({ content: 'You must be in a voice channel to set the max users.', ephemeral: true });
                return;
            }

            // Ensure the bot is only managing the user's own channel
            if (!voiceChannel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.ManageChannels)) {
                await interaction.reply({ content: 'I do not have permission to manage this voice channel.', ephemeral: true });
                return;
            }

            if (maxInt < 0 || maxInt >= 100) {
                await interaction.reply({ content: 'Invalid user limit: ' + maxInt, ephemeral: true });
                return;
            }

            const userCount = voiceChannel.members.filter(member => !member.user.bot).size;

            if (maxInt > 0 && maxInt < userCount) {
                await interaction.reply({ content: 'User limit is lower than the current user count.', ephemeral: true });
                return;
            }

            if (voiceChannel.userLimit === maxInt) {
                await interaction.reply({ content: 'User limit is already ' + maxInt, ephemeral: true });
                return;
            }

            // Acknowledge the command immediately to prevent timing out
            await interaction.deferReply({ ephemeral: false });

            const targetUsers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);

            if (userCount > 1) {
                if (votePending[voiceChannel.id]) {
                    await interaction.editReply('There is already a vote pending on that channel.');
                    return;
                }

                votePending[voiceChannel.id] = true;

                vote.vote(`Set user limit of ${voiceChannel.name} to ${maxInt}? Please vote using the reactions below.`, interaction.channel, {
                    targetUsers,
                    time: VOTING_DURATION, // Use the variable from .env
                }).then(async (results) => {
                    // Recheck if the channel still exists after the vote
                    voiceChannel = interaction.member.voice.channel;
                    if (!voiceChannel) {
                        await interaction.editReply('The voice channel no longer exists.');
                        delete votePending[voiceChannel.id];
                        return;
                    }

                    if (((results.agree.count + 1) / userCount) > 0.5) { // +1 for requesting user
                        try {
                            await doSetMax(voiceChannel, maxInt);
                            await interaction.editReply('New user limit set.');
                            if (LOG_COMMANDS) {
                                console.log(`[COMMAND LOG] Successfully set max user limit for ${voiceChannel.name} to ${maxInt}.`);
                            }
                        } catch (error) {
                            console.error(`[ERROR] Failed to set max user limit for ${voiceChannel.name}:`, error);
                            await interaction.editReply('Failed to set the user limit due to an error.');
                        }
                    } else {
                        await interaction.editReply('Request rejected by channel members.');
                    }

                    delete votePending[voiceChannel.id];
                }).catch(async () => {
                    await interaction.editReply('Vote timed out or failed.');
                    delete votePending[voiceChannel.id];
                });
            } else {
                // Apply the new user limit if there's only one member in the channel
                try {
                    await doSetMax(voiceChannel, maxInt);
                    await interaction.editReply('New user limit set.');
                    if (LOG_COMMANDS) {
                        console.log(`[COMMAND LOG] Successfully set max user limit for ${voiceChannel.name} to ${maxInt}.`);
                    }
                } catch (error) {
                    console.error(`[ERROR] Failed to set max user limit for ${voiceChannel.name}:`, error);
                    await interaction.editReply('Failed to set the user limit due to an error.');
                }
            }
        } catch (error) {
            console.error(`[ERROR] Failed to execute /setmax:`, error);
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    },
};
