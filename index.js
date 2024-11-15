const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

// Import the necessary files
const channelManagement = require('./channelState/channelManagement.js');  // For channel management functions
const abbreviationHandler = require('./channelState/abbreviationHandler.js');  // For abbreviation handling

// Logging control
const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';

// Function to validate environment variables and perform login attempts
async function validateEnv(client) {
    const criticalErrors = [];
    const warnings = [];

    // Check for Discord bot token presence and display the value if it's invalid
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        criticalErrors.push("Discord bot token is missing in the .env file.");
    }

    // Check for Discord client ID presence and format
    const clientId = process.env.CLIENT_ID;
    if (!clientId) {
        criticalErrors.push("Discord client ID is missing in the .env file.");
    } else if (!/^\d{18}$/.test(clientId)) {
        criticalErrors.push(`Invalid Discord client ID format: ${clientId}`);
    }

    // Test Google API Key and Search Engine ID by making a sample request
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.SEARCH_ENGINE_ID;

    if (googleApiKey && searchEngineId) {
        const testUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&safe=off&q=test`;
        https.get(testUrl, (res) => {
            if (res.statusCode === 403 || res.statusCode === 400) {
                console.warn("\n[WARNING] Invalid Google API credentials:");
                console.warn(` - Google API Key: ${googleApiKey}`);
                console.warn(` - Search Engine ID: ${searchEngineId}`);
                console.warn("The bot will work without these, but game name shortening may not function.\n");
            } else if (res.statusCode !== 200) {
                console.error(`[ERROR] Unexpected response while validating Google API Key: ${res.statusCode}`);
            } else if (LOG_COMMANDS) {
                console.log(`[COMMAND LOG] Successfully validated Google API Key.`);
            }
        }).on('error', (e) => {
            console.error(`[ERROR] Error while validating Google API Key: ${e.message}`);
        });
    } else {
        console.warn("\n[WARNING] Missing Google API credentials:");
        console.warn(` - Google API Key: ${googleApiKey || "Not provided"}`);
        console.warn(` - Search Engine ID: ${searchEngineId || "Not provided"}`);
        console.warn("The bot will work without these, but game name shortening may not function.\n");
    }

    // Display critical errors prominently
    if (criticalErrors.length > 0) {
        console.error("\n========== [CRITICAL ERRORS] ==========");
        criticalErrors.forEach((error) => console.error(" - " + error));
        console.error("\nThe bot cannot start until these errors are resolved.");
        console.log("\nPress Enter to exit...");

        // Wait for user input before exiting
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.exit(1);
        });

        return false;
    }

    // Display warnings for non-critical issues below critical errors
    if (warnings.length > 0) {
        console.warn("\n[ENVIRONMENT VARIABLE WARNINGS]");
        warnings.forEach((warning) => console.warn(" - " + warning));
    }

    // Attempt to login with Discord token to validate it
    try {
        await client.login(token);
        if (LOG_COMMANDS) console.log(`[COMMAND LOG] Successfully logged in with the provided Discord token.`);
    } catch (error) {
        console.error(`\n========== [CRITICAL ERROR] ==========\nInvalid Discord bot token: ${token}`);
        console.error("Please check your .env file and ensure the token is correct.");
        console.log("\nPress Enter to exit...");
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.exit(1);
        });
        return false;
    }
    return true;
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

// Validate environment setup
(async () => {
    const validEnv = await validateEnv(client);
    if (!validEnv) return;  // Exit if environment validation fails

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
        // Initialize the channel management system
        channelManagement.init(client);

        console.log('[INFO] Bot is ready!');

        try {
            // Generate an invite link with minimal permissions
            const inviteLink = await client.generateInvite({
                scopes: ['bot', 'applications.commands'],
                permissions: []
            });

            // Format and display the invite link
            console.log(`\n=====================\nInvite the bot using this link:\n${inviteLink}\n=====================\n`);
        } catch (error) {
            console.error('[ERROR] Error generating invite link:', error);
        }
    });

    // Event listener for handling interactions, including commands and autocomplete
    client.on(Events.InteractionCreate, async interaction => {
        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                const voiceChannel = interaction.member?.voice?.channel;

                // Recheck if the voice channel exists for voice-based commands
                if (['lock', 'unlock', 'setmax', 'setvad', 'boot'].includes(interaction.commandName) && !voiceChannel) {
                    await interaction.reply({ content: 'You are not connected to a valid voice channel.', ephemeral: true });
                    return;
                }

                // Execute the command
                await command.execute(interaction);
            } catch (error) {
                console.error(`[ERROR] Error executing ${interaction.commandName}:`, error);
                try {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                } catch (replyError) {
                    console.error(`[ERROR] Error sending error message for ${interaction.commandName}:`, replyError);
                }
            }
        } else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.autocomplete) {
                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    console.error(`[ERROR] Error during autocomplete for ${interaction.commandName}:`, error);
                }
            }
        }
    });
})();
