const { Client, GatewayIntentBits, Events } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
require('dotenv').config();  // Make sure this is at the top

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,  // Necessary for guild events (including commands)
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Load token and guildId from the environment variables
const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

client.once('ready', async () => {
    console.log('Bot is ready!');

    // Initialize the commands collection
    client.commands = new Map();

    // Read all command files from the commands folder
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    const commands = [];

    // Dynamically load all commands
    for (const file of commandFiles) {
        const command = require(`./commands/${file}`);
        client.commands.set(command.data.name, command);  // Store the command by its name
        commands.push(command.data.toJSON());  // Ensure commands are properly formatted for registration
    }

    try {
        // Register all commands to the guild
        await client.guilds.cache.get(guildId).commands.set(commands);
        console.log('Successfully registered application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Handle interactions (slash commands)
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;  // Ignore non-command interactions
    console.log('Received interaction:', interaction.commandName);  // Debugging log

    const command = client.commands.get(interaction.commandName);  // Fetch command from collection
    if (!command) return;

    try {
        await command.execute(interaction);  // Execute command
    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: 'There was an error while executing this command!',
            ephemeral: true
        });
    }
});

// Log in the bot using the token from the .env file
client.login(token);
