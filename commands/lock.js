const { SlashCommandBuilder } = require('@discordjs/builders'); // For SlashCommandBuilder
const { PermissionFlagsBits } = require('discord.js'); // For permission handling
const utils = require('../utils.js');

let votePending = {};

// Function to lock the voice channel
function doLock(voiceChannel) {
    let perms, promises = [];

    // Reset CONNECT overwrites
    perms = voiceChannel.permissionOverwrites.map(overwrite => ({
        deny: overwrite.denied.remove(PermissionFlagsBits.Connect).bitfield,
        allow: overwrite.allowed.remove(PermissionFlagsBits.Connect).bitfield,
        id: overwrite.id,
        type: overwrite.type,
    }));

    // Edit the permissions with the updated permissions
    let promise = voiceChannel.edit({ permissionOverwrites: perms });

    // Set CONNECT on for current members (and this bot)
    promise = promise.then(() => {
        promises = [];
        voiceChannel.members.forEach(member => {
            promises.push(voiceChannel.permissionOverwrites.create(member, { 'CONNECT': true }));
        });
        promises.push(voiceChannel.permissionOverwrites.create(voiceChannel.client.user, { 'CONNECT': true }));
        return Promise.all(promises);
    });

    // Set CONNECT off for all roles
    promise = promise.then(() => {
        let promises = [];
        voiceChannel.guild.roles.cache.forEach(role => {
            promises.push(voiceChannel.permissionOverwrites.create(role, { 'CONNECT': false }));
        });
        return Promise.all(promises);
    });

    return promise;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the voice channel so only the current occupants can join'),
    cooldown: 20,
    guildOnly: true,

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply('You must be in a voice channel to use this command.');
        }

        if (voiceChannel.parentId !== interaction.channel.parentId) {
            return interaction.reply('You cannot manage a channel in a different category.');
        }

        const userCount = voiceChannel.members.size;

        if (userCount === 1) {
            return interaction.reply('You are the only one here, so locking doesn\'t make sense.');
        }

        const targetUsers = [];
        // Exclude bots from the vote
        voiceChannel.members.forEach(member => {
            if (member.id !== interaction.member.id && !member.user.bot) {
                targetUsers.push(member);
            }
        });

        if (votePending[voiceChannel.id] === true) {
            return interaction.reply('There is already a vote pending on that channel.');
        }

        votePending[voiceChannel.id] = true;
        
        // Call vote system - Ensure that utils.vote works with interactions
        utils.vote(`${interaction.user.tag} has requested to lock ${voiceChannel.name}. Please vote using the reactions below.`, interaction.channel, {
            targetUsers,
            time: 10000
        }).then(results => {
            if (((results.agree.count + 1) / userCount) > 0.5) { // +1 for requesting user
                doLock(voiceChannel).then(() => {
                    interaction.reply('Channel locked.');
                });
            } else {
                interaction.reply('Request rejected by channel members.');
            }
            delete votePending[voiceChannel.id];
        }).catch(() => {
            delete votePending[voiceChannel.id];
        });
    }
};
