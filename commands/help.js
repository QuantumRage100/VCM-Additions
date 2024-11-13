const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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
                return interaction.reply('That\'s not a valid command!');
            }

            // Retrieve command details
            data.push(`**Name:** ${command.data.name}`);
            data.push(`**Description:** ${command.data.description}`);
            data.push(`**Cooldown:** ${command.cooldown || 3} second(s)`);
        }

        return interaction.reply({ content: data.join('\n'), ephemeral: true });
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(interaction.client.commands.keys());
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })).slice(0, 25) // Discord allows a max of 25 suggestions
        );
    },
};
