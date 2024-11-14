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
  
~~Dynamic command handling is based on https://github.com/discordjs/guide/tree/master/code_samples/command-handling/dynamic-commands~~

### Configuration (.env)

##### "DISCORD_TOKEN"

The app bot user token. Found in the Discord application console - https://discordapp.com/developers/applications/me/

##### "GOOGLE_API_KEY"
##### "SEARCH_ENGINE_ID"

you will need to make your own google api search engine, and filter for just the reddit website - https://developers.google.com/custom-search/v1/overview

##### "CLIENT_ID"

this is your bots applicatoin id/client id and is requierd for command deployment you can find it on this page inside your bot application https://discord.com/developers/applications

##### "GUILD_ID"

this is 100% optional, specifying a guild id (your server id) will limit the bot command deployment to only your server, this is helpful for testing / troubleshooting commands, but most of the time you can leave this blank
