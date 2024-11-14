// deploy-global-commands.js
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const commands = [];

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
        console.log(`\nStarted refreshing ${commands.length} application (/) commands.\n`);

        // Attempt to clear global commands
        try {
            console.log('Clearing all global commands...');
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
            console.log('\nGlobal commands cleared successfully.\n');
        } catch (error) {
            console.error(`\n[ERROR] Invalid CLIENT_ID: "${process.env.CLIENT_ID}"\n`);
            console.log('[INFO] The Client ID should be a valid bot application ID, typically 18 digits.');
            console.log('[INFO] To retrieve your Client ID, go to the Discord Developer Portal, select your application, and copy the "Application ID" from the General Information tab.');
            console.log("The bot cannot proceed without a valid CLIENT_ID. Please correct the CLIENT_ID in your .env file.\n");
            process.exit(1);
        }

        // Attempt to clear guild-specific commands
        if (process.env.GUILD_ID) {
            try {
                console.log('Attempting to clear existing guild-specific commands...');
                await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
                console.log('\nGuild-specific commands cleared successfully.\n');
            } catch (error) {
                console.warn(`\n[WARNING] Invalid GUILD_ID found in .env file: "${process.env.GUILD_ID}"\n`);
                console.log('[INFO] The Guild ID should be a 17-19 digit numeric ID.');
                console.log('[INFO] Providing a valid GUILD_ID can help avoid duplicates by ensuring guild-specific commands are cleared.\n');
                console.log(`To retrieve your Guild ID:
1. Open Discord and go to User Settings.
2. Go to "Advanced" and enable "Developer Mode."
3. Navigate to your server and right-click the server name at the top.
4. Select "Copy ID" from the dropdown menu to copy the Guild ID.
5. Paste the Guild ID into your .env file as GUILD_ID=YOUR_GUILD_ID_HERE.

Note: If no valid Guild ID is provided, only global commands will be cleared.\n`);
            }
        } else {
            // Warning if GUILD_ID is missing
            console.warn('\n[WARNING] No GUILD_ID found in .env file. Skipping guild-specific command clearing.\n');
            console.log('[INFO] Providing a GUILD_ID can help avoid duplicates by ensuring guild-specific commands are cleared.\n');
        }

        // Deploy global commands
        console.log('Deploying global commands...');
        const data = await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log(`\nSuccessfully deployed ${data.length} global application (/) commands.`);
    } catch (error) {
        console.error('\nError during command deployment:', error);
    } finally {
        clearInterval(intervalId);
        console.log('\nDeployment complete.\n');
    }
})();
