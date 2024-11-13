const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const utils = require('../utils.js');
let votePending = {};

// Function to set VAD on/off for the channel
async function doSetVad(voiceChannel, state, exclude) {
    const allowVad = state === 'on';

    try {
        const members = await voiceChannel.guild.members.fetch();

        // Set VAD for bot members to always allow
        const botPermissionPromises = members
            .filter(member => member.user.bot)
            .map(botMember =>
                voiceChannel.permissionOverwrites.edit(botMember.id, {
                    [PermissionFlagsBits.UseVAD]: true
                })
            );

        await Promise.all(botPermissionPromises);

        // Explicitly update @everyone role VAD permission
        await voiceChannel.permissionOverwrites.edit(voiceChannel.guild.roles.everyone, {
            [PermissionFlagsBits.UseVAD]: allowVad
        });
        console.log(`Set VAD for @everyone role to ${allowVad}`);

        // Set VAD for other roles and members based on 'state' and exclude logic
        const permissionPromises = [];
        voiceChannel.permissionOverwrites.cache.forEach(overwrite => {
            const role = voiceChannel.guild.roles.cache.get(overwrite.id);
            if (role && role.id !== voiceChannel.guild.roles.everyone.id && (!exclude || exclude.id !== overwrite.id)) {
                permissionPromises.push(
                    voiceChannel.permissionOverwrites.edit(overwrite.id, {
                        [PermissionFlagsBits.UseVAD]: allowVad
                    })
                );
            }
        });

        await Promise.all(permissionPromises);
        console.log(`Voice activation set to "${state}" successfully for ${voiceChannel.name}`);
    } catch (error) {
        console.error(`Failed to set VAD for ${voiceChannel.name}`, error);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setvad')
        .setDescription('Allow or disallow Voice Activation. When disallowing, a role to exclude can be passed.')
        .addStringOption(option =>
            option.setName('state')
                .setDescription('Turn VAD on or off')
                .setRequired(true)
                .addChoices(
                    { name: 'on', value: 'on' },
                    { name: 'off', value: 'off' }
                )
        )
        .addRoleOption(option =>
            option.setName('exclude')
                .setDescription('Role to exclude from the VAD setting')
                .setRequired(false)
        ),
    cooldown: 20,
    guildOnly: true,

    async execute(interaction) {
        console.log('Executing /setvad command');

        // Check if the bot has permission to send messages in the current channel
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        const state = interaction.options.getString('state');
        let exclude = interaction.options.getRole('exclude');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply('You must be in a voice channel to set VAD.');
            return;
        }

        if (state !== 'off') {
            exclude = undefined;
        }

        // Defer the reply to prevent timeout
        await interaction.deferReply();

        // Apply the VAD setting
        try {
            await doSetVad(voiceChannel, state, exclude);
            await interaction.editReply(`Voice activation set to "${state}"`);
        } catch (error) {
            console.error(`Error setting VAD: ${error}`);
            await interaction.editReply('Failed to set voice activation due to an error.');
        }
    }
};
