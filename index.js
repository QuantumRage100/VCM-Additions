// index.js
const { Client, GatewayIntentBits, Collection, Events, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const channelStateListener = require('./listeners/channelState.js');

// Function to validate required environment variables
function validateEnv() {
    const warnings = [];
    let hasCriticalError = false;

    if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN.includes("YOUR_DISCORD_BOT_TOKEN_HERE")) {
        warnings.push("Discord bot token is missing or not set correctly in the .env file.");
        hasCriticalError = true;
    }
    if (!process.env.CLIENT_ID || process.env.CLIENT_ID.includes("YOUR_CLIENT_ID_HERE")) {
        warnings.push("Discord client ID is missing or not set correctly in the .env file.");
        hasCriticalError = true;
    }
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY.includes("YOUR_GOOGLE_API_KEY_HERE")) {
        warnings.push("Google API key is missing. Game name shortening may not work.");
    }
    if (!process.env.SEARCH_ENGINE_ID || process.env.SEARCH_ENGINE_ID.includes("YOUR_SEARCH_ENGINE_ID_HERE")) {
        warnings.push("Custom Search Engine ID is missing. Game name shortening may not work.");
    }

    if (warnings.length > 0) {
        console.warn("\n[ENVIRONMENT VARIABLE WARNINGS]");
        warnings.forEach((warning) => console.warn(" - " + warning));
        console.log("Please update your .env file accordingly.\n");
    }

    // If critical errors are present, exit the program gracefully after user acknowledgment
    if (hasCriticalError) {
        console.error("[ERROR] Missing critical environment variables. The bot cannot start without a valid token and client ID.");
        console.log("\nPress any key to restart/exit, depending on your setup...");
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', process.exit.bind(process, 1)); // Wait for user to press any key, then exit
        return false;
    }
    return true;
}

// Validate environment setup
if (!validateEnv()) {
    // Skip further execution if validation fails
    return;
}

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

// Event listener for handling interactions, including commands and autocomplete
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isCommand()) {
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
    } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command && command.autocomplete) {
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(`Error during autocomplete for ${interaction.commandName}`);
                console.error(error);
            }
        }
    }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);
