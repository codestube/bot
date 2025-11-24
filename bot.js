// ========== for gcloud health checks ==========
const http = require('http');
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok\n');
}).listen(port, '0.0.0.0', () => {
  console.log(`Health server listening on ${port}`);
});
// ==============================================

// ================ for firestore ================
const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore();
const todosCollection = db.collection('todos');

// helper func
async function addTodo(userId, guildId, description) {
  const docRef = await todosCollection.add({
    userId,
    guildId: guildId || null,
    description,
    completed: false,
    createdAt: new Date(),
  });
  return docRef.id;
}

async function getTodos(userId, guildId, limit = 10) {
  let query = todosCollection.where('userId', '==', userId);

  if (guildId) {
    query = query.where('guildId', '==', guildId);
  }

  const snapshot = await query.limit(limit).get();

  const todos = [];
  snapshot.forEach((doc) => todos.push({ id: doc.id, ...doc.data() }));
  return todos;
}
// ==============================================

require('dotenv').config();

// discord.js imports
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ============== /todo command ==============
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('todo')
      .setDescription('Manage your to-do list')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add a new to-do item'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('list')
          .setDescription('List your to-do items'),
      ),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    for (const [guildId, guild] of client.guilds.cache) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands },
      );
      console.log(`Registered /todo in guild ${guild.name} (${guildId})`);
    }
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
});
// =================================================

// ============ interaction handlers ===============
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'todo') {
        const sub = interaction.options.getSubcommand();

        // /todo add -> show modal
        if (sub === 'add') {
          const modal = new ModalBuilder()
            .setCustomId('todo-add-modal')
            .setTitle('Add a to-do item');

          const descriptionInput = new TextInputBuilder()
            .setCustomId('todo-description')
            .setLabel('What do you need to do?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(200);

          const row = new ActionRowBuilder().addComponents(descriptionInput);
          modal.addComponents(row);

          await interaction.showModal(modal);
          return;
        }

        // /todo list 
        if (sub === 'list') {
          const todos = await getTodos(interaction.user.id, interaction.guildId);

          if (!todos.length) {
            await interaction.reply({
              content: 'You have no to-do items yet. Use `/todo add` to create one.',
              ephemeral: true,
            });
            return;
          }

          const lines = todos.map((todo, idx) => {
            const prefix = `${idx + 1}.`;
            const status = todo.completed ? ' ✅' : '';
            return `${prefix} ${todo.description}${status}`;
          });

          await interaction.reply({
            content: `Your to-do items:\n${lines.join('\n')}`,
            ephemeral: true,
          });
          return;
        }
      }
    }

    // saves modal 
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'todo-add-modal') {
        const description = interaction.fields.getTextInputValue('todo-description');

        await addTodo(interaction.user.id, interaction.guildId, description);

        await interaction.reply({
          content: `Added a new to-do:\n> ${description}`,
          ephemeral: true,
        });
        return;
      }
    }
  } catch (err) {
    console.error('Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong while handling that /todo action.',
        ephemeral: true,
      });
    }
  }
});
// =================================================

// ================ /purge message cmd =============
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  // use a slash command instead
  const prefix = '/purge ';
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // Only let users with Manage Messages run it 
  // if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
  //   return message.reply('You need Manage Messages to use this.');
  // }

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

    // forloop to delete message 1-by-1
    for (const m of toDelete) {
      try { await m.delete(); } catch (_) {}
    }

    // delete orig message
    try { await message.delete(); } catch (_) {}

    // sends feedback
    const info = await message.channel.send(`${toDelete.length} sus messages purged. :>`);
    setTimeout(() => info.delete().catch(() => {}), 1500);
  } catch (e) {
    console.error(e);
    message.channel.send('Purge failed (check my permissions/intents).');
  }
});
// =================================================

client.login(process.env.BOT_TOKEN);
