const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const LOG_COMMANDS = process.env.LOG_COMMANDS === 'true';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all of my commands or info about a specific command.')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command you want help with')
                .setRequired(false)
                .setAutocomplete(true) // Enables autocomplete
        ),
    cooldown: 5,

    async execute(interaction) {
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        const { commands } = interaction.client;
        const data = [];

        const commandName = interaction.options.getString('command');

        if (!commandName) {
            // List all commands if no specific command is requested
            data.push('Here\'s a list of all my commands:');
            data.push(commands.map(cmd => cmd.data.name).join(', '));
            data.push(`\nYou can send \`/help [command name]\` to get info on a specific command!`);
        } else {
            // Display details for a specific command
            const command = commands.get(commandName);

            if (!command) {
                await interaction.reply({ content: 'That\'s not a valid command!', ephemeral: true });
                if (LOG_COMMANDS) console.log(`[COMMAND LOG] Invalid command requested: ${commandName}`);
                return;
            }

            // Retrieve command details
            data.push(`**Name:** ${command.data.name}`);
            data.push(`**Description:** ${command.data.description}`);
            data.push(`**Cooldown:** ${command.cooldown || 3} second(s)`);
        }

        await interaction.reply({ content: data.join('\n'), ephemeral: true });
        if (LOG_COMMANDS) console.log(`[COMMAND LOG] Executed /help successfully.`);
    },

    async autocomplete(interaction) {
        const { commands } = interaction.client;

        if (!commands || commands.size === 0) {
            console.error('[ERROR] Autocomplete attempted but no commands found.');
            return;
        }

        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(commands.keys());
        const filtered = choices
            .filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase().trim()))
            .slice(0, 25); // Discord allows a max of 25 suggestions

        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice }))
        );

        if (LOG_COMMANDS) console.log(`[COMMAND LOG] Autocomplete executed for /help with input: "${focusedValue}"`);
    },
};
