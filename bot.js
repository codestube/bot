require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const prefix = 'purge ';
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // Only let users with Manage Messages run it (optional but recommended)
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return message.reply('You need Manage Messages to use this.');
  }

  const n = parseInt(message.content.slice(prefix.length).trim(), 10);
  if (!Number.isInteger(n) || n <= 0) return message.reply('Usage: `purge <amount>`');

  try {
    let remaining = n;
    let lastId = message.id;
    const toDelete = [];

    while (remaining > 0) {
      const batch = await message.channel.messages.fetch({ limit: 100, before: lastId });
      if (batch.size === 0) break;
      for (const m of batch.values()) {
        if (m.author.id === message.author.id) {
          toDelete.push(m);
          remaining--;
          if (remaining === 0) break;
        }
      }
      lastId = batch.last().id;
    }

    // Delete the N messages (one-by-one avoids the 14-day bulk delete limit)
    for (const m of toDelete) {
      try { await m.delete(); } catch (_) {}
    }

    // Delete the command message itself
    try { await message.delete(); } catch (_) {}

    // Optional feedback (auto-delete)
    const info = await message.channel.send(`${toDelete.length} sus messages purged. :>`);
    setTimeout(() => info.delete().catch(()=>{}), 1500);
  } catch (e) {
    console.error(e);
    message.channel.send('Purge failed (check my permissions/intents).');
  }
});

client.login(process.env.BOT_TOKEN);
