const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const utils = require('../utils.js');
let votePending = {};

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
