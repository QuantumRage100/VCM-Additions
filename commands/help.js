const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all of my commands or info about a specific command.')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command you want help with')
                .setRequired(false)
        ),
    cooldown: 5,
    async execute(interaction) {
        // Check if the bot has permission to send messages in the current channel
        if (!interaction.channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
            await interaction.reply({ content: 'I do not have permission to send messages in this channel.', ephemeral: true });
            return;
        }

        const { commands } = interaction.client;
        const data = [];

        const commandName = interaction.options.getString('command');

        if (!commandName) {
            // If no command is specified, list all commands
            data.push('Here\'s a list of all my commands:');
            data.push(Array.from(commands.keys()).join(', ')); // Changed this line to work with Map
            data.push(`\nYou can send \`/help [command name]\` to get info on a specific command!`);
        } else {
            // If a command is specified, show info about that command
            const command = commands.get(commandName);

            if (!command) {
                return interaction.reply('That\'s not a valid command!');
            }

            data.push(`**Name:** ${command.name}`);

            if (command.description) data.push(`**Description:** ${command.description}`);
            if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(', ')}`);
            if (command.usage) data.push(`**Usage:** \`/help ${command.name} ${command.usage}\``);

            data.push(`**Cooldown:** ${command.cooldown || 3} second(s)`);
        }

        // Send the response
        return interaction.reply({ content: data.join('\n'), ephemeral: true });
    }
};
