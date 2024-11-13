const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const utils = require('../utils.js');
let votePending = {};

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
        
    } catch (error) {
        console.error(`Failed to lock ${voiceChannel.name}:`, error);
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

        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.editReply('You must be connected to a voice channel to use this command.');
            return;
        }

        const everyonePermissions = voiceChannel.permissionsFor(voiceChannel.guild.roles.everyone);
        if (!everyonePermissions.has(PermissionFlagsBits.Connect)) {
            await interaction.editReply('This channel is already locked. Use the `/unlock` command to unlock it.');
            return;
        }

        if (votePending[voiceChannel.id]) {
            await interaction.editReply('A vote is already pending for this channel.');
            return;
        }

        votePending[voiceChannel.id] = true;

        // Filter out bots to get only human members
        const humanMembers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);
        const subject = `Lock ${voiceChannel.name}? Please vote using the reactions below.`;

        try {
            const results = await utils.vote(subject, interaction.channel, {
                targetUsers: humanMembers,
                time: 30000,
            });

            // Calculate the majority threshold based on human members only
            const totalHumanMembers = humanMembers.length;
            const majorityThreshold = Math.floor(totalHumanMembers / 2) + 1;

            if (results.agree.count >= majorityThreshold) {
                await lockChannel(voiceChannel);
                await interaction.editReply('Channel locked.');
            } else {
                await interaction.editReply('Not enough votes to lock the channel.');
            }
        } catch (error) {
            console.error('Error during voting process:', error);
            await interaction.editReply('Vote timed out or failed.');
        } finally {
            delete votePending[voiceChannel.id];
        }
    },
};

