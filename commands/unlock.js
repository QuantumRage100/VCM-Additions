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
            // Sync permissions with the category if the voice channel has one
            await voiceChannel.lockPermissions(); // Syncs with the category permissions
        } else {
            // If there’s no category, allow @everyone to connect
            await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
                [PermissionFlagsBits.Connect]: null, // Resetting to default
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
        // Check if the bot has permission to send messages in the current channel
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        await interaction.deferReply(); // Acknowledge the interaction

        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.editReply('You must be connected to a voice channel to use this command.');
            return;
        }

        // Check if the channel is already unlocked
        const everyonePermissions = voiceChannel.permissionsFor(voiceChannel.guild.roles.everyone);
        if (everyonePermissions.has(PermissionFlagsBits.Connect)) {
            await interaction.editReply('This channel is already unlocked. Use the /lock command to lock it.');
            return;
        }

        if (votePending[voiceChannel.id]) {
            await interaction.editReply('A vote is already pending for this channel.');
            return;
        }

        votePending[voiceChannel.id] = true;

        // Filter out bots to get only human members
        const humanMembers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);
        const subject = `Unlock ${voiceChannel.name}? Please vote using the reactions below.`;

        try {
            const results = await utils.vote(subject, interaction.channel, {
                targetUsers: humanMembers,
                time: 30000, // Set voting time to 30 seconds
            });

            // Calculate the majority threshold based on human members only
            const totalHumanMembers = humanMembers.length;
            const majorityThreshold = Math.floor(totalHumanMembers / 2) + 1;

            // Check if the majority voted "agree"
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
