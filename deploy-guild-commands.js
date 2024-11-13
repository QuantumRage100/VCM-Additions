// deploy-guild-commands.js
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const commands = [];

// Check if GUILD_ID is valid
if (!process.env.GUILD_ID || isNaN(process.env.GUILD_ID) || process.env.GUILD_ID.length < 17 || process.env.GUILD_ID.length > 19) {
    console.error(`Error: Invalid or missing GUILD_ID in the .env file.
    
- Provided GUILD_ID: "${process.env.GUILD_ID || 'undefined'}"
    
It looks like you might have entered some "chicken scratch"! To provide a proper Guild ID:
1. Open Discord and go to User Settings.
2. Go to "Advanced" and enable "Developer Mode."
3. Navigate to your server and right-click the server name at the top.
4. Select "Copy ID" from the dropdown menu to copy the Guild ID.
5. Paste the Guild ID into your .env file as GUILD_ID=YOUR_GUILD_ID_HERE.

Please add a valid Guild ID and try again.`);
    process.exit(1); // Exit the script if no valid GUILD_ID is provided
}

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${file} is missing "data" or "execute" property.`);
    }
}

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

// Spinner function
const spinner = ['|', '/', '-', '\\'];
let spinnerIndex = 0;
const intervalId = setInterval(() => {
    process.stdout.write(`\r${spinner[spinnerIndex++ % spinner.length]} Working...`);
}, 200);

(async () => {
    try {
        console.log(`\nStarted refreshing ${commands.length} application (/) commands.`);

        // Clear global commands first
        console.log('Clearing all global commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
        console.log('\nGlobal commands cleared successfully.');

        // Clear and deploy guild-specific commands
        console.log('Clearing existing guild-specific commands...');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
        console.log('\nGuild-specific commands cleared successfully.');

        console.log(`Deploying ${commands.length} new guild-specific commands...`);
        const data = await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        console.log(`\nSuccessfully deployed ${data.length} application (/) commands to guild ID ${process.env.GUILD_ID}.`);
    } catch (error) {
        console.error('\nError during command deployment:', error);
    } finally {
        clearInterval(intervalId);
        console.log('\nDeployment complete.');
    }
})();
