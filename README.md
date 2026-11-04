# walking-cat

A cat for Claude Code that walks across the band above your prompt while Claude works.

![A pixel cat walking with a speech bubble and stats line, and a kitten for a subagent](docs/demo.svg)

- **A progress bar with paws.** The cat sets off when a reply starts, walks at the pace of your usual replies, slows down near the end, and sprints off the moment the work is done.
- **It tells you what's going on.** A speech bubble shows the current step ("Reading register.tsx", "Searching the web: …"), and a line below shows elapsed time, steps, model, effort, and tokens.
- **It asks for attention.** When Claude is waiting on a permission prompt or a question, the cat's eyes go wide and the bubble turns to a warning.
- **Kittens for subagents.** Each subagent gets its own kitten walking as its progress bar, with its task, time, and steps.
- **A receipt when done.** After the cat leaves, a short summary stays until your next message: time, steps, tokens, files read and edited, searches, commands, and agents.
- **Ten coats**, picked at random: orange, brown, silver, and cream tabby, Russian blue, black, tuxedo, Siamese, calico, and odd-eyed white.

![The ten coats, walking in place](docs/coats.svg)

In the Claude desktop app the cat and kittens are animated 8-bit pixel art; in the terminal they're ASCII art.

The images above are drawn from the plugin's own sprite: `node --experimental-strip-types docs/make-images.ts` makes them again after a change to `hooks/sprite.ts`.

Type `/cat` to send the cat for a stroll.

## Privacy

Everything the cat shows comes from your own Claude Code session, and nothing leaves your machine.

- **What it reads:** the tool calls Claude makes (the tool's name and a few words of its input, such as a file name, a search query, a command's description, or a web address's host), each subagent's type and task description, the model and effort level of each request, token counts, how long each reply takes, and permission prompts.
- **What it keeps:** the average time a reply and a subagent take, in Claude Code's own plugin storage on your machine, so the cat's pace fits how you work. Everything else lives only for the session.
- **What it doesn't do:** it makes no network requests, runs no commands, writes no files, and never changes a tool call, a prompt, or a permission. It only watches, and draws.

`docs/make-images.ts` draws the images in this README; the plugin never runs it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install walking-cat --marketplace crswebb/walking-cat
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install walking-cat --marketplace crswebb/walking-cat
```

In the Claude desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `crswebb/walking-cat`, then **Add plugin**.

## Turning it off

```
claude plugin disable walking-cat
```

## License

[MIT](LICENSE)
