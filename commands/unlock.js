const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const utils = require('../utils.js');
let votePending = {};

/**
 * Unlocks the voice channel by syncing permissions with its category if available,
 * otherwise allows the CONNECT permission for @everyone.
 * @param {VoiceChannel} voiceChannel The voice channel to unlock
 * @returns {Promise}
 */
async function unlockChannel(voiceChannel) {
    try {
        if (voiceChannel.parent) {
            await voiceChannel.lockPermissions();
        } else {
            await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                [PermissionFlagsBits.Connect]: null,
            });
        }
    } catch (error) {
        console.error(`Failed to unlock ${voiceChannel.name}:`, error);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlocks the voice channel to allow specified roles or everyone to join')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        await interaction.deferReply();

        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.editReply('You must be connected to a voice channel to use this command.');
            return;
        }

        const humanMembers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);

        // Skip the vote if only one human member is in the channel
        if (humanMembers.length <= 1) {
            await unlockChannel(voiceChannel);
            await interaction.editReply('Channel unlocked.');
            return;
        }

        const subject = `Unlock ${voiceChannel.name}? Please vote using the reactions below.`;

        try {
            const results = await utils.vote(subject, interaction.channel, {
                targetUsers: humanMembers,
                time: 30000,
            });

            const majorityThreshold = Math.floor(humanMembers.length / 2) + 1;

            if (results.agree.count >= majorityThreshold) {
                await unlockChannel(voiceChannel);
                await interaction.editReply('Channel unlocked.');
            } else {
                await interaction.editReply('Not enough votes to unlock the channel.');
            }
        } catch (error) {
            console.error('Error during voting process:', error);
            await interaction.editReply('Vote timed out or failed.');
        } finally {
            delete votePending[voiceChannel.id];
        }
    },
};
