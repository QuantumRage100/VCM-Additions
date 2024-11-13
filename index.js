// index.js
const { Client, GatewayIntentBits, Collection, Events, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const channelStateListener = require('./listeners/channelState.js');

// Initialize the client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ]
});

// Create a collection to store commands
client.commands = new Collection();

// Path to the commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Register commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Event listener for when the bot is ready
client.once(Events.ClientReady, async () => {
    channelStateListener.init(client);
    console.log('Ready!');

    try {
        // Generate an invite link with minimal permissions
        const inviteLink = await client.generateInvite({
            scopes: ['bot', 'applications.commands'],
            permissions: []
        });
        
        // Format and display the invite link
        console.log(`\n=====================\nInvite the bot using this link:\n${inviteLink}\n=====================\n`);
    } catch (error) {
        console.error('Error generating invite link:', error);
    }
});

// Event listener for handling interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}`);
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);
