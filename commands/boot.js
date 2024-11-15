const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const vote = require('../misc/vote.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';
const VOTING_DURATION = parseInt(process.env.VOTING_DURATION, 10) || 120000; // Default to 2 minutes if not set
let votePending = {};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boot')
        .setDescription('Boot a user from your voice channel.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to boot from the channel.')
                .setRequired(true)
        ),
    cooldown: 20,
    guildOnly: true,

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        let voiceChannel = interaction.member.voice.channel;

        // Ensure the user is in a voice channel
        if (!voiceChannel) {
            await interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
            return;
        }

        // Ensure the bot has permission to move members
        if (!voiceChannel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.MoveMembers)) {
            await interaction.reply({ content: 'I do not have permission to move members in this voice channel.', ephemeral: true });
            return;
        }

        let targetMember = voiceChannel.members.get(targetUser.id);

        // Check if the target user is in the voice channel
        if (!targetMember) {
            await interaction.reply({ content: 'The specified user is not in your voice channel.', ephemeral: true });
            return;
        }

        const nonBotUsers = Array.from(voiceChannel.members.values()).filter(member => !member.user.bot);

        if (nonBotUsers.length > 1) {
            if (votePending[voiceChannel.id]) {
                await interaction.reply('There is already a vote pending on this channel.');
                return;
            }

            votePending[voiceChannel.id] = true;

            // Start the voting process
            await interaction.deferReply();
            vote.vote(`Kick <@${targetUser.id}> from the voice channel "${voiceChannel.name}"? Please vote using the reactions below.`, interaction.channel, {
                targetUsers: nonBotUsers,
                time: VOTING_DURATION // Use the variable from .env
            }).then(async (results) => {
                // Recheck if the channel and targetMember still exist
                voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    await interaction.editReply('The voice channel no longer exists.');
                    delete votePending[voiceChannel.id];
                    return;
                }
                targetMember = voiceChannel.members.get(targetUser.id);
                if (!targetMember) {
                    await interaction.editReply('The target user is no longer in the voice channel.');
                    delete votePending[voiceChannel.id];
                    return;
                }

                const totalVotes = nonBotUsers.length;
                const majority = (results.agree.count + 1) / totalVotes > 0.5; // +1 for the command initiator's implicit agreement

                if (majority) {
                    try {
                        await targetMember.voice.disconnect('Removed by vote.');
                        const dmMessage = `You have been removed from the voice channel "${voiceChannel.name}".`;
                        try {
                            await targetUser.send(dmMessage);
                        } catch {
                            await interaction.channel.send(`<@${targetUser.id}> ${dmMessage}`);
                        }
                        await interaction.editReply(`<@${targetUser.id}> has been booted from the voice channel by vote.`);
                        if (LOG_COMMANDS) {
                            console.log(`[COMMAND LOG] Booted user ${targetUser.tag} from voice channel "${voiceChannel.name}" by vote.`);
                        }
                    } catch (error) {
                        console.error(`[ERROR] Failed to boot user ${targetUser.tag}:`, error);
                        await interaction.editReply('Failed to boot the user due to an error.');
                    }
                } else {
                    await interaction.editReply('Vote failed. The user will remain in the voice channel.');
                }

                delete votePending[voiceChannel.id];
            }).catch(async () => {
                await interaction.editReply('Vote timed out or failed.');
                delete votePending[voiceChannel.id];
            });
        } else {
            // Directly boot the user if there's only one non-bot member
            try {
                await targetMember.voice.disconnect('Removed by command.');
                const dmMessage = `You have been removed from the voice channel "${voiceChannel.name}".`;
                try {
                    await targetUser.send(dmMessage);
                } catch {
                    await interaction.channel.send(`<@${targetUser.id}> ${dmMessage}`);
                }
                await interaction.reply({ content: `<@${targetUser.id}> has been booted from the voice channel.`, ephemeral: true });
                if (LOG_COMMANDS) {
                    console.log(`[COMMAND LOG] Booted user ${targetUser.tag} from voice channel "${voiceChannel.name}".`);
                }
            } catch (error) {
                console.error(`[ERROR] Failed to boot user ${targetUser.tag}:`, error);
                await interaction.reply({ content: 'Failed to boot the user due to an error.', ephemeral: true });
            }
        }
    }
};
