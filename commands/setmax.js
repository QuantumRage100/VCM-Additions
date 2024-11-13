const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');
const utils = require('../utils.js');

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
        // Check if the bot has permission to send messages in the current channel
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        const maxInt = interaction.options.getInteger('maxusers');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply('You must be in a voice channel to set the max users.');
        }

        // Check if the channel is in the same category as the command channel
        if (voiceChannel.parentId !== interaction.channel.parentId) {
            return interaction.reply('You cannot manage a voice channel in a different category.');
        }

        if (maxInt < 0 || maxInt >= 100) {
            return interaction.reply('Invalid user limit: ' + maxInt);
        }

        const userCount = voiceChannel.members.size;

        if (maxInt > 0 && maxInt < userCount) {
            return interaction.reply('User limit is lower than the current user count.');
        }

        if (voiceChannel.userLimit === maxInt) {
            return interaction.reply('User limit is already ' + maxInt);
        }

        let targetUsers = [];
        // Exclude bots from the vote
        voiceChannel.members.forEach(member => {
            if (member.id !== interaction.member.id && !member.user.bot) {
                targetUsers.push(member);
            }
        });

        if (userCount > 1) {
            if (votePending[voiceChannel.id] === true) {
                return interaction.reply('There is already a vote pending on that channel.');
            }

            votePending[voiceChannel.id] = true;

            // Call the vote system, ensure that utils.vote works with interactions
            utils.vote(`Set user limit of ${voiceChannel.name} to ${maxInt}? Please vote using the reactions below.`, interaction.channel, {
                targetUsers,
                time: 10000
            }).then(results => {
                if (((results.agree.count + 1) / userCount) > 0.5) { // +1 for requesting user
                    doSetMax(voiceChannel, maxInt).then(() => {
                        interaction.reply('New user limit set');
                    });
                } else {
                    interaction.reply('Request rejected by channel members');
                }
                delete votePending[voiceChannel.id];
            }).catch(() => {
                delete votePending[voiceChannel.id];
            });
        } else {
            // Apply the new user limit if there's only one member in the channel
            doSetMax(voiceChannel, maxInt).then(() => {
                interaction.reply('New user limit set');
            });
        }
    }
};
