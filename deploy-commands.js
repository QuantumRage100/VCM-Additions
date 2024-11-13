// deploy-commands.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
require('dotenv').config(); // Load .env variables

const commands = [];

// Import commands
const fs = require('fs');
const path = require('path');
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Read command files and add them to the commands array
for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${file} is missing "data" or "execute" property.`);
    }
}

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Clear global commands
        console.log('Clearing all global commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
        console.log('Global commands cleared successfully.');

        // Clear existing guild-specific commands before deploying new ones
        console.log('Clearing existing guild-specific commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [] }
        );
        console.log('Guild-specific commands cleared successfully.');

        // Deploy new guild-specific commands
        console.log(`Deploying ${commands.length} new guild-specific commands...`);
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log(`Successfully deployed ${data.length} application (/) commands to guild ID ${process.env.GUILD_ID}.`);
    } catch (error) {
        console.error('Error during command deployment:', error);
    }
})();
