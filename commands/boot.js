const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const utils = require('../utils.js');
let votePending = {};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boot')
        .setDescription('Boot a user from the voice channel')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to boot')
                .setRequired(true)),
    cooldown: 120,
    guildOnly: true,

    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser('user');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('You must be in a voice channel to use this command.');
        }

        if (!user) {
            return interaction.editReply('No user mentioned.');
        }

        if (interaction.user.id === user.id) {
            return interaction.editReply('Why would you want to boot yourself?');
        }

        const botPermissions = voiceChannel.permissionsFor(interaction.client.user);

        if (!botPermissions.has([PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels])) {
            return interaction.editReply('I do not have permission to manage or move members in this voice channel.');
        }

        const userCount = voiceChannel.members.filter(member => !member.user.bot).size;
        const targetUsers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot && member.id !== interaction.member.id);

        if (votePending[voiceChannel.id]) {
            return interaction.editReply('There is already a vote pending on this channel.');
        }

        votePending[voiceChannel.id] = true;

        if (userCount === 1) {
            await this.bootUser(interaction, voiceChannel, user);
            delete votePending[voiceChannel.id];
            return;
        }

        utils.vote(`${interaction.user} has requested that ${user} be kicked from ${voiceChannel.name}. Please vote using the reactions below.`, interaction.channel, {
            targetUsers,
            time: 10000
        }).then(async results => {
            if (((results.agree.count + 1) / userCount) > 0.5) {
                await this.bootUser(interaction, voiceChannel, user);
            } else {
                await interaction.editReply('Request rejected by channel members.');
            }
            delete votePending[voiceChannel.id];
        }).catch(error => {
            console.error('[ERROR] Vote failed or timed out:', error);
            delete votePending[voiceChannel.id];
            interaction.editReply('Vote timed out or failed.');
        });
    },

    async bootUser(interaction, voiceChannel, user) {
        try {
            await voiceChannel.permissionOverwrites.create(user, {
                [PermissionFlagsBits.Connect]: false
            });

            try {
                await user.send(`You have been removed from ${voiceChannel.name}`);
            } catch (dmError) {
                console.warn(`[WARNING] Could not send DM to user: ${dmError.message}`);
            }

            const refreshedMember = await voiceChannel.guild.members.fetch(user.id);
            if (refreshedMember.voice.channelId === voiceChannel.id) {
                const newChannel = voiceChannel.parent?.children.cache.find(channel =>
                    channel.type === ChannelType.GuildVoice && channel.members.size === 0
                );

                if (newChannel) {
                    await refreshedMember.voice.setChannel(newChannel);
                    await interaction.editReply('User removed.');
                } else {
                    await interaction.editReply('No empty channel available to move the user.');
                }
            } else {
                await interaction.editReply('User already removed from the channel.');
            }
        } catch (error) {
            console.error('[ERROR] Failed to boot user:', error);
            await interaction.editReply('An error occurred while trying to remove the user.');
        }
    }
};
