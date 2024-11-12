/**
 * A simple discord.js bot to manage Voice Channels.
 *
 * Dynamic command handling based on https://github.com/discordjs/guide/tree/master/code_samples/command-handling/dynamic-commands
 */
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const commandListener = require('./listeners/command.js');
const channelStateListener = require('./listeners/channelState.js');

// Initialize client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,                // Required for guild events
        GatewayIntentBits.GuildMessages,         // Required if your bot needs to read messages
        GatewayIntentBits.MessageContent,        // Required to access message content if needed
        GatewayIntentBits.GuildVoiceStates,      // Required for managing voice states
        GatewayIntentBits.GuildPresences         // Required to access user presence and activities
    ]
});

client.once('ready', () => {
    commandListener.init(client);
    channelStateListener.init(client);
    console.log('Ready!');
});

client.login(process.env.DISCORD_TOKEN);
