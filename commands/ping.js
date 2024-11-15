const { SlashCommandBuilder } = require('@discordjs/builders');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),

    async execute(interaction) {
        try {
            await interaction.reply('Pong!');
            if (LOG_COMMANDS) {
                console.log(`[COMMAND LOG] Executed /ping successfully.`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to execute /ping:`, error);
        }
    },
};
