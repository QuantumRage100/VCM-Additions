# Discord Voice Channel Manager

A slightly less simple discord.js bot to manage Voice Channels.

Will manage channels in any category that the bot has MANAGE_CHANNELS, MANAGE_ROLES, MOVE_MEMBERS, VIEW_CHANNEL and CONNECT permissions in the following ways;

* Updates the name of voice channels to represent the activity of the majority of members in the channel.
* Ensures that there is always one empty voice channel available in the category
* Allows for users to do the following things on the Voice Channel they are connected to
  - Set the userLimit using the 'setmax' command (Bots can’t bypass this by default; it’s up to the creator to enable it.)
  - Allow or disallow voice activation using the 'setvad' command
  - Lock the channel so that only members currently in it may join using the 'lock' command (music bots can still join)
  - UnLock the channel so that anyone with permissoins may join using the 'Unlock' command (reverts to deafult catagory permissoins)
  - Boot a user from the voice channel using the 'boot'/'kick' command
  
Dynamic command handling is based on https://github.com/discordjs/guide/tree/master/code_samples/command-handling/dynamic-commands

### Configuration (.env)

##### "DISCORD_TOKEN"

The app bot user token. Found in the Discord application console - https://discordapp.com/developers/applications/me/

##### "GOOGLE_API_KEY"
##### "SEARCH_ENGINE_ID"

you will need to make your own google api search engine, and filter for just the reddit website - https://developers.google.com/custom-search/v1/overview

##### "GUILD_ID"
##### "CLIENT_ID"

this is somewhat tempowery while im working on the bot, the guild and client id are for slash command propergatoin, its faster to update slash commands for a speecified build, but in the future this will just be a global slash command propergatoin thing which will work for all servers i think? idk im learning as i go on this one
