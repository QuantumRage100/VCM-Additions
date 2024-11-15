const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const vote = require('../misc/vote.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';
const VOTING_DURATION = parseInt(process.env.VOTING_DURATION, 10) || 120000; // Default to 2 minutes if not set
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

        if (LOG_COMMANDS) {
            console.log(`[COMMAND LOG] Voice activation set to "${state}" for ${voiceChannel.name}.`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to set VAD for ${voiceChannel.name}:`, error);
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
        try {
            // Check if the bot has permission to send messages in the current channel
            if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
                await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
                return;
            }

            const state = interaction.options.getString('state');
            let exclude = interaction.options.getRole('exclude');
            let voiceChannel = interaction.member.voice.channel;

            if (!voiceChannel) {
                await interaction.reply({ content: 'You must be in a voice channel to set VAD.', ephemeral: true });
                return;
            }

            if (state !== 'off') {
                exclude = undefined;
            }

            // Get non-bot users in the channel
            const nonBotUsers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);

            // Defer the reply to prevent timeout
            await interaction.deferReply();

            if (nonBotUsers.length > 1) {
                if (votePending[voiceChannel.id]) {
                    await interaction.editReply('There is already a vote pending on that channel.');
                    return;
                }

                votePending[voiceChannel.id] = true;

                // Start the vote
                vote.vote(`Set voice activation detection for ${voiceChannel.name} to "${state}"? Please vote using the reactions below.`, interaction.channel, {
                    targetUsers: nonBotUsers,
                    time: VOTING_DURATION // Use the variable from .env
                }).then(async (results) => {
                    // Recheck if the channel still exists after voting
                    voiceChannel = interaction.member.voice.channel;
                    if (!voiceChannel) {
                        await interaction.editReply('The voice channel no longer exists.');
                        delete votePending[voiceChannel.id];
                        return;
                    }

                    if (((results.agree.count + 1) / nonBotUsers.length) > 0.5) { // +1 for the command initiator
                        try {
                            await doSetVad(voiceChannel, state, exclude);
                            await interaction.editReply(`Voice activation set to "${state}".`);
                        } catch (error) {
                            console.error(`[ERROR] Failed to set VAD for ${voiceChannel.name}:`, error);
                            await interaction.editReply('Failed to set voice activation due to an error.');
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
                // Apply the VAD setting if there's only one member
                try {
                    await doSetVad(voiceChannel, state, exclude);
                    await interaction.editReply(`Voice activation set to "${state}".`);
                } catch (error) {
                    console.error(`[ERROR] Failed to set VAD for ${voiceChannel.name}:`, error);
                    await interaction.editReply('Failed to set voice activation due to an error.');
                }
            }

            if (LOG_COMMANDS) {
                console.log(`[COMMAND LOG] Executed /setvad for ${voiceChannel.name} with state "${state}".`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to execute /setvad:`, error);
            await interaction.editReply({ content: 'Failed to set voice activation due to an error.', ephemeral: true });
        }
    },
};
