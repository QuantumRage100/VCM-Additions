const { SlashCommandBuilder } = require('@discordjs/builders');
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
        let subject = '',
            voiceChannel = interaction.member.voice.channel,
            targetUsers = [],
            userCount,
            user = interaction.options.getUser('user');

        if (!voiceChannel) {
            return interaction.reply('User not connected to a voice channel');
        }

        if (voiceChannel.parentId !== interaction.channel.parentId) {
            return interaction.reply('Cannot manage the voice channel');
        }

        if (!user) {
            return interaction.reply('No user mentioned');
        }

        if (interaction.user.id === user.id) {
            return interaction.reply('Why?');
        }

        userCount = voiceChannel.members.size;
        voiceChannel.members.forEach(member => {
            if (member.id !== interaction.member.id) {
                targetUsers.push(member);
            }
        });

        if (votePending[voiceChannel.id] === true) {
            return interaction.reply('There is already a vote pending on that channel');
        }
        votePending[voiceChannel.id] = true;

        utils.vote(interaction.user.toString() + ' has requested that ' + user.toString() + ' be kicked from ' + voiceChannel.name + '? Please vote using the reactions below.', interaction.channel, {
            targetUsers: targetUsers,
            time: 10000
        }).then(results => {
            if (((results.agree.count + 1) / userCount) > 0.5) { //+1 for requesting user
                voiceChannel.permissionOverwrites.create(user, {
                    'CONNECT': false
                }).then(() => {
                    let newChannel = voiceChannel.parent.children.find(channel => {
                        return channel.type === 'voice' && channel.members.size === 0;
                    });
                    user.send('You have been removed from ' + voiceChannel.name).then(() => {
                        user.setVoiceChannel(newChannel).then(() => {
                            interaction.reply('User removed');
                        });
                    });
                });
            } else {
                interaction.reply('Request rejected by channel members');
            }
            delete votePending[voiceChannel.id];
        }).catch(() => {
            delete votePending[voiceChannel.id];
        });
    }
};
