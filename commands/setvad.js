const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');
const utils = require('../utils.js');
let votePending = {};

// Function to set VAD on/off for the channel
function doSetVad(voiceChannel, state, exclude) {
    const allowVad = state === 'on'; // If 'on', VAD is allowed

    // Initialize an array for permission overwrites
    let perms = voiceChannel.permissionOverwrites.cache.map(overwrite => {
        return {
            deny: overwrite.denied.remove(PermissionFlagsBits.UseVad).bitfield,
            allow: overwrite.allowed.remove(PermissionFlagsBits.UseVad).bitfield,
            id: overwrite.id,
            type: overwrite.type,
        };
    });

    // Apply the new permission overwrites to the channel
    return voiceChannel.edit({
        permissionOverwrites: perms
    }).then(() => {
        let promises = [];

        // Apply the VAD permission to roles, excluding the role (if provided)
        voiceChannel.guild.roles.cache.forEach(role => {
            promises.push(voiceChannel.permissionOverwrites.edit(role, {
                'USE_VAD': (exclude && exclude.id === role.id) || allowVad
            }));
        });

        return Promise.all(promises);
    });
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
        // Check if the bot has permission to send messages in the current channel
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        const state = interaction.options.getString('state');
        let exclude = interaction.options.getRole('exclude');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply('You must be in a voice channel to set VAD.');
        }

        // Check if the channel is in the same category as the command channel
        if (voiceChannel.parentId !== interaction.channel.parentId) {
            return interaction.reply('You cannot manage a voice channel in a different category.');
        }

        // Exclude is only applicable when turning VAD off
        if (state !== 'off') {
            exclude = undefined;
        }

        let targetUsers = [];
        const userCount = voiceChannel.members.size;

        // Filter out bots from target users
        voiceChannel.members.forEach(member => {
            if (member.id !== interaction.member.id && !member.user.bot) {
                targetUsers.push(member);
            }
        });

        // If there are multiple members, initiate a vote to apply the VAD change
        if (userCount > 1) {
            if (votePending[voiceChannel.id] === true) {
                return interaction.reply('There is already a vote pending on that channel.');
            }

            votePending[voiceChannel.id] = true;

            // Call the vote system
            utils.vote(`Set voice activation "${state}" for ${voiceChannel.name}? Please vote using the reactions below.`, interaction.channel, {
                targetUsers,
                time: 10000
            }).then(results => {
                if (((results.agree.count + 1) / userCount) > 0.5) { // +1 for requesting user
                    doSetVad(voiceChannel, state, exclude).then(() => {
                        interaction.reply(`Voice activation set to "${state}"`);
                    });
                } else {
                    interaction.reply('Request rejected by channel members');
                }
                delete votePending[voiceChannel.id];
            }).catch(() => {
                delete votePending[voiceChannel.id];
            });
        } else {
            // Apply the VAD setting directly if there is only one member in the channel
            doSetVad(voiceChannel, state, exclude).then(() => {
                interaction.reply(`Voice activation set to "${state}"`);
            });
        }
    }
};
