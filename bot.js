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

// send a message in the discord channel when it starts up (to do)

// find todo-list database
const db = new Firestore({
  databaseId: 'todo-list',
});

const todosCollection = db.collection('todos');

// helper func
async function addTodo(userId, guildId, name, description, dueText) {
  const docRef = await todosCollection.add({
    userId,
    guildId: guildId || null,
    name,
    description: description || '',
    due: dueText || '',
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

async function deleteTodoById(userId, guildId, id) {
  const docRef = todosCollection.doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return 0;

  const data = snap.data();
  if (data.userId !== userId) return 0;
  if (guildId && data.guildId !== guildId) return 0;

  await docRef.delete();
  return 1;
}

async function clearTodos(userId, guildId) {
  let query = todosCollection.where('userId', '==', userId);
  if (guildId) {
    query = query.where('guildId', '==', guildId);
  }

  const snapshot = await query.get();
  if (snapshot.empty) return 0;

  const batch = db.batch();
  snapshot.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snapshot.size;
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
  StringSelectMenuBuilder,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// sleep command
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============== /todo command ==============
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // sanity check
  let statusMessage;
  const announceSanityChannelID = "1438097113006215262";
  const sanityChannel = await client.channels.fetch(announceSanityChannelID);
  
  // im clinically insane
  if (sanityChannel) { statusMessage = await sanityChannel.send('i am erecting :3 please wait') };

  // def commands
  const commands = [
    new SlashCommandBuilder()
      .setName('todo')
      .setDescription('Manage your to-do list')
      .addSubcommand((sub) =>
        sub
      .setName('add')
      .setDescription('Add a new to-do item with name and due time'),
    )
    .addSubcommand((sub) =>
      sub
    .setName('list')
    .setDescription('List your to-do items'),
  )
  .addSubcommand((sub) =>
        sub
  .setName('delete')
          .setDescription('Delete a to-do item using a dropdown'),
        )
        .addSubcommand((sub) =>
          sub
        .setName('clear')
        .setDescription('Clear all your to-do items in this server'),
      ),
    ].map((cmd) => cmd.toJSON());

    // youre not getting my token lil bro
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

  // yay finish initializationing (i cant english)
  await statusMessage.edit('i am fully erect :D');
});

// =================================================

// ============ interaction handlers ===============
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'todo') {
        const sub = interaction.options.getSubcommand();

        // /todo add
        if (sub === 'add') {
          const modal = new ModalBuilder()
            .setCustomId('todo-add-modal')
            .setTitle('Add a to-do item');

          const nameInput = new TextInputBuilder()
            .setCustomId('todo-name')
            .setLabel('Task name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

          const descriptionInput = new TextInputBuilder()
            .setCustomId('todo-description')
            .setLabel('Description (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(200);

          const dueInput = new TextInputBuilder()
            .setCustomId('todo-due')
            .setLabel('Due time (optional, e.g. 2025-11-30 18:00)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100);

          const rows = [
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(dueInput),
          ];

          modal.addComponents(...rows);

          await interaction.showModal(modal);
          return;
        }

        // /todo list
        if (sub === 'list') {
          const todos = await getTodos(interaction.user.id, interaction.guildId);

          if (!todos.length) {
            await interaction.reply({
              content: 'You have no to-do items yet. Use `/todo add` to create one.',
              ephemeral: true, // this is technically an error message
            });
            return;
          }

          const lines = todos.map((todo, idx) => {
            let line = `${idx + 1}. **${todo.name || '(no name)'}**`;
            if (todo.due) {
              line += ` (due: ${todo.due})`;
            }
            if (todo.description) {
              line += ` — ${todo.description}`;
            }
            if (todo.completed) {
              line += ' finished!';
            }
            return line;
          });

          await interaction.reply({
            content: `Your to-do items:\n${lines.join('\n')}`,
          });
          return;
        }

        // /todo delete
        if (sub === 'delete') {
          const todos = await getTodos(interaction.user.id, interaction.guildId);

          if (!todos.length) {
            await interaction.reply({
              content: 'You have no to-do items to delete.',
              ephemeral: true,
            });
            return;
          }

          const options = todos.map((todo) => {
            let desc = '';
            // due desc
            if (todo.due) {
              desc += `Due: ${todo.due}. `;
            }

            // desc desc
            if (todo.description) {
              desc += todo.description;
            } else {
              desc += 'No description provided.';
            }

            // reconstruct option
            const option = {
              label: todo.name,
              value: todo.id,
              description: desc,
            };

            return option;
          });

          const select = new StringSelectMenuBuilder()
            .setCustomId(`todo:delete:${interaction.user.id}`)
            .setPlaceholder('Select a task to delete')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(select);

          await interaction.reply({
            content: 'Choose a task to delete:',
            components: [row],
          });
          return;
        }

        // /todo-clear
        if (sub === 'clear') {
          const deletedCount = await clearTodos(interaction.user.id, interaction.guildId);

          if (deletedCount === 0) {
            await interaction.reply({
              content: 'You had no to-do items to clear.',
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: `Cleared ${deletedCount} to-do item(s).`,
            });
          }
          return;
        }
      }
    }

    // save modal
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'todo-add-modal') {
        const name = interaction.fields.getTextInputValue('todo-name');
        const description =
          interaction.fields.getTextInputValue('todo-description') || '';
        const due = interaction.fields.getTextInputValue('todo-due') || '';

        await addTodo(interaction.user.id, interaction.guildId, name, description, due);

        let msg = `Added a new to-do **${name}**`;
        if (due) {
          msg += ` (due: ${due})`;
        }
        if (description) {
          msg += `\n> Description: ${description}`;
        }

        await interaction.reply({
          content: msg,
        });
        return;
      }
    }

    // dropdown for select what to delete
    if (interaction.isStringSelectMenu()) {
      const [prefix, action, ownerId] = interaction.customId.split(':');

      if (prefix === 'todo' && action === 'delete') {
        // lil bro tryna delete other's todo :skull:
        if (interaction.user.id !== ownerId) {
          await interaction.reply({
            content: "This delete menu isn't for you.",
            ephemeral: true,
          });
          return;
        }

        const selectedId = interaction.values[0];
        const deleted = await deleteTodoById(
          interaction.user.id,
          interaction.guildId,
          selectedId,
        );

        // wadahelly
        if (!deleted) {
          await interaction.reply({
            content: 'That to-do item could not be found or deleted.',
            ephemeral: true,
          });
          return;
        }

        // done, remove menu
        await interaction.update({
          content: 'To-do item deleted.',
          components: [],
        });
        return;
      }
    }
  } catch (err) {
    console.error('Error handling interaction:', err);

    // make error messages ephemeral
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong with that /todo command.',
        ephemeral: true,
      });
    }
  }
});
// =================================================

// messageCreate handlers
client.on('messageCreate', async (message) => {
  const content = message.content.toLowerCase();
  if (content === 'vulncheck') return vulncheck(message);
  
  if (!message.guild || message.author.bot) return;
  if (content.startsWith('/purge ')) return purgeCmd(message);
  if (content.startsWith('say ')) return sayCmd(message);
});

// ================ purge cmd =============
async function purgeCmd(message) {
  if (!message.guild || message.author.bot) return;

  // /purge command
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
        toDelete.push(m);
        remaining--;
        if (remaining === 0) break;
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
}
// =================================================

// ============= Talk as the bot command ============
async function sayCmd(message) {
  if (!message.guild || message.author.bot) return;

  // hidden say command
  const prefix = 'say ';
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // // someone said I shouldn't gatekeep the command skull
  // // only youstube can say it
  // if (message.author.username !== 'youtubeshort') {
  //   return message.reply({
  //     content: "imagine not being able to use this command xd",
  //     ephemeral: true,
  //   });
  // }

  sayText = message.content.slice(prefix.length).trim();
  try { await message.delete(); } catch (_) {}
  message.channel.send(sayText);
}
// =================================================

// ============= testing command for vuln ============
async function vulncheck(message) {
  // vuln check
  if (message.content !== 'vulncheck') return;

  // check priv
  if (message.author.id === '131614435067297792')
    return message.channel.send("hai youstube :>");
  else if (message.author.username === 'youtubeshort')
    return message.channel.send("hai yous- wait how are you him!? :o");
  else if (message.author.id === client.user.id) {
    const bot = await message.guild.members.fetchMe();
    return message.channel.send(`hai im ${bot.displayName}! :D`);
  }
  else
    return message.channel.send("you are not youstube! :p");
}
// =================================================

client.login(process.env.BOT_TOKEN);
